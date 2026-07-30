const prisma = require('../../../config/db');

// Default permissions list for reference
const ALL_PERMISSIONS = [
    'products.view', 'products.create', 'products.update', 'products.delete',
    'orders.view', 'orders.update', 'orders.cancel',
    'inventory.update',
    'reviews.view', 'reviews.moderate',
    'coupons.view', 'coupons.create', 'coupons.update', 'coupons.delete',
    'analytics.view',
    'shipping.manage',
    'leads.view', 'leads.update', 'leads.delete',
];

const createRole = async ({ name, permissions }) => {
    const existing = await prisma.staffRole.findUnique({ where: { name } });
    if (existing) {
        const err = new Error('Role with this name already exists');
        err.statusCode = 409;
        throw err;
    }

    const invalidPerms = permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (invalidPerms.length) {
        const err = new Error(`Invalid permissions: ${invalidPerms.join(', ')}`);
        err.statusCode = 400;
        throw err;
    }

    return await prisma.staffRole.create({ data: { name, permissions } });
};

const getAllRoles = async () => {
    return await prisma.staffRole.findMany({
        include: { _count: { select: { staff: true } } },
        orderBy: { createdAt: 'asc' },
    });
};

const getRoleById = async (id) => {
    const role = await prisma.staffRole.findUnique({
        where: { id },
        include: { staff: { include: { user: { select: { id: true, name: true, email: true } } } } },
    });
    if (!role) {
        const err = new Error('Role not found');
        err.statusCode = 404;
        throw err;
    }
    return role;
};

const updateRole = async (id, { name, permissions }) => {
    if (permissions) {
        const invalidPerms = permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
        if (invalidPerms.length) {
            const err = new Error(`Invalid permissions: ${invalidPerms.join(', ')}`);
            err.statusCode = 400;
            throw err;
        }
    }

    return await prisma.staffRole.update({
        where: { id },
        data: { ...(name && { name }), ...(permissions && { permissions }) },
    });
};

const deleteRole = async (id) => {
    const staffCount = await prisma.staffProfile.count({ where: { roleId: id } });
    if (staffCount > 0) {
        const err = new Error('Cannot delete role with assigned staff members');
        err.statusCode = 400;
        throw err;
    }
    await prisma.staffRole.delete({ where: { id } });
};

const getAvailablePermissions = () => ALL_PERMISSIONS;

module.exports = { createRole, getAllRoles, getRoleById, updateRole, deleteRole, getAvailablePermissions };