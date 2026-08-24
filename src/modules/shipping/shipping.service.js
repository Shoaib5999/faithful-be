const axios = require('axios');
const prisma = require('../../config/db');
const notificationService = require('../notification/notification.service');
const { getOrderStatusIdByCode } = require('../masterdata/masterdata.service');

const SHIPROCKET_TO_ORDER_STATUS = {
    Delivered: 'DELIVERED',
    'Shipment Picked Up': 'SHIPPED',
    'Out For Delivery': 'SHIPPED',
    'In Transit': 'SHIPPED',
    'Reached Destination Hub': 'SHIPPED',
    'RTO Initiated': 'RETURNED',
};

const SHIPROCKET_BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

let shiprocketToken = null;
let tokenExpiresAt = null;

// Auth token (valid for 24 hrs)
const getShiprocketToken = async () => {
    const now = new Date();
    if (shiprocketToken && tokenExpiresAt && now < tokenExpiresAt) {
        return shiprocketToken;
    }

    const email = process.env.SHIPROCKET_EMAIL;
    const password = process.env.SHIPROCKET_PASSWORD;
    if (!email || !password) {
        const err = new Error('SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD must be set in .env');
        err.statusCode = 500;
        throw err;
    }

    try {
        const response = await axios.post(`${SHIPROCKET_BASE_URL}/auth/login`, {
            email,
            password,
        });

        shiprocketToken = response.data.token;
        tokenExpiresAt = new Date(now.getTime() + 23 * 60 * 60 * 1000); // 23 hrs
        return shiprocketToken;
    } catch (err) {
        if (err.response?.status === 403) {
            const authErr = new Error(
                'Shiprocket auth failed. Verify API credentials in Shiprocket panel and quote SHIPROCKET_PASSWORD in .env if it contains # or $.',
            );
            authErr.statusCode = 502;
            throw authErr;
        }
        throw err;
    }
};

const shiprocketApi = async (method, endpoint, data = null) => {
    const token = await getShiprocketToken();
    const config = {
        method,
        url: `${SHIPROCKET_BASE_URL}${endpoint}`,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    };
    if (data) config.data = data;

    const response = await axios(config);
    return response.data;
};

const splitCustomerName = (fullName) => {
    const trimmed = (fullName || 'Customer').trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) {
        return { firstName: parts[0], lastName: parts[0] };
    }
    return {
        firstName: parts[0],
        lastName: parts.slice(1).join(' '),
    };
};

const getShiprocketPaymentFlags = (paymentModeCode) => ({
    isCod: paymentModeCode === 'COD',
    paymentMethod: paymentModeCode === 'COD' ? 'COD' : 'Prepaid',
});

const getOrderShippingContext = async (orderId) => {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
            address: true,
            paymentMode: true,
            tracking: true,
        },
    });

    if (!order) {
        const err = new Error('Order not found');
        err.statusCode = 404;
        throw err;
    }

    if (!order.tracking?.shipmentId) {
        const err = new Error('Shiprocket shipment not created yet. Call /api/shipping/create first.');
        err.statusCode = 400;
        throw err;
    }

    return order;
};

const parseAwbAssignResult = (result) => {
    if (result?.awb_assign_status === 0 || (result?.status_code && result.status_code !== 200)) {
        const err = new Error(result?.message || 'AWB assignment failed');
        err.statusCode = 422;
        throw err;
    }

    const awbData = result?.response?.data || result?.awb_assign_status || result || {};
    const awbCode = awbData.awb_code || awbData.awb || null;

    if (!awbCode) {
        const err = new Error('AWB assignment failed');
        err.statusCode = 422;
        throw err;
    }

    return {
        awbCode,
        courierName: awbData.courier_name || null,
    };
};

const parseServiceabilityCouriers = (result) => {
    return result?.data?.available_courier_companies
        || result?.available_courier_companies
        || [];
};

const createShiprocketOrder = async (orderId) => {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
            user: true,
            address: true,
            paymentMode: true,
            items: {
                include: {
                    variant: { include: { product: true } },
                },
            },
        },
    });

    if (!order) {
        const err = new Error('Order not found');
        err.statusCode = 404;
        throw err;
    }

    const orderItems = order.items.map((item) => ({
        name: `${item.variant.product.name} (${item.variant.weightGrams}g)`,
        sku: item.variant.sku,
        units: item.quantity,
        selling_price: Number(item.priceAtPurchase),
        discount: 0,
        tax: 0,
        hsn: 0,
    }));

    const { firstName, lastName } = splitCustomerName(order.address.name);

    const payload = {
        order_id: order.id.slice(0, 20),
        order_date: order.createdAt.toISOString().split('T')[0],
        channel_id: process.env.SHIPROCKET_CHANNEL_ID,
        billing_customer_name: firstName,
        billing_last_name: lastName,
        billing_address: order.address.line1,
        billing_address_2: order.address.line2 || '',
        billing_city: order.address.city,
        billing_pincode: order.address.pincode,
        billing_state: order.address.state,
        billing_country: 'India',
        // Phone-only accounts have no email — Shiprocket gets the store's own
        // address rather than null, since this field feeds an external API.
        billing_email: order.user.email || process.env.STORE_EMAIL || 'orders@faithfulmeat.com',
        billing_phone: order.address.phone,
        shipping_is_billing: true,
        order_items: orderItems,
        payment_method: getShiprocketPaymentFlags(order.paymentMode?.code).paymentMethod,
        sub_total: Number(order.total),
        length: 10,
        breadth: 10,
        height: 10,
        weight: 0.5,
    };

    const result = await shiprocketApi('post', '/orders/create/adhoc', payload);

    // Save Shiprocket order ID
    await prisma.order.update({
        where: { id: orderId },
        data: { shiprocketOrderId: String(result.order_id) },
    });

    // Create tracking record
    await prisma.shipmentTracking.upsert({
        where: { orderId },
        create: {
            orderId,
            shiprocketOrderId: String(result.order_id),
            shipmentId: result.shipment_id ? String(result.shipment_id) : null,
            currentStatus: 'Order Created',
        },
        update: {
            shiprocketOrderId: String(result.order_id),
            shipmentId: result.shipment_id ? String(result.shipment_id) : null,
            currentStatus: 'Order Created',
        },
    });

    return result;
};

const generateAWB = async (orderId, shipmentId, courierId) => {
    const payload = {
        shipment_id: Number(shipmentId),
    };
    if (courierId) payload.courier_id = Number(courierId);

    const result = await shiprocketApi('post', '/courier/assign/awb', payload);
    const { awbCode, courierName } = parseAwbAssignResult(result);

    const tracking = await prisma.shipmentTracking.update({
        where: { orderId },
        data: {
            shipmentId: String(shipmentId),
            awbCode,
            courierName,
            currentStatus: 'AWB Assigned',
            lastUpdated: new Date(),
        },
    });

    return { result, tracking, awbCode, courierName };
};

const generateShippingLabel = async (shipmentId) => {
    return await shiprocketApi('post', '/courier/generate/label', {
        shipment_id: [Number(shipmentId)],
    });
};

const applyShiprocketTrackingStatus = async (
    orderId,
    shiprocketStatus,
    trackingRecord = null,
) => {
    const mappedStatus = SHIPROCKET_TO_ORDER_STATUS[shiprocketStatus];
    if (!mappedStatus) {
        return { updated: false };
    }

    try {
        const statusId = await getOrderStatusIdByCode(mappedStatus);
        const existing = await prisma.order.findUnique({
            where: { id: orderId },
            include: { status: true },
        });

        if (!existing || existing.status?.code === mappedStatus) {
            return { updated: false, status: mappedStatus };
        }

        const updateData = { statusId };
        if (mappedStatus === 'DELIVERED') {
            updateData.paymentStatus = 'PAID';
        }

        await prisma.order.update({
            where: { id: orderId },
            data: updateData,
        });

        const updatedOrder = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                status: true,
                paymentMode: true,
                currency: true,
            },
        });

        setImmediate(() => {
            notificationService
                .sendOrderStatusEmail(updatedOrder, trackingRecord)
                .catch(console.error);
        });

        return {
            updated: true,
            status: mappedStatus,
            previousStatus: existing.status?.code,
        };
    } catch (err) {
        console.error(
            'Failed to sync Shiprocket status to order:',
            err.message,
        );
        return { updated: false, error: err.message };
    }
};

const trackShipment = async (orderId) => {
    const tracking = await prisma.shipmentTracking.findUnique({ where: { orderId } });
    if (!tracking || !tracking.awbCode) {
        const err = new Error('Tracking info not available yet');
        err.statusCode = 404;
        throw err;
    }

    const result = await shiprocketApi('get', `/courier/track/awb/${tracking.awbCode}`);
    const shipmentTrack = result.tracking_data?.shipment_track?.[0];
    const currentStatus = shipmentTrack?.current_status
        || result.tracking_data?.shipment_status
        || tracking.currentStatus;

    const updatedTracking = await prisma.shipmentTracking.update({
        where: { orderId },
        data: {
            currentStatus,
            trackingUrl: tracking.trackingUrl || `https://shiprocket.co/tracking/${tracking.awbCode}`,
            lastUpdated: new Date(),
        },
    });

    const statusSync = await applyShiprocketTrackingStatus(
        orderId,
        currentStatus,
        updatedTracking,
    );

    return {
        tracking: updatedTracking,
        shiprocketData: result.tracking_data,
        statusSync,
    };
};

const cancelShiprocketOrder = async (orderId) => {
    const tracking = await prisma.shipmentTracking.findUnique({ where: { orderId } });
    if (!tracking?.shiprocketOrderId) {
        const err = new Error('Shiprocket order not found');
        err.statusCode = 404;
        throw err;
    }

    return await shiprocketApi('post', '/orders/cancel', {
        ids: [Number(tracking.shiprocketOrderId)],
    });
};

const handleShiprocketWebhook = async (payload) => {
    const { awb, current_status } = payload;

    if (!awb) return { received: true };

    const tracking = await prisma.shipmentTracking.findFirst({
        where: { awbCode: awb },
    });

    if (!tracking) return { received: true };

    const updatedTracking = await prisma.shipmentTracking.update({
        where: { id: tracking.id },
        data: { currentStatus: current_status, lastUpdated: new Date() },
    });

    const statusSync = await applyShiprocketTrackingStatus(
        tracking.orderId,
        current_status,
        updatedTracking,
    );

    return {
        received: true,
        orderId: tracking.orderId,
        shiprocketStatus: current_status,
        statusSync,
    };
};

const getAvailableCouriers = async (orderId) => {
    const order = await getOrderShippingContext(orderId);
    const { isCod } = getShiprocketPaymentFlags(order.paymentMode?.code);
    const shiprocketOrderId = order.tracking.shiprocketOrderId || order.shiprocketOrderId;

    const query = new URLSearchParams({
        pickup_postcode: process.env.STORE_PINCODE,
        delivery_postcode: order.address.pincode,
        cod: isCod ? '1' : '0',
        weight: '0.5',
    });
    if (shiprocketOrderId) query.set('order_id', shiprocketOrderId);

    return await shiprocketApi('get', `/courier/serviceability/?${query.toString()}`);
};

const fulfillShipment = async (orderId, courierId = null) => {
    const order = await getOrderShippingContext(orderId);
    const shipmentId = order.tracking.shipmentId;
    let awbResult = null;

    if (!order.tracking.awbCode) {
        let selectedCourierId = courierId;
        if (!selectedCourierId) {
            const serviceability = await getAvailableCouriers(orderId);
            const couriers = parseServiceabilityCouriers(serviceability);
            if (!couriers.length) {
                const err = new Error('No couriers available for this route');
                err.statusCode = 422;
                throw err;
            }
            const cheapest = [...couriers].sort((a, b) => Number(a.rate) - Number(b.rate))[0];
            selectedCourierId = cheapest.courier_company_id;
        }
        awbResult = await generateAWB(orderId, shipmentId, selectedCourierId);
    } else {
        awbResult = { awbCode: order.tracking.awbCode, courierName: order.tracking.courierName };
    }

    const labelResult = await generateShippingLabel(shipmentId);
    const labelUrl = labelResult?.label_url || null;

    if (labelUrl) {
        await prisma.shipmentTracking.update({
            where: { orderId },
            data: { trackingUrl: labelUrl, lastUpdated: new Date() },
        });
    }

    const trackResult = await trackShipment(orderId);

    return {
        shipmentId,
        awbCode: trackResult.tracking.awbCode,
        courierName: trackResult.tracking.courierName,
        labelUrl,
        currentStatus: trackResult.tracking.currentStatus,
        awbResult,
        labelResult,
        trackResult,
    };
};

module.exports = {
    createShiprocketOrder,
    generateAWB,
    generateShippingLabel,
    trackShipment,
    cancelShiprocketOrder,
    handleShiprocketWebhook,
    getAvailableCouriers,
    fulfillShipment,
};