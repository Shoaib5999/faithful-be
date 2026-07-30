const { Resend } = require('resend');
const { getStoreName } = require('./store');

const isPlaceholder = (value) =>
    !value || /your_|example\.com|yourdomain/i.test(String(value));

const isResendConfigured = () =>
    Boolean(process.env.RESEND_API_KEY) && !isPlaceholder(process.env.RESEND_API_KEY);

let resendClient = null;

const getResendClient = () => {
    if (!resendClient && isResendConfigured()) {
        resendClient = new Resend(process.env.RESEND_API_KEY);
    }
    return resendClient;
};

/**
 * Resend requires a verified sender. Use RESEND_FROM in .env.
 * Dev fallback: onboarding@resend.dev (test mode — external recipients need a verified domain).
 */
const getFromAddress = () => {
    if (process.env.RESEND_FROM?.trim()) {
        return process.env.RESEND_FROM.trim();
    }

    if (isResendConfigured()) {
        return `${getStoreName()} <onboarding@resend.dev>`;
    }

    return `"${getStoreName()}" <${process.env.STORE_EMAIL}>`;
};

/** Real business inbox (Gmail etc.) — replies and contact notifications go here. */
const getReplyToAddress = () =>
    process.env.CONTACT_INBOX?.trim() || process.env.STORE_EMAIL?.trim() || null;

const sendViaResend = async ({ to, subject, html, replyTo }) => {
    const client = getResendClient();
    if (!client) {
        throw new Error('Resend is not configured');
    }

    const effectiveReplyTo = replyTo || getReplyToAddress();

    const { data, error } = await client.emails.send({
        from: getFromAddress(),
        to,
        subject,
        html,
        ...(effectiveReplyTo ? { reply_to: effectiveReplyTo } : {}),
    });

    if (error) {
        const message = error.message || JSON.stringify(error);
        throw new Error(message);
    }

    return { provider: 'resend', success: true, messageId: data?.id || null };
};

/**
 * Send email via Resend.
 * @param {Object} options - { to, subject, html, replyTo? }
 */
const sendEmail = async ({ to, subject, html, replyTo }) => {
    if (!isResendConfigured()) {
        throw new Error('No email provider configured. Set RESEND_API_KEY + RESEND_FROM.');
    }

    try {
        const result = await sendViaResend({ to, subject, html, replyTo });
        console.log(`Email sent via Resend → ${to} (id: ${result.messageId || 'n/a'})`);
        return result;
    } catch (resendError) {
        console.error('Resend failed:', resendError.message);
        throw new Error(`Email delivery failed. Resend: ${resendError.message}`);
    }
};

const getEmailStatus = () => ({
    resend: isResendConfigured(),
    from: getFromAddress(),
    replyTo: getReplyToAddress(),
    contactInbox: getReplyToAddress(),
});

module.exports = { sendEmail, getEmailStatus, getFromAddress };
