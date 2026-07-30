const express = require('express');
const router = express.Router();
const shippingController = require('./shipping.controller');
const shippingConfigRoutes = require('./shipping-config.routes');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

router.use('/config', shippingConfigRoutes);

// Shiprocket webhook — no auth
router.post('/webhook/shiprocket', shippingController.shiprocketWebhook);

// Customer tracking
router.get('/track/:orderId', authenticate, shippingController.trackOrder);

// Admin only
router.post('/fulfill', authenticate, authorize('ADMIN', 'MANAGER'), shippingController.fulfillShipment);
router.post('/create', authenticate, authorize('ADMIN', 'MANAGER'), shippingController.createOrder);
router.post('/awb', authenticate, authorize('ADMIN', 'MANAGER'), shippingController.assignAWB);
router.get('/label/:shipmentId', authenticate, authorize('ADMIN', 'MANAGER'), shippingController.getLabel);
router.delete('/cancel/:orderId', authenticate, authorize('ADMIN', 'MANAGER'), shippingController.cancelOrder);
router.get('/couriers/:orderId', authenticate, authorize('ADMIN', 'MANAGER'), shippingController.getCouriers);

module.exports = router;