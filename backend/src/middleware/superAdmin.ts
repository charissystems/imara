// src/middleware/adminAuth.ts
import { Context, Next } from 'hono';
import { UnauthorizedError } from './errorHandler';

/**
 * Simple middleware to protect admin routes.
 * TODO: Implement proper JWT or API Key validation here.
 */
export const requireSuperAdmin = async (c: Context, next: Next) => {
    // Example: Check for a specific secret header
    const adminSecret = c.req.header('X-Admin-Secret');
    
    if (adminSecret !== process.env.ADMIN_SECRET_KEY) {
        throw new UnauthorizedError('Admin access required');
    }

    // Set an admin user context if needed
    // c.set('adminUser', { ... });

    await next();
};