const prisma = require('../../config/db');
const shippingPricing = require('../shipping/shipping-pricing.service');

const getOrCreateCart = async (userId) => {
    let cart = await prisma.cart.findUnique({
        where: { userId },
        include: {
            items: {
                include: {
                    variant: {
                        include: {
                            product: {
                                include: {
                                    images: { where: { isPrimary: true } },
                                    category: { select: { slug: true } },
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!cart) {
        cart = await prisma.cart.create({
            data: { userId },
            include: {
                items: {
                    include: {
                        variant: {
                            include: {
                                product: {
                                    include: {
                                        images: { where: { isPrimary: true } },
                                        category: { select: { slug: true } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
    }

    return cart;
};

const addToCart = async (userId, { variantId, quantity }) => {
    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant || !variant.isActive) {
        const err = new Error('Product variant not found or unavailable');
        err.statusCode = 404;
        throw err;
    }

    if (variant.stockQty < quantity) {
        const err = new Error(`Only ${variant.stockQty} units available`);
        err.statusCode = 400;
        throw err;
    }

    const cart = await prisma.cart.upsert({
        where: { userId },
        create: { userId },
        update: {},
    });

    const existingItem = await prisma.cartItem.findUnique({
        where: { cartId_variantId: { cartId: cart.id, variantId } },
    });

    if (existingItem) {
        const newQty = existingItem.quantity + quantity;
        if (newQty > variant.stockQty) {
            const err = new Error(`Only ${variant.stockQty} units available`);
            err.statusCode = 400;
            throw err;
        }
        return await prisma.cartItem.update({
            where: { id: existingItem.id },
            data: { quantity: newQty },
        });
    }

    return await prisma.cartItem.create({
        data: { cartId: cart.id, variantId, quantity },
    });
};

const updateCartItem = async (userId, itemId, quantity) => {
    const cart = await prisma.cart.findUnique({ where: { userId } });
    if (!cart) {
        const err = new Error('Cart not found');
        err.statusCode = 404;
        throw err;
    }

    const item = await prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
    if (!item) {
        const err = new Error('Cart item not found');
        err.statusCode = 404;
        throw err;
    }

    if (quantity <= 0) {
        await prisma.cartItem.delete({ where: { id: itemId } });
        return null;
    }

    const variant = await prisma.productVariant.findUnique({ where: { id: item.variantId } });
    if (quantity > variant.stockQty) {
        const err = new Error(`Only ${variant.stockQty} units available`);
        err.statusCode = 400;
        throw err;
    }

    return await prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
};

const removeFromCart = async (userId, itemId) => {
    const cart = await prisma.cart.findUnique({ where: { userId } });
    if (!cart) {
        const err = new Error('Cart not found');
        err.statusCode = 404;
        throw err;
    }

    const item = await prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
    if (!item) {
        const err = new Error('Cart item not found');
        err.statusCode = 404;
        throw err;
    }

    await prisma.cartItem.delete({ where: { id: itemId } });
};

const clearCart = async (userId) => {
    const cart = await prisma.cart.findUnique({ where: { userId } });
    if (cart) {
        await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    }
};

const getCartSummary = async (userId, couponCode = null, shippingMethodCode = null) => {
    const cart = await getOrCreateCart(userId);

    let subtotal = 0;
    cart.items.forEach((item) => {
        subtotal += Number(item.variant.price) * item.quantity;
    });

    let discount = 0;
    let coupon = null;

    if (couponCode) {
        coupon = await prisma.coupon.findUnique({ where: { code: couponCode.toUpperCase() } });
        if (coupon && coupon.isActive) {
            const now = new Date();
            const notExpired = !coupon.expiresAt || coupon.expiresAt > now;
            const withinLimit = !coupon.maxUses || coupon.usedCount < coupon.maxUses;
            const meetsMinOrder = !coupon.minOrder || subtotal >= Number(coupon.minOrder);

            if (notExpired && withinLimit && meetsMinOrder) {
                if (coupon.type === 'percent') {
                    discount = (subtotal * Number(coupon.value)) / 100;
                } else {
                    discount = Number(coupon.value);
                }
                discount = Math.min(discount, subtotal);
            }
        }
    }

    const [pricing, shippingMethods] = await Promise.all([
        shippingPricing.calculateShippingCharge(subtotal, shippingMethodCode),
        shippingPricing.getActiveShippingMethods(),
    ]);

    const shippingCharge = pricing.shippingCharge;
    const total = subtotal - discount + shippingCharge;

    return {
        cart,
        subtotal: subtotal.toFixed(2),
        discount: discount.toFixed(2),
        shippingCharge: shippingCharge.toFixed(2),
        total: total.toFixed(2),
        coupon: coupon ? { code: coupon.code, type: coupon.type, value: coupon.value } : null,
        shippingMethod: pricing.shippingMethod,
        isFreeShippingApplied: pricing.isFreeShippingApplied,
        shippingMethods: shippingMethods.map((method) => ({
            id: method.id,
            name: method.name,
            code: method.code,
            fee: Number(method.fee),
            deliveryLabel: method.deliveryLabel,
            isDefault: method.isDefault,
        })),
        shippingSettings: pricing.settings,
    };
};

const normalizeGuestCartItems = (rawItems) => {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
        const err = new Error('Cart is empty');
        err.statusCode = 400;
        throw err;
    }

    if (rawItems.length > 20) {
        const err = new Error('Cart cannot have more than 20 items');
        err.statusCode = 400;
        throw err;
    }

    const normalized = rawItems.map((item) => {
        const variantId = String(item.variantId || '').trim();
        const quantity = Math.floor(Number(item.quantity));

        if (!variantId || !Number.isFinite(quantity) || quantity < 1 || quantity > 99) {
            const err = new Error('Each cart item must include a valid variantId and quantity');
            err.statusCode = 400;
            throw err;
        }

        return { variantId, quantity };
    });

    const seen = new Set();
    for (const item of normalized) {
        if (seen.has(item.variantId)) {
            const err = new Error('Duplicate cart items are not allowed');
            err.statusCode = 400;
            throw err;
        }
        seen.add(item.variantId);
    }

    return normalized;
};

const buildCartSummaryFromItems = async (
    rawItems,
    couponCode = null,
    shippingMethodCode = null,
) => {
    const items = normalizeGuestCartItems(rawItems);
    const variantIds = items.map((item) => item.variantId);

    const variants = await prisma.productVariant.findMany({
        where: {
            id: { in: variantIds },
            isActive: true,
        },
        include: {
            product: {
                include: {
                    images: { where: { isPrimary: true } },
                    category: { select: { slug: true } },
                },
            },
        },
    });

    const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
    const cartItems = [];

    for (const item of items) {
        const variant = variantMap.get(item.variantId);
        if (!variant) {
            const err = new Error('Product variant not found or unavailable');
            err.statusCode = 404;
            throw err;
        }

        if (variant.stockQty < item.quantity) {
            const err = new Error(`Only ${variant.stockQty} units available`);
            err.statusCode = 400;
            throw err;
        }

        cartItems.push({
            variantId: item.variantId,
            quantity: item.quantity,
            variant,
        });
    }

    let subtotal = 0;
    cartItems.forEach((item) => {
        subtotal += Number(item.variant.price) * item.quantity;
    });

    let discount = 0;
    let coupon = null;

    if (couponCode) {
        coupon = await prisma.coupon.findUnique({
            where: { code: couponCode.toUpperCase() },
        });
        if (coupon && coupon.isActive) {
            const now = new Date();
            const notExpired = !coupon.expiresAt || coupon.expiresAt > now;
            const withinLimit = !coupon.maxUses || coupon.usedCount < coupon.maxUses;
            const meetsMinOrder = !coupon.minOrder || subtotal >= Number(coupon.minOrder);

            if (notExpired && withinLimit && meetsMinOrder) {
                if (coupon.type === 'percent') {
                    discount = (subtotal * Number(coupon.value)) / 100;
                } else {
                    discount = Number(coupon.value);
                }
                discount = Math.min(discount, subtotal);
            }
        }
    }

    const [pricing, shippingMethods] = await Promise.all([
        shippingPricing.calculateShippingCharge(subtotal, shippingMethodCode),
        shippingPricing.getActiveShippingMethods(),
    ]);

    const shippingCharge = pricing.shippingCharge;
    const total = subtotal - discount + shippingCharge;

    return {
        cart: { items: cartItems },
        subtotal: subtotal.toFixed(2),
        discount: discount.toFixed(2),
        shippingCharge: shippingCharge.toFixed(2),
        total: total.toFixed(2),
        coupon: coupon ? { code: coupon.code, type: coupon.type, value: coupon.value } : null,
        shippingMethod: pricing.shippingMethod,
        isFreeShippingApplied: pricing.isFreeShippingApplied,
        shippingMethods: shippingMethods.map((method) => ({
            id: method.id,
            name: method.name,
            code: method.code,
            fee: Number(method.fee),
            deliveryLabel: method.deliveryLabel,
            isDefault: method.isDefault,
        })),
        shippingSettings: pricing.settings,
    };
};

module.exports = {
    getOrCreateCart,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    getCartSummary,
    normalizeGuestCartItems,
    buildCartSummaryFromItems,
};