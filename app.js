const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const passport = require('./src/config/passport');
const { corsOptions } = require('./src/config/cors');
const { errorHandler } = require('./src/middlewares/error.middleware');

// Route imports
const authRoutes = require('./src/modules/auth/auth.routes');
const userRoutes = require('./src/modules/user/user.routes');
const categoryRoutes = require('./src/modules/category/category.routes');
const productRoutes = require('./src/modules/product/product.routes');
const addressRoutes = require('./src/modules/address/address.routes');
const cartRoutes = require('./src/modules/cart/cart.routes');
const orderRoutes = require('./src/modules/order/order.routes');
const paymentRoutes = require('./src/modules/payment/payment.routes');
const shippingRoutes = require('./src/modules/shipping/shipping.routes');
const reviewRoutes = require('./src/modules/review/review.routes');
const couponRoutes = require('./src/modules/coupon/coupon.routes');
const wishlistRoutes = require('./src/modules/wishlist/wishlist.routes');
const searchRoutes = require('./src/modules/search/search.routes');
const giftsetRoutes = require('./src/modules/giftset/giftset.routes');
const rolesRoutes = require('./src/modules/admin/roles/roles.routes');
const analyticsRoutes = require('./src/modules/admin/analytics/analytics.routes');
const customersRoutes = require('./src/modules/admin/customers/customers.routes');
const leadsRoutes = require('./src/modules/admin/leads/leads.routes');
const uploadRoutes = require('./src/modules/upload/upload.routes');
const masterdataRoutes = require('./src/modules/masterdata/masterdata.routes');
const storefrontRoutes = require('./src/modules/storefront/storefront.routes');
const cmsSliderRoutes = require('./src/modules/cms-slider/cms-slider.routes');
const cmsHomeImageRoutes = require('./src/modules/cms-home-image/cms-home-image.routes');
const cutTypeRoutes = require('./src/modules/cut-type/cut-type.routes');
const contactRoutes = require('./src/modules/contact/contact.routes');
const newsletterRoutes = require('./src/modules/newsletter/newsletter.routes');
const paymentController = require('./src/modules/payment/payment.controller');
const sitemapController = require('./src/modules/sitemap/sitemap.controller');

const app = express();

app.set("trust proxy", 1);


// ─── SECURITY HEADERS ────────────────────────────────────────────
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ─── CORS (CORS_ALLOWED_ORIGINS in .env) ─────────────────────────
app.use(cors(corsOptions));

// ─── COMPRESSION ─────────────────────────────────────────────────
// Skip OAuth redirects — compressing 302 responses can cause "Corrupted Content" in browsers
app.use(
    compression({
        filter: (req, res) => {
            const url = req.originalUrl || req.url || '';
            if (url.includes('/auth/google')) return false;
            return compression.filter(req, res);
        },
    }),
);

// ─── BODY PARSERS ────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ─── HTTP PARAM POLLUTION PROTECTION ─────────────────────────────
app.use(hpp({
    whitelist: ['sortBy', 'gender', 'categoryId', 'status'],
}));

// ─── PASSPORT ────────────────────────────────────────────────────
app.use(passport.initialize());

// ─── RATE LIMITERS ───────────────────────────────────────────────

// Auth routes — strict limiter
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, message: 'Too many auth attempts. Try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// General API limiter
const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    message: { success: false, message: 'Too many requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Public forms — contact & newsletter
const formLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many submissions. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Search limiter — prevent scraping
const searchLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { success: false, message: 'Too many search requests.' },
});

// Upload limiter
const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { success: false, message: 'Too many upload requests.' },
});

// Apply general limiter to all routes
app.use('/api', generalLimiter);

// ─── STATIC CHECKOUT DEMO ────────────────────────────────────────
app.use(express.static('public'));

// ─── HEALTH CHECK ────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date(),
        env: process.env.NODE_ENV,
        uptime: process.uptime(),
    });
});

// ─── SITEMAP (proxied from faithfulmeat.in/sitemap.xml via vercel.json) ──
app.get('/sitemap.xml', sitemapController.generate);

// ─── ROUTES ──────────────────────────────────────────────────────
app.use('/api/auth', (req, res, next) => {
    if (req.path.startsWith('/google')) return next();
    return authLimiter(req, res, next);
}, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.post('/api/create-order', paymentController.createOrder);
app.post('/api/verify-payment', paymentController.verifyStandardPayment);
app.use('/api/payments', paymentRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/search', searchLimiter, searchRoutes);
app.use('/api/gift-sets', giftsetRoutes);
app.use('/api/admin/roles', rolesRoutes);
app.use('/api/admin/analytics', analyticsRoutes);
app.use('/api/admin/customers', customersRoutes);
app.use('/api/admin/leads', leadsRoutes);
app.use('/api/upload', uploadLimiter, uploadRoutes);
app.use('/api/master', masterdataRoutes);
app.use('/api/storefront', storefrontRoutes);
app.use('/api/cms/sliders', cmsSliderRoutes);
app.use('/api/cms/home-images', cmsHomeImageRoutes);
app.use('/api/cut-types', cutTypeRoutes);
app.use('/api/contact', formLimiter, contactRoutes);
app.use('/api/newsletter', formLimiter, newsletterRoutes);

// ─── 404 HANDLER ─────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────
app.use(errorHandler);

module.exports = app;