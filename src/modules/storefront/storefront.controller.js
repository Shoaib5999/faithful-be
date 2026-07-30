const uploadService = require('../upload/upload.service');
const cmsSliderService = require('../cms-slider/cms-slider.service');
const cmsHomeImageService = require('../cms-home-image/cms-home-image.service');
const { success } = require('../../utils/response');
const r2Service = require('../../services/r2.service');

const getHeroBanners = async (req, res, next) => {
    try {
        if (!r2Service.isConfigured()) {
            return success(res, { slides: [] }, 'Hero banners unavailable');
        }

        const all = [];
        let cursor;

        do {
            const page = await uploadService.getFolderAssets('banners', {
                maxResults: 100,
                continuationToken: cursor,
            });
            all.push(...(page.resources ?? []));
            cursor = page.nextCursor;
        } while (cursor);

        all.sort((a, b) => {
            const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return ta - tb;
        });

        const slides = all.map((asset) => ({
            imageUrl: asset.url,
            linkUrl: '/collection',
            alt: 'Faithful Meat featured banner',
            storageKey: asset.publicId,
        }));

        return success(res, { slides }, 'Hero banners fetched');
    } catch (err) {
        next(err);
    }
};

const getSliders = async (req, res, next) => {
    try {
        const sliders = await cmsSliderService.getPublicSliders();
        return success(res, { sliders }, 'Storefront sliders fetched');
    } catch (err) {
        next(err);
    }
};

const getHomeImages = async (req, res, next) => {
    try {
        const homeImages = await cmsHomeImageService.getPublicHomeImages();
        return success(res, { homeImages }, 'Storefront home images fetched');
    } catch (err) {
        next(err);
    }
};

module.exports = { getHeroBanners, getSliders, getHomeImages };
