const productService = require('./product.service');
const r2Service = require('../../services/r2.service');
const { success, error } = require('../../utils/response');

const create = async (req, res, next) => {
    try {
        const { name, categoryId, variants } = req.body;
        if (!name || !categoryId || !variants || !variants.length) {
            return error(res, 'name, categoryId and at least one variant are required', 400);
        }

        const product = await productService.createProduct(req.body);

        return success(res, product, 'Product created', 201);
    } catch (err) {
        next(err);
    }
};

const { requireAdminProductAccess } = require('../../middlewares/auth.middleware');

const getAll = async (req, res, next) => {
    try {
        const isAdmin = req.query.admin === 'true';
        if (isAdmin) {
            const authError = requireAdminProductAccess(req, res);
            if (authError) return authError;
        }
        const result = isAdmin
            ? await productService.getAdminProducts(req.query)
            : await productService.getAllProducts(req.query);
        return success(res, result, 'Products fetched');
    } catch (err) {
        next(err);
    }
};

const getById = async (req, res, next) => {
    try {
        const product = await productService.getProductById(req.params.id);
        return success(res, product, 'Product fetched');
    } catch (err) {
        next(err);
    }
};

const getBySlug = async (req, res, next) => {
    try {
        const product = await productService.getProductBySlug(req.params.slug);
        return success(res, product, 'Product fetched');
    } catch (err) {
        next(err);
    }
};

const update = async (req, res, next) => {
    try {
        const product = await productService.updateProduct(req.params.id, req.body);
        return success(res, product, 'Product updated');
    } catch (err) {
        next(err);
    }
};

const remove = async (req, res, next) => {
    try {
        await productService.deleteProduct(req.params.id);
        return success(res, null, 'Product deleted');
    } catch (err) {
        next(err);
    }
};

const addVariant = async (req, res, next) => {
    try {
        const variant = await productService.addVariant(req.params.id, req.body);
        return success(res, variant, 'Variant added', 201);
    } catch (err) {
        next(err);
    }
};

const updateVariant = async (req, res, next) => {
    try {
        const variant = await productService.updateVariant(req.params.variantId, req.body);
        return success(res, variant, 'Variant updated');
    } catch (err) {
        next(err);
    }
};

const deleteVariant = async (req, res, next) => {
    try {
        await productService.deleteVariant(req.params.variantId);
        return success(res, null, 'Variant deleted');
    } catch (err) {
        next(err);
    }
};

const updateStock = async (req, res, next) => {
    try {
        const { stockQty } = req.body;
        if (stockQty === undefined) return error(res, 'stockQty is required', 400);
        const variant = await productService.updateStock(req.params.variantId, stockQty);
        return success(res, variant, 'Stock updated');
    } catch (err) {
        next(err);
    }
};

const uploadImages = async (req, res, next) => {
    try {
        if (!req.files || req.files.length === 0) {
            return error(res, 'No files uploaded', 400);
        }

        const existingCount = await productService.countProductImages(req.params.id);

        const images = await Promise.all(
            req.files.map((file, index) =>
                productService.addProductImage(req.params.id, {
                    cloudinaryId: file.storageKey || file.filename,
                    url: file.path,
                    isPrimary: existingCount === 0 && index === 0,
                    sortOrder: existingCount + index,
                }),
            ),
        );

        return success(res, images, 'Images uploaded', 201);
    } catch (err) {
        next(err);
    }
};

const registerImages = async (req, res, next) => {
    try {
        const { images } = req.body;

        if (!Array.isArray(images) || images.length === 0) {
            return error(res, 'images array is required', 400);
        }

        for (const img of images) {
            if (!img?.url || !img?.storageKey) {
                return error(res, 'Each image needs url and storageKey', 400);
            }
        }

        const existingCount = await productService.countProductImages(req.params.id);

        const created = await Promise.all(
            images.map((img, index) =>
                productService.addProductImage(req.params.id, {
                    cloudinaryId: img.storageKey,
                    url: img.url,
                    isPrimary: existingCount === 0 && index === 0,
                    sortOrder: existingCount + index,
                }),
            ),
        );

        return success(res, created, 'Images registered', 201);
    } catch (err) {
        next(err);
    }
};

const deleteImage = async (req, res, next) => {
    try {
        const storageKey = await productService.deleteProductImage(req.params.imageId);
        if (r2Service.isConfigured()) {
            await r2Service.deleteObject(storageKey);
        }
        return success(res, null, 'Image deleted');
    } catch (err) {
        next(err);
    }
};

module.exports = {
    create, getAll, getById, getBySlug, update, remove,
    addVariant, updateVariant, deleteVariant, updateStock,
    uploadImages, registerImages, deleteImage,
};