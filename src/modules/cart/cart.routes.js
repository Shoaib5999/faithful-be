const express = require('express');
const router = express.Router();
const cartController = require('./cart.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

router.post('/estimate', cartController.estimateCart);

router.use(authenticate);

router.get('/', cartController.getCart);
router.post('/items', cartController.addItem);
router.put('/items/:itemId', cartController.updateItem);
router.delete('/items/:itemId', cartController.removeItem);
router.delete('/', cartController.clearCart);

module.exports = router;