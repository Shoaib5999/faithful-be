const isExpectedAuthFailure = (err, req) => {
    const status = err.statusCode || 500;
    if (status !== 401) return false;

    const path = req.originalUrl || req.url || '';
    const message = String(err.message || '').toLowerCase();

    if (path.includes('/auth/refresh-token')) return true;
    if (path.includes('/auth/login')) return true;

    return (
        message.includes('refresh token') ||
        message.includes('access token') ||
        message.includes('invalid or expired')
    );
};

const errorHandler = (err, req, res, next) => {
    if (!isExpectedAuthFailure(err, req)) {
        console.error('Global Error:', err);
    }

    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';

    if (err.name === 'MulterError') {
        statusCode = 400;
        if (err.code === 'LIMIT_FILE_SIZE') {
            message = 'File is too large';
        } else if (err.code === 'LIMIT_FILE_COUNT') {
            message = 'Too many files uploaded';
        } else {
            message = err.message;
        }
    }

    if (err.code === 'P2002') {
        statusCode = 409;
        const target = err.meta?.target;
        const fields = Array.isArray(target) ? target : [target];

        if (fields.some((f) => String(f).includes('sku'))) {
            message = 'A variant with this SKU already exists. Use a unique SKU.';
        } else if (fields.some((f) => String(f).includes('slug'))) {
            message = 'This slug is already in use.';
        } else if (fields.some((f) => String(f).includes('RefreshToken'))) {
            message = 'Session refresh conflict. Please sign in again.';
            statusCode = 401;
        } else {
            message = 'A record with this value already exists.';
        }
    }

    return res.status(statusCode).json({
        success: false,
        message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
};

module.exports = { errorHandler };