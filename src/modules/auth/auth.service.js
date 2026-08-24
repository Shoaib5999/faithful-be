const bcrypt = require('bcryptjs');
const prisma = require('../../config/db');
const {
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken,
} = require('../../utils/jwt');
const crypto = require('crypto');
const { sendEmail } = require('../../config/mailer');
const { getStoreName } = require('../../config/store');
const { passwordResetTemplate, emailVerificationTemplate } = require('../../utils/email-templates');
const notificationService = require('../notification/notification.service');
const msg91 = require('../../config/msg91');

const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const EMAIL_VERIFICATION_EXPIRY_HOURS = 24;

const getRefreshExpiry = () => {
    const date = new Date();
    date.setDate(date.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
    return date;
};

const buildTokenPayload = (user) => ({
    id: user.id,
    email: user.email,
    role: user.role,
});

const isEmailVerified = (user) => Boolean(user.emailVerifiedAt || user.googleId);

const createSessionTokens = async (user) => {
    const payload = buildTokenPayload(user);
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await prisma.refreshToken.create({
        data: {
            token: refreshToken,
            userId: user.id,
            expiresAt: getRefreshExpiry(),
        },
    });

    return {
        accessToken,
        refreshToken,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
};

const sendVerificationEmail = async (user) => {
    await prisma.emailVerificationToken.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true },
    });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000);

    await prisma.emailVerificationToken.create({
        data: {
            userId: user.id,
            token: hashedToken,
            expiresAt,
        },
    });

    const { getFrontendUrl } = require('../../utils/frontend-url');
    const verifyLink = `${getFrontendUrl()}/verify-email?token=${rawToken}`;
    const html = emailVerificationTemplate({ name: user.name, verifyLink });

    await sendEmail({
        to: user.email,
        subject: `Verify your ${getStoreName()} account`,
        html,
    });
};

const register = async ({ name, email, password }) => {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
        const err = new Error('Email already registered');
        err.statusCode = 409;
        throw err;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
        data: { name, email, passwordHash, role: 'CUSTOMER', emailVerifiedAt: null },
    });

    await sendVerificationEmail(user);

    return {
        requiresVerification: true,
        message: 'Account created. Please check your email to verify your account before signing in.',
        email: user.email,
    };
};

const login = async ({ email, password }) => {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
        const err = new Error('Invalid email or password');
        err.statusCode = 401;
        throw err;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
        const err = new Error('Invalid email or password');
        err.statusCode = 401;
        throw err;
    }

    if (!user.isActive) {
        const err = new Error('Your account has been deactivated');
        err.statusCode = 403;
        throw err;
    }

    if (!isEmailVerified(user)) {
        const err = new Error('Please verify your email before signing in. Check your inbox for the verification link.');
        err.statusCode = 403;
        err.code = 'EMAIL_NOT_VERIFIED';
        throw err;
    }

    return createSessionTokens(user);
};

const handleGoogleAuth = async (user) => {
    if (!user.isActive) {
        const err = new Error('Your account has been deactivated');
        err.statusCode = 403;
        throw err;
    }

    if (!user.emailVerifiedAt) {
        await prisma.user.update({
            where: { id: user.id },
            data: { emailVerifiedAt: new Date() },
        });
        user.emailVerifiedAt = new Date();
    }

    return createSessionTokens(user);
};

const requestPhoneOtp = async (phone) => {
    await msg91.requestOtp(phone);
};

// MSG91 owns OTP generation/storage/expiry — verifyOtp() is the only check that
// this phone number was actually proven. Once it passes, find-or-create the
// local User row and hand back the same session shape every other login path
// uses (mirrors handleGoogleAuth's role for Google sign-in).
const verifyPhoneOtpAndLogin = async (phone, otp) => {
    const verified = await msg91.verifyOtp(phone, otp);
    if (!verified) {
        const err = new Error('That code is incorrect or has expired.');
        err.statusCode = 401;
        throw err;
    }

    let user = await prisma.user.findUnique({ where: { phone } });

    if (!user) {
        user = await prisma.user.create({
            data: {
                name: `Customer ${phone.slice(-4)}`,
                phone,
                role: 'CUSTOMER',
                isActive: true,
            },
        });

        if (user.email) {
            setImmediate(() => {
                notificationService.sendWelcomeEmail(user).catch(console.error);
            });
        }
    }

    if (!user.isActive) {
        const err = new Error('Your account has been deactivated');
        err.statusCode = 403;
        throw err;
    }

    return createSessionTokens(user);
};

const verifyEmail = async (rawToken) => {
    if (!rawToken) {
        const err = new Error('Verification token is required');
        err.statusCode = 400;
        throw err;
    }

    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const record = await prisma.emailVerificationToken.findUnique({
        where: { token: hashedToken },
        include: { user: true },
    });

    if (!record) {
        const err = new Error('Invalid or expired verification link');
        err.statusCode = 400;
        throw err;
    }

    if (record.used) {
        if (record.user.emailVerifiedAt) {
            return { message: 'Email verified successfully. You can now sign in.' };
        }
        const err = new Error('Invalid or expired verification link');
        err.statusCode = 400;
        throw err;
    }

    if (record.expiresAt < new Date()) {
        const err = new Error('Invalid or expired verification link');
        err.statusCode = 400;
        throw err;
    }

    await prisma.$transaction(async (tx) => {
        await tx.user.update({
            where: { id: record.userId },
            data: { emailVerifiedAt: new Date() },
        });
        await tx.emailVerificationToken.update({
            where: { id: record.id },
            data: { used: true },
        });
    });

    setImmediate(() => {
        notificationService
            .sendWelcomeEmail(record.user)
            .catch(console.error);
    });

    return { message: 'Email verified successfully. You can now sign in.' };
};

const resendVerificationEmail = async (email) => {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || isEmailVerified(user) || !user.passwordHash) {
        return { message: 'If this email is registered and unverified, a verification link has been sent.' };
    }

    await sendVerificationEmail(user);
    return { message: 'If this email is registered and unverified, a verification link has been sent.' };
};

const refreshAccessToken = async (token) => {
    let decoded;
    try {
        decoded = verifyRefreshToken(token);
    } catch {
        const err = new Error('Invalid or expired refresh token');
        err.statusCode = 401;
        throw err;
    }

    const storedToken = await prisma.refreshToken.findUnique({ where: { token } });
    if (!storedToken || storedToken.expiresAt < new Date()) {
        const err = new Error('Refresh token not found or expired');
        err.statusCode = 401;
        throw err;
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
        const err = new Error('User not found');
        err.statusCode = 404;
        throw err;
    }

    if (!isEmailVerified(user)) {
        const err = new Error('Please verify your email before continuing');
        err.statusCode = 403;
        err.code = 'EMAIL_NOT_VERIFIED';
        throw err;
    }

    const payload = buildTokenPayload(user);
    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(payload);

    await prisma.$transaction(async (tx) => {
        await tx.refreshToken.deleteMany({ where: { token } });
        await tx.refreshToken.create({
            data: {
                token: newRefreshToken,
                userId: user.id,
                expiresAt: getRefreshExpiry(),
            },
        });
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
};

const logout = async (token) => {
    await prisma.refreshToken.deleteMany({ where: { token } });
};

const forgotPassword = async (email) => {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) return { message: 'If this email exists, a reset link has been sent' };

    if (!user.passwordHash) {
        return { message: 'This account uses Google login. Please sign in with Google.' };
    }

    await prisma.passwordResetToken.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true },
    });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordResetToken.create({
        data: {
            userId: user.id,
            token: hashedToken,
            expiresAt,
        },
    });

    const { getFrontendUrl } = require('../../utils/frontend-url');
    const resetLink = `${getFrontendUrl()}/reset-password?token=${rawToken}`;
    const html = passwordResetTemplate({ name: user.name, resetLink });

    await sendEmail({
        to: user.email,
        subject: 'Password Reset Request',
        html,
    });

    return { message: 'If this email exists, a reset link has been sent' };
};

const resetPassword = async (rawToken, newPassword) => {
    if (!rawToken || !newPassword) {
        const err = new Error('Token and new password are required');
        err.statusCode = 400;
        throw err;
    }

    if (newPassword.length < 6) {
        const err = new Error('Password must be at least 6 characters');
        err.statusCode = 400;
        throw err;
    }

    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    const resetRecord = await prisma.passwordResetToken.findUnique({
        where: { token: hashedToken },
        include: { user: true },
    });

    if (!resetRecord) {
        const err = new Error('Invalid or expired reset token');
        err.statusCode = 400;
        throw err;
    }

    if (resetRecord.used) {
        const err = new Error('This reset link has already been used');
        err.statusCode = 400;
        throw err;
    }

    if (resetRecord.expiresAt < new Date()) {
        const err = new Error('Reset token has expired. Please request a new one.');
        err.statusCode = 400;
        throw err;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction(async (tx) => {
        await tx.user.update({
            where: { id: resetRecord.userId },
            data: { passwordHash },
        });

        await tx.passwordResetToken.update({
            where: { id: resetRecord.id },
            data: { used: true },
        });

        await tx.refreshToken.deleteMany({
            where: { userId: resetRecord.userId },
        });
    });

    return { message: 'Password reset successfully. Please log in with your new password.' };
};

const changePassword = async (userId, { oldPassword, newPassword }) => {
    if (!oldPassword || !newPassword) {
        const err = new Error('Old password and new password are required');
        err.statusCode = 400;
        throw err;
    }

    if (newPassword.length < 6) {
        const err = new Error('New password must be at least 6 characters');
        err.statusCode = 400;
        throw err;
    }

    if (oldPassword === newPassword) {
        const err = new Error('New password must be different from old password');
        err.statusCode = 400;
        throw err;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.passwordHash) {
        const err = new Error('This account uses Google login and has no password to change');
        err.statusCode = 400;
        throw err;
    }

    const isValid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isValid) {
        const err = new Error('Old password is incorrect');
        err.statusCode = 401;
        throw err;
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction(async (tx) => {
        await tx.user.update({
            where: { id: userId },
            data: { passwordHash: newPasswordHash },
        });

        await tx.refreshToken.deleteMany({ where: { userId } });
    });

    return { message: 'Password changed successfully. Please log in again.' };
};

const verifyResetToken = async (rawToken) => {
    if (!rawToken) {
        const err = new Error('Token is required');
        err.statusCode = 400;
        throw err;
    }

    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    const resetRecord = await prisma.passwordResetToken.findUnique({
        where: { token: hashedToken },
    });

    if (!resetRecord || resetRecord.used || resetRecord.expiresAt < new Date()) {
        return { valid: false, message: 'Token is invalid or expired' };
    }

    return { valid: true, message: 'Token is valid' };
};

const findOrCreateCheckoutUser = async ({ email, name, phone }) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
        const err = new Error('Customer email is required');
        err.statusCode = 400;
        throw err;
    }

    const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
    });

    if (existingUser) {
        if (!existingUser.isActive) {
            const err = new Error('This account is deactivated');
            err.statusCode = 403;
            throw err;
        }

        if (!existingUser.emailVerifiedAt && !existingUser.googleId) {
            await prisma.user.update({
                where: { id: existingUser.id },
                data: { emailVerifiedAt: new Date() },
            });
        }

        return { user: existingUser, isNewAccount: false };
    }

    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
    const displayName =
        String(name || '').trim() || normalizedEmail.split('@')[0] || 'Customer';

    const user = await prisma.user.create({
        data: {
            name: displayName,
            email: normalizedEmail,
            passwordHash,
            role: 'CUSTOMER',
            emailVerifiedAt: new Date(),
            isActive: true,
        },
    });

    return { user, isNewAccount: true };
};

module.exports = {
    register,
    login,
    handleGoogleAuth,
    requestPhoneOtp,
    verifyPhoneOtpAndLogin,
    verifyEmail,
    resendVerificationEmail,
    refreshAccessToken,
    logout,
    forgotPassword,
    resetPassword,
    changePassword,
    verifyResetToken,
    findOrCreateCheckoutUser,
};
