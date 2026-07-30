const express = require('express');
const router = express.Router();
const staffController = require('./staff.controller');
const { authenticate } = require('../../../middlewares/auth.middleware');
const { authorize } = require('../../../middlewares/role.middleware');

router.use(authenticate, authorize('ADMIN'));

router.get('/', staffController.getAll);
router.get('/:id', staffController.getById);
router.post('/', staffController.invite);
router.patch('/:id/role', staffController.updateRole);
router.patch('/:id/activate', staffController.activate);
router.patch('/:id/deactivate', staffController.deactivate);

module.exports = router;