const prisma = require('../../config/db');

const toggleWishlist = async (userId, productId) => {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.isActive) {
        const err = new Error('Product not found');
        err.statusCode = 404;
        throw err;
    }

    const existing = await prisma.wishlist.findUnique({
        where: { userId_productId: { userId, productId } },
    });

    if (existing) {
        await prisma.wishlist.delete({
            where: { userId_productId: { userId, productId } },
        });
        return { action: 'removed', productId };
    }

    await prisma.wishlist.create({ data: { userId, productId } });
    return { action: 'added', productId };
};

const getWishlist = async (userId, { page = 1, limit = 20 }) => {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
        prisma.wishlist.findMany({
            where: { userId },
            include: {
                product: {
                    include: {
                        images: { where: { isPrimary: true } },
                        variants: { where: { isActive: true }, orderBy: { price: 'asc' }, take: 1 },
                        category: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: Number(limit),
        }),
        prisma.wishlist.count({ where: { userId } }),
    ]);

    return {
        items,
        total,
        page: Number(page),
        totalPages: Math.ceil(total / limit),
    };
};

const isWishlisted = async (userId, productId) => {
    const item = await prisma.wishlist.findUnique({
        where: { userId_productId: { userId, productId } },
    });
    return { isWishlisted: !!item, productId };
};

const clearWishlist = async (userId) => {
    await prisma.wishlist.deleteMany({ where: { userId } });
};

const getWishlistIds = async (userId) => {
    const items = await prisma.wishlist.findMany({
        where: { userId },
        select: { productId: true },
        orderBy: { createdAt: 'desc' },
    });
    return { productIds: items.map((item) => item.productId) };
};

module.exports = { toggleWishlist, getWishlist, isWishlisted, clearWishlist, getWishlistIds };