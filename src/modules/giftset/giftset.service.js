const prisma = require('../../config/db');
const { getOrSetCache, invalidateNamespace } = require('../../utils/cache');

const CACHE_TTL = 300;
// Bundle items embed child product price, so reads also depend on 'product'.
const GIFTSET_READ_DEPS = ['giftset', 'product'];
const invalidateGiftsetCache = () => invalidateNamespace('giftset');

const addBundleItem = async (bundleProductId, { childProductId, variantId, quantity, sortOrder }) => {
    // Verify bundle product exists and belongs to Gift Set category
    const bundleProduct = await prisma.product.findUnique({
        where: { id: bundleProductId },
        include: { category: true },
    });

    if (!bundleProduct) {
        const err = new Error('Bundle product not found');
        err.statusCode = 404;
        throw err;
    }

    if (bundleProduct.category.slug !== 'gift-set') {
        const err = new Error('Product must belong to Gift Set category to have bundle items');
        err.statusCode = 400;
        throw err;
    }

    // Prevent self-bundling
    if (bundleProductId === childProductId) {
        const err = new Error('A product cannot be bundled with itself');
        err.statusCode = 400;
        throw err;
    }

    const childProduct = await prisma.product.findUnique({ where: { id: childProductId } });
    if (!childProduct) {
        const err = new Error('Child product not found');
        err.statusCode = 404;
        throw err;
    }

    const item = await prisma.productBundle.create({
        data: {
            bundleProductId,
            childProductId,
            variantId: variantId || null,
            quantity: quantity || 1,
            sortOrder: sortOrder || 0,
        },
        include: {
            childProduct: { select: { id: true, name: true, slug: true } },
            variant: { select: { id: true, weightGrams: true, price: true } },
        },
    });

    await invalidateGiftsetCache();

    return item;
};

const getBundleItems = async (bundleProductId) =>
    getOrSetCache(GIFTSET_READ_DEPS, ['bundle-items', bundleProductId], CACHE_TTL, async () => {
        const product = await prisma.product.findUnique({
            where: { id: bundleProductId },
            include: {
                bundleItems: {
                    include: {
                        childProduct: {
                            include: { images: { where: { isPrimary: true } } },
                        },
                        variant: true,
                    },
                    orderBy: { sortOrder: 'asc' },
                },
            },
        });

        if (!product) {
            const err = new Error('Product not found');
            err.statusCode = 404;
            throw err;
        }

        return product.bundleItems;
    });

const updateBundleItem = async (bundleItemId, { quantity, sortOrder }) => {
    const item = await prisma.productBundle.findUnique({ where: { id: bundleItemId } });
    if (!item) {
        const err = new Error('Bundle item not found');
        err.statusCode = 404;
        throw err;
    }

    const updated = await prisma.productBundle.update({
        where: { id: bundleItemId },
        data: {
            ...(quantity !== undefined && { quantity }),
            ...(sortOrder !== undefined && { sortOrder }),
        },
    });

    await invalidateGiftsetCache();

    return updated;
};

const removeBundleItem = async (bundleItemId) => {
    const item = await prisma.productBundle.findUnique({ where: { id: bundleItemId } });
    if (!item) {
        const err = new Error('Bundle item not found');
        err.statusCode = 404;
        throw err;
    }
    await prisma.productBundle.delete({ where: { id: bundleItemId } });
    await invalidateGiftsetCache();
};

const getGiftSets = async ({ page = 1, limit = 20 }) =>
    getOrSetCache(GIFTSET_READ_DEPS, ['list', { page, limit }], CACHE_TTL, async () => {
        const skip = (page - 1) * limit;

        const giftSetCategory = await prisma.category.findFirst({
            where: { slug: 'gift-set', isActive: true },
        });

        if (!giftSetCategory) {
            return { products: [], total: 0, page: Number(page), totalPages: 0 };
        }

        const [products, total] = await Promise.all([
            prisma.product.findMany({
                where: { categoryId: giftSetCategory.id, isActive: true },
                include: {
                    images: { where: { isPrimary: true } },
                    variants: { where: { isActive: true }, orderBy: { price: 'asc' } },
                    bundleItems: {
                        include: {
                            childProduct: { select: { id: true, name: true, slug: true } },
                            variant: { select: { id: true, weightGrams: true, price: true } },
                        },
                        orderBy: { sortOrder: 'asc' },
                    },
                },
                skip,
                take: Number(limit),
                orderBy: { createdAt: 'desc' },
            }),
            prisma.product.count({
                where: { categoryId: giftSetCategory.id, isActive: true },
            }),
        ]);

        return { products, total, page: Number(page), totalPages: Math.ceil(total / limit) };
    });

module.exports = { addBundleItem, getBundleItems, updateBundleItem, removeBundleItem, getGiftSets };