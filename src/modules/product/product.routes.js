const express = require('express');
const router = express.Router();
const productController = require('./product.controller');
const { authenticate, optionalAuthenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');
const { uploadProducts } = require('../../config/storage');

// Public routes
router.get('/', optionalAuthenticate, productController.getAll);
router.get('/slug/:slug', productController.getBySlug);
router.get('/:id', productController.getById);

// Admin routes
router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), productController.create);
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), productController.update);
router.delete('/:id', authenticate, authorize('ADMIN'), productController.remove);

// Variant routes
router.post('/:id/variants', authenticate, authorize('ADMIN', 'MANAGER'), productController.addVariant);
router.put('/:id/variants/:variantId', authenticate, authorize('ADMIN', 'MANAGER'), productController.updateVariant);
router.delete('/:id/variants/:variantId', authenticate, authorize('ADMIN', 'MANAGER'), productController.deleteVariant);
router.patch('/:id/variants/:variantId/stock', authenticate, authorize('ADMIN', 'MANAGER', 'STAFF'), productController.updateStock);

// Image routes
router.post(
    '/:id/images',
    authenticate,
    authorize('ADMIN', 'MANAGER'),
    ...uploadProducts,
    productController.uploadImages,
);
router.post(
    '/:id/images/register',
    authenticate,
    authorize('ADMIN', 'MANAGER'),
    productController.registerImages,
);
router.delete('/:id/images/:imageId', authenticate, authorize('ADMIN', 'MANAGER'), productController.deleteImage);

module.exports = router;