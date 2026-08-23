const axios = require('axios');

const DEFAULT_BASE_URL = 'https://ntfy.sh';

const sendNtfyNotification = async ({ title, message, priority = 3, tags, click }) => {
    const topic = process.env.NTFY_TOPIC?.trim();
    if (!topic) {
        const err = new Error('NTFY_TOPIC is not set in environment');
        err.statusCode = 500;
        throw err;
    }

    const baseUrl = (process.env.NTFY_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');

    const payload = {
        topic,
        title,
        message,
        priority,
    };

    if (tags?.length) payload.tags = tags;
    if (click) payload.click = click;

    const response = await axios.post(baseUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
    });

    return response.data;
};

module.exports = { sendNtfyNotification };
