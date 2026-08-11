const prisma = require('../../config/db');
const { getOrSetCache, invalidateNamespace } = require('../../utils/cache');

const CACHE_TTL = 300;
const invalidateSliderCache = () => invalidateNamespace('cmsslider');

const mapSlider = (row) => ({
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    imageUrl: row.imageUrl,
    imageUrlMobile: row.imageUrlMobile,
    linkUrl: row.linkUrl,
    linkLabel: row.linkLabel,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    startDate: row.startDate ? row.startDate.toISOString() : null,
    endDate: row.endDate ? row.endDate.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
});

const getAllSliders = async () => {
    const rows = await prisma.cmsSlider.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(mapSlider);
};

const getPublicSliders = async () =>
    getOrSetCache(['cmsslider'], ['public'], CACHE_TTL, async () => {
        const rows = await prisma.cmsSlider.findMany({
            where: { isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
        return rows
            .map(mapSlider)
            .filter((slider) => slider.imageUrl || slider.imageUrlMobile);
    });

const getSliderById = async (id) => {
    const row = await prisma.cmsSlider.findUnique({ where: { id } });
    if (!row) {
        const err = new Error('Slider not found');
        err.statusCode = 404;
        throw err;
    }
    return mapSlider(row);
};

const createSlider = async (data) => {
    const maxOrder = await prisma.cmsSlider.aggregate({ _max: { sortOrder: true } });
    const sortOrder = data.sortOrder ?? (maxOrder._max.sortOrder ?? -1) + 1;

    const row = await prisma.cmsSlider.create({
        data: {
            title: data.title ?? '',
            subtitle: data.subtitle ?? '',
            imageUrl: data.imageUrl ?? null,
            imageUrlMobile: data.imageUrlMobile ?? null,
            linkUrl: data.linkUrl ?? '/collection',
            linkLabel: data.linkLabel ?? 'Discover Collection',
            sortOrder,
            isActive: data.isActive ?? true,
            startDate: data.startDate ? new Date(data.startDate) : null,
            endDate: data.endDate ? new Date(data.endDate) : null,
        },
    });

    await invalidateSliderCache();

    return mapSlider(row);
};

const updateSlider = async (id, data) => {
    await getSliderById(id);

    const row = await prisma.cmsSlider.update({
        where: { id },
        data: {
            ...(data.title !== undefined ? { title: data.title } : {}),
            ...(data.subtitle !== undefined ? { subtitle: data.subtitle } : {}),
            ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
            ...(data.imageUrlMobile !== undefined ? { imageUrlMobile: data.imageUrlMobile } : {}),
            ...(data.linkUrl !== undefined ? { linkUrl: data.linkUrl } : {}),
            ...(data.linkLabel !== undefined ? { linkLabel: data.linkLabel } : {}),
            ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
            ...(data.startDate !== undefined
                ? { startDate: data.startDate ? new Date(data.startDate) : null }
                : {}),
            ...(data.endDate !== undefined
                ? { endDate: data.endDate ? new Date(data.endDate) : null }
                : {}),
        },
    });

    await invalidateSliderCache();

    return mapSlider(row);
};

const deleteSlider = async (id) => {
    await getSliderById(id);
    await prisma.cmsSlider.delete({ where: { id } });
    await invalidateSliderCache();
};

const reorderSliders = async (orderedIds) => {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        const err = new Error('orderedIds must be a non-empty array');
        err.statusCode = 400;
        throw err;
    }

    await prisma.$transaction(
        orderedIds.map((id, index) =>
            prisma.cmsSlider.update({
                where: { id },
                data: { sortOrder: index },
            }),
        ),
    );

    await invalidateSliderCache();

    return getAllSliders();
};

module.exports = {
    getAllSliders,
    getPublicSliders,
    getSliderById,
    createSlider,
    updateSlider,
    deleteSlider,
    reorderSliders,
};
