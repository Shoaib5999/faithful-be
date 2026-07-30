const analyticsService = require('./analytics.service');
const { success } = require('../../../utils/response');

const overview = async (req, res, next) => {
    try {
        const data = await analyticsService.getOverview();
        return success(res, data, 'Overview fetched');
    } catch (err) {
        next(err);
    }
};

const revenueByDate = async (req, res, next) => {
    try {
        const data = await analyticsService.getRevenueByDate(req.query);
        return success(res, data, 'Revenue data fetched');
    } catch (err) {
        next(err);
    }
};

const topProducts = async (req, res, next) => {
    try {
        const data = await analyticsService.getTopProducts(req.query);
        return success(res, data, 'Top products fetched');
    } catch (err) {
        next(err);
    }
};

const orderBreakdown = async (req, res, next) => {
    try {
        const data = await analyticsService.getOrderStatusBreakdown();
        return success(res, data, 'Order breakdown fetched');
    } catch (err) {
        next(err);
    }
};

const lowStock = async (req, res, next) => {
    try {
        const data = await analyticsService.getLowStockProducts(req.query);
        return success(res, data, 'Low stock products fetched');
    } catch (err) {
        next(err);
    }
};

module.exports = { overview, revenueByDate, topProducts, orderBreakdown, lowStock };