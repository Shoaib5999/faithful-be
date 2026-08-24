const prisma = require('../../config/db');

const getProfile = async (userId) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
    });

    if (!user) {
        const err = new Error('User not found');
        err.statusCode = 404;
        throw err;
    }

    return user;
};

const updateProfile = async (userId, { name }) => {
    if (!name || name.trim() === '') {
        const err = new Error('Name is required');
        err.statusCode = 400;
        throw err;
    }

    const user = await prisma.user.update({
        where: { id: userId },
        data: { name: name.trim() },
        select: { id: true, name: true, email: true, role: true },
    });

    return user;
};

module.exports = { getProfile, updateProfile };