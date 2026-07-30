const prisma = require('../config/db');

const normalizeSKU = (sku) => String(sku ?? '').trim().toUpperCase();

const ensureUniqueVariantSKUs = async (variants, { excludeVariantId } = {}) => {
    const skus = variants
        .map((v) => normalizeSKU(typeof v === 'string' ? v : v.sku))
        .filter(Boolean);

    if (!skus.length) {
        const err = new Error('Each variant must have a SKU');
        err.statusCode = 400;
        throw err;
    }

    const dupInPayload = skus.filter((sku, index) => skus.indexOf(sku) !== index);
    if (dupInPayload.length) {
        const err = new Error(
            `Duplicate SKU in this product: ${[...new Set(dupInPayload)].join(', ')}`,
        );
        err.statusCode = 400;
        throw err;
    }

    const existing = await prisma.productVariant.findMany({
        where: {
            sku: { in: skus },
            ...(excludeVariantId ? { id: { not: excludeVariantId } } : {}),
        },
        select: { sku: true },
    });

    if (existing.length) {
        const err = new Error(
            `SKU already in use: ${existing.map((row) => row.sku).join(', ')}`,
        );
        err.statusCode = 409;
        throw err;
    }

    return skus;
};

module.exports = { normalizeSKU, ensureUniqueVariantSKUs };
