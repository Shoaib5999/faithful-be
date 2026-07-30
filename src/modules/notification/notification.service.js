const prisma = require('../../config/db');
const { sendEmail } = require('../../config/mailer');
const { getStoreName } = require('../../config/store');
const {
    welcomeTemplate,
    orderConfirmationTemplate,
    orderStatusTemplate,
    refundProcessedTemplate,
} = require('../../utils/email-templates');

const logNotification = async ({ userId, orderId, type, status, provider, error }) => {
    try {
        await prisma.notificationLog.create({
            data: {
                userId: userId || null,
                orderId: orderId || null,
                type,
                channel: 'email',
                status,
                provider: provider || null,
                error: error || null,
            },
        });
    } catch (err) {
        console.error('Failed to log notification:', err.message);
    }
};

const sendWelcomeEmail = async (user) => {
    try {
        const html = welcomeTemplate({ name: user.name });
        const result = await sendEmail({
            to: user.email,
            subject: `Welcome to ${getStoreName()}`,
            html,
        });

        await logNotification({
            userId: user.id,
            type: 'welcome',
            status: 'sent',
            provider: result.provider,
        });
    } catch (err) {
        await logNotification({
            userId: user.id,
            type: 'welcome',
            status: 'failed',
            error: err.message,
        });
        console.error('Welcome email failed:', err.message);
    }
};

const sendOrderConfirmationEmail = async (order) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: order.userId } });
        const fullOrder = await prisma.order.findUnique({
            where: { id: order.id },
            include: {
                items: {
                    include: { variant: { include: { product: true } } },
                },
                paymentMode: true,
            },
        });

        const { formatPublicOrderNumber } = require('../../utils/order-number');
        const orderNumber = formatPublicOrderNumber(order.id);

        let trackUrl;
        try {
            const { getFrontendUrl } = require('../../utils/frontend-url');
            trackUrl = `${getFrontendUrl()}/track-order?orderId=${encodeURIComponent(orderNumber)}`;
        } catch {
            trackUrl = undefined;
        }

        const html = orderConfirmationTemplate({
            name: user.name,
            order: fullOrder,
            orderNumber,
            trackUrl,
        });
        const result = await sendEmail({
            to: user.email,
            subject: `Order Confirmed — #${orderNumber}`,
            html,
        });

        await logNotification({
            userId: user.id,
            orderId: order.id,
            type: 'order_confirmation',
            status: 'sent',
            provider: result.provider,
        });
    } catch (err) {
        await logNotification({
            userId: order.userId,
            orderId: order.id,
            type: 'order_confirmation',
            status: 'failed',
            error: err.message,
        });
        console.error('Order confirmation email failed:', err.message);
    }
};

const sendOrderStatusEmail = async (order, tracking = null) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: order.userId } });
        const { formatPublicOrderNumber } = require('../../utils/order-number');
        const orderNumber = formatPublicOrderNumber(order.id);

        let storeTrackUrl;
        try {
            const { getFrontendUrl } = require('../../utils/frontend-url');
            storeTrackUrl = `${getFrontendUrl()}/track-order?orderId=${encodeURIComponent(orderNumber)}`;
        } catch {
            storeTrackUrl = undefined;
        }

        const statusCode = order.status?.code || order.status;
        const html = orderStatusTemplate({
            name: user.name,
            order,
            orderNumber,
            status: statusCode,
            trackingUrl: tracking?.trackingUrl || null,
            storeTrackUrl,
            awbCode: tracking?.awbCode || null,
            courierName: tracking?.courierName || null,
        });

        const result = await sendEmail({
            to: user.email,
            subject: `Order Update — ${statusCode} | #${orderNumber}`,
            html,
        });

        await logNotification({
            userId: user.id,
            orderId: order.id,
            type: `order_${String(statusCode).toLowerCase()}`,
            status: 'sent',
            provider: result.provider,
        });
    } catch (err) {
        await logNotification({
            userId: order.userId,
            orderId: order.id,
            type: `order_${String(statusCode).toLowerCase()}`,
            status: 'failed',
            error: err.message,
        });
        console.error('Order status email failed:', err.message);
    }
};

const sendRefundEmail = async (orderId, amount, reason) => {
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { user: true },
        });

        if (!order?.user?.email) {
            return;
        }

        const html = refundProcessedTemplate({
            name: order.user.name,
            order,
            amount,
            reason,
        });

        const result = await sendEmail({
            to: order.user.email,
            subject: `Refund processed — #${order.id.slice(0, 8).toUpperCase()}`,
            html,
        });

        await logNotification({
            userId: order.userId,
            orderId,
            type: 'refund_processed',
            status: 'sent',
            provider: result.provider,
        });
    } catch (err) {
        await logNotification({
            orderId,
            type: 'refund_processed',
            status: 'failed',
            error: err.message,
        });
        console.error('Refund email failed:', err.message);
    }
};

module.exports = {
    sendWelcomeEmail,
    sendOrderConfirmationEmail,
    sendOrderStatusEmail,
    sendRefundEmail,
};