const couponService = require('./coupon.service');
const { success, error } = require('../../utils/response');

const create = async (req, res, next) => {
    try {
        const { code, type, value } = req.body;
        if (!code || !type || value === undefined) {
            return error(res, 'code, type and value are required', 400);
        }
        const coupon = await couponService.createCoupon(req.body);
        return success(res, coupon, 'Coupon created', 201);
    } catch (err) {
        next(err);
    }
};

const getAll = async (req, res, next) => {
    try {
        const result = await couponService.getAllCoupons(req.query);
        return success(res, result, 'Coupons fetched');
    } catch (err) {
        next(err);
    }
};

const getById = async (req, res, next) => {
    try {
        const coupon = await couponService.getCouponById(req.params.id);
        return success(res, coupon, 'Coupon fetched');
    } catch (err) {
        next(err);
    }
};

const update = async (req, res, next) => {
    try {
        const coupon = await couponService.updateCoupon(req.params.id, req.body);
        return success(res, coupon, 'Coupon updated');
    } catch (err) {
        next(err);
    }
};

const remove = async (req, res, next) => {
    try {
        await couponService.deleteCoupon(req.params.id);
        return success(res, null, 'Coupon deleted');
    } catch (err) {
        next(err);
    }
};

const getPublicActive = async (req, res, next) => {
    try {
        const coupons = await couponService.getPublicActiveCoupons();
        return success(res, { coupons }, 'Active coupons fetched');
    } catch (err) {
        next(err);
    }
};

const validate = async (req, res, next) => {
    try {
        const { code, orderTotal } = req.body;
        if (!code || orderTotal === undefined) {
            return error(res, 'code and orderTotal are required', 400);
        }
        const result = await couponService.validateCoupon(code, req.user.id, Number(orderTotal));
        return success(res, result, result.valid ? 'Coupon is valid' : 'Coupon is invalid');
    } catch (err) {
        next(err);
    }
};

module.exports = { create, getAll, getById, update, remove, getPublicActive, validate };