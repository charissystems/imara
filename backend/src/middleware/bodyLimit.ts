// src/middleware/bodyLimit.ts
import { Context, Next } from 'hono';
import { appLogger } from './logger';

/**
 * Body size limit configuration
 */
interface BodyLimitConfig {
    /** Maximum body size in bytes */
    maxSize: number;
    /** Custom error message */
    message?: string;
}

/**
 * Body size limiting middleware to prevent DoS attacks via large payloads.
 * 
 * Default limit: 10MB
 * 
 * Usage:
 * ```ts
 * app.use('*', bodyLimitMiddleware({ maxSize: 5 * 1024 * 1024 }));
 * ```
 */
export function bodyLimitMiddleware(config?: BodyLimitConfig) {
    const maxSize = config?.maxSize ?? 10 * 1024 * 1024; // Default: 10MB
    const message = config?.message ?? 'Request body too large';

    return async (c: Context, next: Next) => {
        const contentLength = c.req.header('content-length');

        // Check Content-Length header if present
        if (contentLength) {
            const size = parseInt(contentLength, 10);
            
            if (isNaN(size)) {
                appLogger.warn('Invalid Content-Length header', {
                    contentLength,
                    path: c.req.path,
                    method: c.req.method,
                });
                return c.json(
                    {
                        success: false,
                        error: {
                            code: 'INVALID_CONTENT_LENGTH',
                            message: 'Invalid Content-Length header',
                        },
                    },
                    400
                );
            }

            if (size > maxSize) {
                appLogger.warn('Request body size exceeds limit', {
                    size,
                    maxSize,
                    path: c.req.path,
                    method: c.req.method,
                    requestId: c.get('requestId'),
                });

                return c.json(
                    {
                        success: false,
                        error: {
                            code: 'PAYLOAD_TOO_LARGE',
                            message,
                            maxSize,
                        },
                    },
                    413
                );
            }
        }

        // Note: If Content-Length is not provided, we can't check size before
        // reading the body. Hono will throw an error if the body is too large
        // during parsing, which will be caught by the error handler.

        await next();
    };
}
