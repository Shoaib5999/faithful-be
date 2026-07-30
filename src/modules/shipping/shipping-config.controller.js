const pricing = require('./shipping-pricing.service');
const { success, error } = require('../../utils/response');

const wrap = (fn) => async (req, res, next) => {
    try { return await fn(req, res); }
    catch (err) { next(err); }
};

const getSettings = wrap(async (req, res) => {
    const settings = await pricing.getOrCreateShippingSettings();
    return success(res, settings, 'Shipping settings fetched');
});

const updateSettings = wrap(async (req, res) => {
    const { defaultShippingFee, freeShippingThreshold, isFreeShippingEnabled } = req.body;
    if (defaultShippingFee === undefined || freeShippingThreshold === undefined) {
        return error(res, 'defaultShippingFee and freeShippingThreshold are required', 400);
    }
    const updated = await pricing.updateShippingSettings({
        defaultShippingFee,
        freeShippingThreshold,
        isFreeShippingEnabled: isFreeShippingEnabled ?? true,
    });
    return success(res, updated, 'Shipping settings updated');
});

const getMethods = wrap(async (req, res) => {
    const includeInactive = req.query.includeInactive === 'true';
    const methods = includeInactive
        ? await pricing.getAllShippingMethods()
        : await pricing.getActiveShippingMethods();
    return success(res, methods, 'Shipping methods fetched');
});

const createMethod = wrap(async (req, res) => {
    const { name, code, fee, deliveryLabel } = req.body;
    if (!name || !code || fee === undefined || !deliveryLabel) {
        return error(res, 'name, code, fee and deliveryLabel are required', 400);
    }
    const created = await pricing.createShippingMethod(req.body);
    return success(res, created, 'Shipping method created', 201);
});

const updateMethod = wrap(async (req, res) => {
    const updated = await pricing.updateShippingMethod(req.params.id, req.body);
    return success(res, updated, 'Shipping method updated');
});

const deleteMethod = wrap(async (req, res) => {
    await pricing.deleteShippingMethod(req.params.id);
    return success(res, null, 'Shipping method deleted');
});

module.exports = {
    getSettings,
    updateSettings,
    getMethods,
    createMethod,
    updateMethod,
    deleteMethod,
};
