const shippingService = require('./shipping.service');
const { success, error } = require('../../utils/response');

const createOrder = async (req, res, next) => {
    try {
        const { orderId } = req.body;
        if (!orderId) return error(res, 'orderId is required', 400);
        const result = await shippingService.createShiprocketOrder(orderId);
        return success(res, result, 'Shiprocket order created');
    } catch (err) {
        next(err);
    }
};

const assignAWB = async (req, res, next) => {
    try {
        const { orderId, shipmentId, courierId } = req.body;
        if (!orderId || !shipmentId) {
            return error(res, 'orderId and shipmentId are required', 400);
        }
        const result = await shippingService.generateAWB(orderId, shipmentId, courierId);
        return success(res, result, 'AWB assigned');
    } catch (err) {
        next(err);
    }
};

const getLabel = async (req, res, next) => {
    try {
        const { shipmentId } = req.params;
        const result = await shippingService.generateShippingLabel(shipmentId);
        return success(res, result, 'Label generated');
    } catch (err) {
        next(err);
    }
};

const trackOrder = async (req, res, next) => {
    try {
        const result = await shippingService.trackShipment(req.params.orderId);
        return success(res, result, 'Tracking info fetched');
    } catch (err) {
        next(err);
    }
};

const cancelOrder = async (req, res, next) => {
    try {
        const result = await shippingService.cancelShiprocketOrder(req.params.orderId);
        return success(res, result, 'Shiprocket order cancelled');
    } catch (err) {
        next(err);
    }
};

const getCouriers = async (req, res, next) => {
    try {
        const result = await shippingService.getAvailableCouriers(req.params.orderId);
        return success(res, result, 'Available couriers fetched');
    } catch (err) {
        next(err);
    }
};

const fulfillShipment = async (req, res, next) => {
    try {
        const { orderId, courierId } = req.body;
        if (!orderId) return error(res, 'orderId is required', 400);
        const result = await shippingService.fulfillShipment(orderId, courierId || null);
        return success(res, result, 'Shipment fulfilled');
    } catch (err) {
        next(err);
    }
};

const shiprocketWebhook = async (req, res, next) => {
    try {
        const result = await shippingService.handleShiprocketWebhook(req.body);
        return res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

module.exports = { createOrder, assignAWB, getLabel, trackOrder, cancelOrder, getCouriers, fulfillShipment, shiprocketWebhook };