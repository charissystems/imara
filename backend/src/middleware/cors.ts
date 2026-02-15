// src/middleware/cors.ts
import { cors as honoCors } from 'hono/cors';

/**
 * CORS configuration based on environment
 */
const getAllowedOrigins = (): string[] => {
    const env = process.env.NODE_ENV || 'development';
    
    if (env === 'production') {
        // In production, use specific allowed origins
        const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
        return allowedOrigins;
    }
    
    // In development, allow localhost and local domain
    const baseDomain = process.env.BASE_DOMAIN || '';
    const origins = [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:8080',
    ];
    if (baseDomain) {
        origins.push(`http://${baseDomain}`);
        origins.push(`http://${baseDomain}:3000`);
        origins.push(`http://${baseDomain}:5173`);
    }
    return origins;
};

/**
 * CORS middleware with dynamic origin validation
 */
export const corsMiddleware = honoCors({
    origin: (origin, c) => {
        const allowedOrigins = getAllowedOrigins();
        
        // Requests with no origin (mobile apps, curl, server-to-server).
        // When `credentials: true`, returning '*' is invalid for browsers.
        // Return `undefined` so Hono will skip setting a wildcard origin.
        if (!origin) return undefined;
        
        // Check if origin is in allowed list
        if (allowedOrigins.includes(origin)) return origin;
        
        // In development, allow all localhost and local domain origins
        if (process.env.NODE_ENV !== 'production') {
            if (origin.includes('localhost')) return origin;
            const baseDomain = process.env.BASE_DOMAIN || '';
            if (baseDomain && origin.includes(baseDomain)) return origin;
        }
        
        // Check for tenant subdomain pattern in production
        if (process.env.NODE_ENV === 'production') {
            const baseDomain = process.env.BASE_DOMAIN || '';
            if (baseDomain) {
                const tenantPattern = new RegExp(`^https?://[a-z0-9-]+\\.${baseDomain.replace('.', '\\.')}$`);
                if (tenantPattern.test(origin)) {
                    return origin;
                }
            }
        }
        
        return undefined;
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: [
        'Content-Type',
        'Authorization',
        'X-Tenant-Subdomain',
        'X-Request-ID',
    ],
    exposeHeaders: [
        'X-Request-ID',
        'X-Response-Time',
    ],
    maxAge: 86400, // 24 hours
});