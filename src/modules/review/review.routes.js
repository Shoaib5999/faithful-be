const express = require('express');
const router = express.Router();
const reviewController = require('./review.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

// Public
router.get('/product/:productId', reviewController.getProductReviews);

// Customer
router.get('/eligibility/:productId', authenticate, reviewController.getEligibility);
router.post('/', authenticate, reviewController.submit);

// Admin
router.get('/', authenticate, authorize('ADMIN', 'MANAGER'), reviewController.getAll);
router.get('/pending', authenticate, authorize('ADMIN', 'MANAGER'), reviewController.getPending);
router.patch('/:id/moderate', authenticate, authorize('ADMIN', 'MANAGER'), reviewController.moderate);
router.delete('/:id', authenticate, authorize('ADMIN'), reviewController.remove);

module.exports = router;