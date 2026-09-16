const agentService = require('./agent.service');
const agentVoice = require('./agent.voice');
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
        // This listens on the response, not the request: with a consumed body
        // the request emits 'close' as soon as it has been fully read, which
        // would abort our own in-flight call immediately.
        const controller = new AbortController();
        res.on('close', () => {
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

/**
 * Transcribe a voice clip to text.
 *
 * Kept separate from /chat rather than folded into it: the customer sees the
 * transcript before it is sent, so a misheard request can be corrected instead
 * of silently spending a conversation turn on the wrong question.
 */
const transcribe = async (req, res, next) => {
    try {
        if (!isConfigured()) {
            return error(res, 'The shopping assistant is not available right now.', 503);
        }

        if (!req.file?.buffer) {
            return error(res, 'No audio was received.', 400);
        }

        // Voice clips are cheap to send but not free to transcribe, so they are
        // limited per session exactly like text turns.
        const sessionId = String(req.body?.sessionId || '').trim() || memory.newSessionId();
        const limit = memory.checkRateLimit(sessionId);
        if (!limit.allowed) {
            res.set('Retry-After', String(limit.retryAfterSeconds));
            return error(res, 'You are sending messages a little too quickly. Please wait a moment.', 429);
        }

        // Same reasoning as in chat(): multer has already consumed the request
        // stream by this point, so req 'close' fires immediately and would
        // cancel the transcription before it started.
        const controller = new AbortController();
        res.on('close', () => {
            if (!res.writableEnded) controller.abort();
        });

        const { transcript } = await agentVoice.transcribe({
            buffer: req.file.buffer,
            mimetype: req.file.mimetype,
            signal: controller.signal,
        });

        if (!transcript) {
            return success(res, { sessionId, transcript: '', empty: true }, 'No speech detected');
        }

        return success(res, { sessionId, transcript }, 'Transcribed');
    } catch (err) {
        if (err.statusCode === 400) return error(res, err.message, 400);
        if (err.name === 'GatewayError') {
            return error(
                res,
                err.statusCode === 429
                    ? 'The assistant is busy right now. Please try again in a moment.'
                    : 'Could not understand that recording. Please try again.',
                err.statusCode === 429 ? 429 : 503,
            );
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

module.exports = { chat, transcribe, resetConversation, status };
