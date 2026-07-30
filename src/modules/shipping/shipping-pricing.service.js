const prisma = require('../../config/db');

const DEFAULT_SETTINGS = {
    defaultShippingFee: 99,
    freeShippingThreshold: 999,
    isFreeShippingEnabled: true,
};

const getOrCreateShippingSettings = async () => {
    const existing = await prisma.shippingSettings.findUnique({
        where: { id: 'default' },
    });

    if (existing) return existing;

    return prisma.shippingSettings.create({
        data: {
            id: 'default',
            ...DEFAULT_SETTINGS,
        },
    });
};

const getActiveShippingMethods = async () => {
    return prisma.shippingMethod.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
};

const getAllShippingMethods = async () => {
    return prisma.shippingMethod.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
};

const resolveShippingMethod = async (shippingMethodCode) => {
    if (shippingMethodCode) {
        const method = await prisma.shippingMethod.findUnique({
            where: { code: String(shippingMethodCode).toLowerCase() },
        });
        if (method?.isActive) return method;
    }

    return prisma.shippingMethod.findFirst({
        where: { isDefault: true, isActive: true },
        orderBy: { sortOrder: 'asc' },
    });
};

const calculateShippingCharge = async (subtotal, shippingMethodCode = null) => {
    const settings = await getOrCreateShippingSettings();
    const method = await resolveShippingMethod(shippingMethodCode);

    let fee = Number(settings.defaultShippingFee);
    if (method) {
        fee = Number(method.fee);
    }

    const isFree = settings.isFreeShippingEnabled
        && Number(subtotal) >= parseFloat(String(settings.freeShippingThreshold));

    return {
        shippingCharge: isFree ? 0 : fee,
        shippingMethodId: method?.id ?? null,
        shippingMethod: method
            ? {
                id: method.id,
                name: method.name,
                code: method.code,
                fee: Number(method.fee),
                deliveryLabel: method.deliveryLabel,
            }
            : null,
        isFreeShippingApplied: isFree,
        settings: {
            defaultShippingFee: Number(settings.defaultShippingFee),
            freeShippingThreshold: Number(settings.freeShippingThreshold),
            isFreeShippingEnabled: settings.isFreeShippingEnabled,
        },
    };
};

const updateShippingSettings = async (data) => {
    await getOrCreateShippingSettings();
    return prisma.shippingSettings.update({
        where: { id: 'default' },
        data: {
            defaultShippingFee: data.defaultShippingFee,
            freeShippingThreshold: data.freeShippingThreshold,
            isFreeShippingEnabled: data.isFreeShippingEnabled,
        },
    });
};

const createShippingMethod = async ({
    name,
    code,
    fee,
    deliveryLabel,
    isDefault,
    isActive,
    sortOrder,
}) => {
    const normalizedCode = String(code).toLowerCase();
    const existing = await prisma.shippingMethod.findUnique({
        where: { code: normalizedCode },
    });
    if (existing) {
        const err = new Error('Shipping method code already exists');
        err.statusCode = 409;
        throw err;
    }

    if (isDefault) {
        await prisma.shippingMethod.updateMany({
            where: { isDefault: true },
            data: { isDefault: false },
        });
    }

    return prisma.shippingMethod.create({
        data: {
            name,
            code: normalizedCode,
            fee,
            deliveryLabel,
            isDefault: isDefault || false,
            isActive: isActive ?? true,
            sortOrder: sortOrder || 0,
        },
    });
};

const updateShippingMethod = async (id, data) => {
    const method = await prisma.shippingMethod.findUnique({ where: { id } });
    if (!method) {
        const err = new Error('Shipping method not found');
        err.statusCode = 404;
        throw err;
    }

    if (data.code) data.code = String(data.code).toLowerCase();
    if (data.isDefault) {
        await prisma.shippingMethod.updateMany({
            where: { isDefault: true },
            data: { isDefault: false },
        });
    }

    return prisma.shippingMethod.update({ where: { id }, data });
};

const deleteShippingMethod = async (id) => {
    const method = await prisma.shippingMethod.findUnique({ where: { id } });
    if (!method) {
        const err = new Error('Shipping method not found');
        err.statusCode = 404;
        throw err;
    }

    const inUse = await prisma.order.count({ where: { shippingMethodId: id } });
    if (inUse > 0) {
        const err = new Error(`Cannot delete — ${inUse} orders use this shipping method`);
        err.statusCode = 400;
        throw err;
    }

    await prisma.shippingMethod.delete({ where: { id } });
};

module.exports = {
    getOrCreateShippingSettings,
    getActiveShippingMethods,
    getAllShippingMethods,
    calculateShippingCharge,
    updateShippingSettings,
    createShippingMethod,
    updateShippingMethod,
    deleteShippingMethod,
};
