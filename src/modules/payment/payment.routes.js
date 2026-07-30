const express = require('express');
const router = express.Router();
const paymentController = require('./payment.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

// Razorpay webhook — no auth, raw body needed
router.post('/webhook/razorpay', paymentController.razorpayWebhook);

// Razorpay Magic Checkout public callbacks (no auth)
router.post('/magic/shipping-info', paymentController.magicShippingInfo);
router.get('/magic/shipping-info', paymentController.magicShippingInfo);
router.get('/magic/promotions', paymentController.magicGetPromotions);
router.post('/magic/promotions', paymentController.magicGetPromotions);
router.get('/magic/promotions/apply', paymentController.magicApplyPromotion);
router.post('/magic/promotions/apply', paymentController.magicApplyPromotion);

router.get('/checkout-config', paymentController.getCheckoutConfig);

// Guest Magic Checkout (no auth)
router.post('/guest/prepare', paymentController.prepareGuestOnlineCheckout);
router.post('/guest/complete', paymentController.completeGuestOnlineCheckout);

// Authenticated routes
router.post('/online/prepare', authenticate, paymentController.prepareOnlineCheckout);
router.post('/online/complete', authenticate, paymentController.completeOnlineCheckout);
router.post('/razorpay/create', authenticate, paymentController.createRazorpayOrder);
router.post('/razorpay/verify', authenticate, paymentController.verifyPayment);
router.post(
    '/razorpay/refund',
    authenticate,
    authorize('ADMIN', 'MANAGER'),
    paymentController.refundRazorpayPayment,
);
router.get('/upi/:orderId', authenticate, paymentController.getUpiLink);
router.post('/upi/confirm', authenticate, paymentController.confirmUpi);

module.exports = router;