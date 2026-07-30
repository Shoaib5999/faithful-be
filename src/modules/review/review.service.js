const prisma = require('../../config/db');

const getDeliveredStatusId = async () => {
    const status = await prisma.orderStatus.findUnique({ where: { code: 'DELIVERED' } });
    return status?.id ?? null;
};

const getReviewEligibility = async (userId, productId) => {
    const existing = await prisma.review.findUnique({
        where: { productId_userId: { productId, userId } },
    });

    if (existing) {
        return {
            canReview: false,
            alreadyReviewed: true,
            reason: 'You have already reviewed this product',
            eligibleOrders: [],
        };
    }

    const deliveredStatusId = await getDeliveredStatusId();
    if (!deliveredStatusId) {
        return {
            canReview: false,
            alreadyReviewed: false,
            reason: 'Reviews are not available yet',
            eligibleOrders: [],
        };
    }

    const orderItems = await prisma.orderItem.findMany({
        where: {
            variant: { productId },
            order: {
                userId,
                statusId: deliveredStatusId,
            },
        },
        include: {
            order: { select: { id: true, createdAt: true } },
        },
        orderBy: { order: { createdAt: 'desc' } },
    });

    const seen = new Set();
    const eligibleOrders = [];
    for (const item of orderItems) {
        if (seen.has(item.orderId)) continue;
        seen.add(item.orderId);
        eligibleOrders.push({
            orderId: item.orderId,
            orderedAt: item.order.createdAt,
        });
    }

    if (!eligibleOrders.length) {
        return {
            canReview: false,
            alreadyReviewed: false,
            reason: 'You can review this product after your order is delivered',
            eligibleOrders: [],
        };
    }

    return {
        canReview: true,
        alreadyReviewed: false,
        reason: null,
        eligibleOrders,
    };
};

const submitReview = async (userId, { productId, orderId, rating, title, comment }) => {
    const eligibility = await getReviewEligibility(userId, productId);
    if (eligibility.alreadyReviewed) {
        const err = new Error('You have already reviewed this product');
        err.statusCode = 409;
        throw err;
    }

    let resolvedOrderId = orderId;
    if (!resolvedOrderId) {
        if (eligibility.eligibleOrders.length === 1) {
            resolvedOrderId = eligibility.eligibleOrders[0].orderId;
        } else {
            const err = new Error('orderId is required when you have multiple delivered orders for this product');
            err.statusCode = 400;
            throw err;
        }
    }

    const deliveredStatusId = await getDeliveredStatusId();
    const orderItem = await prisma.orderItem.findFirst({
        where: {
            orderId: resolvedOrderId,
            order: {
                userId,
                statusId: deliveredStatusId,
            },
            variant: { productId },
        },
    });

    if (!orderItem) {
        const err = new Error('You can only review products from your delivered orders');
        err.statusCode = 403;
        throw err;
    }

    if (rating < 1 || rating > 5) {
        const err = new Error('Rating must be between 1 and 5');
        err.statusCode = 400;
        throw err;
    }

    return await prisma.review.create({
        data: {
            productId,
            userId,
            orderId: resolvedOrderId,
            rating,
            title: title?.trim() || null,
            comment: comment?.trim(),
            status: 'PENDING',
        },
    });
};

const getProductReviews = async (productId, { page = 1, limit = 10 }) => {
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
        prisma.review.findMany({
            where: { productId, status: 'APPROVED' },
            include: { user: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
            skip,
            take: Number(limit),
        }),
        prisma.review.count({ where: { productId, status: 'APPROVED' } }),
    ]);

    const ratingStats = await prisma.review.groupBy({
        by: ['rating'],
        where: { productId, status: 'APPROVED' },
        _count: { rating: true },
    });

    const totalReviews = ratingStats.reduce((sum, r) => sum + r._count.rating, 0);
    const avgRating =
        totalReviews > 0
            ? ratingStats.reduce((sum, r) => sum + r.rating * r._count.rating, 0) / totalReviews
            : 0;

    return {
        reviews,
        total,
        page: Number(page),
        totalPages: Math.ceil(total / limit),
        stats: { avgRating: Number(avgRating.toFixed(1)), totalReviews, breakdown: ratingStats },
    };
};

// Admin functions
const getPendingReviews = async ({ page = 1, limit = 20 }) => {
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
        prisma.review.findMany({
            where: { status: 'PENDING' },
            include: {
                user: { select: { id: true, name: true, email: true } },
                product: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'asc' },
            skip,
            take: Number(limit),
        }),
        prisma.review.count({ where: { status: 'PENDING' } }),
    ]);

    return { reviews, total, page: Number(page), totalPages: Math.ceil(total / limit) };
};

const getAllReviews = async ({ page = 1, limit = 20, status, productId }) => {
    const skip = (page - 1) * limit;
    const where = {};
    if (status) where.status = status;
    if (productId) where.productId = productId;

    const [reviews, total] = await Promise.all([
        prisma.review.findMany({
            where,
            include: {
                user: { select: { id: true, name: true, email: true } },
                product: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: Number(limit),
        }),
        prisma.review.count({ where }),
    ]);

    return { reviews, total, page: Number(page), totalPages: Math.ceil(total / limit) };
};

const moderateReview = async (reviewId, { action, rejectedReason }) => {
    const validActions = ['APPROVED', 'REJECTED'];
    if (!validActions.includes(action)) {
        const err = new Error('action must be APPROVED or REJECTED');
        err.statusCode = 400;
        throw err;
    }

    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
        const err = new Error('Review not found');
        err.statusCode = 404;
        throw err;
    }

    return await prisma.review.update({
        where: { id: reviewId },
        data: {
            status: action,
            rejectedReason: action === 'REJECTED' ? (rejectedReason || 'Does not meet guidelines') : null,
        },
    });
};

const deleteReview = async (reviewId) => {
    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
        const err = new Error('Review not found');
        err.statusCode = 404;
        throw err;
    }
    await prisma.review.delete({ where: { id: reviewId } });
};

module.exports = {
    submitReview,
    getReviewEligibility,
    getProductReviews,
    getPendingReviews,
    getAllReviews,
    moderateReview,
    deleteReview,
};
