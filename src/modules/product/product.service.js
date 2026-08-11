const prisma = require('../../config/db');
const slugify = require('../../utils/slugify');
const { normalizeSKU, ensureUniqueVariantSKUs } = require('../../utils/variant-sku');
const { getOrSetCache, invalidateNamespace } = require('../../utils/cache');

const STOREFRONT_MAX_LIMIT = 50;
const ADMIN_MAX_LIMIT = 100;
const CACHE_TTL = 300;

// Product reads embed brand/category/taxClass, so their cache must be invalidated
// whenever any of those namespaces changes, not just 'product' itself.
const PRODUCT_READ_DEPS = ['product', 'category', 'masterdata'];

// Every write that can change what a storefront product read returns (price, stock,
// name, images, variants, active state, ...) must call this before returning.
const invalidateProductCache = () => invalidateNamespace('product');

const clampLimit = (value, max) =>
    Math.min(Math.max(Number(value) || 20, 1), max);

const applyStorefrontQuickFilters = (where, quickFilters) => {
    const filters = String(quickFilters || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);

    if (!filters.length) return;

    for (const filter of filters) {
        if (filter === 'new-arrivals') {
            where.AND = [
                ...(where.AND || []),
                { tags: { contains: 'badge:new-arrivals' } },
            ];
        } else if (filter === 'best-sellers') {
            where.AND = [
                ...(where.AND || []),
                { tags: { contains: 'badge:best-sellers' } },
            ];
        } else if (filter === 'in-stock') {
            where.AND = [
                ...(where.AND || []),
                {
                    variants: {
                        some: {
                            isActive: true,
                            stockQty: { gt: 0 },
                        },
                    },
                },
            ];
        }
    }
};

const getOnSaleProductIds = async () => {
    const rows = await prisma.$queryRaw`
        SELECT DISTINCT "productId" AS id
        FROM "ProductVariant"
        WHERE "isActive" = true
          AND "compareAtPrice" IS NOT NULL
          AND "compareAtPrice" > price
    `;

    return rows.map((row) => row.id);
};

const createProduct = async ({
    name,
    description,
    categoryId,
    brandId,
    taxClassId,
    status,
    tags,
    storefrontMeta,
    sortOrder,
    variants,
}) => {
    let slug = slugify(name);

    const existing =
        await prisma.product.findUnique({
            where: { slug },
        });

    if (existing) {
        slug = `${slug}-${Date.now()}`;
    }

    await ensureUniqueVariantSKUs(variants);

    const product =
        await prisma.product.create({
            data: {
                name,
                slug,
                description,
                categoryId,

                brandId:
                    brandId || null,

                taxClassId:
                    taxClassId || null,

                isActive: status === 'active',

                tags,

                storefrontMeta: storefrontMeta ?? undefined,

                sortOrder: sortOrder != null ? Number(sortOrder) : 0,

                variants: {
                    create: variants.map((v) => ({
                        weightGrams: Number(v.weightGrams),
                        price: Number(v.price),
                        compareAtPrice:
                            v.compareAtPrice != null && v.compareAtPrice !== ''
                                ? Number(v.compareAtPrice)
                                : null,
                        stockQty: Number(v.stockQty) || 0,
                        sku: normalizeSKU(v.sku),
                    })),
                },
            },

            include: {
                variants: true,
                category: true,

                brand: {
                    select: {
                        id: true,
                        name: true,
                        logoUrl: true,
                    },
                },

                taxClass: true,
            },
        });

    await invalidateProductCache();

    return product;
};

const getAdminProducts = async ({
    page = 1,
    limit = 200,
    categoryId,
    brandId,
    search,
    status,
    sortBy = 'display_order',
}) => {
    const resolvedLimit = clampLimit(limit, ADMIN_MAX_LIMIT);
    const skip = (page - 1) * resolvedLimit;
    const where = {};

    if (status === 'active') {
        where.isActive = true;
    } else if (status === 'draft' || status === 'archived') {
        where.isActive = false;
    }

    if (categoryId) {
        where.categoryId = categoryId;
    }

    if (brandId) {
        where.brandId = brandId;
    }

    if (search) {
        where.OR = [
            { name: { contains: search } },
            { description: { contains: search } },
            { tags: { contains: search } },
            { slug: { contains: search } },
            { brand: { is: { name: { contains: search } } } },
            { variants: { some: { sku: { contains: search } } } },
        ];
    }

    let orderBy = [{ sortOrder: 'asc' }, { createdAt: 'desc' }];

    if (sortBy === 'newest') {
        orderBy = [{ createdAt: 'desc' }];
    } else if (sortBy === 'name_asc') {
        orderBy = [{ name: 'asc' }];
    } else if (sortBy === 'name_desc') {
        orderBy = [{ name: 'desc' }];
    } else if (sortBy === 'display_order') {
        orderBy = [{ sortOrder: 'asc' }, { createdAt: 'desc' }];
    }

    const [products, total] = await Promise.all([
        prisma.product.findMany({
            where,
            include: {
                variants: { orderBy: { weightGrams: 'asc' } },
                images: { orderBy: { sortOrder: 'asc' } },
                category: true,
                brand: {
                    select: { id: true, name: true, logoUrl: true },
                },
                taxClass: true,
            },
            skip,
            take: resolvedLimit,
            orderBy,
        }),
        prisma.product.count({ where }),
    ]);

    return {
        products,
        total,
        page: Number(page),
        limit: resolvedLimit,
        totalPages: Math.ceil(total / resolvedLimit),
    };
};

const getAllProducts = async (params) =>
    getOrSetCache(PRODUCT_READ_DEPS, ['product-list', params], CACHE_TTL, () =>
        fetchAllProducts(params),
    );

const fetchAllProducts = async ({
    page = 1,
    limit = 20,
    categoryId,
    categorySlug,
    brandSlug,
    minPrice,
    maxPrice,
    search,
    sortBy,
    quickFilters,
    cutTypeSlug,
}) => {
    const resolvedLimit = clampLimit(limit, STOREFRONT_MAX_LIMIT);
    const skip = (page - 1) * resolvedLimit;

    const where = {
        isActive: true,
    };

    if (categoryId) {
        where.categoryId = categoryId;
    }

    if (categorySlug) {
        where.category = { is: { slug: categorySlug } };
    }

    if (brandSlug) {
        where.brand = { is: { slug: brandSlug } };
    }

    if (search) {
        where.OR = [
            { name: { contains: search } },
            { description: { contains: search } },
            { tags: { contains: search } },
            { slug: { contains: search } },
            {
                brand: {
                    is: {
                        name: { contains: search },
                    },
                },
            },
        ];
    }

    if (minPrice || maxPrice) {
        where.variants = {
            some: {
                isActive: true,
                price: {
                    ...(minPrice && { gte: parseFloat(minPrice) }),
                    ...(maxPrice && { lte: parseFloat(maxPrice) }),
                },
            },
        };
    }

    applyStorefrontQuickFilters(where, quickFilters);

    const quickFilterList = String(quickFilters || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);

    if (quickFilterList.includes('on-sale')) {
        const onSaleIds = await getOnSaleProductIds();
        where.AND = [
            ...(where.AND || []),
            { id: { in: onSaleIds.length ? onSaleIds : ['__none__'] } },
        ];
    }

    if (cutTypeSlug) {
        const cutType = await prisma.cutType.findFirst({
            where: { slug: cutTypeSlug, isActive: true },
        });

        // Multi-cuts may be stored as `cut:Boneless+CurryCut` or separate `cut:Boneless, cut:CurryCut`.
        // `contains: cut:CurryCut` misses the first format when CurryCut is not first.
        if (cutType) {
            const name = cutType.name;
            where.AND = [
                ...(where.AND || []),
                {
                    OR: [
                        { tags: { contains: `cut:${name}` } },
                        { tags: { contains: `+${name}` } },
                    ],
                },
            ];
        } else {
            where.AND = [
                ...(where.AND || []),
                {
                    OR: [
                        { tags: { contains: `cut:${cutTypeSlug}` } },
                        { tags: { contains: `+${cutTypeSlug}` } },
                        { tags: { contains: cutTypeSlug } },
                    ],
                },
            ];
        }
    }

    const productInclude = {
        variants: {
            where: {
                isActive: true,
            },
        },
        images: {
            orderBy: {
                sortOrder: 'asc',
            },
        },
        category: true,
        brand: {
            select: {
                id: true,
                name: true,
                logoUrl: true,
                slug: true,
            },
        },
        taxClass: true,
    };

    // Prisma only supports `_count` for to-many orderBy — price needs groupBy.
    if (sortBy === 'price_asc' || sortBy === 'price_desc') {
        const [total, grouped] = await Promise.all([
            prisma.product.count({ where }),
            prisma.productVariant.groupBy({
                by: ['productId'],
                where: {
                    isActive: true,
                    product: where,
                },
                _min: { price: true },
                orderBy: {
                    _min: {
                        price: sortBy === 'price_asc' ? 'asc' : 'desc',
                    },
                },
                skip,
                take: resolvedLimit,
            }),
        ]);

        const orderedIds = grouped.map((row) => row.productId);
        const unordered =
            orderedIds.length === 0
                ? []
                : await prisma.product.findMany({
                      where: { id: { in: orderedIds } },
                      include: productInclude,
                  });
        const byId = new Map(unordered.map((product) => [product.id, product]));
        const products = orderedIds.map((id) => byId.get(id)).filter(Boolean);

        return {
            products,
            total,
            page: Number(page),
            limit: resolvedLimit,
            totalPages: Math.ceil(total / resolvedLimit) || 0,
        };
    }

    let orderBy = [{ sortOrder: 'asc' }, { createdAt: 'desc' }];

    if (sortBy === 'newest') {
        orderBy = [{ createdAt: 'desc' }];
    } else if (sortBy === 'name_asc') {
        orderBy = [{ name: 'asc' }];
    } else if (sortBy === 'name_desc') {
        orderBy = [{ name: 'desc' }];
    }

    const [products, total] = await Promise.all([
        prisma.product.findMany({
            where,
            include: productInclude,
            skip,
            take: resolvedLimit,
            orderBy,
        }),
        prisma.product.count({ where }),
    ]);

    return {
        products,
        total,
        page: Number(page),
        limit: resolvedLimit,
        totalPages: Math.ceil(total / resolvedLimit) || 0,
    };
};

const getProductById = async (id) =>
    getOrSetCache(PRODUCT_READ_DEPS, ['product-by-id', id], CACHE_TTL, () =>
        fetchProductById(id),
    );

const fetchProductById = async (id) => {
    const product =
        await prisma.product.findUnique({
            where: { id },

            include: {
                variants: {
                    where: {
                        isActive: true,
                    },
                },

                images: {
                    orderBy: {
                        sortOrder: 'asc',
                    },
                },

                category: true,

                brand: {
                    select: {
                        id: true,
                        name: true,
                        logoUrl: true,
                    },
                },

                taxClass: true,
            },
        });

    if (!product) {
        const err = new Error(
            'Product not found'
        );

        err.statusCode = 404;
        throw err;
    }

    const ratingData =
        await prisma.review.aggregate({
            where: {
                productId: id,
                status: 'APPROVED',
            },

            _avg: {
                rating: true,
            },

            _count: {
                rating: true,
            },
        });

    return {
        ...product,

        avgRating: Number(
            (
                ratingData._avg.rating ||
                0
            ).toFixed(1)
        ),

        reviewCount:
            ratingData._count.rating,
    };
};

const getProductBySlug = async (slug) =>
    getOrSetCache(PRODUCT_READ_DEPS, ['product-by-slug', slug], CACHE_TTL, () =>
        fetchProductBySlug(slug),
    );

const fetchProductBySlug = async (slug) => {
    const product = await prisma.product.findFirst({
        where: { slug, isActive: true },
        include: {
            variants: {
                where: { isActive: true },
                orderBy: { weightGrams: 'asc' },
            },
            images: { orderBy: { sortOrder: 'asc' } },
            category: true,
            brand: {
                select: { id: true, name: true, logoUrl: true },
            },
            taxClass: true,
        },
    });

    if (!product) {
        const err = new Error('Product not found');
        err.statusCode = 404;
        throw err;
    }

    const ratingData = await prisma.review.aggregate({
        where: { productId: product.id, status: 'APPROVED' },
        _avg: { rating: true },
        _count: { rating: true },
    });

    return {
        ...product,
        avgRating: Number((ratingData._avg.rating || 0).toFixed(1)),
        reviewCount: ratingData._count.rating,
    };
};

const updateProduct = async (id, data) => {
    const productData = { ...data };

    delete productData.variants;
    delete productData.images;
    delete productData.brand;
    delete productData.category;
    delete productData.taxClass;
    delete productData.avgRating;
    delete productData.reviewCount;

    if (productData.status !== undefined) {
        productData.isActive = productData.status === 'active';
        delete productData.status;
    }

    if (productData.name) {
        const existing = await prisma.product.findUnique({
            where: { id },
            select: { name: true, slug: true },
        });

        if (!existing) {
            const err = new Error('Product not found');
            err.statusCode = 404;
            throw err;
        }

        if (productData.name !== existing.name) {
            let slug = slugify(productData.name);
            const conflict = await prisma.product.findFirst({
                where: { slug, NOT: { id } },
            });
            if (conflict) {
                slug = `${slug}-${Date.now()}`;
            }
            productData.slug = slug;
        }
    }

    if (productData.brandId === '') {
        productData.brandId = null;
    }

    if (productData.taxClassId === '') {
        productData.taxClassId = null;
    }

    const product = await prisma.product.update({
        where: { id },
        data: productData,
        include: {
            variants: { orderBy: { weightGrams: 'asc' } },
            images: { orderBy: { sortOrder: 'asc' } },
            brand: {
                select: { id: true, name: true, logoUrl: true },
            },
            category: true,
            taxClass: true,
        },
    });

    await invalidateProductCache();

    return product;
};

const deleteProduct = async (id) => {
    await prisma.product.update({
        where: { id },

        data: {
            isActive: false,
        },
    });

    await invalidateProductCache();
};

const addVariant = async (productId, { weightGrams, price, compareAtPrice, stockQty, sku }) => {
    const normalizedSKU = normalizeSKU(sku);
    await ensureUniqueVariantSKUs([{ sku: normalizedSKU }]);

    const variant = await prisma.productVariant.create({
        data: {
            productId,
            weightGrams: Number(weightGrams),
            price: Number(price),
            compareAtPrice:
                compareAtPrice != null && compareAtPrice !== ''
                    ? Number(compareAtPrice)
                    : null,
            stockQty: Number(stockQty) || 0,
            sku: normalizedSKU,
        },
    });

    await invalidateProductCache();

    return variant;
};

const updateVariant = async (
    variantId,
    data
) => {
    const updateData = { ...data };

    if (updateData.sku !== undefined) {
        updateData.sku = normalizeSKU(updateData.sku);
        await ensureUniqueVariantSKUs(
            [{ sku: updateData.sku }],
            { excludeVariantId: variantId },
        );
    }

    const variant = await prisma.productVariant.update({
        where: { id: variantId },
        data: updateData,
    });

    // Price/stock changes must be visible immediately — bump before returning.
    await invalidateProductCache();

    return variant;
};

const deleteVariant = async (
    variantId
) => {
    await prisma.productVariant.update({
        where: {
            id: variantId,
        },

        data: {
            isActive: false,
        },
    });

    await invalidateProductCache();
};

const updateStock = async (
    variantId,
    stockQty
) => {
    const variant = await prisma.productVariant.update(
        {
            where: {
                id: variantId,
            },

            data: {
                stockQty:
                    Number(stockQty),
            },
        }
    );

    await invalidateProductCache();

    return variant;
};

const addProductImage = async (
    productId,
    {
        cloudinaryId,
        url,
        isPrimary,
        sortOrder,
    }
) => {
    if (isPrimary) {
        await prisma.productImage.updateMany(
            {
                where: {
                    productId,
                },

                data: {
                    isPrimary: false,
                },
            }
        );
    }

    const image = await prisma.productImage.create(
        {
            data: {
                productId,
                cloudinaryId,
                url,

                isPrimary:
                    isPrimary || false,

                sortOrder:
                    sortOrder || 0,
            },
        }
    );

    await invalidateProductCache();

    return image;
};

const deleteProductImage = async (
    imageId
) => {
    const image =
        await prisma.productImage.findUnique({
            where: {
                id: imageId,
            },
        });

    if (!image) {
        const err = new Error(
            'Image not found'
        );

        err.statusCode = 404;
        throw err;
    }

    await prisma.productImage.delete({
        where: {
            id: imageId,
        },
    });

    await invalidateProductCache();

    return image.cloudinaryId;
};

const countProductImages = async (productId) =>
    prisma.productImage.count({
        where: { productId },
    });

module.exports = {
    createProduct,
    getAdminProducts,
    getAllProducts,
    getProductById,
    getProductBySlug,
    updateProduct,
    deleteProduct,
    addVariant,
    updateVariant,
    deleteVariant,
    updateStock,
    addProductImage,
    deleteProductImage,
    countProductImages,
};
