const giftsetService = require('./giftset.service');
const { success, error } = require('../../utils/response');

const getGiftSets = async (req, res, next) => {
    try {
        const result = await giftsetService.getGiftSets(req.query);
        return success(res, result, 'Gift sets fetched');
    } catch (err) {
        next(err);
    }
};

const getBundleItems = async (req, res, next) => {
    try {
        const items = await giftsetService.getBundleItems(req.params.productId);
        return success(res, items, 'Bundle items fetched');
    } catch (err) {
        next(err);
    }
};

const addBundleItem = async (req, res, next) => {
    try {
        const { childProductId, variantId, quantity, sortOrder } = req.body;
        if (!childProductId) return error(res, 'childProductId is required', 400);
        const item = await giftsetService.addBundleItem(req.params.productId, req.body);
        return success(res, item, 'Bundle item added', 201);
    } catch (err) {
        next(err);
    }
};

const updateBundleItem = async (req, res, next) => {
    try {
        const item = await giftsetService.updateBundleItem(req.params.itemId, req.body);
        return success(res, item, 'Bundle item updated');
    } catch (err) {
        next(err);
    }
};

const removeBundleItem = async (req, res, next) => {
    try {
        await giftsetService.removeBundleItem(req.params.itemId);
        return success(res, null, 'Bundle item removed');
    } catch (err) {
        next(err);
    }
};

module.exports = { getGiftSets, getBundleItems, addBundleItem, updateBundleItem, removeBundleItem };