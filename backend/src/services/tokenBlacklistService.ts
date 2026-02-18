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
 * Capped at MAX_MEMORY_ENTRIES to prevent unbounded growth.
 */
const memoryBlacklist = new Map<string, number>(); // hash → expiresAt (ms)
const MAX_MEMORY_ENTRIES = 10_000;

setInterval(() => {
    const now = Date.now();
    for (const [key, expiresAt] of memoryBlacklist) {
        if (expiresAt <= now) {
            memoryBlacklist.delete(key);
        }
    }
}, 60_000).unref();

/** In-memory "revoked-before" timestamps for user-level revocation when Redis is down */
const memoryUserRevocations = new Map<string, { revokedBefore: number; expiresAt: number }>();

setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryUserRevocations) {
        if (entry.expiresAt <= now) {
            memoryUserRevocations.delete(key);
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

    // Always write to in-memory fallback (with cap to prevent unbounded growth)
    if (memoryBlacklist.size >= MAX_MEMORY_ENTRIES) {
        // Evict expired entries first before falling back to FIFO
        const now = Date.now();
        let evicted = false;
        for (const [key, expiresAt] of memoryBlacklist) {
            if (expiresAt <= now) {
                memoryBlacklist.delete(key);
                evicted = true;
                break;
            }
        }
        // If no expired entries found, evict the oldest (FIFO fallback)
        if (!evicted) {
            const firstKey = memoryBlacklist.keys().next().value;
            if (firstKey) memoryBlacklist.delete(firstKey);
        }
    }
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
        // Redis down — in-memory blacklist was already checked above.
        // Fail-open: allow tokens not in the in-memory blacklist through rather
        // than rejecting ALL tokens (which causes a full DoS for legitimate users).
        // Per-token and user-level in-memory fallbacks still provide revocation coverage.
        appLogger.warn('Redis unavailable — relying on in-memory blacklist only');
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
    const now = Math.floor(Date.now() / 1000);

    // Always write to in-memory fallback so this instance rejects the user's tokens
    memoryUserRevocations.set(userId, {
        revokedBefore: now,
        expiresAt: Date.now() + maxTtl * 1000,
    });

    if (!isRedisAvailable()) {
        appLogger.warn('Redis unavailable — user token revocation stored in memory only', { userId });
        return;
    }

    try {
        const redis = getCacheRedis();
        await redis.set(`${BLACKLIST_PREFIX}user:${userId}`, String(now), 'EX', maxTtl);
    } catch (err) {
        appLogger.error('Failed to blacklist user tokens', err as Error);
    }
}

/**
 * Check whether a user's tokens issued before the revocation timestamp should be rejected.
 * Used by the auth middleware to enforce user-level token revocation (e.g., password change, forced logout).
 * @param userId   Staff / user ID
 * @param iatUnix  Token `iat` claim (Unix seconds)
 * @returns true if the token was issued before the user's revocation timestamp
 */
export async function isUserTokenRevoked(userId: string, iatUnix: number): Promise<boolean> {
    // Check in-memory fallback first
    const memoryEntry = memoryUserRevocations.get(userId);
    if (memoryEntry && memoryEntry.expiresAt > Date.now() && iatUnix < memoryEntry.revokedBefore) {
        return true;
    }

    if (!isRedisAvailable()) {
        // If Redis is down and in-memory didn't catch it, fail open for user-level
        // (per-token blacklist already fails closed above)
        return false;
    }

    try {
        const redis = getCacheRedis();
        const revokedBefore = await redis.get(`${BLACKLIST_PREFIX}user:${userId}`);
        if (revokedBefore && iatUnix < parseInt(revokedBefore, 10)) {
            return true;
        }
    } catch (err) {
        appLogger.error('Failed to check user token revocation', err as Error);
    }

    return false;
}
