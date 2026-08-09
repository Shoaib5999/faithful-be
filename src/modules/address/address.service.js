const prisma = require('../../config/db');

const addAddress = async (userId, data) => {
    const { label, name, phone, line1, line2, city, state, pincode, isDefault, latitude, longitude } = data;

    if (isDefault) {
        await prisma.address.updateMany({
            where: { userId },
            data: { isDefault: false },
        });
    }

    const addressCount = await prisma.address.count({ where: { userId } });

    return await prisma.address.create({
        data: {
            userId,
            label: label || 'Home',
            name,
            phone,
            line1,
            line2,
            city,
            state,
            pincode,
            latitude: latitude ?? null,
            longitude: longitude ?? null,
            isDefault: addressCount === 0 ? true : (isDefault || false),
        },
    });
};

const getUserAddresses = async (userId) => {
    return await prisma.address.findMany({
        where: { userId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
};

const updateAddress = async (addressId, userId, data) => {
    const address = await prisma.address.findFirst({ where: { id: addressId, userId } });
    if (!address) {
        const err = new Error('Address not found');
        err.statusCode = 404;
        throw err;
    }

    if (data.isDefault) {
        await prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }

    return await prisma.address.update({ where: { id: addressId }, data });
};

const deleteAddress = async (addressId, userId) => {
    const address = await prisma.address.findFirst({ where: { id: addressId, userId } });
    if (!address) {
        const err = new Error('Address not found');
        err.statusCode = 404;
        throw err;
    }

    await prisma.address.delete({ where: { id: addressId } });
};

const setDefault = async (addressId, userId) => {
    await prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    return await prisma.address.update({ where: { id: addressId }, data: { isDefault: true } });
};

module.exports = { addAddress, getUserAddresses, updateAddress, deleteAddress, setDefault };