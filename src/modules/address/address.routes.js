const express = require('express');
const router = express.Router();
const addressController = require('./address.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

router.use(authenticate);

router.get('/', addressController.getAll);
router.post('/', addressController.add);
router.put('/:id', addressController.update);
router.delete('/:id', addressController.remove);
router.patch('/:id/default', addressController.setDefault);

module.exports = router;