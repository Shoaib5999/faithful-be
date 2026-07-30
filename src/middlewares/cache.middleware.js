/** Sets short-lived public cache headers for read-only storefront GET endpoints. */
const cachePublic = (maxAgeSeconds = 300) => (_req, res, next) => {
    res.set('Cache-Control', `public, max-age=${maxAgeSeconds}`);
    next();
};

module.exports = { cachePublic };
