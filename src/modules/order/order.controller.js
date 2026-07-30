const orderService = require('./order.service');
const { success, error } = require('../../utils/response');
const prisma = require('../../config/db');
const { isOnlineCheckoutPaymentCode } = require('../../constants/payment.constants');

const place = async (req, res, next) => {
    try {
        const { addressId, paymentMethod, couponCode, notes, shippingMethodCode } = req.body;
        if (!addressId || !paymentMethod) {
            return error(res, 'addressId and paymentMethod are required', 400);
        }

        const mode = await prisma.paymentMode.findFirst({
            where: {
                code: String(paymentMethod).toUpperCase(),
                isActive: true,
            },
        });

        if (!mode) {
            return error(res, 'Invalid or unavailable payment method', 400);
        }

        if (mode.isOnline || isOnlineCheckoutPaymentCode(mode.code)) {
            return error(
                res,
                'Card and UPI orders must be completed through online payment',
                400,
            );
        }

        const order = await orderService.placeOrder(req.user.id, {
            addressId,
            paymentMethod: mode.code,
            couponCode,
            notes,
            shippingMethodCode,
        });
        return success(res, order, 'Order placed successfully', 201);
    } catch (err) {
        next(err);
    }
};

const getMyOrders = async (req, res, next) => {
    try {
        const result = await orderService.getUserOrders(req.user.id, req.query);
        return success(res, result, 'Orders fetched');
    } catch (err) {
        next(err);
    }
};

const getMyOrderById = async (req, res, next) => {
    try {
        const order = await orderService.getOrderById(req.params.id, req.user.id);
        return success(res, order, 'Order fetched');
    } catch (err) {
        next(err);
    }
};

const cancel = async (req, res, next) => {
    try {
        const order = await orderService.cancelOrder(req.params.id, req.user.id, req.body.reason);
        return success(res, order, 'Order cancelled');
    } catch (err) {
        next(err);
    }
};

// Admin
const getAllOrders = async (req, res, next) => {
    try {
        const result = await orderService.getAllOrders(req.query);
        return success(res, result, 'All orders fetched');
    } catch (err) {
        next(err);
    }
};

const getOrderById = async (req, res, next) => {
    try {
        const order = await orderService.getOrderById(req.params.id);
        return success(res, order, 'Order fetched');
    } catch (err) {
        next(err);
    }
};

const updateStatus = async (req, res, next) => {
    try {
        const { status, shiprocketOrderId } = req.body;
        if (!status) return error(res, 'status is required', 400);
        const order = await orderService.updateOrderStatus(req.params.id, status, shiprocketOrderId);
        return success(res, order, 'Order status updated');
    } catch (err) {
        next(err);
    }
};

const trackOrder = async (req, res, next) => {
    try {
        const { orderId } = req.body;
        if (!orderId) {
            return error(res, 'orderId is required', 400);
        }
        const order = await orderService.trackOrderPublic(orderId);
        return success(res, order, 'Order fetched');
    } catch (err) {
        next(err);
    }
};

const cancelTrackedOrder = async (req, res, next) => {
    try {
        const { reason, email } = req.body;
        if (!email) return error(res, 'email is required', 400);
        const order = await orderService.cancelOrderPublic(
            req.params.id,
            reason,
            email,
        );
        return success(res, order, 'Order cancelled');
    } catch (err) {
        next(err);
    }
};

module.exports = {
    place,
    getMyOrders,
    getMyOrderById,
    cancel,
    trackOrder,
    cancelTrackedOrder,
    getAllOrders,
    getOrderById,
    updateStatus,
};