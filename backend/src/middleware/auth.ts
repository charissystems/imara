import { Context, Next } from 'hono';
import { verify } from 'hono/jwt';
import { Env } from './types';
import { appLogger } from './logger';
import { UnauthorizedError } from './errorHandler';
import { isTokenBlacklisted, isUserTokenRevoked } from '../services/tokenBlacklistService';

/**
 * JWT authentication middleware
 * Verifies Bearer token, checks account status, and sets current user in context
 * Supports both access and refresh tokens
 * Requirements: JWT + OAuth 2.0, account lockout, password expiration
 */
export async function authMiddleware(c: Context<Env>, next: Next) {
    const publicPaths = [
        '/auth/login',
        '/auth/forgot-password',
        '/auth/reset-password',
        '/auth/verify-otp',
        '/auth/2fa/verify',
        '/health',
    ];

    // Check if current path is public (use startsWith for prefix matching
    // so that paths like /health/readiness are also public)
    const requestPath = c.req.path;
    if (publicPaths.some(pp => requestPath === pp || requestPath.startsWith(pp + '/'))) {
        await next();
        return;
    }

    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        appLogger.warn('Missing or invalid authorization header', {
            path: c.req.path,
            requestId: c.get('requestId'),
        });
        return c.json(
            {
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Authorization required',
                },
            },
            401
        );
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
        appLogger.error('JWT_SECRET environment variable is not set');
        return c.json(
            {
                success: false,
                error: {
                    code: 'SERVER_CONFIGURATION_ERROR',
                    message: 'Authentication service is misconfigured',
                },
            },
            500
        );
    }

    try {
        const payload = await verify(token, jwtSecret, 'HS256') as any;

        // Reject refresh tokens and 2FA pending tokens from API access
        if (payload.type === 'refresh') {
            throw new Error('Refresh token cannot be used for API access');
        }
        if (payload.type === '2fa_pending') {
            throw new Error('Two-factor authentication has not been completed');
        }

        // Check if token has been revoked (logout blacklist)
        const blacklisted = await isTokenBlacklisted(token);
        if (blacklisted) {
            throw new Error('Token has been revoked');
        }

        // Check if all tokens for this user were revoked (password change, forced logout)
        if (payload.staffId && payload.iat) {
            const userRevoked = await isUserTokenRevoked(payload.staffId, payload.iat);
            if (userRevoked) {
                throw new Error('All tokens for this user have been revoked');
            }
        }

        // Set current user in context with full user info
        // Note: email and staffNumber are NOT in the JWT (PII removed).
        // They should be looked up from the database if needed.
        const userInfo = {
            id: payload.staffId,
            email: payload.staffEmail || '',
            staffNumber: payload.staffNumber || '',
            role: payload.role || 'staff',
            staffId: payload.staffId,
            tenant_id: payload.tenantId,
        };
        c.set('user', userInfo);
        c.set('currentUser', userInfo);

        appLogger.debug('JWT token verified', {
            staffId: payload.staffId,
            role: payload.role,
            requestId: c.get('requestId'),
        });
    } catch (error) {
        appLogger.warn('JWT token verification failed', {
            path: c.req.path,
            requestId: c.get('requestId'),
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        return c.json(
            {
                success: false,
                error: {
                    code: 'INVALID_TOKEN',
                    message: 'Token verification failed',
                },
            },
            401
        );
    }

    await next();
}

/**
 * Require authentication middleware
 * Throws 401 if user is not authenticated
 */
export async function requireAuth(c: Context<Env>, next: Next) {
    const user = c.get('user');

    if (!user || !user.id) {
        appLogger.warn('Authenticated endpoint accessed without valid user', {
            path: c.req.path,
            requestId: c.get('requestId'),
        });

        throw new UnauthorizedError('Authentication required');
    }

    await next();
}

/**
 * Require specific role middleware factory
 * Usage: app.use('/admin/*', requireRole('sacco_administrator', 'system_administrator'))
 */
export function requireRole(...allowedRoles: string[]) {
    return async (c: Context<Env>, next: Next) => {
        const user = c.get('user');

        if (!user || !user.role) {
            throw new UnauthorizedError('Authentication required');
        }

        if (!allowedRoles.includes(user.role)) {
            appLogger.warn('Unauthorized role access attempt', {
                user_id: user.id,
                user_role: user.role,
                required_roles: allowedRoles,
                path: c.req.path,
                requestId: c.get('requestId'),
            });

            return c.json(
                {
                    success: false,
                    error: {
                        code: 'FORBIDDEN',
                        message: `This operation requires one of: ${allowedRoles.join(', ')}`,
                    },
                },
                403
            );
        }

        await next();
    };
}
