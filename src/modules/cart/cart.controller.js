const cartService = require('./cart.service');
const { success, error } = require('../../utils/response');

const getCart = async (req, res, next) => {
    try {
        const { coupon, shippingMethod } = req.query;
        const summary = await cartService.getCartSummary(
            req.user.id,
            coupon,
            shippingMethod,
        );
        return success(res, summary, 'Cart fetched');
    } catch (err) {
        next(err);
    }
};

const addItem = async (req, res, next) => {
    try {
        const { variantId, quantity } = req.body;
        if (!variantId || !quantity || quantity < 1) {
            return error(res, 'variantId and quantity (min 1) are required', 400);
        }
        const item = await cartService.addToCart(req.user.id, { variantId, quantity: Number(quantity) });
        return success(res, item, 'Item added to cart', 201);
    } catch (err) {
        next(err);
    }
};

const updateItem = async (req, res, next) => {
    try {
        const { quantity } = req.body;
        if (quantity === undefined) return error(res, 'quantity is required', 400);
        const item = await cartService.updateCartItem(req.user.id, req.params.itemId, Number(quantity));
        return success(res, item, item ? 'Cart item updated' : 'Item removed from cart');
    } catch (err) {
        next(err);
    }
};

const removeItem = async (req, res, next) => {
    try {
        await cartService.removeFromCart(req.user.id, req.params.itemId);
        return success(res, null, 'Item removed from cart');
    } catch (err) {
        next(err);
    }
};

const clearCart = async (req, res, next) => {
    try {
        await cartService.clearCart(req.user.id);
        return success(res, null, 'Cart cleared');
    } catch (err) {
        next(err);
    }
};

const estimateCart = async (req, res, next) => {
    try {
        const { items, coupon, shippingMethod } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return error(res, 'items are required', 400);
        }

        const summary = await cartService.buildCartSummaryFromItems(
            items.map((item) => ({
                variantId: item.variantId,
                quantity: Number(item.quantity),
            })),
            coupon,
            shippingMethod,
        );
        return success(res, summary, 'Cart estimate');
    } catch (err) {
        next(err);
    }
};

module.exports = { getCart, addItem, updateItem, removeItem, clearCart, estimateCart };