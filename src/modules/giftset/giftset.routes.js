const express = require('express');
const router = express.Router();
const giftsetController = require('./giftset.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

// Public
router.get('/', giftsetController.getGiftSets);
router.get('/:productId/items', giftsetController.getBundleItems);

// Admin
router.post('/:productId/items', authenticate, authorize('ADMIN', 'MANAGER'), giftsetController.addBundleItem);
router.put('/:productId/items/:itemId', authenticate, authorize('ADMIN', 'MANAGER'), giftsetController.updateBundleItem);
router.delete('/:productId/items/:itemId', authenticate, authorize('ADMIN', 'MANAGER'), giftsetController.removeBundleItem);

module.exports = router;