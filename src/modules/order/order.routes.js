const express = require('express');
const router = express.Router();
const orderController = require('./order.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

// Customer routes
router.post('/', authenticate, orderController.place);
router.post('/track', orderController.trackOrder);
router.patch('/track/:id/cancel', orderController.cancelTrackedOrder);
router.get('/my', authenticate, orderController.getMyOrders);
router.get('/my/:id', authenticate, orderController.getMyOrderById);
router.patch('/my/:id/cancel', authenticate, orderController.cancel);

// Admin routes
router.get('/', authenticate, authorize('ADMIN', 'MANAGER', 'STAFF'), orderController.getAllOrders);
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'STAFF'), orderController.getOrderById);
router.patch('/:id/status', authenticate, authorize('ADMIN', 'MANAGER'), orderController.updateStatus);

module.exports = router;