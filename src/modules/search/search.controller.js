const searchService = require('./search.service');
const { success } = require('../../utils/response');

const search = async (req, res, next) => {
    try {
        const result = await searchService.searchProducts(req.query);
        return success(res, result, 'Search results fetched');
    } catch (err) {
        next(err);
    }
};

const filterOptions = async (req, res, next) => {
    try {
        const { category } = req.query;
        const result = await searchService.getFilterOptions(category);
        return success(res, result, 'Filter options fetched');
    } catch (err) {
        next(err);
    }
};

const suggestions = async (req, res, next) => {
    try {
        const { q, limit } = req.query;
        const result = await searchService.getSuggestions(q, limit);
        return success(res, result, 'Suggestions fetched');
    } catch (err) {
        next(err);
    }
};

module.exports = { search, filterOptions, suggestions };