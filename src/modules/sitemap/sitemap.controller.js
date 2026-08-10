const prisma = require('../../config/db');

// Hardcoded to the canonical indexed domain — deliberately not derived from
// FRONTEND_URL, since that env var also drives OAuth/email redirects and
// could point elsewhere (e.g. a preview deploy) without the sitemap noticing.
const SITE_URL = 'https://www.faithfulmeat.in';

const STATIC_URLS = [
    { path: '/', changefreq: 'daily', priority: '1.0' },
    { path: '/collection', changefreq: 'daily', priority: '0.9' },
    { path: '/about', changefreq: 'monthly', priority: '0.5' },
    { path: '/contact', changefreq: 'monthly', priority: '0.5' },
    { path: '/track-order', changefreq: 'monthly', priority: '0.3' },
    { path: '/terms', changefreq: 'yearly', priority: '0.2' },
    { path: '/privacy', changefreq: 'yearly', priority: '0.2' },
    { path: '/returns', changefreq: 'yearly', priority: '0.2' },
];

const escapeXml = (value) =>
    String(value).replace(/[<>&'"]/g, (c) => ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&apos;',
        '"': '&quot;',
    }[c]));

const urlEntry = (loc, { lastmod, changefreq, priority } = {}) => {
    const parts = [`  <url>`, `    <loc>${escapeXml(loc)}</loc>`];
    if (lastmod) parts.push(`    <lastmod>${new Date(lastmod).toISOString()}</lastmod>`);
    if (changefreq) parts.push(`    <changefreq>${changefreq}</changefreq>`);
    if (priority) parts.push(`    <priority>${priority}</priority>`);
    parts.push('  </url>');
    return parts.join('\n');
};

const generate = async (req, res, next) => {
    try {
        const [products, categories] = await Promise.all([
            prisma.product.findMany({
                where: { isActive: true },
                select: { slug: true, updatedAt: true },
                orderBy: { updatedAt: 'desc' },
            }),
            prisma.category.findMany({
                where: { isActive: true },
                select: { slug: true, updatedAt: true },
            }),
        ]);

        // Category slugs aren't globally unique (unique per parent), so the
        // flat /collection?category= URL scheme needs de-duping.
        const categoryBySlug = new Map();
        for (const c of categories) {
            const existing = categoryBySlug.get(c.slug);
            if (!existing || c.updatedAt > existing.updatedAt) categoryBySlug.set(c.slug, c);
        }

        const urls = [
            ...STATIC_URLS.map((u) => urlEntry(`${SITE_URL}${u.path}`, u)),
            ...[...categoryBySlug.values()].map((c) =>
                urlEntry(`${SITE_URL}/collection?category=${encodeURIComponent(c.slug)}`, {
                    lastmod: c.updatedAt,
                    changefreq: 'daily',
                    priority: '0.8',
                }),
            ),
            ...products.map((p) =>
                urlEntry(`${SITE_URL}/product/${encodeURIComponent(p.slug)}`, {
                    lastmod: p.updatedAt,
                    changefreq: 'weekly',
                    priority: '0.7',
                }),
            ),
        ];

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;

        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=3600');
        return res.send(xml);
    } catch (err) {
        next(err);
    }
};

module.exports = { generate };
