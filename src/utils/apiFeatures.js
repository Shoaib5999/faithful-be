/**
 * Safely parse sort fields to prevent injection
 */
const ALLOWED_SORT_FIELDS = {
    products: ['createdAt', 'name', 'updatedAt'],
    orders: ['createdAt', 'total', 'status', 'updatedAt'],
    users: ['createdAt', 'name', 'email'],
};

const safeSort = (sortBy, direction, entity = 'products') => {
    const allowed = ALLOWED_SORT_FIELDS[entity] || ['createdAt'];
    const field = allowed.includes(sortBy) ? sortBy : 'createdAt';
    const dir = direction === 'asc' ? 'asc' : 'desc';
    return { [field]: dir };
};

/**
 * Clean and sanitize search query
 */
const sanitizeSearch = (q) => {
    if (!q || typeof q !== 'string') return null;
    return q.trim().slice(0, 100).replace(/[<>'"]/g, '');
};

module.exports = { safeSort, sanitizeSearch };