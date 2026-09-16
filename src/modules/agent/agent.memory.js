const crypto = require('crypto');
const { client: redisClient } = require('../../config/redis');
const { config } = require('./agent.config');

/**
 * Conversation state.
 *
 * Redis when available, an in-process map otherwise — the agent must keep
 * working on a box with no Redis, just without cross-instance continuity.
 * Either way state is server-side: the browser holds only a session id, so a
 * client cannot forge history to manipulate the agent.
 */

const memoryStore = new Map();

const memoryKey = (sessionId) => `agent:conv:${sessionId}`;

const pruneMemoryStore = () => {
    const now = Date.now();
    for (const [key, entry] of memoryStore) {
        if (entry.expiresAt <= now) memoryStore.delete(key);
    }
};

const newSessionId = () => `sess_${crypto.randomUUID().replace(/-/g, '')}`;

const loadConversation = async (sessionId) => {
    if (!sessionId) return [];

    if (redisClient) {
        try {
            const raw = await redisClient.get(memoryKey(sessionId));
            return raw ? JSON.parse(raw) : [];
        } catch {
            return []; // A Redis blip should start a fresh turn, not fail the request.
        }
    }

    pruneMemoryStore();
    const entry = memoryStore.get(sessionId);
    return entry && entry.expiresAt > Date.now() ? entry.messages : [];
};

const saveConversation = async (sessionId, messages) => {
    if (!sessionId) return;

    // Only user/assistant text is retained. Tool call plumbing is re-derived per
    // turn, and keeping it would grow the prompt without improving answers.
    const trimmed = messages
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content)
        .slice(-config.maxHistoryMessages);

    if (redisClient) {
        try {
            await redisClient.set(
                memoryKey(sessionId),
                JSON.stringify(trimmed),
                'EX',
                config.conversationTtlSeconds,
            );
            return;
        } catch {
            // Fall through to in-process storage.
        }
    }

    pruneMemoryStore();
    memoryStore.set(sessionId, {
        messages: trimmed,
        expiresAt: Date.now() + config.conversationTtlSeconds * 1000,
    });
};

const clearConversation = async (sessionId) => {
    if (!sessionId) return;
    if (redisClient) {
        try {
            await redisClient.del(memoryKey(sessionId));
            return;
        } catch {
            /* fall through */
        }
    }
    memoryStore.delete(sessionId);
};

/**
 * Per-session turn limiting. This protects the upstream token budget as much as
 * the server: one abusive tab can otherwise exhaust a shared per-minute quota
 * for every other customer.
 */
const rateBuckets = new Map();

const checkRateLimit = (sessionId) => {
    const now = Date.now();
    const { windowMs, maxTurns } = config.rateLimit;

    for (const [key, bucket] of rateBuckets) {
        if (bucket.resetAt <= now) rateBuckets.delete(key);
    }

    const bucket = rateBuckets.get(sessionId);
    if (!bucket || bucket.resetAt <= now) {
        rateBuckets.set(sessionId, { count: 1, resetAt: now + windowMs });
        return { allowed: true };
    }

    if (bucket.count >= maxTurns) {
        return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
    }

    bucket.count += 1;
    return { allowed: true };
};

module.exports = {
    newSessionId,
    loadConversation,
    saveConversation,
    clearConversation,
    checkRateLimit,
};
