/**
 * Token Blacklist Service
 *
 * Tracks revoked JWT tokens in Redis so that logout is enforced server-side.
 * Tokens are stored with a TTL matching their remaining validity so the
 * blacklist is self-cleaning.
 *
 * When Redis is unavailable the service falls back to an in-memory blacklist
 * to ensure revoked tokens are still rejected (fail-closed).
 */

import { getCacheRedis, isRedisAvailable } from '../config/redis';
import { appLogger } from '../middleware/logger';

const BLACKLIST_PREFIX = 'token:blacklist:';

/**
 * In-memory fallback blacklist for when Redis is unavailable.
 * Auto-cleans expired entries every 60 seconds.
 */
const memoryBlacklist = new Map<string, number>(); // hash → expiresAt (ms)

setInterval(() => {
    const now = Date.now();
    for (const [key, expiresAt] of memoryBlacklist) {
        if (expiresAt <= now) {
            memoryBlacklist.delete(key);
        }
    }
}, 60_000).unref();

/**
 * Hash the token to avoid storing raw JWTs in Redis.
 * Uses a simple SHA-256 digest.
 */
async function tokenHash(token: string): Promise<string> {
    const { createHash } = await import('crypto');
    return createHash('sha256').update(token).digest('hex');
}

/**
 * Add a token to the blacklist.
 * @param token   Raw JWT string
 * @param expUnix Token `exp` claim (Unix seconds) — used to compute TTL
 */
export async function blacklistToken(token: string, expUnix: number): Promise<void> {
    const hash = await tokenHash(token);
    const ttlMs = Math.max(1000, (expUnix - Math.floor(Date.now() / 1000)) * 1000);

    // Always write to in-memory fallback
    memoryBlacklist.set(hash, Date.now() + ttlMs);

    if (!isRedisAvailable()) {
        appLogger.warn('Redis unavailable — token blacklisted in memory only');
        return;
    }

    try {
        const redis = getCacheRedis();
        const ttlSec = Math.max(1, expUnix - Math.floor(Date.now() / 1000));
        await redis.set(`${BLACKLIST_PREFIX}${hash}`, '1', 'EX', ttlSec);
    } catch (err) {
        appLogger.error('Failed to blacklist token in Redis (in-memory fallback active)', err as Error);
    }
}

/**
 * Check whether a token has been revoked.
 * Checks both Redis and in-memory fallback (fail-closed).
 */
export async function isTokenBlacklisted(token: string): Promise<boolean> {
    const hash = await tokenHash(token);

    // Always check in-memory fallback first
    const memoryEntry = memoryBlacklist.get(hash);
    if (memoryEntry && memoryEntry > Date.now()) {
        return true;
    }

    if (!isRedisAvailable()) {
        // Redis down — rely on in-memory (which we already checked)
        return false;
    }

    try {
        const redis = getCacheRedis();
        const result = await redis.get(`${BLACKLIST_PREFIX}${hash}`);
        return result !== null;
    } catch (err) {
        appLogger.error('Failed to check token blacklist', err as Error);
        // Fail closed: if we can't verify, treat as blacklisted for safety
        return true;
    }
}

/**
 * Blacklist all tokens for a user by storing a "revoked-before" timestamp.
 * The auth middleware can compare `iat` against this marker.
 * @param userId   Staff / user ID
 * @param maxTtl   Maximum token lifetime in seconds (should be >= refresh token TTL)
 */
export async function blacklistAllUserTokens(userId: string, maxTtl: number = 7 * 24 * 3600): Promise<void> {
    if (!isRedisAvailable()) {
        appLogger.warn('Redis unavailable — user token revocation skipped');
        return;
    }

    try {
        const redis = getCacheRedis();
        const now = Math.floor(Date.now() / 1000);
        await redis.set(`${BLACKLIST_PREFIX}user:${userId}`, String(now), 'EX', maxTtl);
    } catch (err) {
        appLogger.error('Failed to blacklist user tokens', err as Error);
    }
}
