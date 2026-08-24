const express = require('express');
const router = express.Router();
const passport = require('../../config/passport');
const authController = require('./auth.controller');
const { getFrontendUrl } = require('../../utils/frontend-url');
const {
    registerValidator,
    loginValidator,
    requestPhoneOtpValidator,
    verifyPhoneOtpValidator,
} = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const rateLimit = require('express-rate-limit');

// Stricter rate limiter for password reset — prevent abuse
const resetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Too many reset attempts. Try again in 15 minutes.' },
});

// OTP requests cost real money per SMS (unlike Firebase's client-side reCAPTCHA
// gate, MSG91 has no abuse check upstream of this endpoint) — keep this tight.
const otpRequestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Too many OTP requests. Try again in 15 minutes.' },
});

// Public routes
router.post('/register', registerValidator, authController.register);
router.post('/login', loginValidator, authController.login);
router.post('/phone/request-otp', otpRequestLimiter, requestPhoneOtpValidator, authController.requestPhoneOtp);
router.post('/phone/verify-otp', verifyPhoneOtpValidator, authController.verifyPhoneOtp);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authController.logout);

// Email verification (public)
router.get('/verify-email', authController.verifyEmail);
router.post('/resend-verification', resetLimiter, authController.resendVerification);

// Password reset flow (public — user not logged in)
router.post('/forgot-password', resetLimiter, authController.forgotPassword);
router.get('/verify-reset-token', authController.verifyResetToken);
router.post('/reset-password', resetLimiter, authController.resetPassword);

// Change password (must be logged in)
router.post('/change-password', authenticate, authController.changePassword);

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
const googleFailureRedirect = () => `${getFrontendUrl()}/auth/callback?error=google_failed`;

router.get(
    '/google/callback',
    (req, res, next) => {
        passport.authenticate('google', { session: false }, (err, user) => {
            if (err) {
                console.error('Google OAuth passport error:', err);
                return res.redirect(302, googleFailureRedirect());
            }
            if (!user) {
                return res.redirect(302, googleFailureRedirect());
            }
            req.user = user;
            return authController.googleCallback(req, res).catch((callbackErr) => {
                console.error('Google OAuth callback handler error:', callbackErr);
                return res.redirect(302, googleFailureRedirect());
            });
        })(req, res, next);
    },
);
router.get('/google/failure', (req, res) => {
    res.redirect(302, googleFailureRedirect());
});

module.exports = router;