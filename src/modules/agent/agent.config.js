/**
 * Shopping agent configuration.
 *
 * The agent talks to the self-hosted AI Gateway (OpenAI-compatible, Groq-backed)
 * rather than to a model provider directly, so credential rotation, retries and
 * rate-limit handling all stay in one place. Missing configuration disables the
 * agent cleanly instead of throwing at request time.
 */

const GATEWAY_URL = (process.env.AI_GATEWAY_URL || '').trim().replace(/\/$/, '');
const GATEWAY_API_KEY = (process.env.AI_GATEWAY_API_KEY || '').trim();

const config = {
    gatewayUrl: GATEWAY_URL,
    gatewayApiKey: GATEWAY_API_KEY,

    /** Model used for the tool-calling loop. */
    model: (process.env.AGENT_MODEL || 'openai/gpt-oss-120b').trim(),

    /** Upstream call budget for a single user turn. */
    requestTimeoutMs: Number(process.env.AGENT_TIMEOUT_MS) || 60_000,

    /**
     * Hard ceiling on tool-call round trips within one user turn. Without this a
     * confused model can ping-pong tool calls indefinitely, burning tokens and
     * holding the connection open.
     */
    maxToolIterations: Number(process.env.AGENT_MAX_TOOL_ITERATIONS) || 5,

    /**
     * How many prior messages to replay. Every turn resends history, so this is
     * the main lever on token cost — and on the provider's per-minute ceiling.
     * Older turns beyond this are dropped rather than silently inflating cost.
     */
    maxHistoryMessages: Number(process.env.AGENT_MAX_HISTORY) || 12,

    /** Conversation retention. */
    conversationTtlSeconds: Number(process.env.AGENT_CONVERSATION_TTL) || 60 * 60 * 6,

    /** Per-session turn limit, independent of the gateway's own rate limiting. */
    rateLimit: {
        windowMs: Number(process.env.AGENT_RATE_WINDOW_MS) || 60_000,
        maxTurns: Number(process.env.AGENT_RATE_MAX_TURNS) || 12,
    },

    maxMessageLength: Number(process.env.AGENT_MAX_MESSAGE_LENGTH) || 2000,

    /** Speech-to-text, through the same gateway. */
    transcriptionModel: (process.env.AGENT_TRANSCRIPTION_MODEL || 'whisper-large-v3-turbo').trim(),
    // Indian English is the store's audience; naming it beats per-clip guessing,
    // which can misfire badly on short utterances and product names.
    transcriptionLanguage: (process.env.AGENT_TRANSCRIPTION_LANGUAGE || 'en').trim(),
    transcriptionTimeoutMs: Number(process.env.AGENT_TRANSCRIPTION_TIMEOUT_MS) || 30_000,
    /** A voice clip should be seconds long; this is a generous ceiling. */
    maxAudioBytes: Number(process.env.AGENT_MAX_AUDIO_BYTES) || 8 * 1024 * 1024,
};

/** The agent is optional infrastructure — the store works fine without it. */
const isConfigured = () => Boolean(config.gatewayUrl && config.gatewayApiKey);

module.exports = { config, isConfigured };
