const parseAllowedOrigins = (raw) => {
    if (!raw?.trim()) {
        throw new Error('CORS_ALLOWED_ORIGINS is not set in environment');
    }

    const origins = raw
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

    if (origins.length === 0) {
        throw new Error('CORS_ALLOWED_ORIGINS must contain at least one origin');
    }

    return origins;
};

const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'Idempotency-Key'],
};

module.exports = { allowedOrigins, corsOptions };
