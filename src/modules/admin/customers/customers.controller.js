const customersService = require('./customers.service');
const { success, error } = require('../../../utils/response');

const getAll = async (req, res, next) => {
    try {
        const result = await customersService.getAllCustomers(req.query);
        return success(res, result, 'Customers fetched');
    } catch (err) {
        next(err);
    }
};

const updateStatus = async (req, res, next) => {
    try {
        const { isActive } = req.body;
        if (typeof isActive !== 'boolean') {
            return error(res, 'isActive (boolean) is required', 400);
        }
        const customer = await customersService.setCustomerStatus(req.params.id, isActive);
        return success(res, customer, isActive ? 'Customer activated' : 'Customer deactivated');
    } catch (err) {
        next(err);
    }
};

module.exports = { getAll, updateStatus };
