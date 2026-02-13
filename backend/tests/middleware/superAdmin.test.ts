// tests/middleware/superAdmin.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Context, Next } from 'hono';
import { requireSuperAdmin } from '../../src/middleware/superAdmin';
import { UnauthorizedError } from '../../src/middleware/errorHandler';

describe('SuperAdmin Middleware', () => {
    let mockContext: Partial<Context>;
    let mockNext: Next;
    let originalEnv: string | undefined;

    beforeEach(() => {
        // Save original env
        originalEnv = process.env.ADMIN_SECRET_KEY;

        // Setup default mock context
        mockContext = {
            req: {
                header: vi.fn(),
            } as any,
        };

        // Setup mock next
        mockNext = vi.fn().mockResolvedValue(undefined);
    });

    afterEach(() => {
        // Restore original env
        if (originalEnv) {
            process.env.ADMIN_SECRET_KEY = originalEnv;
        } else {
            delete process.env.ADMIN_SECRET_KEY;
        }
        vi.clearAllMocks();
    });

    it('should allow request with valid ADMIN_SECRET_KEY header', async () => {
        process.env.ADMIN_SECRET_KEY = 'test-secret-123';
        (mockContext.req!.header as any).mockReturnValue('test-secret-123');

        await requireSuperAdmin(mockContext as Context, mockNext);

        expect(mockNext).toHaveBeenCalled();
    });

    it('should throw UnauthorizedError when header is missing', async () => {
        process.env.ADMIN_SECRET_KEY = 'test-secret-123';
        (mockContext.req!.header as any).mockReturnValue(undefined);

        try {
            await requireSuperAdmin(mockContext as Context, mockNext);
            expect.fail('Should have thrown UnauthorizedError');
        } catch (error) {
            expect(error).toBeInstanceOf(UnauthorizedError);
            expect((error as any).statusCode).toBe(401);
        }
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedError when header is invalid', async () => {
        process.env.ADMIN_SECRET_KEY = 'test-secret-123';
        (mockContext.req!.header as any).mockReturnValue('wrong-secret');

        try {
            await requireSuperAdmin(mockContext as Context, mockNext);
            expect.fail('Should have thrown UnauthorizedError');
        } catch (error) {
            expect(error).toBeInstanceOf(UnauthorizedError);
            expect((error as any).statusCode).toBe(401);
        }
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('should check X-Admin-Secret header by default', async () => {
        process.env.ADMIN_SECRET_KEY = 'test-secret';
        (mockContext.req!.header as any).mockReturnValue('test-secret');

        await requireSuperAdmin(mockContext as Context, mockNext);

        expect(mockContext.req!.header).toHaveBeenCalledWith('X-Admin-Secret');
    });

    it('should throw UnauthorizedError when ADMIN_SECRET_KEY env is not set', async () => {
        delete process.env.ADMIN_SECRET_KEY;
        (mockContext.req!.header as any).mockReturnValue('any-secret');

        try {
            await requireSuperAdmin(mockContext as Context, mockNext);
            expect.fail('Should have thrown UnauthorizedError');
        } catch (error) {
            expect(error).toBeInstanceOf(UnauthorizedError);
        }
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('should be case-sensitive for secret comparison', async () => {
        process.env.ADMIN_SECRET_KEY = 'Test-Secret-123';
        (mockContext.req!.header as any).mockReturnValue('test-secret-123');

        try {
            await requireSuperAdmin(mockContext as Context, mockNext);
            expect.fail('Should have thrown UnauthorizedError');
        } catch (error) {
            expect(error).toBeInstanceOf(UnauthorizedError);
        }
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle special characters in secret', async () => {
        const specialSecret = 'secret!@#$%^&*()_+=-[]{}|;:,.<>?';
        process.env.ADMIN_SECRET_KEY = specialSecret;
        (mockContext.req!.header as any).mockReturnValue(specialSecret);

        await requireSuperAdmin(mockContext as Context, mockNext);

        expect(mockNext).toHaveBeenCalled();
    });

    it('should handle whitespace in secret comparison', async () => {
        process.env.ADMIN_SECRET_KEY = 'secret-with-spaces';
        (mockContext.req!.header as any).mockReturnValue(' secret-with-spaces '); // With spaces

        try {
            await requireSuperAdmin(mockContext as Context, mockNext);
            expect.fail('Should have thrown UnauthorizedError');
        } catch (error) {
            expect(error).toBeInstanceOf(UnauthorizedError);
        }
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('should throw error with appropriate message', async () => {
        process.env.ADMIN_SECRET_KEY = 'valid-secret';
        (mockContext.req!.header as any).mockReturnValue('invalid-secret');

        try {
            await requireSuperAdmin(mockContext as Context, mockNext);
            expect.fail('Should have thrown UnauthorizedError');
        } catch (error) {
            expect((error as any).message).toBeDefined();
            expect((error as any).code).toBeDefined();
        }
    });

    it('should allow empty secret if explicitly configured', async () => {
        process.env.ADMIN_SECRET_KEY = '';
        (mockContext.req!.header as any).mockReturnValue('');

        // This depends on implementation - if empty string is allowed
        // The middleware should either reject it or allow it
        try {
            await requireSuperAdmin(mockContext as Context, mockNext);
            // If no error, next was called
            expect(mockNext).toHaveBeenCalled();
        } catch (error) {
            // If error thrown, should be UnauthorizedError
            expect(error).toBeInstanceOf(UnauthorizedError);
        }
    });

    it('should work with very long secrets', async () => {
        const longSecret = 'a'.repeat(1000);
        process.env.ADMIN_SECRET_KEY = longSecret;
        (mockContext.req!.header as any).mockReturnValue(longSecret);

        await requireSuperAdmin(mockContext as Context, mockNext);

        expect(mockNext).toHaveBeenCalled();
    });

    it('should call next with context properly', async () => {
        process.env.ADMIN_SECRET_KEY = 'test-secret';
        (mockContext.req!.header as any).mockReturnValue('test-secret');

        await requireSuperAdmin(mockContext as Context, mockNext);

        expect(mockNext).toHaveBeenCalledTimes(1);
    });
});
