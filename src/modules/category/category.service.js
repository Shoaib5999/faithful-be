const prisma = require('../../config/db');
const slugify = require('../../utils/slugify');
const { getOrSetCache, invalidateNamespace } = require('../../utils/cache');

const CACHE_TTL = 300;

// Category objects are embedded in cached product reads (product.service.js), so any
// write here must also invalidate 'category' — bumping it is what makes those go stale too.
const invalidateCategoryCache = () => invalidateNamespace('category');

const createCategory = async ({ name, parentId, sortOrder }) => {
    const slug = slugify(name);

    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) {
        const err = new Error('Category with this name already exists');
        err.statusCode = 409;
        throw err;
    }

    const category = await prisma.category.create({
        data: { name, slug, parentId: parentId || null, sortOrder: sortOrder || 0 },
    });

    await invalidateCategoryCache();

    return category;
};

const getAllCategories = async () =>
    getOrSetCache(['category'], ['category-list'], CACHE_TTL, async () => {
        return prisma.category.findMany({
            where: { isActive: true, parentId: null },
            include: { children: { where: { isActive: true } } },
            orderBy: { sortOrder: 'asc' },
        });
    });

const getCategoryById = async (id) =>
    getOrSetCache(['category'], ['category-by-id', id], CACHE_TTL, async () => {
        const category = await prisma.category.findUnique({
            where: { id },
            include: { children: true },
        });

        if (!category) {
            const err = new Error('Category not found');
            err.statusCode = 404;
            throw err;
        }

        return category;
    });

const updateCategory = async (id, { name, parentId, isActive, sortOrder }) => {
    const updateData = {};
    if (name) {
        updateData.name = name;
        updateData.slug = slugify(name);
    }
    if (parentId !== undefined) updateData.parentId = parentId;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

    const category = await prisma.category.update({ where: { id }, data: updateData });

    await invalidateCategoryCache();

    return category;
};

const deleteCategory = async (id) => {
    const products = await prisma.product.count({ where: { categoryId: id } });
    if (products > 0) {
        const err = new Error('Cannot delete category with existing products');
        err.statusCode = 400;
        throw err;
    }

    await prisma.category.delete({ where: { id } });

    await invalidateCategoryCache();
};

module.exports = { createCategory, getAllCategories, getCategoryById, updateCategory, deleteCategory };