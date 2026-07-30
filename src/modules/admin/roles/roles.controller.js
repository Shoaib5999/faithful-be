const rolesService = require('./roles.service');
const { success, error } = require('../../../utils/response');

const create = async (req, res, next) => {
    try {
        const { name, permissions } = req.body;
        if (!name || !permissions || !Array.isArray(permissions)) {
            return error(res, 'name and permissions (array) are required', 400);
        }
        const role = await rolesService.createRole(req.body);
        return success(res, role, 'Role created', 201);
    } catch (err) {
        next(err);
    }
};

const getAll = async (req, res, next) => {
    try {
        const roles = await rolesService.getAllRoles();
        return success(res, roles, 'Roles fetched');
    } catch (err) {
        next(err);
    }
};

const getById = async (req, res, next) => {
    try {
        const role = await rolesService.getRoleById(req.params.id);
        return success(res, role, 'Role fetched');
    } catch (err) {
        next(err);
    }
};

const update = async (req, res, next) => {
    try {
        const role = await rolesService.updateRole(req.params.id, req.body);
        return success(res, role, 'Role updated');
    } catch (err) {
        next(err);
    }
};

const remove = async (req, res, next) => {
    try {
        await rolesService.deleteRole(req.params.id);
        return success(res, null, 'Role deleted');
    } catch (err) {
        next(err);
    }
};

const getPermissions = (req, res) => {
    const permissions = rolesService.getAvailablePermissions();
    return success(res, permissions, 'Available permissions');
};

module.exports = { create, getAll, getById, update, remove, getPermissions };