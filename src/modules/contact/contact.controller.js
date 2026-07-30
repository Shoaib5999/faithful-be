const contactService = require('./contact.service');
const { success, error } = require('../../utils/response');

const submit = async (req, res, next) => {
    try {
        const { name, email, subject, message } = req.body;

        if (!name || !email || !message) {
            return error(res, 'Name, email, and message are required', 400);
        }

        const result = await contactService.submitContact({ name, email, subject, message });
        return success(res, null, result.message);
    } catch (err) {
        next(err);
    }
};

module.exports = { submit };
