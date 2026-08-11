const prisma = require('../../config/db');
const { getOrSetCache } = require('../../utils/cache');

const FILTER_CACHE_TTL = 300;

const searchProducts = async ({
    q,
    categoryId,
    categorySlug,
    minPrice,
    maxPrice,
    minRating,
    inStock,
    sortBy,
    page = 1,
    limit = 20,
}) => {
    const skip = (page - 1) * Number(limit);

    // --- Build WHERE clause (Postgres, $N positional placeholders, quoted camelCase identifiers) ---
    const conditions = [`p."isActive" = true`];
    const params = [];
    let paramIndex = 1;

    const nextParam = (value) => {
        params.push(value);
        return `$${paramIndex++}`;
    };

    // Full text search (Postgres native tsvector/tsquery — matches the GIN index from prisma/seed-indexes.js)
    let searchTsquery = null;
    if (q && q.trim()) {
        searchTsquery = nextParam(q.trim());
        conditions.push(
            `to_tsvector('english', coalesce(p.name, '') || ' ' || coalesce(p.description, '') || ' ' || coalesce(p.tags, '')) @@ plainto_tsquery('english', ${searchTsquery})`,
        );
    }

    // Category filter by ID
    if (categoryId) {
        conditions.push(`p."categoryId" = ${nextParam(categoryId)}`);
    }

    // Category filter by slug
    if (categorySlug) {
        conditions.push(`c.slug = ${nextParam(categorySlug)}`);
    }

    // Price range filter (through variants)
    if (minPrice) {
        conditions.push(
            `(SELECT MIN(pv.price) FROM "ProductVariant" pv WHERE pv."productId" = p.id AND pv."isActive" = true) >= ${nextParam(Number(minPrice))}`,
        );
    }

    if (maxPrice) {
        conditions.push(
            `(SELECT MIN(pv.price) FROM "ProductVariant" pv WHERE pv."productId" = p.id AND pv."isActive" = true) <= ${nextParam(Number(maxPrice))}`,
        );
    }

    // In stock filter
    if (inStock === 'true') {
        conditions.push(
            `EXISTS (SELECT 1 FROM "ProductVariant" pv WHERE pv."productId" = p.id AND pv."isActive" = true AND pv."stockQty" > 0)`,
        );
    }

    // Rating filter
    if (minRating) {
        conditions.push(
            `(SELECT COALESCE(AVG(r.rating), 0) FROM "Review" r WHERE r."productId" = p.id AND r.status = 'APPROVED') >= ${nextParam(Number(minRating))}`,
        );
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // --- Build ORDER BY ---
    let orderClause = `ORDER BY p."createdAt" DESC`;
    if (searchTsquery && !sortBy) {
        orderClause = `ORDER BY ts_rank(to_tsvector('english', coalesce(p.name, '') || ' ' || coalesce(p.description, '') || ' ' || coalesce(p.tags, '')), plainto_tsquery('english', ${searchTsquery})) DESC`;
    } else if (sortBy === 'price_asc') {
        orderClause = `ORDER BY (SELECT MIN(pv.price) FROM "ProductVariant" pv WHERE pv."productId" = p.id AND pv."isActive" = true) ASC`;
    } else if (sortBy === 'price_desc') {
        orderClause = `ORDER BY (SELECT MIN(pv.price) FROM "ProductVariant" pv WHERE pv."productId" = p.id AND pv."isActive" = true) DESC`;
    } else if (sortBy === 'rating') {
        orderClause = `ORDER BY (SELECT COALESCE(AVG(r.rating), 0) FROM "Review" r WHERE r."productId" = p.id AND r.status = 'APPROVED') DESC`;
    } else if (sortBy === 'newest') {
        orderClause = `ORDER BY p."createdAt" DESC`;
    } else if (sortBy === 'popular') {
        orderClause = `ORDER BY (SELECT COALESCE(COUNT(oi.id), 0) FROM "OrderItem" oi JOIN "ProductVariant" pv2 ON oi."variantId" = pv2.id WHERE pv2."productId" = p.id) DESC`;
    }

    // Count query
    const countSql = `
    SELECT COUNT(DISTINCT p.id) as total
    FROM "Product" p
    LEFT JOIN "Category" c ON p."categoryId" = c.id
    ${whereClause}
  `;

    // Main query — no DISTINCT needed: categoryId is a single required FK, so this
    // join can never produce more than one row per product (and DISTINCT would
    // require every ORDER BY expression, e.g. ts_rank(...), to also be selected).
    const limitParam = nextParam(Number(limit));
    const offsetParam = nextParam(skip);
    const dataSql = `
    SELECT p.id
    FROM "Product" p
    LEFT JOIN "Category" c ON p."categoryId" = c.id
    ${whereClause}
    ${orderClause}
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `;

    // Count query must not include the LIMIT/OFFSET params
    const countParams = params.slice(0, params.length - 2);
    const dataParams = params;

    const [countResult, productIds] = await Promise.all([
        prisma.$queryRawUnsafe(countSql, ...countParams),
        prisma.$queryRawUnsafe(dataSql, ...dataParams),
    ]);

    const total = Number(countResult[0]?.total || 0);
    const ids = productIds.map((r) => r.id);

    if (!ids.length) {
        return { products: [], total: 0, page: Number(page), limit: Number(limit), totalPages: 0 };
    }

    // Fetch full product data via Prisma for clean relational output
    const products = await prisma.product.findMany({
        where: { id: { in: ids } },
        include: {
            category: { select: { id: true, name: true, slug: true } },
            variants: { where: { isActive: true }, orderBy: { price: 'asc' } },
            images: { where: { isPrimary: true } },
        },
    });

    // Attach average ratings in one grouped query
    const ratingRows = await prisma.review.groupBy({
        by: ['productId'],
        where: {
            productId: { in: ids },
            status: 'APPROVED',
        },
        _avg: { rating: true },
        _count: { rating: true },
    });

    const ratingByProductId = new Map(
        ratingRows.map((row) => [
            row.productId,
            {
                avgRating: Number((row._avg.rating || 0).toFixed(1)),
                reviewCount: row._count.rating,
            },
        ]),
    );

    const enriched = products.map((product) => {
        const rating = ratingByProductId.get(product.id);
        return {
            ...product,
            avgRating: rating?.avgRating ?? 0,
            reviewCount: rating?.reviewCount ?? 0,
        };
    });

    // Re-sort enriched products to preserve raw SQL order
    const sortedEnriched = ids.map((id) => enriched.find((p) => p.id === id)).filter(Boolean);

    return {
        products: sortedEnriched,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
    };
};

const getFilterOptions = async (categorySlug) =>
    getOrSetCache(['product', 'category'], ['filters', categorySlug], FILTER_CACHE_TTL, async () => {
        const where = { isActive: true };
        if (categorySlug) {
            const category = await prisma.category.findUnique({ where: { slug: categorySlug } });
            if (category) where.categoryId = category.id;
        }

        const [priceRange, categories] = await Promise.all([
            // Min and max price across all active variants
            prisma.productVariant.aggregate({
                where: { isActive: true, product: where },
                _min: { price: true },
                _max: { price: true },
            }),
            // All active categories
            prisma.category.findMany({
                where: { isActive: true },
                select: { id: true, name: true, slug: true },
                orderBy: { name: 'asc' },
            }),
        ]);

        return {
            priceRange: {
                min: Number(priceRange._min.price || 0),
                max: Number(priceRange._max.price || 0),
            },
            categories,
            sortOptions: [
                { value: 'newest', label: 'Newest First' },
                { value: 'price_asc', label: 'Price: Low to High' },
                { value: 'price_desc', label: 'Price: High to Low' },
                { value: 'rating', label: 'Top Rated' },
                { value: 'popular', label: 'Most Popular' },
            ],
            ratingOptions: [5, 4, 3, 2, 1],
        };
    });

const getSuggestions = async (q, limit = 6) => {
    if (!q || q.trim().length < 2) return [];

    const products = await prisma.product.findMany({
        where: {
            isActive: true,
            OR: [
                { name: { contains: q.trim(), mode: 'insensitive' } },
                { tags: { contains: q.trim(), mode: 'insensitive' } },
            ],
        },
        select: {
            id: true,
            name: true,
            slug: true,
            images: { where: { isPrimary: true }, select: { url: true } },
            variants: { where: { isActive: true }, orderBy: { price: 'asc' }, take: 1, select: { price: true } },
        },
        take: Number(limit),
    });

    return products.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        image: p.images[0]?.url || null,
        startingPrice: p.variants[0]?.price || null,
    }));
};

module.exports = { searchProducts, getFilterOptions, getSuggestions };
