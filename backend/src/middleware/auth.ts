import { Context, Next } from 'hono';
import { verify } from 'hono/jwt';
import { Env } from './types';
import { appLogger } from './logger';

/**
 * JWT authentication middleware
 * Verifies Bearer token and sets currentUser in context
 */
export async function authMiddleware(c: Context<Env>, next: Next) {
    const publicPaths = [
        '/auth/login',
        '/auth/register',
        '/auth/forgot-password',
        '/auth/reset-password',
    ];

    // Check if current path is public
    if (publicPaths.includes(c.req.path)) {
        await next();
        return;
    }

    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        appLogger.warn('Missing or invalid authorization header', {
            path: c.req.path,
            requestId: c.get('requestId'),
        });
        c.set('currentUser', undefined);
        await next();
        return;
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';

    try {
        const payload = await verify(token, jwtSecret, 'HS256') as any;

        // Set current user in context
        c.set('currentUser', {
            id: payload.staffId,
            email: payload.staffEmail,
            staffNumber: payload.staffNumber,
        });

        appLogger.debug('JWT token verified', {
            staffId: payload.staffId,
            requestId: c.get('requestId'),
        });
    } catch (error) {
        appLogger.warn('JWT token verification failed', {
            path: c.req.path,
            requestId: c.get('requestId'),
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        c.set('currentUser', undefined);
    }

    await next();
}

/**
 * Require authentication middleware
 * Can be used for routes that absolutely require authentication
 */
export async function requireAuth(c: Context<Env>, next: Next) {
    const currentUser = c.get('currentUser');

    if (!currentUser) {
        return c.json(
            {
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Authentication required',
                },
            },
            401
        );
    }

    await next();
}
