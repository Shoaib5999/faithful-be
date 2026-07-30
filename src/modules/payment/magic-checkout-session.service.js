const prisma = require('../../config/db');

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

const normalizeRazorpayOrderId = (value) => {
    const id = String(value || '').trim();
    if (!id) return null;
    return id.startsWith('order_') ? id : `order_${id}`;
};

const mapShippingMethodsForSession = (summary) => {
    const methods = Array.isArray(summary.shippingMethods) ? summary.shippingMethods : [];
    const mapped = methods.map((method) => ({
        id: method.id || method.code,
        code: method.code,
        name: method.name,
        fee: Number(method.fee),
        deliveryLabel: method.deliveryLabel || '',
        isDefault: Boolean(method.isDefault),
    }));

    // Admin default first — Magiic has no isDefault field and picks by list order.
    mapped.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    return mapped;
};

const saveMagicCheckoutSession = async ({
    razorpayOrderId,
    receipt,
    userId = null,
    guestCheckout = false,
    couponCode = null,
    shippingMethodCode = null,
    summary,
    cartItems = null,
}) => {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const data = {
        userId: userId || null,
        guestCheckout: Boolean(guestCheckout),
        couponCode: couponCode ? String(couponCode).toUpperCase() : null,
        shippingMethodCode: shippingMethodCode
            ? String(shippingMethodCode).toLowerCase()
            : null,
        subtotal: Number(summary.subtotal),
        discount: Number(summary.discount || 0),
        shippingCharge: Number(summary.shippingCharge || 0),
        isFreeShipping: Boolean(summary.isFreeShippingApplied),
        shippingMethodsJson: mapShippingMethodsForSession(summary),
        cartItemsJson: cartItems,
        expiresAt,
    };

    return prisma.magicCheckoutSession.upsert({
        where: { razorpayOrderId },
        create: {
            razorpayOrderId,
            receipt,
            ...data,
        },
        update: {
            receipt,
            ...data,
        },
    });
};

const findMagicCheckoutSession = async (payload = {}) => {
    const orderRef = payload.order_id || payload.receipt || null;
    const rawRpId = payload.razorpay_order_id || payload.razorpayOrderId || null;
    const razorpayOrderId = normalizeRazorpayOrderId(rawRpId);
    const now = new Date();

    const tryIds = [];
    if (razorpayOrderId) tryIds.push(razorpayOrderId);
    if (orderRef?.startsWith('order_')) tryIds.push(orderRef);
    if (
        orderRef
        && !orderRef.startsWith('order_')
        && !orderRef.startsWith('chk_')
        && !orderRef.startsWith('gst_')
    ) {
        tryIds.push(normalizeRazorpayOrderId(orderRef));
    }

    for (const id of [...new Set(tryIds.filter(Boolean))]) {
        const row = await prisma.magicCheckoutSession.findUnique({
            where: { razorpayOrderId: id },
        });
        if (row && row.expiresAt > now) return row;
    }

    if (orderRef) {
        const byReceipt = await prisma.magicCheckoutSession.findUnique({
            where: { receipt: String(orderRef) },
        });
        if (byReceipt && byReceipt.expiresAt > now) return byReceipt;
    }

    return null;
};

/**
 * Free shipping from session subtotal + current admin settings
 * (recomputed every shipping-info call, including after phone entry).
 */
const resolveSessionFreeShipping = async (session) => {
    if (!session) return false;
    if (session.isFreeShipping) return true;

    const shippingPricing = require('../shipping/shipping-pricing.service');
    const settings = await shippingPricing.getOrCreateShippingSettings();
    if (!settings.isFreeShippingEnabled) return false;

    const subtotal = Number(session.subtotal);
    const threshold = parseFloat(String(settings.freeShippingThreshold));
    return Number.isFinite(subtotal) && Number.isFinite(threshold) && subtotal >= threshold;
};

module.exports = {
    saveMagicCheckoutSession,
    findMagicCheckoutSession,
    resolveSessionFreeShipping,
    normalizeRazorpayOrderId,
};
