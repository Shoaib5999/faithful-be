const express = require('express');
const router = express.Router();
const uploadController = require('./upload.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');
const {
    uploadBanner,
    uploadBanners,
    uploadLogo,
    uploadCutType,
    uploadCategory,
    uploadSlider,
    uploadProduct,
    uploadGeneral,
    uploadGeneralMultiple,
} = require('../../config/storage');

router.use(authenticate, authorize('ADMIN', 'MANAGER'));

router.post('/banner', ...uploadBanner, uploadController.uploadSingle);
router.post('/banners', ...uploadBanners, uploadController.uploadMultiple);
router.post('/logo', ...uploadLogo, uploadController.uploadSingle);
router.post('/cut-type', ...uploadCutType, uploadController.uploadSingle);
router.post('/category', ...uploadCategory, uploadController.uploadSingle);
router.post('/slider', ...uploadSlider, uploadController.uploadSingle);
router.post('/product', ...uploadProduct, uploadController.uploadMultiple);
router.post('/media', ...uploadGeneral, uploadController.uploadSingle);
router.post('/media/multiple', ...uploadGeneralMultiple, uploadController.uploadMultiple);

router.delete('/asset', uploadController.deleteAsset);
router.delete('/assets', uploadController.deleteMultiple);
router.get('/assets', uploadController.listAssets);

module.exports = router;
