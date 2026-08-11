const prisma = require('../../config/db');
const slugify = require('../../utils/slugify');
const { getOrSetCache, invalidateNamespace } = require('../../utils/cache');

const CACHE_TTL = 300;
const invalidateCutTypeCache = () => invalidateNamespace('cuttype');

const mapType = (row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    imageUrl: row.imageUrl,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
});

const getAllTypes = async ({ activeOnly = false } = {}) => {
    const rows = await prisma.cutType.findMany({
        where: activeOnly ? { isActive: true } : undefined,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(mapType);
};

const getPublicTypes = async () =>
    getOrSetCache(['cuttype'], ['public'], CACHE_TTL, () => getAllTypes({ activeOnly: true }));

const getTypeById = async (id) => {
    const row = await prisma.cutType.findUnique({ where: { id } });
    if (!row) {
        const err = new Error('Cut type not found');
        err.statusCode = 404;
        throw err;
    }
    return mapType(row);
};

const createType = async ({ name, slug, imageUrl, sortOrder, isActive }) => {
    const resolvedSlug = slugify(slug || name);
    const existing = await prisma.cutType.findUnique({ where: { slug: resolvedSlug } });
    if (existing) {
        const err = new Error('A cut type with this slug already exists');
        err.statusCode = 409;
        throw err;
    }

    const maxOrder = await prisma.cutType.aggregate({ _max: { sortOrder: true } });
    const row = await prisma.cutType.create({
        data: {
            name,
            slug: resolvedSlug,
            imageUrl: imageUrl || null,
            sortOrder: sortOrder ?? (maxOrder._max.sortOrder ?? -1) + 1,
            isActive: isActive ?? true,
        },
    });
    await invalidateCutTypeCache();
    return mapType(row);
};

const updateType = async (id, data) => {
    await getTypeById(id);

    if (data.name && !data.slug) {
        data.slug = slugify(data.name);
    } else if (data.slug) {
        data.slug = slugify(data.slug);
    }

    if (data.slug) {
        const clash = await prisma.cutType.findFirst({
            where: { slug: data.slug, NOT: { id } },
        });
        if (clash) {
            const err = new Error('A cut type with this slug already exists');
            err.statusCode = 409;
            throw err;
        }
    }

    const row = await prisma.cutType.update({
        where: { id },
        data: {
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.slug !== undefined ? { slug: data.slug } : {}),
            ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
            ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
    });
    await invalidateCutTypeCache();
    return mapType(row);
};

const deleteType = async (id) => {
    await getTypeById(id);
    await prisma.cutType.delete({ where: { id } });
    await invalidateCutTypeCache();
};

const reorderTypes = async (orderedIds) => {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        const err = new Error('orderedIds must be a non-empty array');
        err.statusCode = 400;
        throw err;
    }

    await prisma.$transaction(
        orderedIds.map((id, index) =>
            prisma.cutType.update({
                where: { id },
                data: { sortOrder: index },
            }),
        ),
    );

    await invalidateCutTypeCache();

    return getAllTypes();
};

module.exports = {
    getAllTypes,
    getPublicTypes,
    getTypeById,
    createType,
    updateType,
    deleteType,
    reorderTypes,
};
