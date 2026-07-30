const userService = require('./user.service');
const { success, error } = require('../../utils/response');

const getProfile = async (req, res, next) => {
    try {
        const user = await userService.getProfile(req.user.id);
        return success(res, user, 'Profile fetched');
    } catch (err) {
        next(err);
    }
};

const updateProfile = async (req, res, next) => {
    try {
        const user = await userService.updateProfile(req.user.id, req.body);
        return success(res, user, 'Profile updated');
    } catch (err) {
        next(err);
    }
};

module.exports = { getProfile, updateProfile };