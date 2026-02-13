// src/middleware/logger.ts
import { Context, Next } from 'hono';
import { Env } from './types';

/**
 * Color codes for terminal output
 */
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
};

/**
 * Get color based on HTTP status code
 */
function getStatusColor(status: number): string {
    if (status >= 500) return colors.red;
    if (status >= 400) return colors.yellow;
    if (status >= 300) return colors.cyan;
    if (status >= 200) return colors.green;
    return colors.white;
}

/**
 * Get color based on HTTP method
 */
function getMethodColor(method: string): string {
    switch (method) {
        case 'GET':
            return colors.blue;
        case 'POST':
            return colors.green;
        case 'PUT':
        case 'PATCH':
            return colors.yellow;
        case 'DELETE':
            return colors.red;
        default:
            return colors.white;
    }
}

/**
 * Format duration with appropriate color
 */
function formatDuration(ms: number): string {
    if (ms < 100) return `${colors.green}${ms}ms${colors.reset}`;
    if (ms < 500) return `${colors.yellow}${ms}ms${colors.reset}`;
    return `${colors.red}${ms}ms${colors.reset}`;
}

/**
 * Enhanced logging middleware
 */
export async function logger(c: Context<Env>, next: Next) {
    const start = Date.now();
    const { method, path } = c.req;
    const requestId = c.get('requestId') || 'unknown';
    
    // Log incoming request
    console.log(
        `${colors.dim}[${new Date().toISOString()}]${colors.reset}`,
        `${colors.bright}${requestId}${colors.reset}`,
        `${getMethodColor(method)}${method.padEnd(7)}${colors.reset}`,
        `${colors.cyan}${path}${colors.reset}`
    );
    
    await next();
    
    const duration = Date.now() - start;
    const status = c.res.status;
    const tenant = c.get('tenant');
    
    // Log response
    console.log(
        `${colors.dim}[${new Date().toISOString()}]${colors.reset}`,
        `${colors.bright}${requestId}${colors.reset}`,
        `${getMethodColor(method)}${method.padEnd(7)}${colors.reset}`,
        `${colors.cyan}${path}${colors.reset}`,
        `${getStatusColor(status)}${status}${colors.reset}`,
        formatDuration(duration),
        tenant ? `${colors.dim}[${tenant.code}]${colors.reset}` : ''
    );
}

/**
 * Structured logger for application events
 */
export const appLogger = {
    info: (message: string, meta?: Record<string, any>) => {
        console.log(
            `${colors.blue}ℹ${colors.reset}`,
            `${colors.bright}[INFO]${colors.reset}`,
            message,
            meta ? JSON.stringify(meta, null, 2) : ''
        );
    },
    
    warn: (message: string, meta?: Record<string, any>) => {
        console.warn(
            `${colors.yellow}⚠${colors.reset}`,
            `${colors.bright}[WARN]${colors.reset}`,
            message,
            meta ? JSON.stringify(meta, null, 2) : ''
        );
    },
    
    error: (message: string, error?: Error, meta?: Record<string, any>) => {
        console.error(
            `${colors.red}✖${colors.reset}`,
            `${colors.bright}[ERROR]${colors.reset}`,
            message,
            error ? `\n${error.stack}` : '',
            meta ? JSON.stringify(meta, null, 2) : ''
        );
    },
    
    success: (message: string, meta?: Record<string, any>) => {
        console.log(
            `${colors.green}✓${colors.reset}`,
            `${colors.bright}[SUCCESS]${colors.reset}`,
            message,
            meta ? JSON.stringify(meta, null, 2) : ''
        );
    },
    
    debug: (message: string, meta?: Record<string, any>) => {
        if (process.env.NODE_ENV === 'development') {
            console.log(
                `${colors.magenta}[DEBUG]${colors.reset}`,
                message,
                meta ? JSON.stringify(meta, null, 2) : ''
            );
        }
    },
};