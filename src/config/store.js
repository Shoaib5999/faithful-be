const DEFAULT_STORE_NAME = 'Faithful Meat';

const isPlaceholderValue = (value) =>
    !value?.trim() || /^your\s/i.test(String(value).trim());

const parseSenderName = (from) => {
    if (!from?.trim()) return null;
    const match = from.trim().match(/^"?([^"<]+)"?\s*</);
    return match?.[1]?.trim() || from.trim();
};

const getStoreName = () => {
    const name = process.env.STORE_NAME?.trim();
    if (name && !isPlaceholderValue(name)) return name;

    const fromName = parseSenderName(process.env.RESEND_FROM);
    if (fromName && !isPlaceholderValue(fromName)) return fromName;

    return DEFAULT_STORE_NAME;
};

module.exports = { getStoreName, isPlaceholderValue };
