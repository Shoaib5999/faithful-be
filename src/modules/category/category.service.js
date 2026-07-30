const prisma = require('../../config/db');
const slugify = require('../../utils/slugify');

const createCategory = async ({ name, parentId, sortOrder }) => {
    const slug = slugify(name);

    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) {
        const err = new Error('Category with this name already exists');
        err.statusCode = 409;
        throw err;
    }

    return await prisma.category.create({
        data: { name, slug, parentId: parentId || null, sortOrder: sortOrder || 0 },
    });
};

const getAllCategories = async () => {
    return await prisma.category.findMany({
        where: { isActive: true, parentId: null },
        include: { children: { where: { isActive: true } } },
        orderBy: { sortOrder: 'asc' },
    });
};

const getCategoryById = async (id) => {
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
};

const updateCategory = async (id, { name, parentId, isActive, sortOrder }) => {
    const updateData = {};
    if (name) {
        updateData.name = name;
        updateData.slug = slugify(name);
    }
    if (parentId !== undefined) updateData.parentId = parentId;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

    return await prisma.category.update({ where: { id }, data: updateData });
};

const deleteCategory = async (id) => {
    const products = await prisma.product.count({ where: { categoryId: id } });
    if (products > 0) {
        const err = new Error('Cannot delete category with existing products');
        err.statusCode = 400;
        throw err;
    }

    await prisma.category.delete({ where: { id } });
};

module.exports = { createCategory, getAllCategories, getCategoryById, updateCategory, deleteCategory };