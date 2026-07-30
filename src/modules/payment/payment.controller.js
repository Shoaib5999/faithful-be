const paymentService = require('./payment.service');
const { success, error } = require('../../utils/response');

const sendMagicCheckoutError = (res, err) => {
    const statusCode = err.statusCode || 500;
    const isServerError = statusCode >= 500;
    return res.status(statusCode).json({
        error: {
            code: isServerError ? 'SERVER_ERROR' : 'BAD_REQUEST_ERROR',
            description: isServerError
                ? 'The server encountered an error. The incident has been reported to admins.'
                : (err.message || 'Request failed'),
            field: err.field || null,
            source: 'business',
            step: 'api_validation',
            reason: err.reason || (isServerError ? 'server_error' : 'invalid_request'),
            metadata: {},
        },
    });
};

const createOrder = async (req, res, next) => {
    try {
        const { amount, currency, receipt } = req.body;
        const data = await paymentService.createCheckoutOrder({ amount, currency, receipt });
        return res.status(200).json(data);
    } catch (err) {
        next(err);
    }
};

const verifyStandardPayment = async (req, res, next) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        } = req.body;

        const data = await paymentService.verifyCheckoutPayment({
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        });

        return res.status(200).json({
            success: true,
            ...data,
        });
    } catch (err) {
        next(err);
    }
};

const createRazorpayOrder = async (req, res, next) => {
    try {
        const { orderId } = req.body;
        if (!orderId) return error(res, 'orderId is required', 400);
        const data = await paymentService.createRazorpayOrder(orderId, req.user.id);
        return success(res, data, 'Online payment session created');
    } catch (err) {
        next(err);
    }
};

const prepareOnlineCheckout = async (req, res, next) => {
    try {
        const { addressId, paymentMethod, couponCode, shippingMethodCode } = req.body;
        const magicEnabled = paymentService.isMagicCheckoutEnabled();

        if (!paymentMethod) {
            return error(res, 'paymentMethod is required', 400);
        }

        if (!magicEnabled && !addressId) {
            return error(res, 'addressId and paymentMethod are required', 400);
        }

        const data = await paymentService.prepareOnlineCheckout(req.user.id, {
            addressId,
            paymentMethod,
            couponCode,
            shippingMethodCode,
        });
        return success(res, data, 'Checkout session ready');
    } catch (err) {
        next(err);
    }
};

const completeOnlineCheckout = async (req, res, next) => {
    try {
        const {
            addressId,
            paymentMethod,
            couponCode,
            shippingMethodCode,
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            notes,
        } = req.body;

        const magicEnabled = paymentService.isMagicCheckoutEnabled();

        if (
            !paymentMethod ||
            !razorpayOrderId ||
            !razorpayPaymentId ||
            !razorpaySignature
        ) {
            return error(res, 'Missing required checkout fields', 400);
        }

        if (!magicEnabled && !addressId) {
            return error(res, 'Missing required checkout fields', 400);
        }

        const order = await paymentService.completeOnlineCheckout(req.user.id, {
            addressId,
            paymentMethod,
            couponCode,
            shippingMethodCode,
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            notes,
        });

        return success(res, order, 'Order placed successfully', 201);
    } catch (err) {
        next(err);
    }
};

const verifyPayment = async (req, res, next) => {
    try {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature, orderId } = req.body;
        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !orderId) {
            return error(res, 'All payment verification fields are required', 400);
        }
        const order = await paymentService.verifyRazorpayPayment(req.body);
        return success(res, order, 'Payment verified successfully');
    } catch (err) {
        next(err);
    }
};

const getUpiLink = async (req, res, next) => {
    try {
        const { orderId } = req.params;
        const data = await paymentService.generateUpiLink(orderId, req.user.id);
        return success(res, data, 'UPI payment details generated');
    } catch (err) {
        next(err);
    }
};

const confirmUpi = async (req, res, next) => {
    try {
        const { orderId, transactionId } = req.body;
        if (!orderId || !transactionId) return error(res, 'orderId and transactionId are required', 400);
        const order = await paymentService.confirmUpiPayment(orderId, req.user.id, transactionId);
        return success(res, order, 'UPI payment confirmed');
    } catch (err) {
        next(err);
    }
};

const razorpayWebhook = async (req, res, next) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        const rawBody = JSON.stringify(req.body);
        const result = await paymentService.handleRazorpayWebhook(rawBody, signature);
        return res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

const refundRazorpayPayment = async (req, res, next) => {
    try {
        const { orderId, reason } = req.body;
        if (!orderId) return error(res, 'orderId is required', 400);

        const result = await paymentService.refundOrderPayment(orderId, {
            reason: reason || 'Manual refund by admin',
            initiatedBy: `admin:${req.user.id}`,
        });

        if (result.skipped) {
            return error(
                res,
                `Refund skipped: ${result.reason}`,
                400,
            );
        }

        const order = await require('../order/order.service').getOrderById(orderId);
        return success(res, { refund: result, order }, 'Refund processed successfully');
    } catch (err) {
        next(err);
    }
};

const magicShippingInfo = async (req, res) => {
    try {
        const payload = { ...req.query, ...req.body };
        const data = await paymentService.getMagicShippingInfo(payload);
        return res.status(200).json(data);
    } catch (err) {
        return sendMagicCheckoutError(res, err);
    }
};

const magicGetPromotions = async (req, res) => {
    try {
        const payload = { ...req.query, ...req.body };
        const data = await paymentService.getMagicPromotions(payload);
        return res.status(200).json(data);
    } catch (err) {
        return sendMagicCheckoutError(res, err);
    }
};

const magicApplyPromotion = async (req, res) => {
    try {
        const payload = { ...req.query, ...req.body };
        const data = await paymentService.applyMagicPromotion(payload);
        return res.status(200).json(data);
    } catch (err) {
        if ((err.statusCode || 500) >= 500) {
            console.error('[magic/promotions/apply]', {
                orderId: req.body?.order_id || req.query?.order_id,
                code: req.body?.code || req.query?.code,
                message: err.message,
            });
        }
        return sendMagicCheckoutError(res, err);
    }
};

const getCheckoutConfig = async (req, res, next) => {
    try {
        return success(res, {
            magicCheckoutEnabled: paymentService.isMagicCheckoutEnabled(),
        });
    } catch (err) {
        next(err);
    }
};

const prepareGuestOnlineCheckout = async (req, res, next) => {
    try {
        if (!paymentService.isMagicCheckoutEnabled()) {
            return error(res, 'Guest checkout is not enabled', 400);
        }

        const { items, paymentMethod, couponCode, shippingMethodCode } = req.body;
        if (!paymentMethod) {
            return error(res, 'paymentMethod is required', 400);
        }
        if (!Array.isArray(items) || items.length === 0) {
            return error(res, 'items are required', 400);
        }

        const data = await paymentService.prepareGuestOnlineCheckout({
            items,
            paymentMethod,
            couponCode,
            shippingMethodCode,
        });
        return success(res, data, 'Guest checkout session ready');
    } catch (err) {
        next(err);
    }
};

const completeGuestOnlineCheckout = async (req, res, next) => {
    try {
        if (!paymentService.isMagicCheckoutEnabled()) {
            return error(res, 'Guest checkout is not enabled', 400);
        }

        const {
            paymentMethod,
            couponCode,
            shippingMethodCode,
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            notes,
        } = req.body;

        if (
            !paymentMethod ||
            !razorpayOrderId ||
            !razorpayPaymentId ||
            !razorpaySignature
        ) {
            return error(res, 'Missing required checkout fields', 400);
        }

        const result = await paymentService.completeGuestOnlineCheckout({
            paymentMethod,
            couponCode,
            shippingMethodCode,
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            notes,
        });

        return success(res, result, 'Order placed successfully', 201);
    } catch (err) {
        next(err);
    }
};

module.exports = {
    createOrder,
    verifyStandardPayment,
    prepareOnlineCheckout,
    completeOnlineCheckout,
    prepareGuestOnlineCheckout,
    completeGuestOnlineCheckout,
    createRazorpayOrder,
    verifyPayment,
    refundRazorpayPayment,
    getUpiLink,
    confirmUpi,
    razorpayWebhook,
    magicShippingInfo,
    magicGetPromotions,
    magicApplyPromotion,
    getCheckoutConfig,
};