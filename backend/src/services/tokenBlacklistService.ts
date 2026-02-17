/**
 * Token Blacklist Service
 *
 * Tracks revoked JWT tokens in Redis so that logout is enforced server-side.
 * Tokens are stored with a TTL matching their remaining validity so the
 * blacklist is self-cleaning.
 *
 * When Redis is unavailable the service degrades gracefully — tokens are
 * treated as valid (fail-open) to avoid locking out all users.
 */

import { getCacheRedis, isRedisAvailable } from '../config/redis';
import { appLogger } from '../middleware/logger';

const BLACKLIST_PREFIX = 'token:blacklist:';

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
    if (!isRedisAvailable()) {
        appLogger.warn('Redis unavailable — token blacklist write skipped');
        return;
    }

    try {
        const redis = getCacheRedis();
        const hash = await tokenHash(token);
        const ttl = Math.max(1, expUnix - Math.floor(Date.now() / 1000));
        await redis.set(`${BLACKLIST_PREFIX}${hash}`, '1', 'EX', ttl);
    } catch (err) {
        appLogger.error('Failed to blacklist token', err as Error);
    }
}

/**
 * Check whether a token has been revoked.
 * Returns `false` (not blacklisted) when Redis is unavailable.
 */
export async function isTokenBlacklisted(token: string): Promise<boolean> {
    if (!isRedisAvailable()) {
        return false;
    }

    try {
        const redis = getCacheRedis();
        const hash = await tokenHash(token);
        const result = await redis.get(`${BLACKLIST_PREFIX}${hash}`);
        return result !== null;
    } catch (err) {
        appLogger.error('Failed to check token blacklist', err as Error);
        return false;
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
