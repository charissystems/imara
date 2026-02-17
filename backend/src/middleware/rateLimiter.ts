// src/middleware/rateLimiter.ts
import { Context, Next } from 'hono';
import { getCacheRedis } from '../config/redis';
import { appLogger } from './logger';

/**
 * Rate limiter configuration
 */
interface RateLimitConfig {
    /** Maximum requests allowed in the window */
    maxRequests: number;
    /** Window duration in seconds */
    windowSeconds: number;
    /** Key prefix for Redis storage */
    keyPrefix: string;
    /** Custom message when rate limit is exceeded */
    message?: string;
}

/**
 * In-memory fallback store when Redis is unavailable.
 * Entries auto-expire via a periodic cleanup interval.
 */
const memoryStore = new Map<string, { count: number; expiresAt: number }>();

// Cleanup expired entries every 60 seconds
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore) {
        if (entry.expiresAt <= now) {
            memoryStore.delete(key);
        }
    }
}, 60_000).unref();

/**
 * Increment counter using Redis (preferred) or in-memory fallback.
 * Returns the current count after increment.
 */
async function incrementCounter(
    key: string,
    windowSeconds: number,
): Promise<{ count: number; ttl: number }> {
    try {
        const redis = getCacheRedis();
        const multi = redis.multi();
        multi.incr(key);
        multi.ttl(key);
        const results = await multi.exec();

        if (!results) throw new Error('Redis multi failed');

        const count = results[0][1] as number;
        let ttl = results[1][1] as number;

        // First request in window — set expiry
        if (ttl === -1) {
            await redis.expire(key, windowSeconds);
            ttl = windowSeconds;
        }

        return { count, ttl };
    } catch {
        // Fallback to in-memory store
        const now = Date.now();
        const existing = memoryStore.get(key);

        if (existing && existing.expiresAt > now) {
            existing.count += 1;
            const ttl = Math.ceil((existing.expiresAt - now) / 1000);
            return { count: existing.count, ttl };
        }

        const entry = { count: 1, expiresAt: now + windowSeconds * 1000 };
        memoryStore.set(key, entry);
        return { count: 1, ttl: windowSeconds };
    }
}

/**
 * Extract client identifier for rate limiting.
 * Uses X-Forwarded-For (if behind proxy), falls back to remote address.
 */
function getClientId(c: Context): string {
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    // Hono doesn't expose remoteAddress directly; use a header-based fallback
    return c.req.header('x-real-ip') || 'unknown';
}

/**
 * Create a rate-limiting middleware with the given configuration.
 *
 * Usage:
 * ```ts
 * app.use('/auth/login', rateLimit({ maxRequests: 5, windowSeconds: 60, keyPrefix: 'rl:login' }));
 * ```
 */
export function rateLimit(config: RateLimitConfig) {
    const {
        maxRequests,
        windowSeconds,
        keyPrefix,
        message = 'Too many requests, please try again later',
    } = config;

    return async (c: Context, next: Next) => {
        const clientId = getClientId(c);
        const key = `${keyPrefix}:${clientId}`;

        const { count, ttl } = await incrementCounter(key, windowSeconds);

        // Set standard rate-limit headers
        c.header('X-RateLimit-Limit', String(maxRequests));
        c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - count)));
        c.header('X-RateLimit-Reset', String(ttl));

        if (count > maxRequests) {
            appLogger.warn('Rate limit exceeded', {
                clientId,
                key,
                count,
                maxRequests,
            });

            c.header('Retry-After', String(ttl));
            return c.json(
                {
                    success: false,
                    error: {
                        code: 'RATE_LIMIT_EXCEEDED',
                        message,
                        retryAfter: ttl,
                    },
                },
                429,
            );
        }

        await next();
    };
}

// ── Pre-configured limiters for common auth endpoints ────────────────

/** Login: 5 attempts per 60 s */
export const loginRateLimit = rateLimit({
    maxRequests: 5,
    windowSeconds: 60,
    keyPrefix: 'rl:login',
    message: 'Too many login attempts. Please try again in 1 minute.',
});

/** Registration: 3 per 60 s */
export const registerRateLimit = rateLimit({
    maxRequests: 3,
    windowSeconds: 60,
    keyPrefix: 'rl:register',
    message: 'Too many registration attempts. Please try again in 1 minute.',
});

/** Password reset request: 3 per 300 s */
export const passwordResetRateLimit = rateLimit({
    maxRequests: 3,
    windowSeconds: 300,
    keyPrefix: 'rl:pwd-reset',
    message: 'Too many password reset attempts. Please try again in 5 minutes.',
});

/** OTP / 2FA verification: 5 per 300 s */
export const otpRateLimit = rateLimit({
    maxRequests: 5,
    windowSeconds: 300,
    keyPrefix: 'rl:otp',
    message: 'Too many verification attempts. Please try again in 5 minutes.',
});

/** General API: 100 per 60 s */
export const apiRateLimit = rateLimit({
    maxRequests: 100,
    windowSeconds: 60,
    keyPrefix: 'rl:api',
});
