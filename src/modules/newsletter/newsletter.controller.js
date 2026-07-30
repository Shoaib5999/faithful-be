const newsletterService = require('./newsletter.service');
const { success, error } = require('../../utils/response');

const subscribe = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) return error(res, 'Email is required', 400);

        const result = await newsletterService.subscribe(email);
        return success(res, null, result.message);
    } catch (err) {
        next(err);
    }
};

module.exports = { subscribe };
