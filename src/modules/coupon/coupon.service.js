const prisma = require('../../config/db');

const createCoupon = async ({ code, type, value, minOrder, maxUses, expiresAt }) => {
    const validTypes = ['flat', 'percent'];
    if (!validTypes.includes(type)) {
        const err = new Error('type must be flat or percent');
        err.statusCode = 400;
        throw err;
    }

    if (type === 'percent' && (value < 1 || value > 100)) {
        const err = new Error('Percent discount must be between 1 and 100');
        err.statusCode = 400;
        throw err;
    }

    const existing = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (existing) {
        const err = new Error('Coupon code already exists');
        err.statusCode = 409;
        throw err;
    }

    return await prisma.coupon.create({
        data: {
            code: code.toUpperCase(),
            type,
            value,
            minOrder: minOrder || null,
            maxUses: maxUses || null,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            isActive: true,
        },
    });
};

const getAllCoupons = async ({ page = 1, limit = 20, isActive }) => {
    const skip = (page - 1) * limit;
    const where = {};
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [coupons, total] = await Promise.all([
        prisma.coupon.findMany({
            where,
            include: { _count: { select: { usages: true } } },
            orderBy: { createdAt: 'desc' },
            skip,
            take: Number(limit),
        }),
        prisma.coupon.count({ where }),
    ]);

    return { coupons, total, page: Number(page), totalPages: Math.ceil(total / limit) };
};

const getCouponById = async (id) => {
    const coupon = await prisma.coupon.findUnique({
        where: { id },
        include: {
            usages: {
                include: { coupon: false },
                take: 10,
                orderBy: { id: 'desc' },
            },
            _count: { select: { usages: true } },
        },
    });

    if (!coupon) {
        const err = new Error('Coupon not found');
        err.statusCode = 404;
        throw err;
    }

    return coupon;
};

const updateCoupon = async (id, data) => {
    const coupon = await prisma.coupon.findUnique({ where: { id } });
    if (!coupon) {
        const err = new Error('Coupon not found');
        err.statusCode = 404;
        throw err;
    }

    const updateData = {};
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.maxUses !== undefined) updateData.maxUses = data.maxUses;
    if (data.expiresAt !== undefined) updateData.expiresAt = new Date(data.expiresAt);
    if (data.minOrder !== undefined) updateData.minOrder = data.minOrder;

    return await prisma.coupon.update({ where: { id }, data: updateData });
};

const isCouponExpired = (coupon) =>
    Boolean(coupon.expiresAt && coupon.expiresAt < new Date());

const deleteCoupon = async (id) => {
    const coupon = await prisma.coupon.findUnique({ where: { id } });
    if (!coupon) {
        const err = new Error('Coupon not found');
        err.statusCode = 404;
        throw err;
    }

    const usageCount = await prisma.couponUsage.count({ where: { couponId: id } });
    const expired = isCouponExpired(coupon);

    if (usageCount > 0 && !expired) {
        const err = new Error('Cannot delete a coupon that has been used. Deactivate it instead.');
        err.statusCode = 400;
        throw err;
    }

    if (usageCount > 0) {
        await prisma.$transaction([
            prisma.couponUsage.deleteMany({ where: { couponId: id } }),
            prisma.coupon.delete({ where: { id } }),
        ]);
        return;
    }

    await prisma.coupon.delete({ where: { id } });
};

const getPublicActiveCoupons = async () => {
    const now = new Date();
    const coupons = await prisma.coupon.findMany({
        where: {
            isActive: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: { createdAt: 'desc' },
    });

    return coupons
        .filter((coupon) => !coupon.maxUses || coupon.usedCount < coupon.maxUses)
        .map((coupon) => ({
            id: coupon.id,
            code: coupon.code,
            type: coupon.type,
            value: Number(coupon.value),
            minOrder: coupon.minOrder ? Number(coupon.minOrder) : null,
            expiresAt: coupon.expiresAt,
            description: formatCouponDescription(coupon),
        }));
};

const formatCouponDescription = (coupon) => {
    const valueLabel =
        coupon.type === 'percent'
            ? `${Number(coupon.value)}% off`
            : `₹${Number(coupon.value)} off`;
    const minLabel = coupon.minOrder ? ` on orders above ₹${Number(coupon.minOrder)}` : '';
    return `${valueLabel}${minLabel}`;
};

const validateCoupon = async (code, userId, orderTotal) => {
    const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });

    if (!coupon || !coupon.isActive) {
        return { valid: false, message: 'Invalid or inactive coupon code' };
    }

    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
        return { valid: false, message: 'Coupon has expired' };
    }

    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
        return { valid: false, message: 'Coupon usage limit reached' };
    }

    if (coupon.minOrder && orderTotal < Number(coupon.minOrder)) {
        return { valid: false, message: `Minimum order of ₹${coupon.minOrder} required` };
    }

    if (userId) {
        const alreadyUsed = await prisma.couponUsage.findFirst({
            where: { couponId: coupon.id, userId },
        });

        if (alreadyUsed) {
            return { valid: false, message: 'You have already used this coupon' };
        }
    }

    let discount = 0;
    if (coupon.type === 'percent') {
        discount = (orderTotal * Number(coupon.value)) / 100;
    } else {
        discount = Number(coupon.value);
    }
    discount = Math.min(discount, orderTotal);

    return {
        valid: true,
        coupon: { id: coupon.id, code: coupon.code, type: coupon.type, value: coupon.value },
        discount: discount.toFixed(2),
    };
};

module.exports = {
    createCoupon,
    getAllCoupons,
    getCouponById,
    updateCoupon,
    deleteCoupon,
    getPublicActiveCoupons,
    validateCoupon,
};