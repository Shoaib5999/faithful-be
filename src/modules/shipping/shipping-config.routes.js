const express = require('express');
const router = express.Router();
const c = require('./shipping-config.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

const adminOnly = [authenticate, authorize('ADMIN')];
const adminOrManager = [authenticate, authorize('ADMIN', 'MANAGER')];

router.get('/settings', c.getSettings);
router.get('/methods', c.getMethods);

router.put('/settings', ...adminOrManager, c.updateSettings);
router.post('/methods', ...adminOrManager, c.createMethod);
router.put('/methods/:id', ...adminOrManager, c.updateMethod);
router.delete('/methods/:id', ...adminOnly, c.deleteMethod);

module.exports = router;
