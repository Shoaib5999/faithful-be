const agentService = require('./agent.service');
const memory = require('./agent.memory');
const { isConfigured, config } = require('./agent.config');
const { success, error } = require('../../utils/response');

/**
 * HTTP layer for the shopping agent.
 *
 * The browser never sees the gateway key or the model name — it posts a message
 * and a session id, and gets back a reply. Identity comes from the request's own
 * auth, never from the request body.
 */

const chat = async (req, res, next) => {
    try {
        if (!isConfigured()) {
            return error(res, 'The shopping assistant is not available right now.', 503);
        }

        const { message } = req.body || {};
        // A client-supplied session id only scopes conversation history; it
        // grants no access, so an attacker guessing one gains nothing but a
        // stranger's product chatter. Cart and order access is bound to the
        // authenticated user below, not to this id.
        const sessionId = String(req.body?.sessionId || '').trim() || memory.newSessionId();

        const limit = memory.checkRateLimit(sessionId);
        if (!limit.allowed) {
            res.set('Retry-After', String(limit.retryAfterSeconds));
            return error(
                res,
                'You are sending messages a little too quickly. Please wait a moment.',
                429,
            );
        }

        const context = {
            userId: req.user?.id || null,
            role: req.user?.role || null,
        };

        // Abort the upstream call if the customer navigates away mid-answer.
        const controller = new AbortController();
        req.on('close', () => {
            if (!res.writableEnded) controller.abort();
        });

        const result = await agentService.runTurn({
            message,
            sessionId,
            context,
            signal: controller.signal,
        });

        return success(
            res,
            {
                sessionId,
                reply: result.reply,
                toolsUsed: result.toolsUsed,
                clientActions: result.clientActions,
            },
            'Reply generated',
        );
    } catch (err) {
        if (err.statusCode === 400) return error(res, err.message, 400);

        if (err.name === 'GatewayError') {
            // Surface capacity problems honestly — this is the one the customer
            // can actually act on by retrying shortly.
            if (err.statusCode === 429) {
                return error(
                    res,
                    'The assistant is busy right now. Please try again in a moment.',
                    429,
                );
            }
            return error(res, 'The assistant is temporarily unavailable.', 503);
        }

        if (err.name === 'AbortError') return res.end();

        next(err);
    }
};

const resetConversation = async (req, res, next) => {
    try {
        const sessionId = String(req.body?.sessionId || '').trim();
        if (sessionId) await memory.clearConversation(sessionId);
        return success(res, { sessionId: memory.newSessionId() }, 'Conversation reset');
    } catch (err) {
        next(err);
    }
};

/** Lets the storefront hide the widget entirely when the agent is switched off. */
const status = async (_req, res) =>
    success(
        res,
        { available: isConfigured(), maxMessageLength: config.maxMessageLength },
        'Agent status',
    );

module.exports = { chat, resetConversation, status };
