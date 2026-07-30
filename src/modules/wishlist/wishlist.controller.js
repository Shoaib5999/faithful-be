const wishlistService = require('./wishlist.service');
const { success, error } = require('../../utils/response');

const toggle = async (req, res, next) => {
    try {
        const { productId } = req.body;
        if (!productId) return error(res, 'productId is required', 400);
        const result = await wishlistService.toggleWishlist(req.user.id, productId);
        return success(res, result, result.action === 'added' ? 'Added to wishlist' : 'Removed from wishlist');
    } catch (err) {
        next(err);
    }
};

const getAll = async (req, res, next) => {
    try {
        const result = await wishlistService.getWishlist(req.user.id, req.query);
        return success(res, result, 'Wishlist fetched');
    } catch (err) {
        next(err);
    }
};

const checkProduct = async (req, res, next) => {
    try {
        const result = await wishlistService.isWishlisted(req.user.id, req.params.productId);
        return success(res, result, 'Wishlist status checked');
    } catch (err) {
        next(err);
    }
};

const clear = async (req, res, next) => {
    try {
        await wishlistService.clearWishlist(req.user.id);
        return success(res, null, 'Wishlist cleared');
    } catch (err) {
        next(err);
    }
};

const getIds = async (req, res, next) => {
    try {
        const result = await wishlistService.getWishlistIds(req.user.id);
        return success(res, result, 'Wishlist ids fetched');
    } catch (err) {
        next(err);
    }
};

module.exports = { toggle, getAll, checkProduct, clear, getIds };