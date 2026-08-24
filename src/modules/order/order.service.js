const prisma = require('../../config/db');
const cartService = require('../cart/cart.service');
const notificationService = require('../notification/notification.service');
const paymentService = require('../payment/payment.service');

const {
    getDefaultOrderStatusId,
    getOrderStatusIdByCode,
    getPaymentModeIdByCode,
    getDefaultCurrencyId,
} = require('../masterdata/masterdata.service');
const { isOnlineGatewayPaymentCode } = require('../../constants/payment.constants');

const REFUNDABLE_STATUS_CODES = new Set(['CANCELLED', 'RETURNED']);

const restoreOrderStock = async (tx, orderId) => {
    const items = await tx.orderItem.findMany({
        where: { orderId },
    });

    for (const item of items) {
        await tx.productVariant.update({
            where: {
                id: item.variantId,
            },

            data: {
                stockQty: {
                    increment: item.quantity,
                },
            },
        });
    }
};

const maybeRefundRazorpayOrder = async (
    orderId,
    { reason, initiatedBy },
) => {
    const result = await paymentService.refundOrderPayment(
        orderId,
        { reason, initiatedBy },
    );

    if (result.skipped) {
        return result;
    }

    if (!result.success) {
        const err = new Error(
            'Refund could not be processed. The order was not updated.',
        );
        err.statusCode = 502;
        throw err;
    }

    return result;
};

const placeOrder = async (
    userId,
    { addressId, paymentMethod, couponCode, notes, onlinePayment, shippingMethodCode, cartSummary }
) => {
    // Validate address
    const address = await prisma.address.findFirst({
        where: { id: addressId, userId },
    });

    if (!address) {
        const err = new Error('Address not found');
        err.statusCode = 404;
        throw err;
    }

    // Get cart summary (reuse validated summary from checkout when provided)
    const summary = cartSummary ?? await cartService.getCartSummary(
        userId,
        couponCode,
        shippingMethodCode,
    );

    if (!summary.cart.items.length) {
        const err = new Error('Cart is empty');
        err.statusCode = 400;
        throw err;
    }

    // Validate stock
    for (const item of summary.cart.items) {
        if (item.variant.stockQty < item.quantity) {
            const err = new Error(
                `Insufficient stock for variant ${item.variantId}`
            );

            err.statusCode = 400;
            throw err;
        }
    }

    const isOnlinePaid = Boolean(onlinePayment?.verified);

    const [
        defaultStatusId,
        confirmedStatusId,
        paymentModeId,
        defaultCurrencyId,
    ] = await Promise.all([
        getDefaultOrderStatusId(),
        isOnlinePaid ? getOrderStatusIdByCode('CONFIRMED') : Promise.resolve(null),
        getPaymentModeIdByCode(paymentMethod),
        getDefaultCurrencyId(),
    ]);

    // Resolve coupon
    let couponId = null;

    if (couponCode && summary.coupon) {
        const coupon = await prisma.coupon.findUnique({
            where: {
                code: couponCode.toUpperCase(),
            },
        });

        if (coupon) {
            couponId = coupon.id;
        }
    }

    // Create order transaction
    const order = await prisma.$transaction(async (tx) => {
        // Deduct stock safely (independent rows, run concurrently to save round trips)
        const stockUpdates = await Promise.all(
            summary.cart.items.map((item) =>
                tx.productVariant.updateMany({
                    where: {
                        id: item.variantId,
                        stockQty: {
                            gte: item.quantity,
                        },
                    },
                    data: {
                        stockQty: {
                            decrement: item.quantity,
                        },
                    },
                }),
            ),
        );

        const shortItem = summary.cart.items.find(
            (_, index) => stockUpdates[index].count === 0,
        );

        if (shortItem) {
            const err = new Error(
                `Insufficient stock for variant ${shortItem.variantId}`
            );

            err.statusCode = 400;
            throw err;
        }

        // Create order
        const newOrder = await tx.order.create({
            data: {
                userId,
                addressId,
                statusId: isOnlinePaid ? confirmedStatusId : defaultStatusId,
                paymentModeId,
                currencyId: defaultCurrencyId,
                paymentStatus: isOnlinePaid ? 'PAID' : 'PENDING',
                couponId,
                subtotal: summary.subtotal,
                discount: summary.discount,
                shippingCharge: summary.shippingCharge,
                shippingMethodId: summary.shippingMethod?.id ?? null,
                total: summary.total,
                notes,

                items: {
                    create: summary.cart.items.map((item) => ({
                        variantId: item.variantId,
                        quantity: item.quantity,
                        priceAtPurchase: item.variant.price,
                    })),
                },
            },

            include: {
                items: true,
                address: true,
                status: true,
                paymentMode: true,
                currency: true,
            },
        });

        // Create payment record and record coupon usage concurrently
        await Promise.all([
            tx.payment.create({
                data: {
                    orderId: newOrder.id,
                    amount: summary.total,
                    paymentModeId,
                    status: isOnlinePaid ? 'PAID' : 'PENDING',
                    razorpayOrderId: onlinePayment?.razorpayOrderId ?? null,
                    razorpayPaymentId: onlinePayment?.razorpayPaymentId ?? null,
                    razorpaySignature: onlinePayment?.razorpaySignature ?? null,
                },
            }),

            couponId
                ? tx.coupon.update({
                    where: { id: couponId },
                    data: {
                        usedCount: {
                            increment: 1,
                        },
                    },
                })
                : Promise.resolve(),

            couponId
                ? tx.couponUsage.create({
                    data: {
                        couponId,
                        userId,
                        orderId: newOrder.id,
                    },
                })
                : Promise.resolve(),
        ]);

        return newOrder;
    });

    // Clear cart
    await cartService.clearCart(userId);

    // Send email
    setImmediate(() => {
        notificationService
            .sendOrderConfirmationEmail(order)
            .catch(console.error);
    });

    // Alert the shop the moment the order is placed — no admin confirmation step required.
    setImmediate(() => {
        notificationService
            .sendOrderConfirmedPush(order)
            .catch(console.error);
    });

    return order;
};

const getUserOrders = async (
    userId,
    { page = 1, limit = 10, status }
) => {
    const skip = (page - 1) * limit;

    const where = {
        userId,
    };

    if (status) {
        const orderStatus =
            await prisma.orderStatus.findUnique({
                where: {
                    code: status.toUpperCase(),
                },
            });

        if (orderStatus) {
            where.statusId = orderStatus.id;
        }
    }

    const [orders, total] = await Promise.all([
        prisma.order.findMany({
            where,

            include: {
                items: {
                    include: {
                        variant: {
                            include: {
                                product: {
                                    include: {
                                        images: {
                                            where: {
                                                isPrimary: true,
                                            },
                                        },
                                        category: {
                                            select: {
                                                slug: true,
                                                name: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },

                address: true,
                payment: true,
                coupon: true,
                status: true,
                paymentMode: true,
                currency: true,
            },

            orderBy: {
                createdAt: 'desc',
            },

            skip,
            take: Number(limit),
        }),

        prisma.order.count({ where }),
    ]);

    return {
        orders,
        total,
        page: Number(page),
        totalPages: Math.ceil(
            total / Number(limit)
        ),
    };
};

const getOrderById = async (
    orderId,
    userId = null
) => {
    const where = {
        id: orderId,
    };

    if (userId) {
        where.userId = userId;
    }

    const order = await prisma.order.findFirst({
        where,

        include: {
            items: {
                include: {
                    variant: {
                        include: {
                            product: {
                                include: {
                                    images: {
                                        where: {
                                            isPrimary: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },

            address: true,
            payment: true,
            coupon: true,
            status: true,
            paymentMode: true,
            currency: true,
            tracking: true,
        },
    });

    if (!order) {
        const err = new Error('Order not found');
        err.statusCode = 404;
        throw err;
    }

    return order;
};

const cancelOrder = async (
    orderId,
    userId,
    reason
) => {
    const order = await prisma.order.findFirst({
        where: {
            id: orderId,
            userId,
        },

        include: {
            status: true,
            payment: true,
            paymentMode: true,
        },
    });

    if (!order) {
        const err = new Error('Order not found');
        err.statusCode = 404;
        throw err;
    }

    if (
        order.status.code === 'CANCELLED' ||
        order.status.isFinal
    ) {
        const err = new Error(
            'Order cannot be cancelled at this stage'
        );

        err.statusCode = 400;
        throw err;
    }

    let wasRefunded = false;

    if (
        isOnlineGatewayPaymentCode(order.paymentMode?.code) &&
        order.paymentStatus === 'PAID'
    ) {
        const refundResult = await maybeRefundRazorpayOrder(orderId, {
            reason: reason || 'Cancelled by customer',
            initiatedBy: 'customer',
        });

        wasRefunded = Boolean(
            refundResult?.success || refundResult?.alreadyRefunded,
        );
    }

    const cancelledStatusId =
        await getOrderStatusIdByCode(
            'CANCELLED'
        );

    const updatedOrder = await prisma.$transaction(
        async (tx) => {
            await restoreOrderStock(tx, orderId);

            return await tx.order.update({
                where: {
                    id: orderId,
                },

                data: {
                    statusId: cancelledStatusId,
                    cancelReason:
                        reason ||
                        'Cancelled by user',
                    ...(wasRefunded
                        ? { paymentStatus: 'REFUNDED' }
                        : {}),
                },

                include: {
                    status: true,
                    payment: true,
                    paymentMode: true,
                    items: true,
                },
            });
        }
    );

    setImmediate(() => {
        notificationService
            .sendOrderStatusEmail(updatedOrder, null)
            .catch(console.error);
    });

    return updatedOrder;
};

// Admin functions

const getAllOrders = async ({
    page = 1,
    limit = 20,
    status,
    paymentMethod,
    search,
}) => {
    const skip = (page - 1) * limit;

    const where = {};

    if (status) {
        const orderStatus =
            await prisma.orderStatus.findUnique({
                where: {
                    code: status.toUpperCase(),
                },
            });

        if (orderStatus) {
            where.statusId = orderStatus.id;
        }
    }

    if (paymentMethod) {
        const paymentMode =
            await prisma.paymentMode.findUnique({
                where: {
                    code: paymentMethod.toUpperCase(),
                },
            });

        if (paymentMode) {
            where.paymentModeId =
                paymentMode.id;
        }
    }

    if (search) {
        where.OR = [
            {
                id: {
                    contains: search,
                },
            },

            {
                user: {
                    name: {
                        contains: search,
                    },
                },
            },

            {
                user: {
                    email: {
                        contains: search,
                    },
                },
            },
        ];
    }

    const [orders, total] = await Promise.all([
        prisma.order.findMany({
            where,

            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },

                address: true,
                payment: true,
                coupon: true,
                items: {
                    include: {
                        variant: {
                            include: {
                                product: {
                                    include: {
                                        images: {
                                            where: {
                                                isPrimary: true,
                                            },
                                            take: 1,
                                        },
                                        category: {
                                            select: {
                                                slug: true,
                                                name: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                status: true,
                paymentMode: true,
                currency: true,
                tracking: true,
            },

            orderBy: {
                createdAt: 'desc',
            },

            skip,
            take: Number(limit),
        }),

        prisma.order.count({ where }),
    ]);

    return {
        orders,
        total,
        page: Number(page),
        totalPages: Math.ceil(
            total / Number(limit)
        ),
    };
};

const updateOrderStatus = async (
    orderId,
    statusCode,
    shiprocketOrderId = null
) => {
    const normalizedStatus = String(statusCode).toUpperCase();

    const existingOrder = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
            status: true,
            payment: true,
            paymentMode: true,
        },
    });

    if (!existingOrder) {
        const err = new Error('Order not found');
        err.statusCode = 404;
        throw err;
    }

    let wasRefunded = false;

    if (
        REFUNDABLE_STATUS_CODES.has(normalizedStatus) &&
        isOnlineGatewayPaymentCode(existingOrder.paymentMode?.code) &&
        existingOrder.paymentStatus === 'PAID'
    ) {
        const refundResult = await maybeRefundRazorpayOrder(orderId, {
            reason:
                normalizedStatus === 'RETURNED'
                    ? 'Order returned'
                    : 'Order cancelled by admin',
            initiatedBy: 'admin',
        });

        wasRefunded = Boolean(
            refundResult?.success || refundResult?.alreadyRefunded,
        );
    }

    const statusId =
        await getOrderStatusIdByCode(
            normalizedStatus
        );

    const updateData = {
        statusId,
    };

    if (shiprocketOrderId) {
        updateData.shiprocketOrderId =
            shiprocketOrderId;
    }

    const deliveredStatusId =
        await getOrderStatusIdByCode(
            'DELIVERED'
        ).catch(() => null);

    if (
        deliveredStatusId &&
        statusId === deliveredStatusId
    ) {
        updateData.paymentStatus = 'PAID';
    }

    if (wasRefunded) {
        updateData.paymentStatus = 'REFUNDED';
    }

    await prisma.$transaction(async (tx) => {
        if (
            normalizedStatus === 'CANCELLED' &&
            existingOrder.status?.code !== 'CANCELLED'
        ) {
            await restoreOrderStock(tx, orderId);
            updateData.cancelReason = 'Cancelled by admin';
        }

        await tx.order.update({
            where: {
                id: orderId,
            },

            data: updateData,
        });
    });

    const updatedOrder =
        await prisma.order.findUnique({
            where: {
                id: orderId,
            },

            include: {
                status: true,
                paymentMode: true,
                currency: true,
            },
        });

    const tracking =
        await prisma.shipmentTracking
            .findUnique({
                where: {
                    orderId,
                },
            })
            .catch(() => null);

    setImmediate(() => {
        notificationService
            .sendOrderStatusEmail(
                updatedOrder,
                tracking
            )
            .catch(console.error);
    });

    return updatedOrder;
};

const formatPublicOrderNumber = require('../../utils/order-number').formatPublicOrderNumber;

const resolveOrderForTracking = async (orderRef) => {
    const raw = String(orderRef || '').trim().replace(/^#/, '');
    const compact = raw.replace(/-/g, '').trim();
    if (!compact) {
        const err = new Error('Order ID is required');
        err.statusCode = 400;
        throw err;
    }

    const orderInclude = {
        items: {
            include: {
                variant: {
                    include: {
                        product: {
                            include: {
                                images: { where: { isPrimary: true } },
                            },
                        },
                    },
                },
            },
        },
        address: true,
        payment: true,
        coupon: true,
        status: true,
        paymentMode: true,
        currency: true,
        tracking: true,
    };

    if (raw.includes('-') || compact.length >= 32) {
        const exact = await prisma.order.findFirst({
            where: { id: raw },
            include: orderInclude,
        });
        if (exact) return exact;
    }

    const prefix = formatPublicOrderNumber(compact).toLowerCase();
    const candidates = await prisma.order.findMany({
        where: { id: { startsWith: prefix } },
        include: orderInclude,
        orderBy: { createdAt: 'desc' },
        take: 25,
    });

    const matches = candidates.filter(
        (order) => formatPublicOrderNumber(order.id) === prefix.toUpperCase(),
    );

    if (matches.length === 0) {
        const err = new Error('Order not found');
        err.statusCode = 404;
        throw err;
    }

    // Prefer newest if rare short-ID collision
    return matches[0];
};

const maskPhone = (phone) => {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length < 4) return '****';
    return `***${digits.slice(-4)}`;
};

const sanitizePublicOrder = (order) => {
    const sanitized = {
        id: order.id,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        subtotal: order.subtotal,
        discount: order.discount,
        shippingCharge: order.shippingCharge,
        total: order.total,
        paymentStatus: order.paymentStatus,
        status: order.status,
        paymentMode: order.paymentMode
            ? {
                code: order.paymentMode.code,
                label: order.paymentMode.label,
                isOnline: order.paymentMode.isOnline,
            }
            : null,
        coupon: order.coupon
            ? { code: order.coupon.code, type: order.coupon.type, value: order.coupon.value }
            : null,
        currency: order.currency,
        tracking: order.tracking,
        items: order.items,
        address: order.address
            ? {
                city: order.address.city,
                state: order.address.state,
                pincode: order.address.pincode,
                phone: maskPhone(order.address.phone),
            }
            : null,
        payment: order.payment
            ? {
                status: order.payment.status,
                updatedAt: order.payment.updatedAt,
            }
            : null,
    };

    return sanitized;
};

const trackOrderPublic = async (orderRef) => {
    const order = await resolveOrderForTracking(orderRef);
    return sanitizePublicOrder(order);
};

const cancelOrderPublic = async (orderRef, reason, email) => {
    const order = await resolveOrderForTracking(orderRef);
    const owner = await prisma.user.findUnique({
        where: { id: order.userId },
        select: { email: true },
    });

    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !owner?.email || owner.email.toLowerCase() !== normalizedEmail) {
        const err = new Error('Email does not match this order');
        err.statusCode = 403;
        throw err;
    }

    return cancelOrder(order.id, order.userId, reason);
};

module.exports = {
    placeOrder,
    getUserOrders,
    getOrderById,
    cancelOrder,
    formatPublicOrderNumber,
    trackOrderPublic,
    cancelOrderPublic,
    trackOrderByEmail: trackOrderPublic,
    cancelOrderByEmail: cancelOrderPublic,
    getAllOrders,
    updateOrderStatus,
};