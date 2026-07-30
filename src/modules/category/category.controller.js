const categoryService = require('./category.service');
const { success, error } = require('../../utils/response');

const create = async (req, res, next) => {
    try {
        const category = await categoryService.createCategory(req.body);
        return success(res, category, 'Category created', 201);
    } catch (err) {
        next(err);
    }
};

const getAll = async (req, res, next) => {
    try {
        const categories = await categoryService.getAllCategories();
        return success(res, categories, 'Categories fetched');
    } catch (err) {
        next(err);
    }
};

const getById = async (req, res, next) => {
    try {
        const category = await categoryService.getCategoryById(req.params.id);
        return success(res, category, 'Category fetched');
    } catch (err) {
        next(err);
    }
};

const update = async (req, res, next) => {
    try {
        const category = await categoryService.updateCategory(req.params.id, req.body);
        return success(res, category, 'Category updated');
    } catch (err) {
        next(err);
    }
};

const remove = async (req, res, next) => {
    try {
        await categoryService.deleteCategory(req.params.id);
        return success(res, null, 'Category deleted');
    } catch (err) {
        next(err);
    }
};

module.exports = { create, getAll, getById, update, remove };