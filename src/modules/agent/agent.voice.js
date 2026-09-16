const { config } = require('./agent.config');
const { GatewayError } = require('./agent.gateway');

/**
 * Speech-to-text, via the AI Gateway's OpenAI-compatible audio endpoint.
 *
 * The audio is forwarded straight through and never written to disk. Nothing
 * about the recording is retained here — only the resulting text goes on to the
 * agent, and only the agent's usual conversation retention applies to that.
 */

/** Whisper handles these; anything else is rejected before leaving the server. */
const ALLOWED_MIME = new Set([
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg',
    'audio/mpga',
    'audio/wav',
    'audio/x-wav',
    'audio/m4a',
    'audio/x-m4a',
    'audio/flac',
]);

const EXTENSION_BY_MIME = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/mpga': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/m4a': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/flac': 'flac',
};

const isSupportedAudio = (mimetype) => {
    if (!mimetype) return false;
    // Browsers append codec details, e.g. "audio/webm;codecs=opus".
    const base = String(mimetype).split(';')[0].trim().toLowerCase();
    return ALLOWED_MIME.has(base);
};

const transcribe = async ({ buffer, mimetype, signal }) => {
    if (!buffer || buffer.length === 0) {
        const err = new Error('No audio was received.');
        err.statusCode = 400;
        throw err;
    }

    const base = String(mimetype || '').split(';')[0].trim().toLowerCase();
    if (!isSupportedAudio(base)) {
        const err = new Error('That audio format is not supported.');
        err.statusCode = 400;
        throw err;
    }

    const form = new FormData();
    form.append(
        'file',
        new Blob([buffer], { type: base }),
        // Whisper infers the container from the filename extension, so this
        // has to match the actual mime type rather than being arbitrary.
        `speech.${EXTENSION_BY_MIME[base] || 'webm'}`,
    );
    form.append('model', config.transcriptionModel);
    form.append('response_format', 'json');
    // Biases the decoder toward the right language instead of guessing per clip.
    form.append('language', config.transcriptionLanguage);

    const controller = new AbortController();
    const timer = setTimeout(
        () => controller.abort(new Error('transcription timeout')),
        config.transcriptionTimeoutMs,
    );
    const onAbort = () => controller.abort();
    if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', onAbort, { once: true });
    }

    try {
        const response = await fetch(`${config.gatewayUrl}/audio/transcriptions`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.gatewayApiKey}` },
            body: form,
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
                body?.error?.message || 'Could not transcribe that audio.',
                response.status,
                body?.error?.code,
            );
        }

        const transcript = typeof body?.text === 'string' ? body.text.trim() : '';
        return { transcript };
    } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
    }
};

module.exports = { transcribe, isSupportedAudio };
