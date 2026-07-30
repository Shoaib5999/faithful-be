const prisma = require('../../../config/db');

const getOverview = async () => {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
        totalRevenue,
        totalOrders,
        totalProducts,
        totalUsers,
        todayOrders,
        todayRevenue,
        monthRevenue,
        pendingOrders,
        pendingReviews,
        lowStockVariants,
    ] = await Promise.all([
        // Total revenue (paid orders only)
        prisma.order.aggregate({
            where: { paymentStatus: 'PAID' },
            _sum: { total: true },
        }),
        // Total orders
        prisma.order.count(),
        // Total active products
        prisma.product.count({ where: { isActive: true } }),
        // Total customers
        prisma.user.count({ where: { role: 'CUSTOMER' } }),
        // Today's orders
        prisma.order.count({ where: { createdAt: { gte: startOfDay } } }),
        // Today's revenue
        prisma.order.aggregate({
            where: { paymentStatus: 'PAID', createdAt: { gte: startOfDay } },
            _sum: { total: true },
        }),
        // This month's revenue
        prisma.order.aggregate({
            where: { paymentStatus: 'PAID', createdAt: { gte: startOfMonth } },
            _sum: { total: true },
        }),
        // Pending orders
        prisma.order.count({ where: { status: 'PENDING' } }),
        // Pending reviews
        prisma.review.count({ where: { status: 'PENDING' } }),
        // Low stock (less than 10 units)
        prisma.productVariant.count({ where: { stockQty: { lte: 10 }, isActive: true } }),
    ]);

    return {
        revenue: {
            total: Number(totalRevenue._sum.total || 0).toFixed(2),
            today: Number(todayRevenue._sum.total || 0).toFixed(2),
            thisMonth: Number(monthRevenue._sum.total || 0).toFixed(2),
        },
        orders: {
            total: totalOrders,
            today: todayOrders,
            pending: pendingOrders,
        },
        products: { total: totalProducts, lowStock: lowStockVariants },
        users: { total: totalUsers },
        reviews: { pending: pendingReviews },
    };
};

const getRevenueByDate = async ({ from, to, groupBy = 'day' }) => {
    const startDate = from ? new Date(from) : new Date(new Date().setDate(new Date().getDate() - 30));
    const endDate = to ? new Date(to) : new Date();

    const orders = await prisma.order.findMany({
        where: {
            paymentStatus: 'PAID',
            createdAt: { gte: startDate, lte: endDate },
        },
        select: { total: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
    });

    // Group by day or month
    const grouped = {};
    orders.forEach((order) => {
        const date = order.createdAt;
        let key;
        if (groupBy === 'month') {
            key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        } else {
            key = date.toISOString().split('T')[0];
        }

        if (!grouped[key]) grouped[key] = { date: key, revenue: 0, orders: 0 };
        grouped[key].revenue += Number(order.total);
        grouped[key].orders += 1;
    });

    return Object.values(grouped).map((g) => ({
        ...g,
        revenue: g.revenue.toFixed(2),
    }));
};

const getTopProducts = async ({ limit = 10, from, to }) => {
    const startDate = from ? new Date(from) : new Date(new Date().setDate(new Date().getDate() - 30));
    const endDate = to ? new Date(to) : new Date();

    const topItems = await prisma.orderItem.groupBy({
        by: ['variantId'],
        where: {
            order: {
                createdAt: { gte: startDate, lte: endDate },
                status: { not: 'CANCELLED' },
            },
        },
        _sum: { quantity: true },
        _count: { variantId: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: Number(limit),
    });

    const enriched = await Promise.all(
        topItems.map(async (item) => {
            const variant = await prisma.productVariant.findUnique({
                where: { id: item.variantId },
                include: { product: { select: { id: true, name: true } } },
            });
            return {
                variantId: item.variantId,
                product: variant?.product,
                weightGrams: variant?.weightGrams,
                totalSold: item._sum.quantity,
                orderCount: item._count.variantId,
            };
        })
    );

    return enriched;
};

const getOrderStatusBreakdown = async () => {
    const breakdown = await prisma.order.groupBy({
        by: ['status'],
        _count: { status: true },
    });

    return breakdown.map((b) => ({ status: b.status, count: b._count.status }));
};

const getLowStockProducts = async ({ threshold = 10 }) => {
    return await prisma.productVariant.findMany({
        where: { stockQty: { lte: Number(threshold) }, isActive: true },
        include: { product: { select: { id: true, name: true } } },
        orderBy: { stockQty: 'asc' },
    });
};

module.exports = {
    getOverview,
    getRevenueByDate,
    getTopProducts,
    getOrderStatusBreakdown,
    getLowStockProducts,
};