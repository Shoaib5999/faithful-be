const cmsSliderService = require('./cms-slider.service');
const { success } = require('../../utils/response');

const getAll = async (req, res, next) => {
    try {
        const sliders = await cmsSliderService.getAllSliders();
        return success(res, { sliders }, 'Sliders fetched');
    } catch (err) {
        next(err);
    }
};

const getById = async (req, res, next) => {
    try {
        const slider = await cmsSliderService.getSliderById(req.params.id);
        return success(res, slider, 'Slider fetched');
    } catch (err) {
        next(err);
    }
};

const create = async (req, res, next) => {
    try {
        const slider = await cmsSliderService.createSlider(req.body);
        return success(res, slider, 'Slider created', 201);
    } catch (err) {
        next(err);
    }
};

const update = async (req, res, next) => {
    try {
        const slider = await cmsSliderService.updateSlider(req.params.id, req.body);
        return success(res, slider, 'Slider updated');
    } catch (err) {
        next(err);
    }
};

const remove = async (req, res, next) => {
    try {
        await cmsSliderService.deleteSlider(req.params.id);
        return success(res, null, 'Slider deleted');
    } catch (err) {
        next(err);
    }
};

const reorder = async (req, res, next) => {
    try {
        const sliders = await cmsSliderService.reorderSliders(req.body.orderedIds);
        return success(res, { sliders }, 'Sliders reordered');
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getAll,
    getById,
    create,
    update,
    remove,
    reorder,
};
