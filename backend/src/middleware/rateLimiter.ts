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
 * Capped at MAX_MEMORY_ENTRIES to prevent unbounded growth.
 */
const memoryStore = new Map<string, { count: number; expiresAt: number }>();
const MAX_MEMORY_ENTRIES = 10_000;

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

        // Cap the store to prevent unbounded memory growth
        if (memoryStore.size >= MAX_MEMORY_ENTRIES) {
            const firstKey = memoryStore.keys().next().value;
            if (firstKey) memoryStore.delete(firstKey);
        }

        const entry = { count: 1, expiresAt: now + windowSeconds * 1000 };
        memoryStore.set(key, entry);
        return { count: 1, ttl: windowSeconds };
    }
}

/**
 * Extract client identifier for rate limiting.
 *
 * IP header trust is controlled by TRUSTED_PROXY_COUNT (default: 0).
 * Set to the number of reverse-proxy hops in front of the app.
 *
 *   TRUSTED_PROXY_COUNT=0  — no proxy; ignore X-Forwarded-For (default)
 *   TRUSTED_PROXY_COUNT=1  — one nginx/load-balancer in front; use the
 *                            rightmost IP in X-Forwarded-For (the real
 *                            client IP added by the trusted proxy) and
 *                            fall back to X-Real-IP
 *
 * Why rightmost? Each proxy *appends* the connecting client's IP. The
 * leftmost entry is client-supplied and trivially spoofable. The entry
 * at position (n - TRUSTED_PROXY_COUNT) was added by the final trusted
 * hop and cannot be forged by the end client.
 *
 * Example (TRUSTED_PROXY_COUNT=1, attacker sets X-Forwarded-For: 1.2.3.4):
 *   Nginx appends real IP → X-Forwarded-For: 1.2.3.4, 5.6.7.8
 *   We take index (2 - 1) = 1 → 5.6.7.8 ✓
 */
function getClientId(c: Context): string {
    const proxyCount = parseInt(process.env.TRUSTED_PROXY_COUNT ?? '0', 10);

    if (proxyCount > 0) {
        const forwarded = c.req.header('x-forwarded-for');
        if (forwarded) {
            const ips = forwarded.split(',').map((ip) => ip.trim());
            // Pick the IP inserted by the last trusted proxy
            const idx = Math.max(0, ips.length - proxyCount);
            const ip = ips[idx];
            if (ip) return ip;
        }
        // X-Real-IP is set by nginx and reflects the real client IP
        const realIp = c.req.header('x-real-ip');
        if (realIp) return realIp;
    }

    // No trusted proxy — fall back to available request identifiers.
    // Try x-real-ip, then the raw connection address from the runtime adapter.
    const realIp = c.req.header('x-real-ip');
    if (realIp) return realIp;

    // Hono exposes the connecting IP via c.env in some adapters (e.g. Bun, Deno).
    // For Node/http adapters, the raw socket address is the most reliable fallback.
    const connInfo = (c.env as any)?.incoming?.socket?.remoteAddress
        ?? (c.env as any)?.remoteAddr?.hostname
        ?? (c.req.raw as any)?.socket?.remoteAddress;
    if (connInfo) return connInfo;

    // Last resort: hash of user-agent + accept-language to reduce collision surface.
    const ua = c.req.header('user-agent') ?? '';
    const lang = c.req.header('accept-language') ?? '';
    return `anon:${ua}:${lang}`;
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
