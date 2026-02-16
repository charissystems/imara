// src/middleware/errorHandler.ts
import { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { StatusCode } from 'hono/utils/http-status';
import { appLogger } from './logger';

/**
 * Custom Application Error for better error handling
 */
export class AppError extends Error {
    constructor(
        public statusCode: StatusCode,
        message: string,
        public code?: string,
        public details?: Record<string, any>
    ) {
        super(message);
        this.name = 'AppError';
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Database-specific errors
 */
export class DatabaseError extends AppError {
    constructor(message: string, details?: Record<string, any>) {
        super(500, message, 'DATABASE_ERROR', details);
        this.name = 'DatabaseError';
    }
}

/**
 * Validation errors
 */
export class ValidationError extends AppError {
    constructor(message: string, details?: Record<string, any>) {
        super(400, message, 'VALIDATION_ERROR', details);
        this.name = 'ValidationError';
    }
}

/**
 * Not found errors
 */
export class NotFoundError extends AppError {
    constructor(resource: string, identifier?: string) {
        const message = identifier 
            ? `${resource} with identifier '${identifier}' not found`
            : `${resource} not found`;
        super(404, message, 'NOT_FOUND');
        this.name = 'NotFoundError';
    }
}

/**
 * Unauthorized errors
 */
export class UnauthorizedError extends AppError {
    constructor(message: string = 'Unauthorized') {
        super(401, message, 'UNAUTHORIZED');
        this.name = 'UnauthorizedError';
    }
}

/**
 * Forbidden errors
 */
export class ForbiddenError extends AppError {
    constructor(message: string = 'Forbidden') {
        super(403, message, 'FORBIDDEN');
        this.name = 'ForbiddenError';
    }
}

/**
 * Format error response based on error type
 */
function formatErrorResponse(err: Error, c: Context) {
    const isDev = process.env.NODE_ENV === 'development';
    const timestamp = new Date().toISOString();
    const requestId = c.get('requestId') || 'unknown';
    const path = c.req.path;

    // Handle AppError instances
    if (err instanceof AppError) {
        return {
            success: false,
            error: {
                code: err.code,
                message: err.message,
                statusCode: err.statusCode,
                ...(err.details && { details: err.details }),
                ...(isDev && { stack: err.stack }),
            },
            meta: {
                timestamp,
                requestId,
                path,
            },
        };
    }

    // Handle HTTPException from Hono
    if (err instanceof HTTPException) {
        return {
            success: false,
            error: {
                code: 'HTTP_EXCEPTION',
                message: err.message,
                statusCode: err.status,
                ...(isDev && { stack: err.stack }),
            },
            meta: {
                timestamp,
                requestId,
                path,
            },
        };
    }

    // Handle unknown errors
    return {
        success: false,
        error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: isDev ? err.message : 'An unexpected error occurred',
            statusCode: 500,
            ...(isDev && { 
                stack: err.stack,
                name: err.name,
            }),
        },
        meta: {
            timestamp,
            requestId,
            path,
        },
    };
}

/**
 * Global error handler middleware
 */
export const errorHandler = async (err: Error, c: Context) => {
    // Structured logging of the error (use appLogger)
    const meta: Record<string, any> = {
        path: c.req.path,
        method: c.req.method,
        tenant: c.get('tenant')?.code,
        ...(err instanceof AppError && { code: err.code }),
    };

    // Only log validation errors at debug level, as they're expected user input issues
    if (err instanceof ValidationError) {
        // Don't log validation errors as they're expected user input issues
        // appLogger.debug('Validation error', err as Error, meta);
    } else {
        appLogger.error('Unhandled error', err as Error, meta);
    }

    const response = formatErrorResponse(err, c);
    
    // Determine status code correctly based on error type
    let statusCode: StatusCode = 500;
    if (err instanceof AppError) {
        statusCode = err.statusCode;
    } else if (err instanceof HTTPException) {
        statusCode = err.status;
    }

    return c.json(response, statusCode as any);
};