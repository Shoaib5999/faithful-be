const prisma = require('../../config/db');
const { sendEmail } = require('../../config/mailer');
const { getStoreName } = require('../../config/store');
const { contactFormTemplate, contactAutoReplyTemplate } = require('../../utils/email-templates');

const SUBJECT_LABELS = {
    general: 'General inquiry',
    order: 'Order support',
    wholesale: 'Wholesale',
};

const submitContact = async ({ name, email, subject, message }) => {
    const trimmedName = name?.trim();
    const trimmedEmail = email?.trim().toLowerCase();
    const trimmedMessage = message?.trim();
    const subjectKey = subject?.trim() || 'general';
    const subjectLabel = SUBJECT_LABELS[subjectKey] ?? subjectKey;

    if (!trimmedName || !trimmedEmail || !trimmedMessage) {
        const err = new Error('Name, email, and message are required');
        err.statusCode = 400;
        throw err;
    }

    await prisma.contactLead.create({
        data: {
            name: trimmedName,
            email: trimmedEmail,
            subject: subjectKey,
            message: trimmedMessage,
        },
    });

    const inbox =
        process.env.CONTACT_INBOX?.trim() ||
        process.env.STORE_EMAIL?.trim();

    if (inbox) {
        const html = contactFormTemplate({
            name: trimmedName,
            email: trimmedEmail,
            subject: subjectLabel,
            message: trimmedMessage,
        });

        await sendEmail({
            to: inbox,
            subject: `[Contact] ${subjectLabel} — ${trimmedName}`,
            html,
            replyTo: trimmedEmail,
        });

        try {
            await sendEmail({
                to: trimmedEmail,
                subject: `We received your message — ${getStoreName()}`,
                html: contactAutoReplyTemplate({ name: trimmedName }),
            });
        } catch (autoReplyError) {
            console.warn(
                `Contact auto-reply to ${trimmedEmail} failed (store notification was still sent):`,
                autoReplyError.message,
            );
        }
    } else {
        console.warn('Contact inbox not configured — lead saved but notification email skipped');
    }

    return {
        message: 'Thank you for reaching out. Our team will respond within two working days.',
    };
};

module.exports = { submitContact, SUBJECT_LABELS };
