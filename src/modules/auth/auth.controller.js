const authService = require('./auth.service');
const { success, error } = require('../../utils/response');
const { getFrontendUrl } = require('../../utils/frontend-url');

const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

const register = async (req, res, next) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return error(res, 'Name, email and password are required', 400);
        }

        if (password.length < 6) {
            return error(res, 'Password must be at least 6 characters', 400);
        }

        const data = await authService.register({ name, email, password });
        return success(res, data, data.message, 201);
    } catch (err) {
        next(err);
    }
};

const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return error(res, 'Email and password are required', 400);
        }

        const data = await authService.login({ email, password });
        return success(res, data, 'Login successful');
    } catch (err) {
        next(err);
    }
};

const requestPhoneOtp = async (req, res, next) => {
    try {
        const { phone } = req.body;
        if (!INDIAN_MOBILE_REGEX.test(String(phone || ''))) {
            return error(res, 'Enter a valid 10-digit mobile number', 400);
        }

        await authService.requestPhoneOtp(phone);
        return success(res, null, 'OTP sent');
    } catch (err) {
        next(err);
    }
};

const verifyPhoneOtp = async (req, res, next) => {
    try {
        const { phone, otp } = req.body;
        if (!INDIAN_MOBILE_REGEX.test(String(phone || ''))) {
            return error(res, 'Enter a valid 10-digit mobile number', 400);
        }
        if (!/^\d{4,9}$/.test(String(otp || ''))) {
            return error(res, 'Enter the code sent to your phone', 400);
        }

        const data = await authService.verifyPhoneOtpAndLogin(phone, otp);
        return success(res, data, 'Login successful');
    } catch (err) {
        next(err);
    }
};

const getFrontendBase = () => getFrontendUrl();

const redirectToStoreAuth = (res, params) => {
    const query = new URLSearchParams(params).toString();
    const target = `${getFrontendBase()}/auth/callback${query ? `?${query}` : ''}`;
    return res.redirect(302, target);
};

const googleCallback = async (req, res) => {
    try {
        if (!req.user) {
            return redirectToStoreAuth(res, { error: 'google_failed' });
        }

        const { accessToken, refreshToken } = await authService.handleGoogleAuth(req.user);
        return redirectToStoreAuth(res, { accessToken, refreshToken });
    } catch (err) {
        console.error('Google OAuth callback failed:', err);
        return redirectToStoreAuth(res, { error: 'google_failed' });
    }
};

const refreshToken = async (req, res, next) => {
    try {
        const { refreshToken: token } = req.body;

        if (!token) {
            return error(res, 'Refresh token is required', 400);
        }

        const data = await authService.refreshAccessToken(token);
        return success(res, data, 'Token refreshed');
    } catch (err) {
        next(err);
    }
};

const logout = async (req, res, next) => {
    try {
        const { refreshToken: token } = req.body;
        if (token) {
            await authService.logout(token);
        }
        return success(res, null, 'Logged out successfully');
    } catch (err) {
        next(err);
    }
};

const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) return error(res, 'Email is required', 400);

        const result = await authService.forgotPassword(email);

        // Always return 200 to prevent email enumeration
        return success(res, null, result.message);
    } catch (err) {
        next(err);
    }
};

const resetPassword = async (req, res, next) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) {
            return error(res, 'Token and newPassword are required', 400);
        }

        const result = await authService.resetPassword(token, newPassword);
        return success(res, null, result.message);
    } catch (err) {
        next(err);
    }
};

const verifyResetToken = async (req, res, next) => {
    try {
        const { token } = req.query;
        if (!token) return error(res, 'Token is required', 400);

        const result = await authService.verifyResetToken(token);
        return success(res, result, result.message);
    } catch (err) {
        next(err);
    }
};

const verifyEmail = async (req, res, next) => {
    try {
        const { token } = req.query;
        const result = await authService.verifyEmail(token);
        return success(res, result, result.message);
    } catch (err) {
        next(err);
    }
};

const resendVerification = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) return error(res, 'Email is required', 400);
        const result = await authService.resendVerificationEmail(email);
        return success(res, result, result.message);
    } catch (err) {
        next(err);
    }
};

const changePassword = async (req, res, next) => {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) {
            return error(res, 'oldPassword and newPassword are required', 400);
        }

        const result = await authService.changePassword(req.user.id, { oldPassword, newPassword });
        return success(res, null, result.message);
    } catch (err) {
        next(err);
    }
};

module.exports = {
    register,
    login,
    requestPhoneOtp,
    verifyPhoneOtp,
    googleCallback,
    refreshToken,
    logout,
    forgotPassword,
    resetPassword,
    verifyResetToken,
    verifyEmail,
    resendVerification,
    changePassword,
};