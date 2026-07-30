const prisma = require('../../../config/db');
const bcrypt = require('bcryptjs');

const inviteStaff = async ({ name, email, password, roleId }, invitedBy) => {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
        const err = new Error('User with this email already exists');
        err.statusCode = 409;
        throw err;
    }

    const role = await prisma.staffRole.findUnique({ where: { id: roleId } });
    if (!role) {
        const err = new Error('Role not found');
        err.statusCode = 404;
        throw err;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
        data: {
            name,
            email,
            passwordHash,
            role: 'STAFF',
            staffProfile: {
                create: {
                    roleId,
                    invitedBy,
                    isActive: true,
                },
            },
        },
        include: {
            staffProfile: { include: { role: true } },
        },
    });

    return user;
};

const getAllStaff = async ({ page = 1, limit = 20, isActive, roleId }) => {
    const skip = (page - 1) * limit;
    const where = {};
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (roleId) where.roleId = roleId;

    const [staff, total] = await Promise.all([
        prisma.staffProfile.findMany({
            where,
            include: {
                user: { select: { id: true, name: true, email: true, createdAt: true } },
                role: true,
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: Number(limit),
        }),
        prisma.staffProfile.count({ where }),
    ]);

    return { staff, total, page: Number(page), totalPages: Math.ceil(total / limit) };
};

const getStaffById = async (staffId) => {
    const staff = await prisma.staffProfile.findUnique({
        where: { id: staffId },
        include: {
            user: { select: { id: true, name: true, email: true, createdAt: true } },
            role: true,
        },
    });

    if (!staff) {
        const err = new Error('Staff member not found');
        err.statusCode = 404;
        throw err;
    }

    return staff;
};

const updateStaffRole = async (staffId, roleId) => {
    const role = await prisma.staffRole.findUnique({ where: { id: roleId } });
    if (!role) {
        const err = new Error('Role not found');
        err.statusCode = 404;
        throw err;
    }

    return await prisma.staffProfile.update({
        where: { id: staffId },
        data: { roleId },
        include: { role: true, user: { select: { id: true, name: true, email: true } } },
    });
};

const toggleStaffStatus = async (staffId, isActive) => {
    const staff = await prisma.staffProfile.findUnique({ where: { id: staffId } });
    if (!staff) {
        const err = new Error('Staff member not found');
        err.statusCode = 404;
        throw err;
    }

    await prisma.$transaction(async (tx) => {
        await tx.staffProfile.update({ where: { id: staffId }, data: { isActive } });
        await tx.user.update({ where: { id: staff.userId }, data: { isActive } });
    });

    return { staffId, isActive };
};

module.exports = { inviteStaff, getAllStaff, getStaffById, updateStaffRole, toggleStaffStatus };