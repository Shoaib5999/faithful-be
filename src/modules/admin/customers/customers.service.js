const prisma = require('../../../config/db');

const getAllCustomers = async ({ page = 1, limit = 50, isActive, search }) => {
    const skip = (page - 1) * limit;
    const where = { role: 'CUSTOMER' };

    if (isActive !== undefined && isActive !== '') {
        where.isActive = isActive === 'true' || isActive === true;
    }

    if (search) {
        const term = String(search).trim();
        if (term) {
            where.OR = [
                { name: { contains: term } },
                { email: { contains: term } },
            ];
        }
    }

    const [users, total] = await Promise.all([
        prisma.user.findMany({
            where,
            select: {
                id: true,
                name: true,
                email: true,
                isActive: true,
                createdAt: true,
                addresses: {
                    select: { phone: true },
                    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
                    take: 1,
                },
                orders: {
                    select: { total: true, paymentStatus: true },
                },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: Number(limit),
        }),
        prisma.user.count({ where }),
    ]);

    const customers = users.map((user) => {
        const paidOrders = user.orders.filter((o) => o.paymentStatus === 'PAID');
        const totalSpent = paidOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

        return {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.addresses[0]?.phone ?? null,
            isActive: user.isActive,
            createdAt: user.createdAt,
            totalOrders: user.orders.length,
            totalSpent: Number(totalSpent.toFixed(2)),
        };
    });

    return {
        customers,
        total,
        page: Number(page),
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
};

const setCustomerStatus = async (userId, isActive) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || user.role !== 'CUSTOMER') {
        const err = new Error('Customer not found');
        err.statusCode = 404;
        throw err;
    }

    const updated = await prisma.user.update({
        where: { id: userId },
        data: { isActive },
        select: {
            id: true,
            name: true,
            email: true,
            isActive: true,
            createdAt: true,
        },
    });

    return updated;
};

module.exports = { getAllCustomers, setCustomerStatus };
