const prisma = require('../../config/db');
const { sendEmail } = require('../../config/mailer');
const { getStoreName } = require('../../config/store');
const { newsletterWelcomeTemplate } = require('../../utils/email-templates');

const getNotifyInbox = () =>
    process.env.NEWSLETTER_NOTIFY_EMAIL?.trim() ||
    process.env.CONTACT_INBOX?.trim() ||
    process.env.STORE_EMAIL?.trim() ||
    null;

const subscribe = async (email) => {
    const trimmedEmail = email?.trim().toLowerCase();

    if (!trimmedEmail) {
        const err = new Error('Email is required');
        err.statusCode = 400;
        throw err;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
        const err = new Error('Please enter a valid email address');
        err.statusCode = 400;
        throw err;
    }

    const existing = await prisma.newsletterSubscriber.findUnique({
        where: { email: trimmedEmail },
    });

    if (existing?.isActive) {
        return {
            message: 'You are already subscribed.',
            alreadySubscribed: true,
        };
    }

    if (existing) {
        await prisma.newsletterSubscriber.update({
            where: { email: trimmedEmail },
            data: { isActive: true },
        });
    } else {
        await prisma.newsletterSubscriber.create({
            data: { email: trimmedEmail },
        });
    }

    const notifyInbox = getNotifyInbox();

    if (notifyInbox) {
        try {
            await sendEmail({
                to: notifyInbox,
                subject: `[Newsletter] New subscriber`,
                html: `<p>New newsletter subscriber: <strong>${trimmedEmail}</strong></p>`,
            });
        } catch (notifyError) {
            console.error('Newsletter notify email failed:', notifyError.message);
        }
    }

    try {
        await sendEmail({
            to: trimmedEmail,
            subject: `Welcome to ${getStoreName()}`,
            html: newsletterWelcomeTemplate({ email: trimmedEmail }),
        });
    } catch (mailError) {
        // Resend test mode only delivers to the account owner until a domain is verified.
        console.warn(
            `Newsletter welcome email to ${trimmedEmail} failed (subscription saved):`,
            mailError.message,
        );
    }

    return {
        message: 'You are subscribed. Watch your inbox for updates from us.',
    };
};

module.exports = { subscribe };
