const express = require('express');
const router = express.Router();
const customersController = require('./customers.controller');
const { authenticate } = require('../../../middlewares/auth.middleware');
const { authorize } = require('../../../middlewares/role.middleware');

router.use(authenticate);

router.get('/', authorize('ADMIN', 'MANAGER', 'STAFF'), customersController.getAll);
router.patch('/:id/status', authorize('ADMIN', 'MANAGER'), customersController.updateStatus);

module.exports = router;
