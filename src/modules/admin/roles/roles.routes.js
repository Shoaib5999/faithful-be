const express = require('express');
const router = express.Router();
const rolesController = require('./roles.controller');
const { authenticate } = require('../../../middlewares/auth.middleware');
const { authorize } = require('../../../middlewares/role.middleware');

router.use(authenticate, authorize('ADMIN'));

router.get('/permissions', rolesController.getPermissions);
router.get('/', rolesController.getAll);
router.get('/:id', rolesController.getById);
router.post('/', rolesController.create);
router.put('/:id', rolesController.update);
router.delete('/:id', rolesController.remove);

module.exports = router;