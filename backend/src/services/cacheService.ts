/**
 * Application Cache Service
 *
 * Redis-backed cache with tenant-aware key namespacing, automatic TTLs,
 * and pattern-based invalidation.
 *
 * Architecture:
 *  - Keys are prefixed: `imara:<tenant>:<domain>:<key>`
 *  - Falls back to no-op when Redis is unavailable (cache-aside pattern)
 *  - Supports stale-while-revalidate via soft TTLs
 *
 * Usage:
 *   const cache = new CacheService('tenant_sacco_1');
 *   const data = await cache.getOrSet('reports', 'dashboard', fetchFn, 300);
 *   await cache.invalidate('reports', 'dashboard');
 *   await cache.invalidateDomain('reports'); // wipe all report caches for this tenant
 */

import { getCacheRedis, isRedisAvailable } from '../config/redis';
import { appLogger } from '../middleware/logger';

// ────────────────────────────────────────────────────────────
// Cache Domains — logical grouping for invalidation
// ────────────────────────────────────────────────────────────

export type CacheDomain =
    | 'tenant'         // Tenant metadata
    | 'reports'        // Financial & operational reports
    | 'dashboard'      // Dashboard KPIs & activity
    | 'members'        // Member listings & profiles
    | 'accounts'       // Account balances & summaries
    | 'loans'          // Loan portfolios & products
    | 'shares'         // Share classes & holdings
    | 'accounting'     // Chart of accounts, GL
    | 'config';        // Settings, products, etc.

// Default TTLs (seconds) per domain
const DEFAULT_TTLS: Record<CacheDomain, number> = {
    tenant: 300,       // 5 minutes
    reports: 600,      // 10 minutes
    dashboard: 120,    // 2 minutes
    members: 300,      // 5 minutes
    accounts: 180,     // 3 minutes
    loans: 300,        // 5 minutes
    shares: 300,       // 5 minutes
    accounting: 300,   // 5 minutes
    config: 900,       // 15 minutes
};

// ────────────────────────────────────────────────────────────
// CacheService
// ────────────────────────────────────────────────────────────

export class CacheService {
    private tenantSchema: string;

    constructor(tenantSchema: string) {
        this.tenantSchema = tenantSchema;
    }

    /**
     * Build a namespaced cache key.
     * Final key: `imara:<tenant>:<domain>:<key>`
     * (The `imara:` prefix is added by the Redis client keyPrefix setting)
     */
    private buildKey(domain: CacheDomain, key: string): string {
        return `${this.tenantSchema}:${domain}:${key}`;
    }

    /**
     * Get a value from cache.
     * Returns `null` if key is missing or Redis is unavailable.
     */
    async get<T>(domain: CacheDomain, key: string): Promise<T | null> {
        if (!isRedisAvailable()) return null;

        try {
            const redis = getCacheRedis();
            const raw = await redis.get(this.buildKey(domain, key));
            if (!raw) return null;
            return JSON.parse(raw) as T;
        } catch (err) {
            appLogger.warn('Cache get error', {
                domain, key, error: (err as Error).message,
            });
            return null;
        }
    }

    /**
     * Set a value in cache with a TTL.
     */
    async set<T>(domain: CacheDomain, key: string, value: T, ttlSeconds?: number): Promise<void> {
        if (!isRedisAvailable()) return;

        const ttl = ttlSeconds ?? DEFAULT_TTLS[domain];

        try {
            const redis = getCacheRedis();
            const serialized = JSON.stringify(value);
            await redis.set(this.buildKey(domain, key), serialized, 'EX', ttl);
        } catch (err) {
            appLogger.warn('Cache set error', {
                domain, key, error: (err as Error).message,
            });
        }
    }

    /**
     * Cache-aside: return cached value if available, otherwise call `fetchFn`,
     * cache the result, and return it.
     */
    async getOrSet<T>(
        domain: CacheDomain,
        key: string,
        fetchFn: () => Promise<T>,
        ttlSeconds?: number,
    ): Promise<T> {
        const cached = await this.get<T>(domain, key);
        if (cached !== null) {
            appLogger.debug('Cache HIT', { domain, key, tenant: this.tenantSchema });
            return cached;
        }

        appLogger.debug('Cache MISS', { domain, key, tenant: this.tenantSchema });
        const fresh = await fetchFn();
        // Don't block the response on cache write
        this.set(domain, key, fresh, ttlSeconds).catch(() => {});
        return fresh;
    }

    /**
     * Delete a specific cached key.
     */
    async invalidate(domain: CacheDomain, key: string): Promise<void> {
        if (!isRedisAvailable()) return;

        try {
            const redis = getCacheRedis();
            await redis.del(this.buildKey(domain, key));
            appLogger.debug('Cache invalidated', { domain, key, tenant: this.tenantSchema });
        } catch (err) {
            appLogger.warn('Cache invalidate error', {
                domain, key, error: (err as Error).message,
            });
        }
    }

    /**
     * Delete **all** keys for a given domain in this tenant.
     * Uses SCAN to avoid blocking Redis on large keyspaces.
     */
    async invalidateDomain(domain: CacheDomain): Promise<number> {
        if (!isRedisAvailable()) return 0;

        try {
            const redis = getCacheRedis();
            // Key prefix is already `imara:`, so scan for the tenant+domain portion
            const pattern = `imara:${this.tenantSchema}:${domain}:*`;
            let cursor = '0';
            let deleted = 0;

            do {
                const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
                cursor = nextCursor;

                if (keys.length > 0) {
                    // Keys from SCAN include the full key (with prefix), but `del` expects
                    // keys without the keyPrefix. Strip it.
                    const stripped = keys.map((k) => k.replace(/^imara:/, ''));
                    await redis.del(...stripped);
                    deleted += keys.length;
                }
            } while (cursor !== '0');

            appLogger.info('Cache domain invalidated', {
                domain, tenant: this.tenantSchema, keysDeleted: deleted,
            });
            return deleted;
        } catch (err) {
            appLogger.warn('Cache domain invalidation error', {
                domain, error: (err as Error).message,
            });
            return 0;
        }
    }

    /**
     * Flush **all** cache keys for this tenant across all domains.
     */
    async invalidateTenant(): Promise<number> {
        if (!isRedisAvailable()) return 0;

        try {
            const redis = getCacheRedis();
            const pattern = `imara:${this.tenantSchema}:*`;
            let cursor = '0';
            let deleted = 0;

            do {
                const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
                cursor = nextCursor;

                if (keys.length > 0) {
                    const stripped = keys.map((k) => k.replace(/^imara:/, ''));
                    await redis.del(...stripped);
                    deleted += keys.length;
                }
            } while (cursor !== '0');

            appLogger.info('Tenant cache flushed', {
                tenant: this.tenantSchema, keysDeleted: deleted,
            });
            return deleted;
        } catch (err) {
            appLogger.warn('Tenant cache flush error', {
                error: (err as Error).message,
            });
            return 0;
        }
    }
}

// ────────────────────────────────────────────────────────────
// Global (non-tenant) cache helpers
// ────────────────────────────────────────────────────────────

/**
 * Cache a value in the global (non-tenant) namespace.
 * Key: `imara:global:<key>`
 */
export async function globalCacheGet<T>(key: string): Promise<T | null> {
    if (!isRedisAvailable()) return null;

    try {
        const redis = getCacheRedis();
        const raw = await redis.get(`global:${key}`);
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export async function globalCacheSet<T>(key: string, value: T, ttlSeconds = 300): Promise<void> {
    if (!isRedisAvailable()) return;

    try {
        const redis = getCacheRedis();
        await redis.set(`global:${key}`, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
        // Fail silently
    }
}

export async function globalCacheInvalidate(key: string): Promise<void> {
    if (!isRedisAvailable()) return;

    try {
        const redis = getCacheRedis();
        await redis.del(`global:${key}`);
    } catch {
        // Fail silently
    }
}
