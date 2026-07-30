const prisma = require('../../config/db');
const slugify = require('../../utils/slugify');

// ── BRAND ────────────────────────────────────────────────────────

const getAllBrands = async () => {
    return prisma.brand.findMany({ orderBy: { sortOrder: 'asc' } });
};

const createBrand = async ({ name, logoUrl, isFeatured, sortOrder, isActive }) => {
    const slug = slugify(name);
    const existing = await prisma.brand.findUnique({ where: { slug } });
    if (existing) {
        const err = new Error('Brand with this name already exists');
        err.statusCode = 409;
        throw err;
    }
    return prisma.brand.create({
        data: { name, slug, logoUrl: logoUrl || null, isFeatured: isFeatured || false, sortOrder: sortOrder || 0, isActive: isActive ?? true },
    });
};

const updateBrand = async (id, data) => {
    const brand = await prisma.brand.findUnique({ where: { id } });
    if (!brand) { const err = new Error('Brand not found'); err.statusCode = 404; throw err; }
    if (data.name) data.slug = slugify(data.name);
    return prisma.brand.update({ where: { id }, data });
};

const deleteBrand = async (id) => {
    const productCount = await prisma.product.count({ where: { brandId: id } });
    if (productCount > 0) {
        const err = new Error(`Cannot delete — ${productCount} products use this brand`);
        err.statusCode = 400;
        throw err;
    }
    await prisma.brand.delete({ where: { id } });
};

// ── UNIT ─────────────────────────────────────────────────────────

const getAllUnits = async () => {
    return prisma.unit.findMany({ orderBy: { sortOrder: 'asc' } });
};

const createUnit = async ({ name, symbol, type, isActive, sortOrder }) => {
    return prisma.unit.create({
        data: { name, symbol, type, isActive: isActive ?? true, sortOrder: sortOrder || 0 },
    });
};

const updateUnit = async (id, data) => {
    const unit = await prisma.unit.findUnique({ where: { id } });
    if (!unit) { const err = new Error('Unit not found'); err.statusCode = 404; throw err; }
    return prisma.unit.update({ where: { id }, data });
};

const deleteUnit = async (id) => {
    await prisma.unit.delete({ where: { id } });
};

// ── CATEGORY ─────────────────────────────────────────────────────

const getAllCategories = async () => {
    return prisma.category.findMany({
        include: {
            children: {
                where: {},
            },
        },
        orderBy: { sortOrder: 'asc' },
    });
};

const createCategory = async ({ name, parentId, sortOrder }) => {
    const slug = slugify(name);

    const existing = await prisma.category.findFirst({
        where: {
            slug,
            parentId: parentId || null,
        },
    });

    if (existing) {
        const err = new Error('Category already exists in this parent');
        err.statusCode = 409;
        throw err;
    }

    return prisma.category.create({
        data: {
            name,
            slug,
            sortOrder: sortOrder || 0,
            parent: parentId
                ? {
                    connect: { id: parentId },
                }
                : undefined,
        },
    });
};

const updateCategory = async (id, data) => {
    if (data.name) {
        data.slug = slugify(data.name);
    }

    const parentId = data.parentId;
    delete data.parentId;

    return prisma.category.update({
        where: { id },
        data: {
            ...data,
            parent: parentId
                ? {
                    connect: { id: parentId },
                }
                : {
                    disconnect: true,
                },
        },
    });
};

const deleteCategory = async (id) => {
    const productCount = await prisma.product.count({ where: { categoryId: id } });
    if (productCount > 0) {
        const err = new Error(`Cannot delete — ${productCount} products use this category`);
        err.statusCode = 400;
        throw err;
    }
    await prisma.category.delete({ where: { id } });
};

// ── ATTRIBUTE ────────────────────────────────────────────────────

const getAllAttributes = async () => {
    return prisma.attribute.findMany({
        where: { isActive: true },
        include: {
            values: {
                orderBy: { sortOrder: "asc" },
            },
        },
        orderBy: { name: "asc" },
    });
};

const createAttribute = async ({ name, code, type, isRequired, isFilterable, options = [] }) => {
    const existing = await prisma.attribute.findUnique({ where: { code } });
    if (existing) { const err = new Error('Attribute code already exists'); err.statusCode = 409; throw err; }
    return prisma.attribute.create({
        data: {
            name,
            code,
            type,
            isRequired: isRequired || false,
            isFilterable: isFilterable || false,
            values: {
                create: options.map(({ label, value, sortOrder }) => ({
                    label,
                    value,
                    sortOrder: sortOrder ?? 0,
                })),
            },
        },
        include: {
            values: { orderBy: { sortOrder: 'asc' } },
        },
    });
};

const updateAttribute = async (id, { name, code, type, isRequired, isFilterable, isActive, options }) => {
    if (options !== undefined) {
        await prisma.attributeValue.deleteMany({ where: { attributeId: id } });
    }
    return prisma.attribute.update({
        where: { id },
        data: {
            name,
            code,
            type,
            isRequired,
            isFilterable,
            isActive,
            ...(options !== undefined && {
                values: {
                    create: options.map(({ label, value, sortOrder }) => ({
                        label,
                        value,
                        sortOrder: sortOrder ?? 0,
                    })),
                },
            }),
        },
        include: {
            values: { orderBy: { sortOrder: 'asc' } },
        },
    });
};

const deleteAttribute = async (id) => {
    await prisma.attributeValue.deleteMany({ where: { attributeId: id } });
    await prisma.attribute.delete({ where: { id } });
};

const addAttributeValue = async (attributeId, { label, value, sortOrder }) => {
    const attribute = await prisma.attribute.findUnique({ where: { id: attributeId } });
    if (!attribute) { const err = new Error('Attribute not found'); err.statusCode = 404; throw err; }
    return prisma.attributeValue.create({
        data: { attributeId, label, value, sortOrder: sortOrder || 0 },
    });
};

const deleteAttributeValue = async (valueId) => {
    await prisma.attributeValue.delete({ where: { id: valueId } });
};

// ── ORDER STATUS ──────────────────────────────────────────────────

const getAllOrderStatuses = async () => {
    return prisma.orderStatus.findMany({ orderBy: { sortOrder: 'asc' } });
};

const createOrderStatus = async ({ label, code, color, isDefault, isFinal, sortOrder }) => {
    const existing = await prisma.orderStatus.findUnique({ where: { code: code.toUpperCase() } });
    if (existing) { const err = new Error('Status code already exists'); err.statusCode = 409; throw err; }

    if (isDefault) {
        await prisma.orderStatus.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }

    return prisma.orderStatus.create({
        data: { label, code: code.toUpperCase(), color, isDefault: isDefault || false, isFinal: isFinal || false, sortOrder: sortOrder || 0 },
    });
};

const updateOrderStatus = async (id, data) => {
    if (data.code) data.code = data.code.toUpperCase();
    if (data.isDefault) {
        await prisma.orderStatus.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return prisma.orderStatus.update({ where: { id }, data });
};

const deleteOrderStatus = async (id) => {
    const status = await prisma.orderStatus.findUnique({ where: { id } });
    if (status?.isDefault) {
        const err = new Error('Cannot delete the default order status');
        err.statusCode = 400;
        throw err;
    }
    const inUse = await prisma.order.count({ where: { statusId: id } });
    if (inUse > 0) {
        const err = new Error(`Cannot delete — ${inUse} orders use this status`);
        err.statusCode = 400;
        throw err;
    }
    await prisma.orderStatus.delete({ where: { id } });
};

// ── TAX CLASS ─────────────────────────────────────────────────────

const getAllTaxClasses = async () => {
    return prisma.taxClass.findMany({ orderBy: { rate: 'asc' } });
};

const createTaxClass = async ({ name, rate, isDefault }) => {
    if (isDefault) {
        await prisma.taxClass.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return prisma.taxClass.create({
        data: { name, rate, isDefault: isDefault || false },
    });
};

const updateTaxClass = async (id, data) => {
    if (data.isDefault) {
        await prisma.taxClass.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return prisma.taxClass.update({ where: { id }, data });
};

const deleteTaxClass = async (id) => {
    const inUse = await prisma.product.count({ where: { taxClassId: id } });
    if (inUse > 0) {
        const err = new Error(`Cannot delete — ${inUse} products use this tax class`);
        err.statusCode = 400;
        throw err;
    }
    await prisma.taxClass.delete({ where: { id } });
};

// ── PAYMENT MODE ──────────────────────────────────────────────────

const getActivePaymentModes = async () => {
    return prisma.paymentMode.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
};

/** Admin Settings — includes inactive so modes can be reactivated. */
const getAllPaymentModes = async () => {
    return prisma.paymentMode.findMany({ orderBy: { sortOrder: 'asc' } });
};

const createPaymentMode = async ({ label, code, isOnline, sortOrder, isActive }) => {
    const existing = await prisma.paymentMode.findUnique({ where: { code: code.toUpperCase() } });
    if (existing) { const err = new Error('Payment mode code already exists'); err.statusCode = 409; throw err; }
    return prisma.paymentMode.create({
        data: {
            label,
            code: code.toUpperCase(),
            isOnline: isOnline || false,
            sortOrder: sortOrder || 0,
            isActive: isActive !== undefined ? Boolean(isActive) : true,
        },
    });
};

const updatePaymentMode = async (id, data) => {
    if (data.code) data.code = data.code.toUpperCase();
    return prisma.paymentMode.update({ where: { id }, data });
};

const deletePaymentMode = async (id) => {
    const [orderCount, paymentCount] = await Promise.all([
        prisma.order.count({ where: { paymentModeId: id } }),
        prisma.payment.count({ where: { paymentModeId: id } }),
    ]);
    const inUse = orderCount + paymentCount;
    if (inUse > 0) {
        const parts = [];
        if (orderCount > 0) parts.push(`${orderCount} order(s)`);
        if (paymentCount > 0) parts.push(`${paymentCount} payment(s)`);
        const err = new Error(`Cannot delete — in use by ${parts.join(', ')}. Deactivate instead.`);
        err.statusCode = 400;
        throw err;
    }
    await prisma.paymentMode.delete({ where: { id } });
};

// ── CURRENCY ──────────────────────────────────────────────────────

const getAllCurrencies = async () => {
    return prisma.currency.findMany({ where: { isActive: true }, orderBy: { isDefault: 'desc' } });
};

const createCurrency = async ({ code, name, symbol, symbolPosition, decimalSeparator, thousandSeparator, exchangeRate, isDefault }) => {
    const existing = await prisma.currency.findUnique({ where: { code: code.toUpperCase() } });
    if (existing) { const err = new Error('Currency code already exists'); err.statusCode = 409; throw err; }
    if (isDefault) {
        await prisma.currency.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return prisma.currency.create({
        data: { code: code.toUpperCase(), name, symbol, symbolPosition: symbolPosition || 'before', decimalSeparator: decimalSeparator || '.', thousandSeparator: thousandSeparator || ',', exchangeRate: exchangeRate || 1, isDefault: isDefault || false },
    });
};

const updateCurrency = async (id, data) => {
    if (data.isDefault) {
        await prisma.currency.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return prisma.currency.update({ where: { id }, data });
};

const deleteCurrency = async (id) => {
    const currency = await prisma.currency.findUnique({ where: { id } });
    if (currency?.isDefault) {
        const err = new Error('Cannot delete the default currency');
        err.statusCode = 400;
        throw err;
    }
    await prisma.currency.delete({ where: { id } });
};

// ─── HELPER — used by order/payment services ──────────────────────

const MASTER_LOOKUP_TTL_MS = 5 * 60 * 1000;
const masterLookupCache = new Map();

const getCachedMasterLookup = async (key, loader) => {
    const cached = masterLookupCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }

    const value = await loader();
    masterLookupCache.set(key, {
        value,
        expiresAt: Date.now() + MASTER_LOOKUP_TTL_MS,
    });
    return value;
};

const getDefaultOrderStatusId = async () => {
    return getCachedMasterLookup('default-order-status', async () => {
        const status = await prisma.orderStatus.findFirst({ where: { isDefault: true } });
        if (!status) throw new Error('No default order status configured. Run seed-master.js first.');
        return status.id;
    });
};

const getOrderStatusIdByCode = async (code) => {
    const normalized = code.toUpperCase();
    return getCachedMasterLookup(`order-status:${normalized}`, async () => {
        const status = await prisma.orderStatus.findUnique({ where: { code: normalized } });
        if (!status) throw new Error(`Order status not found: ${code}`);
        return status.id;
    });
};

const getPaymentModeIdByCode = async (code) => {
    const normalized = code.toUpperCase();
    return getCachedMasterLookup(`payment-mode:${normalized}`, async () => {
        const mode = await prisma.paymentMode.findUnique({ where: { code: normalized } });
        if (!mode) throw new Error(`Payment mode not found: ${code}`);
        return mode.id;
    });
};

const getDefaultCurrencyId = async () => {
    return getCachedMasterLookup('default-currency', async () => {
        const currency = await prisma.currency.findFirst({ where: { isDefault: true } });
        if (!currency) throw new Error('No default currency configured. Run seed-master.js first.');
        return currency.id;
    });
};

module.exports = {
    // Brand
    getAllBrands, createBrand, updateBrand, deleteBrand,
    // Unit
    getAllUnits, createUnit, updateUnit, deleteUnit,
    // Category
    getAllCategories, createCategory, updateCategory, deleteCategory,
    // Attribute
    getAllAttributes, createAttribute, updateAttribute, deleteAttribute,
    addAttributeValue, deleteAttributeValue,
    // Order Status
    getAllOrderStatuses, createOrderStatus, updateOrderStatus, deleteOrderStatus,
    // Tax Class
    getAllTaxClasses, createTaxClass, updateTaxClass, deleteTaxClass,
    // Payment Mode
    getActivePaymentModes, getAllPaymentModes, createPaymentMode, updatePaymentMode, deletePaymentMode,
    // Currency
    getAllCurrencies, createCurrency, updateCurrency, deleteCurrency,
    // Helpers
    getDefaultOrderStatusId, getOrderStatusIdByCode,
    getPaymentModeIdByCode, getDefaultCurrencyId,
};