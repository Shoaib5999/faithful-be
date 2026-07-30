const { verifyAccessToken } = require('../utils/jwt');
const { error } = require('../utils/response');

const authenticate = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return error(res, 'Access token missing', 401);
        }

        const token = authHeader.split(' ')[1];
        const decoded = verifyAccessToken(token);
        req.user = decoded;
        next();
    } catch (err) {
        return error(res, 'Invalid or expired access token', 401);
    }
};

const optionalAuthenticate = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            req.user = verifyAccessToken(token);
        }
    } catch {
        // Public routes may proceed without a valid token
    }
    next();
};

const ADMIN_PRODUCT_ROLES = new Set(['ADMIN', 'MANAGER', 'STAFF']);

const requireAdminProductAccess = (req, res) => {
    if (!req.user) {
        return error(res, 'Access token missing', 401);
    }
    if (!ADMIN_PRODUCT_ROLES.has(req.user.role)) {
        return error(res, 'Forbidden', 403);
    }
    return null;
};

module.exports = { authenticate, optionalAuthenticate, requireAdminProductAccess };