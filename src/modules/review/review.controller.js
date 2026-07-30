const reviewService = require('./review.service');
const { success, error } = require('../../utils/response');

const submit = async (req, res, next) => {
    try {
        const { productId, rating, comment } = req.body;
        if (!productId || !rating || !comment?.trim()) {
            return error(res, 'productId, rating and comment are required', 400);
        }
        const review = await reviewService.submitReview(req.user.id, req.body);
        return success(res, review, 'Review submitted and pending approval', 201);
    } catch (err) {
        next(err);
    }
};

const getEligibility = async (req, res, next) => {
    try {
        const result = await reviewService.getReviewEligibility(req.user.id, req.params.productId);
        return success(res, result, 'Review eligibility fetched');
    } catch (err) {
        next(err);
    }
};

const getProductReviews = async (req, res, next) => {
    try {
        const result = await reviewService.getProductReviews(req.params.productId, req.query);
        return success(res, result, 'Reviews fetched');
    } catch (err) {
        next(err);
    }
};

// Admin
const getPending = async (req, res, next) => {
    try {
        const result = await reviewService.getPendingReviews(req.query);
        return success(res, result, 'Pending reviews fetched');
    } catch (err) {
        next(err);
    }
};

const getAll = async (req, res, next) => {
    try {
        const result = await reviewService.getAllReviews(req.query);
        return success(res, result, 'All reviews fetched');
    } catch (err) {
        next(err);
    }
};

const moderate = async (req, res, next) => {
    try {
        const { action, rejectedReason } = req.body;
        if (!action) return error(res, 'action is required (APPROVED or REJECTED)', 400);
        const review = await reviewService.moderateReview(req.params.id, { action, rejectedReason });
        return success(res, review, `Review ${action.toLowerCase()}`);
    } catch (err) {
        next(err);
    }
};

const remove = async (req, res, next) => {
    try {
        await reviewService.deleteReview(req.params.id);
        return success(res, null, 'Review deleted');
    } catch (err) {
        next(err);
    }
};

module.exports = { submit, getEligibility, getProductReviews, getPending, getAll, moderate, remove };