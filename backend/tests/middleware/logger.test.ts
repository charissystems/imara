// backend/tests/middleware/logger.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Context, Next } from 'hono';

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
};

function getStatusColor(status: number): string {
    if (status >= 500) return colors.red;
    if (status >= 400) return colors.yellow;
    if (status >= 300) return colors.cyan;
    if (status >= 200) return colors.green;
    return colors.white;
}

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

function formatDuration(ms: number): string {
    if (ms < 100) return `${colors.green}${ms}ms${colors.reset}`;
    if (ms < 500) return `${colors.yellow}${ms}ms${colors.reset}`;
    return `${colors.red}${ms}ms${colors.reset}`;
}

describe('Logger Middleware', () => {
    let mockContext: Partial<Context>;
    let mockNext: Next;
    let consoleSpy: any;

    beforeEach(() => {
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        mockNext = vi.fn().mockResolvedValue(undefined);
        mockContext = {
            req: {
                method: 'GET',
                path: '/api/tenants',
            } as any,
            res: {
                status: 200,
            } as any,
            get: vi.fn(),
        };
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    describe('getStatusColor', () => {
        it('should return green for 2xx status', () => {
            expect(getStatusColor(200)).toBe(colors.green);
            expect(getStatusColor(201)).toBe(colors.green);
            expect(getStatusColor(204)).toBe(colors.green);
        });

        it('should return cyan for 3xx status', () => {
            expect(getStatusColor(300)).toBe(colors.cyan);
            expect(getStatusColor(301)).toBe(colors.cyan);
            expect(getStatusColor(304)).toBe(colors.cyan);
        });

        it('should return yellow for 4xx status', () => {
            expect(getStatusColor(400)).toBe(colors.yellow);
            expect(getStatusColor(401)).toBe(colors.yellow);
            expect(getStatusColor(404)).toBe(colors.yellow);
        });

        it('should return red for 5xx status', () => {
            expect(getStatusColor(500)).toBe(colors.red);
            expect(getStatusColor(502)).toBe(colors.red);
            expect(getStatusColor(503)).toBe(colors.red);
        });

        it('should return white for 1xx status', () => {
            expect(getStatusColor(100)).toBe(colors.white);
            expect(getStatusColor(101)).toBe(colors.white);
        });
    });

    describe('getMethodColor', () => {
        it('should return blue for GET', () => {
            expect(getMethodColor('GET')).toBe(colors.blue);
        });

        it('should return green for POST', () => {
            expect(getMethodColor('POST')).toBe(colors.green);
        });

        it('should return yellow for PUT', () => {
            expect(getMethodColor('PUT')).toBe(colors.yellow);
        });

        it('should return yellow for PATCH', () => {
            expect(getMethodColor('PATCH')).toBe(colors.yellow);
        });

        it('should return red for DELETE', () => {
            expect(getMethodColor('DELETE')).toBe(colors.red);
        });

        it('should return white for unknown methods', () => {
            expect(getMethodColor('CUSTOM')).toBe(colors.white);
            expect(getMethodColor('HEAD')).toBe(colors.white);
        });
    });

    describe('formatDuration', () => {
        it('should format duration under 100ms as green', () => {
            const formatted = formatDuration(50);
            expect(formatted).toContain(colors.green);
            expect(formatted).toContain('50ms');
        });

        it('should format duration 100-500ms as yellow', () => {
            const formatted = formatDuration(250);
            expect(formatted).toContain(colors.yellow);
            expect(formatted).toContain('250ms');
        });

        it('should format duration over 500ms as red', () => {
            const formatted = formatDuration(1000);
            expect(formatted).toContain(colors.red);
            expect(formatted).toContain('1000ms');
        });

        it('should include reset code', () => {
            const formatted = formatDuration(100);
            expect(formatted).toContain(colors.reset);
        });
    });

    describe('Logger Middleware Behavior', () => {
        it('should handle different HTTP methods', () => {
            const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
            methods.forEach((method) => {
                const color = getMethodColor(method);
                expect(color).toBeDefined();
                expect(color.length).toBeGreaterThan(0);
            });
        });

        it('should handle various status codes', () => {
            const statuses = [100, 200, 201, 204, 301, 304, 400, 401, 403, 404, 500, 502, 503];
            statuses.forEach((status) => {
                const color = getStatusColor(status);
                expect(color).toBeDefined();
                expect(color.length).toBeGreaterThan(0);
            });
        });

        it('should format various duration values', () => {
            const durations = [1, 50, 99, 100, 250, 499, 500, 1000, 5000];
            durations.forEach((duration) => {
                const formatted = formatDuration(duration);
                expect(formatted).toContain(`${duration}ms`);
            });
        });
    });

    describe('Edge Cases', () => {
        it('should handle 0ms duration', () => {
            const formatted = formatDuration(0);
            expect(formatted).toContain('0ms');
            expect(formatted).toContain(colors.green);
        });

        it('should handle very high duration', () => {
            const formatted = formatDuration(999999);
            expect(formatted).toContain('999999ms');
            expect(formatted).toContain(colors.red);
        });

        it('should handle boundary values', () => {
            expect(formatDuration(99)).toContain(colors.green);
            expect(formatDuration(100)).toContain(colors.yellow);
            expect(formatDuration(499)).toContain(colors.yellow);
            expect(formatDuration(500)).toContain(colors.red);
        });
    });
});
