require('dotenv').config();
const app = require('./app');
const prisma = require('./src/config/db');

const PORT = process.env.PORT || 5000;

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION:', err);
    server.close(() => process.exit(1));
});

const startServer = async () => {
    try {
        await prisma.$connect();
        console.log('✅ Database connected');

        const r2Service = require('./src/services/r2.service');
        if (r2Service.isConfigured()) {
            console.log('✅ R2 storage configured');
        } else {
            console.warn('⚠️  R2 storage not configured — image uploads will fail until R2_* env vars are set');
        }

        if (process.env.REDIS_URL) {
            console.log('⏳ Connecting to Redis...');
        } else {
            console.warn('⚠️  REDIS_URL not set — caching disabled, all reads hit the DB directly');
        }

        const { getEmailStatus } = require('./src/config/mailer');
        const emailStatus = getEmailStatus();
        if (emailStatus.resend) {
            const replyToNote = emailStatus.replyTo ? `, reply-to: ${emailStatus.replyTo}` : '';
            console.log(`✅ Email configured (from: ${emailStatus.from}${replyToNote})`);
            if (emailStatus.from.includes('onboarding@resend.dev')) {
                console.warn(
                    '⚠️  Resend test sender: only delivers to your Resend account email until you verify a domain and set RESEND_FROM',
                );
            }
        } else {
            console.warn('⚠️  Email not configured — set RESEND_API_KEY and RESEND_FROM');
        }

        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
            console.log(`📦 Environment: ${process.env.NODE_ENV}`);
        });

        // Graceful shutdown
        const gracefulShutdown = async (signal) => {
            console.log(`\n${signal} received. Shutting down gracefully...`);
            server.close(async () => {
                await prisma.$disconnect();
                console.log('✅ Database disconnected');

                const { client: redisClient } = require('./src/config/redis');
                if (redisClient) {
                    await redisClient.quit().catch(() => {});
                }

                process.exit(0);
            });
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

        return server;
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        await prisma.$disconnect();
        process.exit(1);
    }
};

startServer();