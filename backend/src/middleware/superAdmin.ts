// src/middleware/adminAuth.ts
import { Context, Next } from 'hono';
import { timingSafeEqual } from 'crypto';
import { UnauthorizedError } from './errorHandler';
import { appLogger } from './logger';

/**
 * Middleware to protect super-admin routes.
 * Uses timing-safe comparison to prevent timing attacks on the secret.
 */
export const requireSuperAdmin = async (c: Context, next: Next) => {
    const adminSecret = c.req.header('X-Admin-Secret');
    const expectedSecret = process.env.ADMIN_SECRET_KEY;

    if (!adminSecret || !expectedSecret) {
        appLogger.warn('Super admin access denied: missing credentials', {
            path: c.req.path,
            ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
        });
        throw new UnauthorizedError('Admin access required');
    }

    // Use timing-safe comparison to prevent timing attacks
    const secretBuffer = Buffer.from(adminSecret);
    const expectedBuffer = Buffer.from(expectedSecret);

    if (secretBuffer.length !== expectedBuffer.length ||
        !timingSafeEqual(secretBuffer, expectedBuffer)) {
        appLogger.warn('Super admin access denied: invalid secret', {
            path: c.req.path,
            ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
        });
        throw new UnauthorizedError('Admin access required');
    }

    await next();
};