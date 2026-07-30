const slugify = (text) => {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/[\s_]+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-');
};

module.exports = slugify;