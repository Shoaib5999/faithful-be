const addressService = require('./address.service');
const { success, error } = require('../../utils/response');

const add = async (req, res, next) => {
    try {
        const { name, phone, line1, city, state, pincode } = req.body;
        if (!name || !phone || !line1 || !city || !state || !pincode) {
            return error(res, 'name, phone, line1, city, state and pincode are required', 400);
        }
        const address = await addressService.addAddress(req.user.id, req.body);
        return success(res, address, 'Address added', 201);
    } catch (err) {
        next(err);
    }
};

const getAll = async (req, res, next) => {
    try {
        const addresses = await addressService.getUserAddresses(req.user.id);
        return success(res, addresses, 'Addresses fetched');
    } catch (err) {
        next(err);
    }
};

const update = async (req, res, next) => {
    try {
        const address = await addressService.updateAddress(req.params.id, req.user.id, req.body);
        return success(res, address, 'Address updated');
    } catch (err) {
        next(err);
    }
};

const remove = async (req, res, next) => {
    try {
        await addressService.deleteAddress(req.params.id, req.user.id);
        return success(res, null, 'Address deleted');
    } catch (err) {
        next(err);
    }
};

const setDefault = async (req, res, next) => {
    try {
        const address = await addressService.setDefault(req.params.id, req.user.id);
        return success(res, address, 'Default address set');
    } catch (err) {
        next(err);
    }
};

module.exports = { add, getAll, update, remove, setDefault };