const cmsHomeImageService = require('./cms-home-image.service');
const { success } = require('../../utils/response');

const getAll = async (req, res, next) => {
    try {
        const homeImages = await cmsHomeImageService.getAllHomeImages();
        return success(res, { homeImages }, 'Home images fetched');
    } catch (err) {
        next(err);
    }
};

const getById = async (req, res, next) => {
    try {
        const homeImage = await cmsHomeImageService.getHomeImageById(req.params.id);
        return success(res, homeImage, 'Home image fetched');
    } catch (err) {
        next(err);
    }
};

const update = async (req, res, next) => {
    try {
        const homeImage = await cmsHomeImageService.updateHomeImage(req.params.id, req.body);
        return success(res, homeImage, 'Home image updated');
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getAll,
    getById,
    update,
};
