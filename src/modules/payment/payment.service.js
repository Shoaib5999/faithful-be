const crypto = require('crypto');

const prisma = require('../../config/db');
const razorpay = require('../../config/razorpay');
const cartService = require('../cart/cart.service');
const magicCheckoutSession = require('./magic-checkout-session.service');

const {
    COD_PAYMENT_CODE,
    isOnlineGatewayPaymentCode,
    isOnlineCheckoutPaymentCode,
} = require('../../constants/payment.constants');

const {
    getOrderStatusIdByCode,
} = require('../masterdata/masterdata.service');

const MIN_CHECKOUT_AMOUNT_PAISE = 100;
const MAGIC_ORDER_CACHE_TTL_MS = 30 * 60 * 1000;
const magicOrderCache = new Map();

const isMagicCheckoutEnabled = () => {
    const flag =
        process.env.ENABLE_MAGIC_CHECKOUT ?? process.env.ENABLE_MEGIC_CHECKOUT;
    return String(flag).toLowerCase() === 'true';
};

const buildMagicCheckoutLineItems = (summary) =>
    summary.cart.items.map((item) => {
        const pricePaise = Math.round(Number(item.variant.price) * 100);
        const product = item.variant.product;
        const imageUrl = product?.images?.[0]?.url ?? '';

        return {
            sku: item.variant.sku,
            variant_id: item.variant.id,
            price: pricePaise,
            offer_price: pricePaise,
            quantity: item.quantity,
            name: product?.name ?? 'Product',
            description: `${item.variant.weightGrams}g`,
            image_url: imageUrl,
        };
    });

const sumMagicLineItemsTotal = (lineItems) =>
    lineItems.reduce(
        (sum, item) => sum + Number(item.offer_price) * Number(item.quantity),
        0,
    );

const normalizePhoneDigits = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : '';
};

const isUsablePhone = (phone) =>
    Boolean(phone) && phone.length === 10 && phone !== '0000000000';

/**
 * Magic Checkout: items amount first; shipping is added via shipping-info
 * callback. Paid amount is source of truth on complete.
 */
const reconcileMagicCheckoutSummary = (summary, rpOrder) => {
    const paidPaise = Number(rpOrder.amount);
    if (!Number.isFinite(paidPaise) || paidPaise < MIN_CHECKOUT_AMOUNT_PAISE) {
        const err = new Error('Invalid payment amount from checkout session');
        err.statusCode = 400;
        throw err;
    }

    const subtotalPaise = Math.round(Number(summary.subtotal) * 100);
    const discountPaise = Math.round(Number(summary.discount) * 100);
    const itemsNetPaise = Math.max(subtotalPaise - discountPaise, 0);

    const rpShippingFee = Number(
        rpOrder.shipping_fee
        ?? rpOrder.customer_details?.shipping_fee
        ?? rpOrder.customer_details?.shipping_address?.shipping_fee,
    );
    const shippingPaise = Number.isFinite(rpShippingFee) && rpShippingFee >= 0
        ? rpShippingFee
        : Math.max(paidPaise - itemsNetPaise, 0);

    const expectedMinPaise = itemsNetPaise;
    if (paidPaise + 1 < expectedMinPaise) {
        const err = new Error(
            'Payment amount is lower than cart items total. Please contact support.',
        );
        err.statusCode = 409;
        throw err;
    }

    return {
        ...summary,
        shippingCharge: (shippingPaise / 100).toFixed(2),
        total: (paidPaise / 100).toFixed(2),
        isFreeShippingApplied: shippingPaise === 0,
    };
};

/** Magic order: products after discount only; shipping comes from shipping-info. */
const applyMagicOrderAmounts = (orderPayload, summary, couponCode) => {
    const lineItems = buildMagicCheckoutLineItems(summary);
    const lineItemsTotalPaise = sumMagicLineItemsTotal(lineItems);
    const discountPaise = Math.round(Number(summary.discount) * 100);
    const discountedLineItemsPaise = Math.max(lineItemsTotalPaise - discountPaise, 0);

    orderPayload.line_items = lineItems;
    orderPayload.line_items_total = discountedLineItemsPaise;
    orderPayload.amount = discountedLineItemsPaise;
    orderPayload.notes.subtotalPaise = String(lineItemsTotalPaise);

    if (discountPaise > 0 && couponCode) {
        orderPayload.notes.prediscount_applied = String(discountPaise);
    }
};

const extractMagicContactPhone = (rpOrder) => {
    const details = rpOrder.customer_details || {};
    const fromContact = normalizePhoneDigits(details.contact);
    if (fromContact) return fromContact;

    return normalizePhoneDigits(details.shipping_address?.contact);
};

const resolveMagicDeliveryAddress = async (userId, rpOrder) => {
    const shipping = rpOrder.customer_details?.shipping_address;
    if (!shipping?.line1 || !shipping?.zipcode) {
        return null;
    }

    const phone = extractMagicContactPhone(rpOrder);
    const line1 = String(shipping.line1).trim();
    const pincode = String(shipping.zipcode).trim();

    const existing = await prisma.address.findFirst({
        where: {
            userId,
            pincode,
            line1,
        },
    });

    if (existing) {
        if (isUsablePhone(phone) && !isUsablePhone(existing.phone)) {
            await prisma.address.update({
                where: { id: existing.id },
                data: { phone },
            });
        }
        return existing.id;
    }

    const created = await prisma.address.create({
        data: {
            userId,
            label: shipping.tag || 'Home',
            name: shipping.name || 'Customer',
            phone: phone || '0000000000',
            line1,
            line2: shipping.line2 ? String(shipping.line2) : null,
            city: shipping.city || '',
            state: shipping.state || '',
            pincode,
            isDefault: false,
        },
    });

    return created.id;
};

const fetchRazorpayOrderByReceipt = async (receipt) => {
    const orders = await razorpay.orders.all({ receipt, count: 1 });
    const order = orders?.items?.[0];
    if (!order) {
        const err = new Error('Checkout session not found');
        err.statusCode = 404;
        throw err;
    }
    return order;
};

const normalizeRazorpayOrderId = magicCheckoutSession.normalizeRazorpayOrderId;

const cacheRazorpayMagicOrder = (order) => {
    if (!order?.id) return;
    const entry = { order, cachedAt: Date.now() };
    magicOrderCache.set(order.id, entry);
    if (order.receipt) {
        magicOrderCache.set(`receipt:${order.receipt}`, entry);
    }
};

const getCachedRazorpayMagicOrder = (orderId) => {
    if (!orderId) return null;
    const cached = magicOrderCache.get(orderId)
        || magicOrderCache.get(`receipt:${orderId}`)
        || (
            !String(orderId).startsWith('chk_')
            && !String(orderId).startsWith('gst_')
            && !String(orderId).startsWith('order_')
                ? magicOrderCache.get(normalizeRazorpayOrderId(orderId))
                : null
        );
    if (!cached) return null;
    if (Date.now() - cached.cachedAt > MAGIC_ORDER_CACHE_TTL_MS) {
        magicOrderCache.delete(orderId);
        if (cached.order?.id) magicOrderCache.delete(cached.order.id);
        if (cached.order?.receipt) {
            magicOrderCache.delete(`receipt:${cached.order.receipt}`);
        }
        return null;
    }
    return cached.order;
};

const fetchRazorpayOrderForMagicCheckout = async (payload) => {
    const orderRef = payload.order_id || payload.receipt;
    const razorpayOrderId = payload.razorpay_order_id || payload.razorpayOrderId;
    const idsToTry = [];

    if (orderRef?.startsWith('order_')) idsToTry.push(orderRef);
    if (razorpayOrderId) idsToTry.push(normalizeRazorpayOrderId(razorpayOrderId));
    if (orderRef) {
        idsToTry.push(orderRef);
        if (
            !orderRef.startsWith('chk_')
            && !orderRef.startsWith('gst_')
            && !orderRef.startsWith('order_')
        ) {
            idsToTry.push(normalizeRazorpayOrderId(orderRef));
        }
    }

    for (const id of [...new Set(idsToTry.filter(Boolean))]) {
        const cached = getCachedRazorpayMagicOrder(id);
        if (cached) return cached;

        if (id.startsWith('chk_') || id.startsWith('gst_')) continue;

        try {
            const order = await razorpay.orders.fetch(
                id.startsWith('order_') ? id : normalizeRazorpayOrderId(id),
            );
            cacheRazorpayMagicOrder(order);
            return order;
        } catch {
            // try next
        }
    }

    if (orderRef) {
        const orders = await razorpay.orders.all({ receipt: orderRef, count: 1 });
        if (orders?.items?.[0]) {
            cacheRazorpayMagicOrder(orders.items[0]);
            return orders.items[0];
        }
    }

    const err = new Error('Checkout session not found');
    err.statusCode = 404;
    throw err;
};

const resolveMagicUserId = async (payload, notesData) => {
    if (String(notesData.guestCheckout || '').toLowerCase() === 'true') {
        return null;
    }

    const noteUserId = String(notesData.userId || '').trim();
    if (noteUserId) {
        const user = await prisma.user.findUnique({ where: { id: noteUserId } });
        if (user) return user.id;
    }

    const email = String(payload.email || '').trim().toLowerCase();
    if (email) {
        const user = await prisma.user.findUnique({ where: { email } });
        if (user) return user.id;
    }

    const err = new Error('Invalid checkout session');
    err.statusCode = 400;
    throw err;
};

const normalizeMagicNotes = (notes) => {
    if (!notes || Array.isArray(notes) || typeof notes !== 'object') {
        return {};
    }
    return notes;
};

/** Used by Magic promotions; shipping fees come from MagicCheckoutSession. */
const buildMagicCheckoutSummary = async (rpOrder, notesData) => {
    const lineItems = Array.isArray(rpOrder.line_items) ? rpOrder.line_items : [];
    let subtotalPaise = Number(notesData.subtotalPaise) || Number(rpOrder.line_items_total) || 0;

    if (!subtotalPaise && lineItems.length) {
        subtotalPaise = sumMagicLineItemsTotal(lineItems);
    }

    if (!subtotalPaise) {
        const err = new Error('Checkout session has no items');
        err.statusCode = 400;
        throw err;
    }

    const subtotal = subtotalPaise / 100;
    const shippingMethodCode = notesData.shippingMethodCode
        ? String(notesData.shippingMethodCode).toLowerCase()
        : null;
    const shippingPricing = require('../shipping/shipping-pricing.service');
    const pricing = await shippingPricing.calculateShippingCharge(
        subtotal,
        shippingMethodCode,
    );

    return {
        subtotal: subtotal.toFixed(2),
        shippingCharge: pricing.shippingCharge.toFixed(2),
        isFreeShippingApplied: pricing.isFreeShippingApplied,
    };
};

const resolveMagicCheckoutContext = async (payload) => {
    const rpOrder = await fetchRazorpayOrderForMagicCheckout(payload);
    const notesData = normalizeMagicNotes(rpOrder.notes);
    const userId = await resolveMagicUserId(payload, notesData);
    const summary = await buildMagicCheckoutSummary(rpOrder, notesData);

    return { rpOrder, notesData, userId, summary };
};

const mapRazorpayApiError = (err) => {
    const apiError = new Error(
        err.error?.description || err.message || 'Failed to create Razorpay order',
    );

    if (err.statusCode === 401) {
        apiError.message =
            'Online payment gateway authentication failed. Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend .env (use keys from dashboard.razorpay.com).';
        apiError.statusCode = 503;
        return apiError;
    }

    apiError.statusCode = 500;
    return apiError;
};

const createCheckoutOrder = async ({ amount, currency = 'INR', receipt }) => {
    const amountInPaise = Math.round(Number(amount));

    if (!Number.isFinite(amountInPaise) || amountInPaise < MIN_CHECKOUT_AMOUNT_PAISE) {
        const err = new Error(`Amount must be at least ${MIN_CHECKOUT_AMOUNT_PAISE} paise`);
        err.statusCode = 400;
        throw err;
    }

    if (!receipt || typeof receipt !== 'string') {
        const err = new Error('receipt is required');
        err.statusCode = 400;
        throw err;
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        const err = new Error('Razorpay credentials are not configured');
        err.statusCode = 500;
        throw err;
    }

    let razorpayOrder;

    try {
        razorpayOrder = await razorpay.orders.create({
            amount: amountInPaise,
            currency,
            receipt,
        });
    } catch (err) {
        throw mapRazorpayApiError(err);
    }

    return {
        order_id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key_id: process.env.RAZORPAY_KEY_ID,
    };
};

const verifyCheckoutPayment = async ({
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
}) => {
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        const err = new Error('razorpay_order_id, razorpay_payment_id, and razorpay_signature are required');
        err.statusCode = 400;
        throw err;
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
        const err = new Error('Razorpay credentials are not configured');
        err.statusCode = 500;
        throw err;
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex');

    if (expectedSignature !== razorpay_signature) {
        const err = new Error('Payment verification failed — invalid signature');
        err.statusCode = 400;
        throw err;
    }

    return {
        verified: true,
        razorpay_order_id,
        razorpay_payment_id,
    };
};

const verifyPaymentSignature = ({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
}) => {
    if (!process.env.RAZORPAY_KEY_SECRET) {
        const err = new Error('Razorpay credentials are not configured');
        err.statusCode = 500;
        throw err;
    }

    const body = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex');

    if (expectedSignature !== razorpaySignature) {
        const err = new Error('Payment verification failed — invalid signature');
        err.statusCode = 400;
        throw err;
    }
};

/** Magic Checkout: customer may switch to COD in Razorpay after session started as UPI/Card. */
const resolveMagicCheckoutPlacement = async ({
    sessionPaymentMethod,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
}) => {
    let rpPayment;

    try {
        rpPayment = await razorpay.payments.fetch(razorpayPaymentId);
    } catch (err) {
        throw mapRazorpayApiError(err);
    }

    const razorpayRefs = {
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
    };

    if (String(rpPayment.method || '').toLowerCase() === 'cod') {
        return {
            paymentMethod: COD_PAYMENT_CODE,
            onlinePayment: { ...razorpayRefs, verified: false },
        };
    }

    return {
        paymentMethod: String(sessionPaymentMethod).toUpperCase(),
        onlinePayment: { ...razorpayRefs, verified: true },
    };
};

const validateCartForCheckout = async (userId, couponCode, shippingMethodCode) => {
    const summary = await cartService.getCartSummary(
        userId,
        couponCode,
        shippingMethodCode,
    );

    if (!summary.cart.items.length) {
        const err = new Error('Cart is empty');
        err.statusCode = 400;
        throw err;
    }

    for (const item of summary.cart.items) {
        if (item.variant.stockQty < item.quantity) {
            const err = new Error(
                `Insufficient stock for variant ${item.variantId}`,
            );
            err.statusCode = 400;
            throw err;
        }
    }

    return summary;
};

const prepareOnlineCheckout = async (
    userId,
    { addressId, paymentMethod, couponCode, shippingMethodCode },
) => {
    const code = String(paymentMethod).toUpperCase();
    const magicEnabled = isMagicCheckoutEnabled();

    if (!isOnlineCheckoutPaymentCode(code)) {
        const err = new Error(
            'Online checkout is only available for Card and UPI',
        );
        err.statusCode = 400;
        throw err;
    }

    if (!magicEnabled) {
        const address = await prisma.address.findFirst({
            where: { id: addressId, userId },
        });

        if (!address) {
            const err = new Error('Address not found');
            err.statusCode = 404;
            throw err;
        }
    }

    const mode = await prisma.paymentMode.findFirst({
        where: { code, isActive: true, isOnline: true },
    });

    if (!mode) {
        const err = new Error('Invalid or unavailable payment method');
        err.statusCode = 400;
        throw err;
    }

    const summary = await validateCartForCheckout(
        userId,
        couponCode,
        shippingMethodCode,
    );
    const amountInPaise = Math.round(Number(summary.total) * 100);

    if (amountInPaise < MIN_CHECKOUT_AMOUNT_PAISE) {
        const err = new Error(
            `Order total must be at least ₹${MIN_CHECKOUT_AMOUNT_PAISE / 100}`,
        );
        err.statusCode = 400;
        throw err;
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        const err = new Error('Online payment is not configured');
        err.statusCode = 500;
        throw err;
    }

    const receipt = `chk_${userId.replace(/-/g, '').slice(0, 12)}_${Date.now()}`.slice(
        0,
        40,
    );

    const orderPayload = {
        amount: amountInPaise,
        currency: 'INR',
        receipt,
        notes: {
            userId,
            addressId: addressId || '',
            paymentMethod: code,
            couponCode: couponCode ? String(couponCode).toUpperCase() : '',
            shippingMethodCode: shippingMethodCode
                ? String(shippingMethodCode).toLowerCase()
                : '',
            checkoutType: magicEnabled ? 'magic' : 'store',
        },
    };

    if (magicEnabled) {
        applyMagicOrderAmounts(orderPayload, summary, couponCode);
    }

    let razorpayOrder;

    try {
        razorpayOrder = await razorpay.orders.create(orderPayload);
    } catch (err) {
        throw mapRazorpayApiError(err);
    }

    if (magicEnabled) {
        const notesFromCreate = normalizeMagicNotes(razorpayOrder.notes);
        cacheRazorpayMagicOrder({
            ...razorpayOrder,
            notes: Object.keys(notesFromCreate).length
                ? notesFromCreate
                : orderPayload.notes,
            line_items_total: razorpayOrder.line_items_total ?? orderPayload.line_items_total,
            line_items: razorpayOrder.line_items?.length
                ? razorpayOrder.line_items
                : orderPayload.line_items,
        });
        await magicCheckoutSession.saveMagicCheckoutSession({
            razorpayOrderId: razorpayOrder.id,
            receipt,
            userId,
            guestCheckout: false,
            couponCode: couponCode || null,
            shippingMethodCode: shippingMethodCode || null,
            summary,
        });
    }

    return {
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        paymentMethod: code,
        checkoutMode: magicEnabled ? 'magic' : 'standard',
    };
};

const completeOnlineCheckout = async (
    userId,
    {
        addressId,
        paymentMethod,
        couponCode,
        shippingMethodCode,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        notes,
    },
) => {
    const code = String(paymentMethod).toUpperCase();

    if (!isOnlineCheckoutPaymentCode(code)) {
        const err = new Error(
            'Online checkout is only available for Card and UPI',
        );
        err.statusCode = 400;
        throw err;
    }

    verifyPaymentSignature({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
    });

    let rpOrder;

    try {
        rpOrder = await razorpay.orders.fetch(razorpayOrderId);
    } catch (err) {
        throw mapRazorpayApiError(err);
    }

    const notesData = normalizeMagicNotes(rpOrder.notes);

    if (notesData.userId !== userId) {
        const err = new Error('Payment session does not belong to this account');
        err.statusCode = 403;
        throw err;
    }

    const isMagicSession = notesData.checkoutType === 'magic';

    let resolvedAddressId = addressId;

    if (isMagicSession) {
        if (!resolvedAddressId) {
            const defaultAddress = await prisma.address.findFirst({
                where: { userId },
                orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
            });
            resolvedAddressId = defaultAddress?.id;
        }

        if (!resolvedAddressId) {
            resolvedAddressId = await resolveMagicDeliveryAddress(userId, rpOrder);
        }
    }

    if (!resolvedAddressId) {
        const err = new Error('Delivery address is required');
        err.statusCode = 400;
        throw err;
    }

    if (
        notesData.addressId
        && notesData.addressId !== resolvedAddressId
        && !isMagicSession
    ) {
        const err = new Error('Delivery address does not match payment session');
        err.statusCode = 400;
        throw err;
    }

    if (!isMagicSession && notesData.paymentMethod !== code) {
        const err = new Error('Payment method does not match payment session');
        err.statusCode = 400;
        throw err;
    }

    const magicPromotionCode = Array.isArray(rpOrder.promotions)
        ? rpOrder.promotions.find((promotion) => promotion?.code)?.code
        : undefined;

    const resolvedCoupon =
        couponCode ||
        (notesData.couponCode ? notesData.couponCode : undefined) ||
        magicPromotionCode;

    const resolvedShippingMethod =
        shippingMethodCode ||
        (notesData.shippingMethodCode ? notesData.shippingMethodCode : undefined);

    if (
        resolvedShippingMethod
        && notesData.shippingMethodCode
        && String(resolvedShippingMethod).toLowerCase()
            !== String(notesData.shippingMethodCode).toLowerCase()
    ) {
        const err = new Error('Delivery option does not match payment session');
        err.statusCode = 400;
        throw err;
    }

    const baseSummary = await validateCartForCheckout(
        userId,
        resolvedCoupon,
        resolvedShippingMethod,
    );
    const summary = isMagicSession
        ? reconcileMagicCheckoutSummary(baseSummary, rpOrder)
        : baseSummary;

    if (!isMagicSession) {
        const expectedPaise = Math.round(Number(summary.total) * 100);
        if (Number(rpOrder.amount) !== expectedPaise) {
            const err = new Error(
                'Cart total changed. Please refresh checkout and try again.',
            );
            err.statusCode = 409;
            throw err;
        }
    }

    const placement = isMagicSession
        ? await resolveMagicCheckoutPlacement({
            sessionPaymentMethod: code,
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
        })
        : {
            paymentMethod: code,
            onlinePayment: {
                verified: true,
                razorpayOrderId,
                razorpayPaymentId,
                razorpaySignature,
            },
        };

    const orderService = require('../order/order.service');

    return orderService.placeOrder(userId, {
        addressId: resolvedAddressId,
        paymentMethod: placement.paymentMethod,
        couponCode: resolvedCoupon,
        shippingMethodCode: resolvedShippingMethod,
        notes,
        cartSummary: summary,
        onlinePayment: placement.onlinePayment,
    });
};

const serializeGuestCartItems = (items) =>
    items.map((item) => `${item.variantId}:${item.quantity}`).join(',');

const parseGuestCartItemsFromNotes = (notesData) => {
    const raw = String(notesData.cartItems || '').trim();
    if (!raw) {
        const err = new Error('Checkout session has no cart items');
        err.statusCode = 400;
        throw err;
    }

    const parsed = raw.split(',').map((part) => {
        const [variantId, quantity] = part.split(':');
        return {
            variantId: String(variantId || '').trim(),
            quantity: Number(quantity),
        };
    });

    return cartService.normalizeGuestCartItems(parsed);
};

const normalizeGuestEmail = (email) => {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        const err = new Error('A valid email is required for guest checkout');
        err.statusCode = 400;
        throw err;
    }
    return normalized;
};

const prepareGuestOnlineCheckout = async ({
    items,
    paymentMethod,
    couponCode,
    shippingMethodCode,
}) => {
    if (!isMagicCheckoutEnabled()) {
        const err = new Error('Guest checkout is only available with Magic Checkout enabled');
        err.statusCode = 400;
        throw err;
    }

    const code = String(paymentMethod).toUpperCase();
    if (!isOnlineCheckoutPaymentCode(code)) {
        const err = new Error('Guest checkout is only available for Card and UPI');
        err.statusCode = 400;
        throw err;
    }

    const mode = await prisma.paymentMode.findFirst({
        where: { code, isActive: true, isOnline: true },
    });

    if (!mode) {
        const err = new Error('Invalid or unavailable payment method');
        err.statusCode = 400;
        throw err;
    }

    const summary = await cartService.buildCartSummaryFromItems(
        items,
        couponCode,
        shippingMethodCode,
    );
    const amountInPaise = Math.round(Number(summary.total) * 100);

    if (amountInPaise < MIN_CHECKOUT_AMOUNT_PAISE) {
        const err = new Error(
            `Order total must be at least ₹${MIN_CHECKOUT_AMOUNT_PAISE / 100}`,
        );
        err.statusCode = 400;
        throw err;
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        const err = new Error('Online payment is not configured');
        err.statusCode = 500;
        throw err;
    }

    const receipt = `gst_${crypto.randomBytes(6).toString('hex')}_${Date.now()}`.slice(0, 40);

    const orderPayload = {
        amount: amountInPaise,
        currency: 'INR',
        receipt,
        notes: {
            guestCheckout: 'true',
            cartItems: serializeGuestCartItems(items),
            paymentMethod: code,
            couponCode: couponCode ? String(couponCode).toUpperCase() : '',
            shippingMethodCode: shippingMethodCode
                ? String(shippingMethodCode).toLowerCase()
                : '',
            checkoutType: 'magic',
        },
    };

    applyMagicOrderAmounts(orderPayload, summary, couponCode);

    let razorpayOrder;

    try {
        razorpayOrder = await razorpay.orders.create(orderPayload);
    } catch (err) {
        throw mapRazorpayApiError(err);
    }

    const notesFromCreate = normalizeMagicNotes(razorpayOrder.notes);
    cacheRazorpayMagicOrder({
        ...razorpayOrder,
        notes: Object.keys(notesFromCreate).length
            ? notesFromCreate
            : orderPayload.notes,
        line_items_total: razorpayOrder.line_items_total ?? orderPayload.line_items_total,
        line_items: razorpayOrder.line_items?.length
            ? razorpayOrder.line_items
            : orderPayload.line_items,
    });
    await magicCheckoutSession.saveMagicCheckoutSession({
        razorpayOrderId: razorpayOrder.id,
        receipt,
        userId: null,
        guestCheckout: true,
        couponCode: couponCode || null,
        shippingMethodCode: shippingMethodCode || null,
        summary,
        cartItems: items,
    });

    return {
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        paymentMethod: code,
        checkoutMode: 'magic',
    };
};

const completeGuestOnlineCheckout = async ({
    paymentMethod,
    couponCode,
    shippingMethodCode,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    notes,
}) => {
    if (!isMagicCheckoutEnabled()) {
        const err = new Error('Guest checkout is only available with Magic Checkout enabled');
        err.statusCode = 400;
        throw err;
    }

    const code = String(paymentMethod).toUpperCase();
    if (!isOnlineCheckoutPaymentCode(code)) {
        const err = new Error('Guest checkout is only available for Card and UPI');
        err.statusCode = 400;
        throw err;
    }

    const existingPayment = await prisma.payment.findFirst({
        where: { razorpayPaymentId },
        include: { order: true },
    });

    if (existingPayment?.order) {
        const user = await prisma.user.findUnique({
            where: { id: existingPayment.order.userId },
        });
        return {
            order: existingPayment.order,
            email: user?.email ?? null,
            isNewAccount: false,
        };
    }

    verifyPaymentSignature({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
    });

    let rpOrder;

    try {
        rpOrder = await razorpay.orders.fetch(razorpayOrderId);
    } catch (err) {
        throw mapRazorpayApiError(err);
    }

    const notesData = normalizeMagicNotes(rpOrder.notes);
    if (String(notesData.guestCheckout || '').toLowerCase() !== 'true') {
        const err = new Error('Payment session is not a guest checkout');
        err.statusCode = 403;
        throw err;
    }

    const customerEmail = normalizeGuestEmail(rpOrder.customer_details?.email);

    const authService = require('../auth/auth.service');
    const customerName =
        rpOrder.customer_details?.shipping_address?.name
        || rpOrder.customer_details?.name
        || 'Customer';
    const { user, isNewAccount } = await authService.findOrCreateCheckoutUser({
        email: customerEmail,
        name: customerName,
        phone: extractMagicContactPhone(rpOrder),
    });

    const resolvedAddressId = await resolveMagicDeliveryAddress(user.id, rpOrder);
    if (!resolvedAddressId) {
        const err = new Error('Delivery address is required');
        err.statusCode = 400;
        throw err;
    }

    const magicPromotionCode = Array.isArray(rpOrder.promotions)
        ? rpOrder.promotions.find((promotion) => promotion?.code)?.code
        : undefined;

    const resolvedCoupon =
        couponCode ||
        (notesData.couponCode ? notesData.couponCode : undefined) ||
        magicPromotionCode;

    const resolvedShippingMethod =
        shippingMethodCode ||
        (notesData.shippingMethodCode ? notesData.shippingMethodCode : undefined);

    const cartItems = parseGuestCartItemsFromNotes(notesData);
    const baseSummary = await cartService.buildCartSummaryFromItems(
        cartItems,
        resolvedCoupon,
        resolvedShippingMethod,
    );
    const summary = reconcileMagicCheckoutSummary(baseSummary, rpOrder);

    const placement = await resolveMagicCheckoutPlacement({
        sessionPaymentMethod: code,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
    });

    const orderService = require('../order/order.service');
    const order = await orderService.placeOrder(user.id, {
        addressId: resolvedAddressId,
        paymentMethod: placement.paymentMethod,
        couponCode: resolvedCoupon,
        shippingMethodCode: resolvedShippingMethod,
        notes,
        cartSummary: summary,
        onlinePayment: placement.onlinePayment,
    });

    return {
        order,
        email: user.email,
        isNewAccount,
    };
};

const createRazorpayOrder = async (
    orderId,
    userId
) => {
    const order = await prisma.order.findFirst({
        where: {
            id: orderId,
            userId,
        },

        include: {
            payment: true,
            paymentMode: true,
        },
    });

    if (!order) {
        const err = new Error('Order not found');
        err.statusCode = 404;
        throw err;
    }

    if (!isOnlineGatewayPaymentCode(order.paymentMode?.code)) {
        const err = new Error('This order does not support online payment');
        err.statusCode = 400;
        throw err;
    }

    if (order.paymentStatus === 'PAID') {
        const err = new Error(
            'Order already paid'
        );

        err.statusCode = 400;
        throw err;
    }

    const amountInPaise = Math.round(
        Number(order.total) * 100
    );

    const razorpayOrder =
        await razorpay.orders.create({
            amount: amountInPaise,
            currency: 'INR',
            receipt: `order_${orderId.slice(
                0,
                20
            )}`,

            notes: {
                orderId,
            },
        });

    await prisma.payment.update({
        where: {
            orderId,
        },

        data: {
            razorpayOrderId:
                razorpayOrder.id,
        },
    });

    return {
        razorpayOrderId:
            razorpayOrder.id,

        amount: razorpayOrder.amount,
        currency:
            razorpayOrder.currency,

        keyId:
            process.env
                .RAZORPAY_KEY_ID,

        orderId,
    };
};

const verifyRazorpayPayment = async ({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    orderId,
}) => {
    const body = `${razorpayOrderId}|${razorpayPaymentId}`;

    const expectedSignature = crypto
        .createHmac(
            'sha256',
            process.env
                .RAZORPAY_KEY_SECRET
        )
        .update(body)
        .digest('hex');

    if (
        expectedSignature !==
        razorpaySignature
    ) {
        const err = new Error(
            'Payment verification failed — invalid signature'
        );

        err.statusCode = 400;
        throw err;
    }

    await prisma.$transaction(
        async (tx) => {
            await tx.payment.update({
                where: {
                    orderId,
                },

                data: {
                    razorpayPaymentId,
                    razorpaySignature,
                    status: 'PAID',
                },
            });

            const confirmedStatusId =
                await getOrderStatusIdByCode(
                    'CONFIRMED'
                );

            await tx.order.update({
                where: {
                    id: orderId,
                },

                data: {
                    statusId:
                        confirmedStatusId,

                    paymentStatus:
                        'PAID',
                },
            });
        }
    );

    return await prisma.order.findUnique({
        where: {
            id: orderId,
        },

        include: {
            payment: true,
            items: true,
            status: true,
            paymentMode: true,
            currency: true,
        },
    });
};

const generateUpiLink = async (
    orderId,
    userId
) => {
    const order = await prisma.order.findFirst({
        where: {
            id: orderId,
            userId,

            paymentMode: {
                code: 'UPI',
            },
        },
    });

    if (!order) {
        const err = new Error('Order not found');
        err.statusCode = 404;
        throw err;
    }

    const vpa = process.env.UPI_VPA;

    const name = encodeURIComponent(
        process.env.UPI_MERCHANT_NAME
    );

    const amount = Number(
        order.total
    ).toFixed(2);

    const note = encodeURIComponent(
        `Order ${orderId.slice(0, 8)}`
    );

    const transactionRef = `TXN${Date.now()}`;

    // Standard UPI deep link
    const upiLink = `upi://pay?pa=${vpa}&pn=${name}&am=${amount}&tn=${note}&tr=${transactionRef}&cu=INR`;

    // Google Pay intent
    const gpayLink = `intent://pay?pa=${vpa}&pn=${name}&am=${amount}&tn=${note}&tr=${transactionRef}&cu=INR#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end`;

    return {
        upiLink,
        gpayLink,
        qrData: upiLink,
        amount,
        orderId,
        transactionRef,
    };
};

const confirmUpiPayment = async (
    orderId,
    userId,
    transactionId
) => {
    const order = await prisma.order.findFirst({
        where: {
            id: orderId,
            userId,
        },
    });

    if (!order) {
        const err = new Error('Order not found');
        err.statusCode = 404;
        throw err;
    }

    await prisma.$transaction(
        async (tx) => {
            await tx.payment.update({
                where: {
                    orderId,
                },

                data: {
                    razorpayPaymentId:
                        transactionId,

                    status: 'PAID',
                },
            });

            const confirmedStatusId =
                await getOrderStatusIdByCode(
                    'CONFIRMED'
                );

            await tx.order.update({
                where: {
                    id: orderId,
                },

                data: {
                    statusId:
                        confirmedStatusId,

                    paymentStatus:
                        'PAID',
                },
            });
        }
    );

    return await prisma.order.findUnique({
        where: {
            id: orderId,
        },

        include: {
            payment: true,
            status: true,
            paymentMode: true,
            currency: true,
        },
    });
};

const MIN_REFUND_AMOUNT_PAISE = 100;

const isAlreadyRefundedError = (err) => {
    const message = String(
        err?.error?.description || err?.message || '',
    ).toLowerCase();

    return (
        message.includes('already been refunded') ||
        message.includes('refunded fully') ||
        message.includes('has been refunded')
    );
};

const markPaymentRefunded = async ({
    paymentId,
    orderId,
    refundId,
    refundAmount,
    refundReason,
}) => {
    const refundedAt = new Date();
    const amountDecimal = Number(refundAmount);

    await prisma.$transaction(async (tx) => {
        await tx.payment.update({
            where: { id: paymentId },
            data: {
                status: 'REFUNDED',
                razorpayRefundId: refundId,
                refundAmount: amountDecimal,
                refundReason,
                refundedAt,
            },
        });

        await tx.order.update({
            where: { id: orderId },
            data: { paymentStatus: 'REFUNDED' },
        });
    });
};

const refundRazorpayPaymentRecord = async ({
    payment,
    orderId,
    amountInRupees,
    reason,
    initiatedBy = 'system',
}) => {
    if (!payment) {
        return { skipped: true, reason: 'NO_PAYMENT' };
    }

    if (payment.status === 'REFUNDED') {
        return {
            skipped: true,
            reason: 'ALREADY_REFUNDED',
            refundId: payment.razorpayRefundId,
        };
    }

    if (payment.status !== 'PAID') {
        return { skipped: true, reason: 'NOT_PAID' };
    }

    if (!payment.razorpayPaymentId) {
        const err = new Error(
            'Razorpay payment ID is missing — refund cannot be processed',
        );
        err.statusCode = 422;
        throw err;
    }

    const amountPaise = Math.round(Number(amountInRupees) * 100);

    if (
        !Number.isFinite(amountPaise) ||
        amountPaise < MIN_REFUND_AMOUNT_PAISE
    ) {
        const err = new Error(
            `Refund amount must be at least ${MIN_REFUND_AMOUNT_PAISE} paise`,
        );
        err.statusCode = 400;
        throw err;
    }

    const refundReason = reason || 'Order refund';
    const receiptSuffix = orderId.replace(/-/g, '').slice(0, 12);

    let refund;

    try {
        refund = await razorpay.payments.refund(
            payment.razorpayPaymentId,
            {
                amount: amountPaise,
                speed: 'normal',
                notes: {
                    orderId,
                    reason: refundReason.slice(0, 255),
                    initiatedBy,
                },
                receipt: `rfnd_${receiptSuffix}_${Date.now()}`,
            },
        );
    } catch (err) {
        if (isAlreadyRefundedError(err)) {
            await markPaymentRefunded({
                paymentId: payment.id,
                orderId,
                refundId: payment.razorpayRefundId || 'existing_refund',
                refundAmount: amountPaise / 100,
                refundReason,
            });

            return {
                success: true,
                alreadyRefunded: true,
                refundId: payment.razorpayRefundId,
                amount: amountPaise / 100,
            };
        }

        throw mapRazorpayApiError(err);
    }

    await markPaymentRefunded({
        paymentId: payment.id,
        orderId,
        refundId: refund.id,
        refundAmount: amountPaise / 100,
        refundReason,
    });

    return {
        success: true,
        refundId: refund.id,
        amount: amountPaise / 100,
        status: refund.status || 'processed',
    };
};

const refundOrderPayment = async (
    orderId,
    { reason, initiatedBy = 'system' } = {},
) => {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
            payment: true,
            paymentMode: true,
        },
    });

    if (!order) {
        const err = new Error('Order not found');
        err.statusCode = 404;
        throw err;
    }

    if (!isOnlineGatewayPaymentCode(order.paymentMode?.code)) {
        return { skipped: true, reason: 'NOT_ONLINE_GATEWAY' };
    }

    if (order.paymentStatus === 'REFUNDED') {
        return {
            skipped: true,
            reason: 'ALREADY_REFUNDED',
            refundId: order.payment?.razorpayRefundId,
        };
    }

    if (order.paymentStatus !== 'PAID') {
        return { skipped: true, reason: 'NOT_PAID' };
    }

    const result = await refundRazorpayPaymentRecord({
        payment: order.payment,
        orderId,
        amountInRupees: order.payment?.amount ?? order.total,
        reason,
        initiatedBy,
    });

    if (result.success) {
        setImmediate(() => {
            const notificationService = require('../notification/notification.service');
            notificationService
                .sendRefundEmail(orderId, result.amount, reason)
                .catch(console.error);
        });
    }

    return result;
};

const syncRefundFromWebhook = async (refundEntity) => {
    const paymentId = refundEntity?.payment_id;
    const refundId = refundEntity?.id;
    const orderIdNote = refundEntity?.notes?.orderId;

    if (!paymentId || !refundId) {
        return { skipped: true, reason: 'INVALID_PAYLOAD' };
    }

    const payment = await prisma.payment.findFirst({
        where: { razorpayPaymentId: paymentId },
    });

    if (!payment) {
        return { skipped: true, reason: 'PAYMENT_NOT_FOUND' };
    }

    const resolvedOrderId = orderIdNote || payment.orderId;
    const refundAmount = Number(refundEntity.amount || 0) / 100;

    await markPaymentRefunded({
        paymentId: payment.id,
        orderId: resolvedOrderId,
        refundId,
        refundAmount: refundAmount || Number(payment.amount),
        refundReason:
            refundEntity?.notes?.reason || 'Refund confirmed by Razorpay',
    });

    return { synced: true, orderId: resolvedOrderId, refundId };
};

const handleRazorpayWebhook = async (
    rawBody,
    signature
) => {
    const expectedSignature = crypto
        .createHmac(
            'sha256',
            process.env
                .RAZORPAY_KEY_SECRET
        )
        .update(rawBody)
        .digest('hex');

    if (
        expectedSignature !== signature
    ) {
        const err = new Error(
            'Invalid webhook signature'
        );

        err.statusCode = 400;
        throw err;
    }

    const event = JSON.parse(rawBody);

    if (
        event.event ===
        'payment.captured'
    ) {
        const paymentId =
            event.payload.payment.entity.id;

        const razorpayOrderId =
            event.payload.payment.entity
                .order_id;

        const notes =
            event.payload.payment.entity
                .notes;

        const orderId = notes?.orderId;

        if (orderId) {
            await prisma.$transaction(
                async (tx) => {
                    await tx.payment.update({
                        where: {
                            orderId,
                        },

                        data: {
                            razorpayPaymentId:
                                paymentId,

                            razorpayOrderId,

                            status: 'PAID',
                        },
                    });

                    const confirmedStatusId =
                        await getOrderStatusIdByCode(
                            'CONFIRMED'
                        );

                    await tx.order.update({
                        where: {
                            id: orderId,
                        },

                        data: {
                            statusId:
                                confirmedStatusId,

                            paymentStatus:
                                'PAID',
                        },
                    });
                }
            );
        }
    }

    if (
        event.event === 'refund.processed' ||
        event.event === 'refund.created'
    ) {
        await syncRefundFromWebhook(
            event.payload?.refund?.entity,
        );
    }

    if (event.event === 'payment.refunded') {
        const paymentEntity = event.payload?.payment?.entity;
        if (paymentEntity?.id) {
            await syncRefundFromWebhook({
                id: paymentEntity.id,
                payment_id: paymentEntity.id,
                amount: paymentEntity.amount_refunded,
                notes: paymentEntity.notes,
            });
        }
    }

    return {
        received: true,
    };
};

const getMagicShippingInfo = async (payload) => {
    if (!payload.order_id && !payload.receipt && !payload.razorpay_order_id) {
        const err = new Error('order_id is required');
        err.statusCode = 400;
        throw err;
    }

    let session = await magicCheckoutSession.findMagicCheckoutSession(payload);

    // If Magiic sends receipt-only / odd ids, resolve via Razorpay order then retry.
    if (!session) {
        try {
            const rpOrder = await fetchRazorpayOrderForMagicCheckout(payload);
            session = await magicCheckoutSession.findMagicCheckoutSession({
                razorpay_order_id: rpOrder.id,
                order_id: rpOrder.receipt,
                receipt: rpOrder.receipt,
            });
        } catch (err) {
            console.warn('[magic/shipping-info] order lookup failed', {
                order_id: payload.order_id,
                razorpay_order_id: payload.razorpay_order_id,
                message: err.message,
            });
        }
    }

    if (!session) {
        console.warn('[magic/shipping-info] session missing — prepare and shipping-info must hit same server/DB', {
            order_id: payload.order_id,
            receipt: payload.receipt,
            razorpay_order_id: payload.razorpay_order_id,
        });
        const err = new Error('Checkout session not found or expired');
        err.statusCode = 404;
        throw err;
    }

    const shippingMethods = Array.isArray(session.shippingMethodsJson)
        ? [...session.shippingMethodsJson]
        : [];
    // Magiic preselects the first method — put admin default (or session choice) first.
    const preferredCode = session.shippingMethodCode
        ? String(session.shippingMethodCode).toLowerCase()
        : null;
    shippingMethods.sort((a, b) => {
        const aPreferred = preferredCode
            ? String(a.code).toLowerCase() === preferredCode
            : Boolean(a.isDefault);
        const bPreferred = preferredCode
            ? String(b.code).toLowerCase() === preferredCode
            : Boolean(b.isDefault);
        return Number(bPreferred) - Number(aPreferred);
    });
    const isFreeShipping = await magicCheckoutSession.resolveSessionFreeShipping(session);
    const codMode = await prisma.paymentMode.findFirst({
        where: { code: 'COD', isActive: true },
    });

    const addresses = (payload.addresses || []).map((addr, index) => {
        const methodRows = shippingMethods.map((method) => {
            const feePaise = Math.round(Number(method.fee) * 100);
            return {
                id: method.code,
                name: method.name,
                description: method.deliveryLabel || '',
                serviceable: true,
                shipping_fee: isFreeShipping ? 0 : feePaise,
                cod: Boolean(codMode),
                cod_fee: 0,
            };
        });

        return {
            id: String(addr.id ?? index),
            zipcode: addr.zipcode,
            country: addr.country || 'IN',
            shipping_methods: methodRows.length
                ? methodRows
                : [
                    {
                        id: 'standard',
                        name: 'Standard delivery',
                        description: 'Delivered to your address',
                        serviceable: true,
                        shipping_fee: isFreeShipping
                            ? 0
                            : Math.round(Number(session.shippingCharge) * 100),
                        cod: Boolean(codMode),
                        cod_fee: 0,
                    },
                ],
        };
    });

    return { addresses };
};

const getMagicPromotions = async (payload) => {
    if (!payload.order_id && !payload.receipt && !payload.razorpay_order_id) {
        const err = new Error('order_id is required');
        err.statusCode = 400;
        throw err;
    }

    const { summary } = await resolveMagicCheckoutContext(payload);
    const couponService = require('../coupon/coupon.service');
    const coupons = await couponService.getPublicActiveCoupons();
    const subtotal = Number(summary.subtotal);

    const promotions = coupons
        .filter((coupon) => !coupon.minOrder || subtotal >= Number(coupon.minOrder))
        .map((coupon) => ({
            code: coupon.code,
            summary:
                coupon.type === 'percent'
                    ? `${Number(coupon.value)}% off`
                    : `₹${Number(coupon.value)} off`,
            description: coupon.description || undefined,
        }));

    return { promotions };
};

const applyMagicPromotion = async (payload) => {
    const code = payload.code;
    if (!payload.order_id && !payload.receipt && !payload.razorpay_order_id) {
        const err = new Error('order_id is required');
        err.statusCode = 400;
        throw err;
    }
    if (!code) {
        const err = new Error('code is required');
        err.statusCode = 400;
        err.field = 'code';
        throw err;
    }

    const { userId, summary } = await resolveMagicCheckoutContext(payload);
    const couponService = require('../coupon/coupon.service');

    let result;
    try {
        result = await couponService.validateCoupon(
            code,
            userId,
            Number(summary.subtotal),
        );
    } catch (err) {
        const apiError = new Error('Unable to validate coupon right now');
        apiError.statusCode = 500;
        apiError.reason = 'server_error';
        throw apiError;
    }

    if (!result.valid) {
        const err = new Error(result.message || 'Invalid coupon');
        err.statusCode = 400;
        err.field = 'code';
        err.reason = 'invalid_promotion_code';
        throw err;
    }

    const discountPaise = Math.round(Number(result.discount) * 100);

    return {
        promotion: {
            reference_id: result.coupon.code,
            code: result.coupon.code,
            type: 'coupon',
            value: discountPaise,
            value_type: 'fixed_amount',
            description: `Coupon ${result.coupon.code} applied`,
        },
    };
};

module.exports = {
    createCheckoutOrder,
    verifyCheckoutPayment,
    prepareOnlineCheckout,
    completeOnlineCheckout,
    prepareGuestOnlineCheckout,
    completeGuestOnlineCheckout,
    createRazorpayOrder,
    verifyRazorpayPayment,
    refundOrderPayment,
    generateUpiLink,
    confirmUpiPayment,
    handleRazorpayWebhook,
    isMagicCheckoutEnabled,
    getMagicShippingInfo,
    getMagicPromotions,
    applyMagicPromotion,
};