const Redis = require('ioredis');

// Caching is opt-in: no REDIS_URL means the app runs uncached against the DB directly.
// When it is set, every cache read/write is still wrapped defensively (see src/utils/cache.js)
// so a Redis outage degrades to "no caching", never a broken request.
const REDIS_URL = process.env.REDIS_URL;

let client = null;

if (REDIS_URL) {
    client = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 5000,
        retryStrategy: (times) => Math.min(times * 200, 5000),
    });

    client.on('error', (err) => {
        console.warn('⚠️  Redis error:', err.message);
    });

    client.on('connect', () => {
        console.log('✅ Redis connected');
    });
}

const isRedisReady = () => !!client && client.status === 'ready';

module.exports = { client, isRedisReady };
