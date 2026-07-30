const express = require('express');
const router = express.Router();
const couponController = require('./coupon.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

// Public — active coupons for storefront
router.get('/public/active', couponController.getPublicActive);

// Customer — validate coupon at checkout
router.post('/validate', authenticate, couponController.validate);

// Admin
router.get('/', authenticate, authorize('ADMIN', 'MANAGER'), couponController.getAll);
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER'), couponController.getById);
router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), couponController.create);
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), couponController.update);
router.delete('/:id', authenticate, authorize('ADMIN'), couponController.remove);

module.exports = router;