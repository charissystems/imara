// tests/middleware/tenantIsolation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Context, Next } from 'hono';

// Mock getPool before importing the middleware so logSecurityViolation
// never touches a real database.
const mockPoolQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
vi.mock('../../src/config/database', () => ({
    getPool: () => ({ query: mockPoolQuery }),
}));
vi.mock('../../src/middleware/logger', () => ({
    appLogger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import {
    tenantIsolationCheck,
    crossTenantAccessCheck,
    requireTenantFilter,
} from '../../src/middleware/tenantIsolation';
import { AppError, ForbiddenError, UnauthorizedError } from '../../src/middleware/errorHandler';

/**
 * Tenant Isolation Middleware Tests
 * Tests multi-tenant security boundaries with defence-in-depth enforcement.
 */

// ─── Helper ──────────────────────────────────────────────────

const createMockContext = (tenant: any, user: any, overrides: Record<string, any> = {}): Context => {
    const store: Record<string, any> = {};
    return {
        get: vi.fn((key: string) => {
            if (key === 'tenant') return tenant;
            if (key === 'user') return user;
            if (key === 'requestId') return overrides.requestId || 'req-test-123';
            return store[key];
        }),
        set: vi.fn((key: string, value: any) => { store[key] = value; }),
        req: {
            path: overrides.path || '/members',
            method: overrides.method || 'GET',
            url: overrides.url || 'http://test.example.com/members',
            header: vi.fn((name: string) => {
                const headers: Record<string, string> = {
                    'x-forwarded-for': '127.0.0.1',
                    'user-agent': 'test-agent',
                    ...(overrides.headers || {}),
                };
                return headers[name];
            }),
        },
    } as unknown as Context;
};

// ─── tenantIsolationCheck ────────────────────────────────────

describe('tenantIsolationCheck', () => {
    let mockNext: Next;

    beforeEach(() => {
        mockNext = vi.fn().mockResolvedValue(undefined);
        mockPoolQuery.mockClear();
    });

    it('should pass when user tenant matches request tenant', async () => {
        const tenant = { id: 'tenant-1', status: 'active', code: 'T1', schema_name: 'tenant_t1' };
        const user = { id: 'u1', tenant_id: 'tenant-1' };
        const ctx = createMockContext(tenant, user);

        await tenantIsolationCheck(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });

    it('should set tenant context variables on success', async () => {
        const tenant = { id: 'tenant-1', status: 'active', code: 'T1', schema_name: 'tenant_t1' };
        const user = { id: 'u1', tenant_id: 'tenant-1' };
        const ctx = createMockContext(tenant, user);

        await tenantIsolationCheck(ctx, mockNext);

        expect(ctx.set).toHaveBeenCalledWith('tenantId', 'tenant-1');
        expect(ctx.set).toHaveBeenCalledWith('tenantCode', 'T1');
        expect(ctx.set).toHaveBeenCalledWith('schemaName', 'tenant_t1');
    });

    it('should throw AppError (500) when tenant context is missing', async () => {
        const ctx = createMockContext(null, null);

        await expect(tenantIsolationCheck(ctx, mockNext)).rejects.toThrow(AppError);
        await expect(tenantIsolationCheck(ctx, mockNext)).rejects.toThrow('tenant context is missing');
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenError for invalid schema name format', async () => {
        const tenant = { id: 'tenant-1', status: 'active', code: 'T1', schema_name: 'INVALID_SCHEMA' };
        const user = { id: 'u1', tenant_id: 'tenant-1' };
        const ctx = createMockContext(tenant, user);

        await expect(tenantIsolationCheck(ctx, mockNext)).rejects.toThrow(ForbiddenError);
        await expect(tenantIsolationCheck(ctx, mockNext)).rejects.toThrow('Tenant configuration error');
    });

    it('should log security violation for invalid schema name', async () => {
        const tenant = { id: 'tenant-1', status: 'active', code: 'T1', schema_name: 'public; DROP TABLE' };
        const ctx = createMockContext(tenant, { id: 'u1', tenant_id: 'tenant-1' });

        await expect(tenantIsolationCheck(ctx, vi.fn())).rejects.toThrow();
        // logSecurityViolation writes to public.tenant_audit_log via pool.query
        expect(mockPoolQuery).toHaveBeenCalled();
    });

    it('should throw ForbiddenError on tenant mismatch and log violation', async () => {
        const tenant = { id: 'tenant-1', status: 'active', code: 'T1', schema_name: 'tenant_t1' };
        const user = { id: 'u1', tenant_id: 'tenant-2', email: 'attacker@test.com' };
        const ctx = createMockContext(tenant, user);

        await expect(tenantIsolationCheck(ctx, mockNext)).rejects.toThrow(
            'User tenant does not match request tenant',
        );
        // Violation should be persisted
        expect(mockPoolQuery).toHaveBeenCalled();
        const insertCall = mockPoolQuery.mock.calls[0];
        expect(insertCall[0]).toContain('tenant_audit_log');
    });

    it('should throw ForbiddenError for inactive tenant', async () => {
        const tenant = { id: 'tenant-1', status: 'suspended', code: 'T1', schema_name: 'tenant_t1' };
        const user = { id: 'u1', tenant_id: 'tenant-1' };
        const ctx = createMockContext(tenant, user);

        await expect(tenantIsolationCheck(ctx, mockNext)).rejects.toThrow('suspended');
    });

    it('should throw UnauthorizedError for deleted user', async () => {
        const tenant = { id: 'tenant-1', status: 'active', code: 'T1', schema_name: 'tenant_t1' };
        const user = { id: 'u1', tenant_id: 'tenant-1', deleted_at: new Date() };
        const ctx = createMockContext(tenant, user);

        await expect(tenantIsolationCheck(ctx, mockNext)).rejects.toThrow('deleted');
    });

    it('should allow unauthenticated access with valid tenant (login routes)', async () => {
        const tenant = { id: 'tenant-1', status: 'active', code: 'T1', schema_name: 'tenant_t1' };
        const ctx = createMockContext(tenant, null);

        await tenantIsolationCheck(ctx, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(ctx.set).toHaveBeenCalledWith('tenantId', 'tenant-1');
    });

    it('should pass when user has no tenant_id (new user)', async () => {
        const tenant = { id: 'tenant-1', status: 'active', code: 'T1', schema_name: 'tenant_t1' };
        const user = { id: 'u1' }; // no tenant_id
        const ctx = createMockContext(tenant, user);

        await tenantIsolationCheck(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });

    it('should reject schema names without tenant_ prefix', async () => {
        const tenant = { id: 'tenant-1', status: 'active', code: 'T1', schema_name: 'public' };
        const ctx = createMockContext(tenant, { id: 'u1', tenant_id: 'tenant-1' });

        await expect(tenantIsolationCheck(ctx, vi.fn())).rejects.toThrow('Tenant configuration error');
    });

    it('should accept valid tenant schema names', async () => {
        const schemas = ['tenant_sacco1', 'tenant_abc_def', 'tenant_123'];
        for (const schema_name of schemas) {
            const tenant = { id: 'tenant-1', status: 'active', code: 'T1', schema_name };
            const user = { id: 'u1', tenant_id: 'tenant-1' };
            const ctx = createMockContext(tenant, user);
            const next = vi.fn().mockResolvedValue(undefined);

            await tenantIsolationCheck(ctx, next);
            expect(next).toHaveBeenCalled();
        }
    });

    it('should not call next on any rejection', async () => {
        const tenant = { id: 'tenant-1', status: 'active', code: 'T1', schema_name: 'tenant_t1' };
        const user = { id: 'u1', tenant_id: 'tenant-WRONG' };
        const ctx = createMockContext(tenant, user);

        await expect(tenantIsolationCheck(ctx, mockNext)).rejects.toThrow();
        expect(mockNext).not.toHaveBeenCalled();
    });
});

// ─── crossTenantAccessCheck ──────────────────────────────────

describe('crossTenantAccessCheck', () => {
    let mockNext: Next;

    beforeEach(() => {
        mockNext = vi.fn().mockResolvedValue(undefined);
        mockPoolQuery.mockClear();
    });

    it('should allow same-tenant access', async () => {
        const tenant = { id: 'tenant-1', schema_name: 'tenant_t1', code: 'T1' };
        const user = { id: 'u1', tenant_id: 'tenant-1' };
        const ctx = createMockContext(tenant, user);

        await crossTenantAccessCheck(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });

    it('should deny cross-tenant for non-super-admin routes and log violation', async () => {
        const tenant = { id: 'tenant-1', schema_name: 'tenant_t1', code: 'T1' };
        const user = { id: 'u1', tenant_id: 'tenant-2', email: 'u1@test.com' };
        const ctx = createMockContext(tenant, user, { path: '/members' });

        await expect(crossTenantAccessCheck(ctx, mockNext)).rejects.toThrow('Cross-tenant access denied');
        expect(mockPoolQuery).toHaveBeenCalled();
    });

    it('should allow super-admin cross-tenant access and audit it', async () => {
        const tenant = { id: 'tenant-1', schema_name: 'tenant_t1', code: 'T1' };
        const user = { id: 'u1', tenant_id: 'tenant-2', email: 'admin@test.com' };
        const ctx = createMockContext(tenant, user, { path: '/api/admin/super/tenants' });

        await crossTenantAccessCheck(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
        // Should log the super-admin access to audit table
        expect(mockPoolQuery).toHaveBeenCalled();
    });

    it('should skip when no tenant or user', async () => {
        const ctx = createMockContext(null, null);
        await crossTenantAccessCheck(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });
});

// ─── requireTenantFilter ─────────────────────────────────────

describe('requireTenantFilter', () => {
    let mockNext: Next;

    beforeEach(() => {
        mockNext = vi.fn().mockResolvedValue(undefined);
    });

    it('should skip for GET requests', async () => {
        const ctx = createMockContext(
            { id: 'tenant-1' },
            { id: 'u1', role: 'system_administrator' },
            { method: 'GET', url: 'http://test.example.com/members' },
        );

        await requireTenantFilter(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });

    it('should skip for POST requests', async () => {
        const ctx = createMockContext(
            { id: 'tenant-1' },
            { id: 'u1', role: 'teller' },
            { method: 'POST', url: 'http://test.example.com/deposits' },
        );

        await requireTenantFilter(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });

    it('should require confirm_cross_tenant for super-admin DELETE', async () => {
        const ctx = createMockContext(
            { id: 'tenant-1' },
            { id: 'u1', role: 'system_administrator' },
            { method: 'DELETE', url: 'http://test.example.com/members/1' },
        );

        await expect(requireTenantFilter(ctx, mockNext)).rejects.toThrow('confirm_cross_tenant');
    });

    it('should require confirm_cross_tenant for super-admin PUT', async () => {
        const ctx = createMockContext(
            { id: 'tenant-1' },
            { id: 'u1', role: 'system_administrator' },
            { method: 'PUT', url: 'http://test.example.com/members/1' },
        );

        await expect(requireTenantFilter(ctx, mockNext)).rejects.toThrow('confirm_cross_tenant');
    });

    it('should require confirm_cross_tenant for super-admin PATCH', async () => {
        const ctx = createMockContext(
            { id: 'tenant-1' },
            { id: 'u1', role: 'system_administrator' },
            { method: 'PATCH', url: 'http://test.example.com/members/1' },
        );

        await expect(requireTenantFilter(ctx, mockNext)).rejects.toThrow('confirm_cross_tenant');
    });

    it('should pass when confirm_cross_tenant param is present', async () => {
        const ctx = createMockContext(
            { id: 'tenant-1' },
            { id: 'u1', role: 'system_administrator' },
            { method: 'DELETE', url: 'http://test.example.com/members/1?confirm_cross_tenant=true' },
        );

        await requireTenantFilter(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });

    it('should allow non-admin write operations without confirmation', async () => {
        const ctx = createMockContext(
            { id: 'tenant-1' },
            { id: 'u1', role: 'manager' },
            { method: 'DELETE', url: 'http://test.example.com/members/1' },
        );

        await requireTenantFilter(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });

    it('should skip checks when no tenant', async () => {
        const ctx = createMockContext(null, null, { method: 'DELETE', url: 'http://test.example.com/members/1' });
        await requireTenantFilter(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });
});
