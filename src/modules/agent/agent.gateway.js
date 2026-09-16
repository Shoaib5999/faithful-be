const { config } = require('./agent.config');

/**
 * Minimal OpenAI-compatible client for the AI Gateway.
 *
 * Deliberately not the `openai` SDK: this needs exactly two calls, and the
 * gateway already owns retries, credential failover and rate-limit handling.
 * Adding a dependency here would duplicate that responsibility.
 */

class GatewayError extends Error {
    constructor(message, statusCode, code) {
        super(message);
        this.name = 'GatewayError';
        this.statusCode = statusCode;
        this.code = code || null;
    }
}

/** Surface the upstream message without leaking internals to the caller. */
const extractMessage = (body, fallback) => {
    if (body && typeof body === 'object') {
        const err = body.error;
        if (err && typeof err === 'object' && typeof err.message === 'string' && err.message.trim()) {
            return err.message.trim();
        }
    }
    return fallback;
};

/**
 * Non-streaming chat completion. Used for the tool-calling loop, where the whole
 * response is needed before deciding whether to run tools or answer.
 */
const chatCompletion = async ({ messages, tools, signal }) => {
    const controller = new AbortController();
    const timer = setTimeout(
        () => controller.abort(new Error('agent upstream timeout')),
        config.requestTimeoutMs,
    );

    const onAbort = () => controller.abort();
    if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', onAbort, { once: true });
    }

    try {
        const payload = {
            model: config.model,
            messages,
            temperature: 0.3, // Commerce answers should be consistent, not creative.
            max_tokens: 1200,
        };
        if (tools && tools.length > 0) {
            payload.tools = tools;
            payload.tool_choice = 'auto';
        }

        const response = await fetch(`${config.gatewayUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.gatewayApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        const text = await response.text();
        let body;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            body = null;
        }

        if (!response.ok) {
            throw new GatewayError(
                extractMessage(body, 'The assistant is temporarily unavailable.'),
                response.status,
                body?.error?.code,
            );
        }

        const choice = body?.choices?.[0];
        if (!choice) {
            throw new GatewayError('The assistant returned an empty response.', 502);
        }

        return choice.message;
    } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
    }
};

module.exports = { chatCompletion, GatewayError };
