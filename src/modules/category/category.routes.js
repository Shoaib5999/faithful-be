const express = require('express');
const router = express.Router();
const categoryController = require('./category.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

// Public
router.get('/', categoryController.getAll);
router.get('/:id', categoryController.getById);

// Admin only
router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), categoryController.create);
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), categoryController.update);
router.delete('/:id', authenticate, authorize('ADMIN'), categoryController.remove);

module.exports = router;