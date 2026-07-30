const express = require('express');
const router = express.Router();
const contactController = require('./contact.controller');

router.post('/', contactController.submit);

module.exports = router;
