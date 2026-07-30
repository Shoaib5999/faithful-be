const md = require('./masterdata.service');
const { success, error } = require('../../utils/response');

const wrap = (fn) => async (req, res, next) => {
    try { return await fn(req, res); }
    catch (err) { next(err); }
};

// ── BRAND ────────────────────────────────────────────────────────
const getBrands = wrap(async (req, res) => success(res, await md.getAllBrands(), 'Brands fetched'));
const createBrand = wrap(async (req, res) => { if (!req.body.name) return error(res, 'name is required', 400); success(res, await md.createBrand(req.body), 'Brand created', 201); });
const updateBrand = wrap(async (req, res) => success(res, await md.updateBrand(req.params.id, req.body), 'Brand updated'));
const deleteBrand = wrap(async (req, res) => { await md.deleteBrand(req.params.id); success(res, null, 'Brand deleted'); });

// ── UNIT ─────────────────────────────────────────────────────────
const getUnits = wrap(async (req, res) => success(res, await md.getAllUnits(), 'Units fetched'));
const createUnit = wrap(async (req, res) => { const { name, symbol, type } = req.body; if (!name || !symbol || !type) return error(res, 'name, symbol and type are required', 400); success(res, await md.createUnit(req.body), 'Unit created', 201); });
const updateUnit = wrap(async (req, res) => success(res, await md.updateUnit(req.params.id, req.body), 'Unit updated'));
const deleteUnit = wrap(async (req, res) => { await md.deleteUnit(req.params.id); success(res, null, 'Unit deleted'); });

// ── CATEGORY ─────────────────────────────────────────────────────
const getCategories = wrap(async (req, res) => success(res, await md.getAllCategories(), 'Categories fetched'));
const createCategory = wrap(async (req, res) => { if (!req.body.name) return error(res, 'name is required', 400); success(res, await md.createCategory(req.body), 'Category created', 201); });
const updateCategory = wrap(async (req, res) => success(res, await md.updateCategory(req.params.id, req.body), 'Category updated'));
const deleteCategory = wrap(async (req, res) => { await md.deleteCategory(req.params.id); success(res, null, 'Category deleted'); });

// ── ATTRIBUTE ────────────────────────────────────────────────────
const getAttributes = wrap(async (req, res) => success(res, await md.getAllAttributes(), 'Attributes fetched'));
const createAttribute = wrap(async (req, res) => { const { name, code, type } = req.body; if (!name || !code || !type) return error(res, 'name, code and type are required', 400); success(res, await md.createAttribute(req.body), 'Attribute created', 201); });
const updateAttribute = wrap(async (req, res) => success(res, await md.updateAttribute(req.params.id, req.body), 'Attribute updated'));
const deleteAttribute = wrap(async (req, res) => { await md.deleteAttribute(req.params.id); success(res, null, 'Attribute deleted'); });
const addAttrValue = wrap(async (req, res) => { if (!req.body.value) return error(res, 'value is required', 400); success(res, await md.addAttributeValue(req.params.id, req.body), 'Value added', 201); });
const deleteAttrValue = wrap(async (req, res) => { await md.deleteAttributeValue(req.params.valueId); success(res, null, 'Value deleted'); });

// ── ORDER STATUS ──────────────────────────────────────────────────
const getOrderStatuses = wrap(async (req, res) => success(res, await md.getAllOrderStatuses(), 'Order statuses fetched'));
const createOrderStatus = wrap(async (req, res) => { const { label, code, color } = req.body; if (!label || !code || !color) return error(res, 'label, code and color are required', 400); success(res, await md.createOrderStatus(req.body), 'Order status created', 201); });
const updateOrderStatus = wrap(async (req, res) => success(res, await md.updateOrderStatus(req.params.id, req.body), 'Order status updated'));
const deleteOrderStatus = wrap(async (req, res) => { await md.deleteOrderStatus(req.params.id); success(res, null, 'Order status deleted'); });

// ── TAX CLASS ─────────────────────────────────────────────────────
const getTaxClasses = wrap(async (req, res) => success(res, await md.getAllTaxClasses(), 'Tax classes fetched'));
const createTaxClass = wrap(async (req, res) => { const { name, rate } = req.body; if (!name || rate === undefined) return error(res, 'name and rate are required', 400); success(res, await md.createTaxClass(req.body), 'Tax class created', 201); });
const updateTaxClass = wrap(async (req, res) => success(res, await md.updateTaxClass(req.params.id, req.body), 'Tax class updated'));
const deleteTaxClass = wrap(async (req, res) => { await md.deleteTaxClass(req.params.id); success(res, null, 'Tax class deleted'); });

// ── PAYMENT MODE ──────────────────────────────────────────────────
const getPaymentModes = wrap(async (req, res) => success(res, await md.getActivePaymentModes(), 'Payment modes fetched'));
const getAdminPaymentModes = wrap(async (req, res) => success(res, await md.getAllPaymentModes(), 'Payment modes fetched'));
const createPaymentMode = wrap(async (req, res) => { const { label, code } = req.body; if (!label || !code) return error(res, 'label and code are required', 400); success(res, await md.createPaymentMode(req.body), 'Payment mode created', 201); });
const updatePaymentMode = wrap(async (req, res) => success(res, await md.updatePaymentMode(req.params.id, req.body), 'Payment mode updated'));
const deletePaymentMode = wrap(async (req, res) => { await md.deletePaymentMode(req.params.id); success(res, null, 'Payment mode deleted'); });

// ── CURRENCY ──────────────────────────────────────────────────────
const getCurrencies = wrap(async (req, res) => success(res, await md.getAllCurrencies(), 'Currencies fetched'));
const createCurrency = wrap(async (req, res) => { const { code, name, symbol } = req.body; if (!code || !name || !symbol) return error(res, 'code, name and symbol are required', 400); success(res, await md.createCurrency(req.body), 'Currency created', 201); });
const updateCurrency = wrap(async (req, res) => success(res, await md.updateCurrency(req.params.id, req.body), 'Currency updated'));
const deleteCurrency = wrap(async (req, res) => { await md.deleteCurrency(req.params.id); success(res, null, 'Currency deleted'); });

module.exports = {
    getBrands, createBrand, updateBrand, deleteBrand,
    getUnits, createUnit, updateUnit, deleteUnit,
    getCategories, createCategory, updateCategory, deleteCategory,
    getAttributes, createAttribute, updateAttribute, deleteAttribute, addAttrValue, deleteAttrValue,
    getOrderStatuses, createOrderStatus, updateOrderStatus, deleteOrderStatus,
    getTaxClasses, createTaxClass, updateTaxClass, deleteTaxClass,
    getPaymentModes, getAdminPaymentModes, createPaymentMode, updatePaymentMode, deletePaymentMode,
    getCurrencies, createCurrency, updateCurrency, deleteCurrency,
};