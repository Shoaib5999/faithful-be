const { body, param, query, validationResult } = require('express-validator');
const { error } = require('../utils/response');

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return error(res, 'Validation failed', 422, errors.array());
    }
    next();
};

// Auth validators
const registerValidator = [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    validate,
];

const loginValidator = [
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
    validate,
];

const requestPhoneOtpValidator = [
    body('phone').matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10-digit mobile number'),
    validate,
];

const verifyPhoneOtpValidator = [
    body('phone').matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10-digit mobile number'),
    body('otp').matches(/^\d{4,9}$/).withMessage('Enter the code sent to your phone'),
    validate,
];

// Product validators
const createProductValidator = [
    body('name').trim().notEmpty().withMessage('Product name is required'),
    body('categoryId').notEmpty().withMessage('Category ID is required'),
    body('variants').isArray({ min: 1 }).withMessage('At least one variant is required'),
    body('variants.*.weightGrams').isInt({ min: 1 }).withMessage('Variant weightGrams must be positive integer'),
    body('variants.*.price').isFloat({ min: 0 }).withMessage('Variant price must be positive number'),
    body('variants.*.sku').notEmpty().withMessage('SKU is required for each variant'),
    validate,
];

// Order validators
const placeOrderValidator = [
    body('addressId').notEmpty().withMessage('Address ID is required'),
    body('paymentMethod').isIn(['COD', 'RAZORPAY', 'UPI']).withMessage('Invalid payment method'),
    validate,
];

// Review validators
const reviewValidator = [
    body('productId').notEmpty().withMessage('Product ID is required'),
    body('orderId').notEmpty().withMessage('Order ID is required'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    validate,
];

// Coupon validators
const createCouponValidator = [
    body('code').trim().notEmpty().toUpperCase().withMessage('Coupon code is required'),
    body('type').isIn(['flat', 'percent']).withMessage('Type must be flat or percent'),
    body('value').isFloat({ min: 0 }).withMessage('Value must be positive number'),
    validate,
];

module.exports = {
    validate,
    registerValidator,
    loginValidator,
    requestPhoneOtpValidator,
    verifyPhoneOtpValidator,
    createProductValidator,
    placeOrderValidator,
    reviewValidator,
    createCouponValidator,
};