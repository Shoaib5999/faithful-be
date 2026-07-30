const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const prisma = require('./db');
const notificationService = require('../modules/notification/notification.service');

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.GOOGLE_CALLBACK_URL,
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const email = profile.emails?.[0]?.value;
                if (!email) {
                    return done(new Error('Google account did not return an email address'), null);
                }
                const name = profile.displayName?.trim() || email.split('@')[0] || 'Customer';
                const googleId = profile.id;

                let user = await prisma.user.findUnique({ where: { googleId } });

                if (!user) {
                    user = await prisma.user.findUnique({ where: { email } });

                    if (user) {
                        user = await prisma.user.update({
                            where: { email },
                            data: {
                                googleId,
                                emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
                            },
                        });
                    } else {
                        user = await prisma.user.create({
                            data: {
                                name,
                                email,
                                googleId,
                                role: 'CUSTOMER',
                                emailVerifiedAt: new Date(),
                            },
                        });

                        setImmediate(() => {
                            notificationService
                                .sendWelcomeEmail(user)
                                .catch(console.error);
                        });
                    }
                }

                return done(null, user);
            } catch (err) {
                return done(err, null);
            }
        }
    )
);

module.exports = passport;