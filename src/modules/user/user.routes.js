const express = require('express');
const router = express.Router();
const userController = require('./user.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

router.get('/profile', authenticate, userController.getProfile);
router.put('/profile', authenticate, userController.updateProfile);

module.exports = router;