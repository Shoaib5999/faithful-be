const express = require('express');
const router = express.Router();
const c = require('./cut-type.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

const adminOrManager = [authenticate, authorize('ADMIN', 'MANAGER')];
const adminOnly = [authenticate, authorize('ADMIN')];

router.get('/public', c.getPublic);
router.get('/', ...adminOrManager, c.getAll);
router.get('/:id', ...adminOrManager, c.getById);
router.post('/', ...adminOrManager, c.create);
router.put('/reorder', ...adminOrManager, c.reorder);
router.put('/:id', ...adminOrManager, c.update);
router.delete('/:id', ...adminOnly, c.remove);

module.exports = router;
