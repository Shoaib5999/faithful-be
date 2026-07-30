const formatPublicOrderNumber = (orderId) =>
    String(orderId || '')
        .replace(/-/g, '')
        .slice(0, 8)
        .toUpperCase();

module.exports = { formatPublicOrderNumber };
