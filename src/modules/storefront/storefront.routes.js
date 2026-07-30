const express = require('express');
const router = express.Router();
const storefrontController = require('./storefront.controller');
const { cachePublic } = require('../../middlewares/cache.middleware');

const publicCache = cachePublic(300);

router.get('/hero-banners', publicCache, storefrontController.getHeroBanners);
router.get('/sliders', publicCache, storefrontController.getSliders);
router.get('/home-images', publicCache, storefrontController.getHomeImages);

module.exports = router;
