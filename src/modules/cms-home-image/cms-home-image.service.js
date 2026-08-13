const prisma = require('../../config/db');
const slugify = require('../../utils/slugify');
const { getOrSetCache, invalidateNamespace } = require('../../utils/cache');

const CACHE_TTL = 300;
const invalidateHomeImageCache = () => invalidateNamespace('cmshomeimage');

const VALID_SECTIONS = new Set(['category-archive', 'promo-banners', 'brand-intro']);

const DEFAULT_SLOTS = [
    {
        slotKey: 'chicken',
        section: 'category-archive',
        title: 'Chicken',
        subtitle: '',
        linkUrl: '/collection?category=chicken',
        sortOrder: 0,
    },
    {
        slotKey: 'mutton',
        section: 'category-archive',
        title: 'Mutton',
        subtitle: '',
        linkUrl: '/collection?category=mutton',
        sortOrder: 1,
    },
    {
        slotKey: 'fish',
        section: 'category-archive',
        title: 'Fish',
        subtitle: '',
        linkUrl: '/collection?category=fish',
        sortOrder: 2,
    },
    {
        slotKey: 'seafood',
        section: 'category-archive',
        title: 'Seafood',
        subtitle: '',
        linkUrl: '/collection?category=seafood',
        sortOrder: 3,
    },
    {
        slotKey: 'ready-to-cook',
        section: 'category-archive',
        title: 'Ready to Cook',
        subtitle: '',
        linkUrl: '/collection?category=ready-to-cook',
        sortOrder: 4,
    },
    {
        slotKey: 'eggs',
        section: 'category-archive',
        title: 'Eggs',
        subtitle: '',
        linkUrl: '/collection?category=eggs',
        sortOrder: 5,
    },
    {
        slotKey: 'free-delivery-banner',
        section: 'promo-banners',
        title: 'Free Delivery',
        subtitle: 'On orders above ₹999',
        linkUrl: '/collection',
        sortOrder: 0,
    },
    {
        slotKey: 'faithful-meat-promise',
        section: 'promo-banners',
        title: 'Fresh Meat. Faithful Promise.',
        subtitle: 'We follow strict hygiene and quality standards',
        linkUrl: '/about',
        sortOrder: 1,
    },
    {
        slotKey: 'faithful-meat-story',
        section: 'brand-intro',
        title: 'The Faithful Meat Promise',
        subtitle: 'Our story',
        linkUrl: '/about',
        sortOrder: 0,
    },
];

const mapHomeImage = (row) => ({
    id: row.id,
    slotKey: row.slotKey,
    section: row.section,
    title: row.title,
    subtitle: row.subtitle,
    imageUrl: row.imageUrl,
    imageUrlMobile: row.imageUrlMobile,
    linkUrl: row.linkUrl,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
});

const ensureDefaultSlots = async () => {
    const existing = await prisma.cmsHomeImage.findMany({ select: { slotKey: true } });
    const existingKeys = new Set(existing.map((row) => row.slotKey));
    const missing = DEFAULT_SLOTS.filter((slot) => !existingKeys.has(slot.slotKey));

    if (missing.length === 0) return;

    await prisma.cmsHomeImage.createMany({
        data: missing.map((slot) => ({
            slotKey: slot.slotKey,
            section: slot.section,
            title: slot.title,
            subtitle: slot.subtitle,
            linkUrl: slot.linkUrl,
            sortOrder: slot.sortOrder,
            isActive: true,
        })),
    });
};

const getAllHomeImages = async () => {
    await ensureDefaultSlots();
    const rows = await prisma.cmsHomeImage.findMany({
        orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(mapHomeImage);
};

const getPublicHomeImages = async () =>
    getOrSetCache(['cmshomeimage'], ['public'], CACHE_TTL, async () => {
        await ensureDefaultSlots();
        const rows = await prisma.cmsHomeImage.findMany({
            where: { isActive: true },
            orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
        return rows
            .map(mapHomeImage)
            .filter((item) => item.imageUrl || item.imageUrlMobile);
    });

const getHomeImageById = async (id) => {
    const row = await prisma.cmsHomeImage.findUnique({ where: { id } });
    if (!row) {
        const err = new Error('Home image slot not found');
        err.statusCode = 404;
        throw err;
    }
    return mapHomeImage(row);
};

const updateHomeImage = async (id, data) => {
    await getHomeImageById(id);

    const row = await prisma.cmsHomeImage.update({
        where: { id },
        data: {
            ...(data.title !== undefined ? { title: data.title } : {}),
            ...(data.subtitle !== undefined ? { subtitle: data.subtitle } : {}),
            ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
            ...(data.imageUrlMobile !== undefined ? { imageUrlMobile: data.imageUrlMobile } : {}),
            ...(data.linkUrl !== undefined ? { linkUrl: data.linkUrl } : {}),
            ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
    });

    await invalidateHomeImageCache();

    return mapHomeImage(row);
};

const createHomeImage = async ({ section, title, subtitle, linkUrl, isActive }) => {
    if (!VALID_SECTIONS.has(section)) {
        const err = new Error(`Invalid section. Must be one of: ${[...VALID_SECTIONS].join(', ')}`);
        err.statusCode = 400;
        throw err;
    }

    if (!title || !title.trim()) {
        const err = new Error('Title is required');
        err.statusCode = 400;
        throw err;
    }

    let slotKey = slugify(title);
    const existing = await prisma.cmsHomeImage.findUnique({ where: { slotKey } });
    if (existing) {
        slotKey = `${slotKey}-${Date.now()}`;
    }

    const maxOrder = await prisma.cmsHomeImage.aggregate({
        where: { section },
        _max: { sortOrder: true },
    });

    const row = await prisma.cmsHomeImage.create({
        data: {
            slotKey,
            section,
            title: title.trim(),
            subtitle: subtitle ?? '',
            linkUrl: linkUrl || '/collection',
            sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
            isActive: isActive ?? true,
        },
    });

    await invalidateHomeImageCache();

    return mapHomeImage(row);
};

const deleteHomeImage = async (id) => {
    await getHomeImageById(id);
    await prisma.cmsHomeImage.delete({ where: { id } });
    await invalidateHomeImageCache();
};

module.exports = {
    getAllHomeImages,
    getPublicHomeImages,
    getHomeImageById,
    updateHomeImage,
    createHomeImage,
    deleteHomeImage,
};
