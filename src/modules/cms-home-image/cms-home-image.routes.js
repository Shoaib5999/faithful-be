const express = require('express');
const router = express.Router();
const cmsHomeImageController = require('./cms-home-image.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

router.get('/', authenticate, authorize('ADMIN', 'MANAGER'), cmsHomeImageController.getAll);
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER'), cmsHomeImageController.getById);
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), cmsHomeImageController.update);

module.exports = router;
