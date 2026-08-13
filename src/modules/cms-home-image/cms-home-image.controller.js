const cmsHomeImageService = require('./cms-home-image.service');
const { success, error } = require('../../utils/response');

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

const create = async (req, res, next) => {
    try {
        const { section, title } = req.body;
        if (!section || !title) {
            return error(res, 'section and title are required', 400);
        }
        const homeImage = await cmsHomeImageService.createHomeImage(req.body);
        return success(res, homeImage, 'Home image created', 201);
    } catch (err) {
        next(err);
    }
};

const remove = async (req, res, next) => {
    try {
        await cmsHomeImageService.deleteHomeImage(req.params.id);
        return success(res, null, 'Home image deleted');
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getAll,
    getById,
    update,
    create,
    remove,
};
