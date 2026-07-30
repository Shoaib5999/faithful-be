const { error } = require('../utils/response');

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return error(res, 'Unauthorized', 401);
        }

        if (!roles.includes(req.user.role)) {
            return error(res, 'Forbidden: You do not have permission', 403);
        }

        next();
    };
};

module.exports = { authorize };