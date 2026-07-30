const staffService = require('./staff.service');
const { success, error } = require('../../../utils/response');

const invite = async (req, res, next) => {
    try {
        const { name, email, password, roleId } = req.body;
        if (!name || !email || !password || !roleId) {
            return error(res, 'name, email, password and roleId are required', 400);
        }
        const staff = await staffService.inviteStaff(req.body, req.user.id);
        return success(res, staff, 'Staff member created', 201);
    } catch (err) {
        next(err);
    }
};

const getAll = async (req, res, next) => {
    try {
        const result = await staffService.getAllStaff(req.query);
        return success(res, result, 'Staff list fetched');
    } catch (err) {
        next(err);
    }
};

const getById = async (req, res, next) => {
    try {
        const staff = await staffService.getStaffById(req.params.id);
        return success(res, staff, 'Staff member fetched');
    } catch (err) {
        next(err);
    }
};

const updateRole = async (req, res, next) => {
    try {
        const { roleId } = req.body;
        if (!roleId) return error(res, 'roleId is required', 400);
        const staff = await staffService.updateStaffRole(req.params.id, roleId);
        return success(res, staff, 'Staff role updated');
    } catch (err) {
        next(err);
    }
};

const activate = async (req, res, next) => {
    try {
        const result = await staffService.toggleStaffStatus(req.params.id, true);
        return success(res, result, 'Staff member activated');
    } catch (err) {
        next(err);
    }
};

const deactivate = async (req, res, next) => {
    try {
        const result = await staffService.toggleStaffStatus(req.params.id, false);
        return success(res, result, 'Staff member deactivated');
    } catch (err) {
        next(err);
    }
};

module.exports = { invite, getAll, getById, updateRole, activate, deactivate };