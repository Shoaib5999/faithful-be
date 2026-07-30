const express = require('express');
const router = express.Router();
const searchController = require('./search.controller');
const { cachePublic } = require('../../middlewares/cache.middleware');

const publicCache = cachePublic(300);

// All public routes
router.get('/', searchController.search);
router.get('/filters', publicCache, searchController.filterOptions);
router.get('/suggestions', searchController.suggestions);

module.exports = router;