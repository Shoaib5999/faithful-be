const axios = require('axios');

// Phone login/signup OTP via MSG91. MSG91 owns OTP generation, storage, expiry,
// and attempt-limiting on its side (same role Firebase/Twilio Verify would play)
// — this app never generates or stores a raw OTP itself, only relays phone
// numbers to MSG91's send/verify endpoints and trusts their verdict.
//
// Needs a DLT-registered template (India regulatory requirement for any SMS to
// Indian numbers) — get MSG91_TEMPLATE_ID from MSG91 dashboard → OTP → after
// your template is DLT-approved. Template body must include ##OTP## as the
// placeholder MSG91 substitutes with the generated code.
//
// NOTE: response-shape assumptions below (`type: 'success'`) are based on
// MSG91's public docs, not yet exercised against a live account/API key —
// worth a manual curl smoke test once real credentials exist, before trusting
// this in production.
const BASE_URL = 'https://control.msg91.com/api/v5/otp';

const isConfigured = () =>
    Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID);

const requireConfigured = () => {
    if (!isConfigured()) {
        const err = new Error('Phone login is not configured on this server yet');
        err.statusCode = 503;
        throw err;
    }
};

const toMsg91Mobile = (phone) => `91${phone}`;

const requestOtp = async (phone) => {
    requireConfigured();

    try {
        await axios.post(
            BASE_URL,
            {
                template_id: process.env.MSG91_TEMPLATE_ID,
                mobile: toMsg91Mobile(phone),
                otp_length: 6,
                otp_expiry: 5,
            },
            {
                headers: {
                    authkey: process.env.MSG91_AUTH_KEY,
                    'Content-Type': 'application/json',
                },
            },
        );
    } catch (err) {
        console.error('MSG91 send OTP failed:', err.response?.data || err.message);
        const wrapped = new Error('Could not send OTP. Please try again in a moment.');
        wrapped.statusCode = 502;
        throw wrapped;
    }
};

const verifyOtp = async (phone, otp) => {
    requireConfigured();

    try {
        const response = await axios.get(`${BASE_URL}/verify`, {
            params: { mobile: toMsg91Mobile(phone), otp },
            headers: { authkey: process.env.MSG91_AUTH_KEY },
        });

        return response.data?.type === 'success';
    } catch (err) {
        // A rejected/expired OTP is an expected outcome MSG91 may signal via a
        // non-2xx response — that's "not verified", not a wiring failure.
        if (err.response) return false;
        console.error('MSG91 verify OTP failed:', err.message);
        const wrapped = new Error('Could not verify OTP right now. Please try again.');
        wrapped.statusCode = 502;
        throw wrapped;
    }
};

module.exports = { requestOtp, verifyOtp, isConfigured };
