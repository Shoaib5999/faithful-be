const express = require('express');
const router = express.Router();
const cmsSliderController = require('./cms-slider.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

router.get('/', authenticate, authorize('ADMIN', 'MANAGER'), cmsSliderController.getAll);
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER'), cmsSliderController.getById);
router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), cmsSliderController.create);
router.put('/reorder', authenticate, authorize('ADMIN', 'MANAGER'), cmsSliderController.reorder);
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), cmsSliderController.update);
router.delete('/:id', authenticate, authorize('ADMIN'), cmsSliderController.remove);

module.exports = router;
