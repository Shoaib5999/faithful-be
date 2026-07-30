const express = require('express');
const router = express.Router();
const leadsController = require('./leads.controller');
const { authenticate } = require('../../../middlewares/auth.middleware');
const { authorize } = require('../../../middlewares/role.middleware');

router.use(authenticate);

router.get('/', authorize('ADMIN', 'MANAGER', 'STAFF'), leadsController.getAll);
router.get('/:id', authorize('ADMIN', 'MANAGER', 'STAFF'), leadsController.getById);
router.patch('/:id/status', authorize('ADMIN', 'MANAGER'), leadsController.updateStatus);
router.delete('/:id', authorize('ADMIN', 'MANAGER'), leadsController.remove);

module.exports = router;
