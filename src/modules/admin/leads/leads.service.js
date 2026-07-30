const prisma = require('../../../config/db');
const { SUBJECT_LABELS } = require('../../contact/contact.service');

const VALID_STATUSES = ['new', 'read', 'archived'];

const formatLead = (lead) => ({
    id: lead.id,
    name: lead.name,
    email: lead.email,
    subject: lead.subject,
    subjectLabel: SUBJECT_LABELS[lead.subject] ?? lead.subject,
    message: lead.message,
    status: lead.status,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
});

const getAllLeads = async ({ page = 1, limit = 50, status, subject, search }) => {
    const skip = (page - 1) * limit;
    const where = {};

    if (status && status !== 'all' && VALID_STATUSES.includes(status)) {
        where.status = status;
    }

    if (subject && subject !== 'all') {
        where.subject = subject;
    }

    if (search) {
        const term = String(search).trim();
        if (term) {
            where.OR = [
                { name: { contains: term } },
                { email: { contains: term } },
                { message: { contains: term } },
            ];
        }
    }

    const [leads, total, statusCounts] = await Promise.all([
        prisma.contactLead.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: Number(limit),
        }),
        prisma.contactLead.count({ where }),
        prisma.contactLead.groupBy({
            by: ['status'],
            _count: { _all: true },
        }),
    ]);

    const counts = { new: 0, read: 0, archived: 0 };
    statusCounts.forEach((row) => {
        if (counts[row.status] !== undefined) {
            counts[row.status] = row._count._all;
        }
    });

    return {
        leads: leads.map(formatLead),
        total,
        page: Number(page),
        totalPages: Math.max(1, Math.ceil(total / limit)),
        statusCounts: counts,
    };
};

const getLeadById = async (id) => {
    const lead = await prisma.contactLead.findUnique({ where: { id } });
    if (!lead) {
        const err = new Error('Lead not found');
        err.statusCode = 404;
        throw err;
    }
    return formatLead(lead);
};

const updateLeadStatus = async (id, status) => {
    if (!VALID_STATUSES.includes(status)) {
        const err = new Error(`Invalid status. Allowed: ${VALID_STATUSES.join(', ')}`);
        err.statusCode = 400;
        throw err;
    }

    const existing = await prisma.contactLead.findUnique({ where: { id } });
    if (!existing) {
        const err = new Error('Lead not found');
        err.statusCode = 404;
        throw err;
    }

    const lead = await prisma.contactLead.update({
        where: { id },
        data: { status },
    });

    return formatLead(lead);
};

const deleteLead = async (id) => {
    const existing = await prisma.contactLead.findUnique({ where: { id } });
    if (!existing) {
        const err = new Error('Lead not found');
        err.statusCode = 404;
        throw err;
    }

    await prisma.contactLead.delete({ where: { id } });
};

module.exports = {
    getAllLeads,
    getLeadById,
    updateLeadStatus,
    deleteLead,
    VALID_STATUSES,
};
