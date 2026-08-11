const { client, isRedisReady } = require('../config/redis');

// Cache-aside with versioned namespaces: every cached value is keyed on the current
// version of the namespace(s) it depends on (e.g. a product list depends on 'product',
// 'category' AND 'masterdata', since brand/category/taxClass are embedded in the response).
// Invalidation = INCR the namespace's version — every key built from the old version is
// instantly orphaned (never read again) and left to expire via TTL. This is correct across
// multiple server instances since the version lives in Redis, not in-process memory.
const DEFAULT_TTL_SECONDS = 300;

const versionKey = (namespace) => `cache:${namespace}:__ver__`;

const getVersion = async (namespace) => {
    if (!isRedisReady()) return 0;
    try {
        const v = await client.get(versionKey(namespace));
        return v ? Number(v) : 0;
    } catch (err) {
        console.warn(`⚠️  Redis getVersion(${namespace}) failed:`, err.message);
        return 0;
    }
};

// Call after any write that changes data a cached read depends on.
const invalidateNamespace = async (namespace) => {
    if (!isRedisReady()) return;
    try {
        await client.incr(versionKey(namespace));
    } catch (err) {
        console.warn(`⚠️  Redis invalidateNamespace(${namespace}) failed:`, err.message);
    }
};

const stableStringify = (value) => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    return `{${Object.keys(value)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
        .join(',')}}`;
};

/**
 * Read-through cache. `namespaces` lists every data dependency of `fetcher`'s result —
 * invalidating any one of them (via invalidateNamespace) makes this key stop being served.
 */
const getOrSetCache = async (namespaces, keyParts, ttlSeconds, fetcher) => {
    if (!isRedisReady()) return fetcher();

    const nsList = Array.isArray(namespaces) ? namespaces : [namespaces];

    let key;
    try {
        const versions = await Promise.all(nsList.map(getVersion));
        const versionSegment = nsList.map((ns, i) => `${ns}=${versions[i]}`).join('&');
        key = `cache:{${versionSegment}}:${stableStringify(keyParts)}`;

        const cached = await client.get(key);
        if (cached) return JSON.parse(cached);
    } catch (err) {
        console.warn('⚠️  Redis read failed, falling back to DB:', err.message);
        return fetcher();
    }

    const fresh = await fetcher();

    try {
        await client.set(key, JSON.stringify(fresh), 'EX', ttlSeconds ?? DEFAULT_TTL_SECONDS);
    } catch (err) {
        console.warn('⚠️  Redis write failed:', err.message);
    }

    return fresh;
};

module.exports = { getOrSetCache, invalidateNamespace };
