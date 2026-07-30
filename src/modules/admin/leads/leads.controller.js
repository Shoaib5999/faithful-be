const leadsService = require('./leads.service');
const { success, error } = require('../../../utils/response');

const getAll = async (req, res, next) => {
    try {
        const result = await leadsService.getAllLeads(req.query);
        return success(res, result, 'Leads fetched');
    } catch (err) {
        next(err);
    }
};

const getById = async (req, res, next) => {
    try {
        const lead = await leadsService.getLeadById(req.params.id);
        return success(res, lead, 'Lead fetched');
    } catch (err) {
        next(err);
    }
};

const updateStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        if (!status || typeof status !== 'string') {
            return error(res, 'status is required', 400);
        }
        const lead = await leadsService.updateLeadStatus(req.params.id, status);
        return success(res, lead, 'Lead status updated');
    } catch (err) {
        next(err);
    }
};

const remove = async (req, res, next) => {
    try {
        await leadsService.deleteLead(req.params.id);
        return success(res, null, 'Lead deleted');
    } catch (err) {
        next(err);
    }
};

module.exports = { getAll, getById, updateStatus, remove };
