const express = require('express');
const router = express.Router();
const wishlistController = require('./wishlist.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

router.use(authenticate);

router.get('/ids', wishlistController.getIds);
router.get('/', wishlistController.getAll);
router.post('/toggle', wishlistController.toggle);
router.get('/check/:productId', wishlistController.checkProduct);
router.delete('/', wishlistController.clear);

module.exports = router;