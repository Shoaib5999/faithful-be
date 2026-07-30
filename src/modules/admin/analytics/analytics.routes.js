const express = require('express');
const router = express.Router();
const analyticsController = require('./analytics.controller');
const { authenticate } = require('../../../middlewares/auth.middleware');
const { authorize } = require('../../../middlewares/role.middleware');

router.use(authenticate, authorize('ADMIN', 'MANAGER'));

router.get('/overview', analyticsController.overview);
router.get('/revenue', analyticsController.revenueByDate);
router.get('/top-products', analyticsController.topProducts);
router.get('/orders/breakdown', analyticsController.orderBreakdown);
router.get('/low-stock', analyticsController.lowStock);

module.exports = router;