const express = require('express');
const router = express.Router();
const c = require('./masterdata.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');
const { cachePublic } = require('../../middlewares/cache.middleware');

const adminOnly = [authenticate, authorize('ADMIN')];
const adminOrManager = [authenticate, authorize('ADMIN', 'MANAGER')];
const publicCache = cachePublic(300);

// ── PUBLIC (frontend needs these for dropdowns) ───────────────────
router.get('/brands', publicCache, c.getBrands);
router.get('/units', publicCache, c.getUnits);
router.get('/categories', c.getCategories);
router.get('/attributes', publicCache, c.getAttributes);
router.get('/order-statuses', publicCache, c.getOrderStatuses);
router.get('/tax-classes', publicCache, c.getTaxClasses);
router.get('/payment-modes', c.getPaymentModes);
router.get('/currencies', publicCache, c.getCurrencies);

// ── BRAND ─────────────────────────────────────────────────────────
router.post('/brands', ...adminOrManager, c.createBrand);
router.put('/brands/:id', ...adminOrManager, c.updateBrand);
router.delete('/brands/:id', ...adminOnly, c.deleteBrand);

// ── UNIT ──────────────────────────────────────────────────────────
router.post('/units', ...adminOnly, c.createUnit);
router.put('/units/:id', ...adminOnly, c.updateUnit);
router.delete('/units/:id', ...adminOnly, c.deleteUnit);

// ── CATEGORY ──────────────────────────────────────────────────────
router.post('/categories', ...adminOrManager, c.createCategory);
router.put('/categories/:id', ...adminOrManager, c.updateCategory);
router.delete('/categories/:id', ...adminOnly, c.deleteCategory);

// ── ATTRIBUTE ─────────────────────────────────────────────────────
router.post('/attributes', ...adminOnly, c.createAttribute);
router.put('/attributes/:id', ...adminOnly, c.updateAttribute);
router.delete('/attributes/:id', ...adminOnly, c.deleteAttribute);
router.post('/attributes/:id/values', ...adminOnly, c.addAttrValue);
router.delete('/attributes/:id/values/:valueId', ...adminOnly, c.deleteAttrValue);

// ── ORDER STATUS ───────────────────────────────────────────────────
router.post('/order-statuses', ...adminOnly, c.createOrderStatus);
router.put('/order-statuses/:id', ...adminOnly, c.updateOrderStatus);
router.delete('/order-statuses/:id', ...adminOnly, c.deleteOrderStatus);

// ── TAX CLASS ──────────────────────────────────────────────────────
router.post('/tax-classes', ...adminOnly, c.createTaxClass);
router.put('/tax-classes/:id', ...adminOnly, c.updateTaxClass);
router.delete('/tax-classes/:id', ...adminOnly, c.deleteTaxClass);

// ── PAYMENT MODE ───────────────────────────────────────────────────
router.get('/payment-modes/admin', ...adminOrManager, c.getAdminPaymentModes);
router.post('/payment-modes', ...adminOnly, c.createPaymentMode);
router.put('/payment-modes/:id', ...adminOnly, c.updatePaymentMode);
router.delete('/payment-modes/:id', ...adminOnly, c.deletePaymentMode);

// ── CURRENCY ────────────────────────────────────────────────────────
router.post('/currencies', ...adminOnly, c.createCurrency);
router.put('/currencies/:id', ...adminOnly, c.updateCurrency);
router.delete('/currencies/:id', ...adminOnly, c.deleteCurrency);

module.exports = router;