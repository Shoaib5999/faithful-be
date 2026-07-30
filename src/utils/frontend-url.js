const normalizeFrontendUrl = (raw) => {
    const value = raw.trim();
    const fixed = value.replace(/(localhost|127\.0\.0\.1)::(?=\d)/g, '$1:');

    try {
        const url = new URL(fixed);
        return url.origin;
    } catch {
        throw new Error(`FRONTEND_URL is not a valid URL: ${raw}`);
    }
};

const getFrontendUrl = () => {
    const raw = process.env.FRONTEND_URL?.trim();

    if (!raw) {
        throw new Error('FRONTEND_URL is not set in environment');
    }

    return normalizeFrontendUrl(raw);
};

module.exports = { normalizeFrontendUrl, getFrontendUrl };
