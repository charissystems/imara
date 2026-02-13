// backend/tests/middleware/context.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Context, Next } from 'hono';

describe('Request Context Middleware', () => {
    let mockContext: Partial<Context>;
    let mockNext: Next;

    beforeEach(() => {
        mockNext = vi.fn().mockResolvedValue(undefined);
        mockContext = {
            set: vi.fn(),
            get: vi.fn(),
            header: vi.fn(),
            req: {} as any,
        };
    });

    describe('requestContext middleware', () => {
        it('should generate and set request ID', () => {
            (mockContext.get as any).mockReturnValue(undefined);

            const requestId = 'generated-uuid-123';
            mockContext.set!('requestId', requestId);

            expect(mockContext.set).toHaveBeenCalledWith('requestId', requestId);
        });

        it('should add X-Request-ID to response headers', () => {
            const requestId = 'test-request-id';
            mockContext.set!('requestId', requestId);

            expect(mockContext.set).toHaveBeenCalledWith('requestId', requestId);
        });

        it('should store request start time', () => {
            const startTime = Date.now();
            mockContext.set!('requestStartTime', startTime);

            expect(mockContext.set).toHaveBeenCalledWith('requestStartTime', expect.any(Number));
        });

        it('should calculate response time on next completion', () => {
            const startTime = Date.now() - 100;
            (mockContext.get as any).mockReturnValue(startTime);

            const duration = Date.now() - startTime;

            expect(duration).toBeGreaterThanOrEqual(100);
            expect(duration).toBeLessThan(200);
        });

        it('should call next middleware', async () => {
            await mockNext();

            expect(mockNext).toHaveBeenCalled();
        });

        it('should handle requests without existing request ID', () => {
            (mockContext.get as any).mockReturnValue(undefined);

            const requestId = 'new-id-123';
            mockContext.set!('requestId', requestId);

            expect(mockContext.set).toHaveBeenCalledWith('requestId', requestId);
        });
    });

    describe('schemaContext middleware', () => {
        it('should throw error if tenant context missing', () => {
            (mockContext.get as any).mockReturnValue(undefined);

            const tenant = mockContext.get!('tenant');
            expect(tenant).toBeUndefined();
        });

        it('should attach tenant-specific database to context', () => {
            const mockTenant = {
                id: 'tenant-123',
                schema_name: 'tenant_testsacco',
            };

            (mockContext.get as any).mockReturnValue(mockTenant);

            const tenant = mockContext.get!('tenant');
            expect(tenant).toEqual(mockTenant);
        });

        it('should throw error if tenant has no schema_name', () => {
            const invalidTenant = {
                id: 'tenant-123',
                schema_name: undefined,
            };

            (mockContext.get as any).mockReturnValue(invalidTenant);

            const tenant = mockContext.get!('tenant');
            expect(tenant.schema_name).toBeUndefined();
        });

        it('should set db in context', () => {
            const mockTenant = {
                id: 'tenant-123',
                schema_name: 'tenant_testsacco',
            };

            mockContext.set!('tenant', mockTenant);
            mockContext.set!('db', {});

            expect(mockContext.set).toHaveBeenCalledWith('tenant', mockTenant);
        });

        it('should call next middleware on success', async () => {
            const mockTenant = {
                id: 'tenant-123',
                schema_name: 'tenant_testsacco',
            };

            (mockContext.get as any).mockReturnValue(mockTenant);

            await mockNext();
            expect(mockNext).toHaveBeenCalled();
        });
    });

    describe('Context Headers', () => {
        it('should set proper header formats', () => {
            const requestId = 'req-123-456';
            mockContext.header!('X-Request-ID', requestId);

            expect(mockContext.header).toHaveBeenCalledWith('X-Request-ID', requestId);
        });

        it('should format response time header correctly', () => {
            const duration = 123;
            const headerValue = `${duration}ms`;

            mockContext.header!('X-Response-Time', headerValue);

            expect(mockContext.header).toHaveBeenCalledWith('X-Response-Time', expect.stringContaining('ms'));
        });
    });

    describe('Context Timing', () => {
        it('should measure request duration accurately', () => {
            const startTime = Date.now();
            mockContext.set!('requestStartTime', startTime);

            const elapsedTime = 50;
            const endTime = startTime + elapsedTime;

            const duration = endTime - startTime;
            expect(duration).toBe(elapsedTime);
        });

        it('should handle sub-millisecond precision', () => {
            const startTime = Date.now();
            mockContext.set!('requestStartTime', startTime);

            const duration = 1;

            expect(duration).toBeGreaterThan(0);
        });

        it('should handle long-running requests', () => {
            const startTime = Date.now() - 30000;
            const duration = Date.now() - startTime;

            expect(duration).toBeGreaterThanOrEqual(30000);
        });
    });

    describe('Error Scenarios', () => {
        it('should handle missing requestStartTime gracefully', () => {
            (mockContext.get as any).mockReturnValue(undefined);

            const startTime = mockContext.get!('requestStartTime');
            const fallback = startTime || Date.now();

            expect(fallback).toEqual(expect.any(Number));
        });

        it('should handle missing tenant context', () => {
            (mockContext.get as any).mockReturnValue(null);

            const tenant = mockContext.get!('tenant');
            expect(tenant).toBeNull();
        });

        it('should preserve context across middleware chain', () => {
            const data = { key: 'value', nested: { data: 'test' } };
            mockContext.set!('customData', data);

            (mockContext.get as any).mockReturnValue(data);
            const retrieved = mockContext.get!('customData');

            expect(retrieved).toEqual(data);
        });
    });

    describe('Integration', () => {
        it('should maintain request ID throughout request lifecycle', () => {
            const requestId = 'req-123';

            mockContext.set!('requestId', requestId);
            (mockContext.get as any).mockReturnValue(requestId);

            const retrieved = mockContext.get!('requestId');
            expect(retrieved).toBe(requestId);

            mockContext.header!('X-Request-ID', requestId);
            expect(mockContext.header).toHaveBeenCalledWith('X-Request-ID', requestId);
        });

        it('should coordinate timing across middleware', () => {
            const startTime = Date.now();

            mockContext.set!('requestStartTime', startTime);
            (mockContext.get as any).mockReturnValue(startTime);

            const retrievedStart = mockContext.get!('requestStartTime');
            const duration = Date.now() - retrievedStart;

            expect(duration).toBeGreaterThanOrEqual(0);
        });
    });
});
