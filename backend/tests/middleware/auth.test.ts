// tests/middleware/auth.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Context, Next } from 'hono';
import { authMiddleware, requireAuth, requireRole } from '../../src/middleware/auth';

/**
 * Auth Middleware Tests
 * Tests JWT verification, public path bypass, requireAuth, and requireRole
 */

// Mock hono/jwt verify
vi.mock('hono/jwt', () => ({
    verify: vi.fn(),
}));

import { verify } from 'hono/jwt';

// ─── Helper ──────────────────────────────────────────────────

const createMockContext = (overrides: Record<string, any> = {}): Context => {
    const store: Record<string, any> = {};
    return {
        req: {
            path: overrides.path || '/members',
            method: overrides.method || 'GET',
            header: vi.fn((name: string) => {
                if (name === 'Authorization') return overrides.authHeader;
                return undefined;
            }),
        },
        get: vi.fn((key: string) => store[key] ?? overrides[key]),
        set: vi.fn((key: string, value: any) => { store[key] = value; }),
        json: vi.fn().mockReturnThis(),
    } as unknown as Context;
};

// ─── authMiddleware ──────────────────────────────────────────

describe('authMiddleware', () => {
    let mockNext: Next;

    beforeEach(() => {
        mockNext = vi.fn().mockResolvedValue(undefined);
        vi.clearAllMocks();
    });

    it('should bypass for public paths', async () => {
        const publicPaths = [
            '/auth/login',
            '/auth/register',
            '/auth/forgot-password',
            '/auth/reset-password',
            '/auth/verify-otp',
            '/auth/2fa/verify',
            '/health',
        ];

        for (const path of publicPaths) {
            const ctx = createMockContext({ path });
            await authMiddleware(ctx, mockNext);
            expect(mockNext).toHaveBeenCalled();
        }
    });

    it('should return 401 when no Authorization header', async () => {
        const ctx = createMockContext({ authHeader: undefined });
        await authMiddleware(ctx, mockNext);

        expect(ctx.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
            }),
            401
        );
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for non-Bearer token', async () => {
        const ctx = createMockContext({ authHeader: 'Basic abc123' });
        await authMiddleware(ctx, mockNext);

        expect(ctx.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
            }),
            401
        );
    });

    it('should set user context on valid token', async () => {
        (verify as any).mockResolvedValue({
            staffId: 'staff-1',
            staffEmail: 'admin@test.com',
            staffNumber: 'STF-001',
            role: 'sacco_administrator',
            tenantId: 'tenant-1',
            type: 'access',
        });

        const ctx = createMockContext({ authHeader: 'Bearer valid-token' });
        await authMiddleware(ctx, mockNext);

        expect(ctx.set).toHaveBeenCalledWith('user', expect.objectContaining({
            id: 'staff-1',
            email: 'admin@test.com',
            staffNumber: 'STF-001',
            role: 'sacco_administrator',
            tenant_id: 'tenant-1',
        }));
        expect(mockNext).toHaveBeenCalled();
    });

    it('should reject refresh tokens for API access', async () => {
        (verify as any).mockResolvedValue({
            staffId: 'staff-1',
            type: 'refresh',
        });

        const ctx = createMockContext({ authHeader: 'Bearer refresh-token' });
        await authMiddleware(ctx, mockNext);

        expect(ctx.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                error: expect.objectContaining({ code: 'INVALID_TOKEN' }),
            }),
            401
        );
    });

    it('should return 401 on JWT verification failure', async () => {
        (verify as any).mockRejectedValue(new Error('Token expired'));

        const ctx = createMockContext({ authHeader: 'Bearer expired-token' });
        await authMiddleware(ctx, mockNext);

        expect(ctx.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                error: expect.objectContaining({ code: 'INVALID_TOKEN' }),
            }),
            401
        );
    });

    it('should default role to "staff" when not in token', async () => {
        (verify as any).mockResolvedValue({
            staffId: 'staff-1',
            staffEmail: 'a@b.com',
            type: 'access',
        });

        const ctx = createMockContext({ authHeader: 'Bearer no-role-token' });
        await authMiddleware(ctx, mockNext);

        expect(ctx.set).toHaveBeenCalledWith('user', expect.objectContaining({
            role: 'staff',
        }));
    });
});

// ─── requireAuth ─────────────────────────────────────────────

describe('requireAuth', () => {
    let mockNext: Next;

    beforeEach(() => {
        mockNext = vi.fn().mockResolvedValue(undefined);
    });

    it('should call next() when user is authenticated', async () => {
        const ctx = createMockContext({ user: { id: 'user-1', role: 'teller' } });
        (ctx.get as any).mockImplementation((key: string) => {
            if (key === 'user') return { id: 'user-1', role: 'teller' };
            return undefined;
        });

        await requireAuth(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });

    it('should throw UnauthorizedError when no user', async () => {
        const ctx = createMockContext({});
        (ctx.get as any).mockReturnValue(undefined);

        await expect(requireAuth(ctx, mockNext)).rejects.toThrow('Authentication required');
    });

    it('should throw UnauthorizedError when user has no id', async () => {
        const ctx = createMockContext({});
        (ctx.get as any).mockImplementation((key: string) => {
            if (key === 'user') return { role: 'teller' }; // no id
            return undefined;
        });

        await expect(requireAuth(ctx, mockNext)).rejects.toThrow('Authentication required');
    });
});

// ─── requireRole ─────────────────────────────────────────────

describe('requireRole', () => {
    let mockNext: Next;

    beforeEach(() => {
        mockNext = vi.fn().mockResolvedValue(undefined);
    });

    it('should call next when user has an allowed role', async () => {
        const ctx = createMockContext({});
        (ctx.get as any).mockImplementation((key: string) => {
            if (key === 'user') return { id: 'u1', role: 'sacco_administrator' };
            return undefined;
        });

        const middleware = requireRole('sacco_administrator', 'system_administrator');
        await middleware(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 when user role is not allowed', async () => {
        const ctx = createMockContext({});
        (ctx.get as any).mockImplementation((key: string) => {
            if (key === 'user') return { id: 'u1', role: 'member' };
            return undefined;
        });

        const middleware = requireRole('sacco_administrator');
        await middleware(ctx, mockNext);

        expect(ctx.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                error: expect.objectContaining({ code: 'FORBIDDEN' }),
            }),
            403
        );
    });

    it('should throw UnauthorizedError when no user', async () => {
        const ctx = createMockContext({});
        (ctx.get as any).mockReturnValue(undefined);

        const middleware = requireRole('sacco_administrator');
        await expect(middleware(ctx, mockNext)).rejects.toThrow('Authentication required');
    });

    it('should throw UnauthorizedError when user has no role', async () => {
        const ctx = createMockContext({});
        (ctx.get as any).mockImplementation((key: string) => {
            if (key === 'user') return { id: 'u1' }; // no role
            return undefined;
        });

        const middleware = requireRole('sacco_administrator');
        await expect(middleware(ctx, mockNext)).rejects.toThrow('Authentication required');
    });

    it('should accept multiple roles and match any', async () => {
        const ctx = createMockContext({});
        (ctx.get as any).mockImplementation((key: string) => {
            if (key === 'user') return { id: 'u1', role: 'accountant' };
            return undefined;
        });

        const middleware = requireRole('sacco_administrator', 'accountant', 'auditor');
        await middleware(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });
});
