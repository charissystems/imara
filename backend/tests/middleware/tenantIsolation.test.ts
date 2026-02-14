// tests/middleware/tenantIsolation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Context, Next } from 'hono';
import {
    tenantIsolationCheck,
    crossTenantAccessCheck,
    requireTenantFilter,
} from '../../src/middleware/tenantIsolation';

/**
 * Tenant Isolation Middleware Tests
 * Tests multi-tenant security boundaries
 */

// ─── Helper ──────────────────────────────────────────────────

const createMockContext = (tenant: any, user: any, overrides: Record<string, any> = {}): Context => {
    const store: Record<string, any> = {};
    return {
        get: vi.fn((key: string) => {
            if (key === 'tenant') return tenant;
            if (key === 'user') return user;
            return store[key];
        }),
        set: vi.fn((key: string, value: any) => { store[key] = value; }),
        req: {
            path: overrides.path || '/members',
            method: overrides.method || 'GET',
            url: overrides.url || 'http://test.example.com/members',
        },
    } as unknown as Context;
};

// ─── tenantIsolationCheck ────────────────────────────────────

describe('tenantIsolationCheck', () => {
    let mockNext: Next;

    beforeEach(() => {
        mockNext = vi.fn().mockResolvedValue(undefined);
    });

    it('should pass when user tenant matches request tenant', async () => {
        const tenant = { id: 'tenant-1', status: 'active', code: 'T1', schema_name: 'tenant_t1' };
        const user = { id: 'u1', tenant_id: 'tenant-1' };
        const ctx = createMockContext(tenant, user);

        await tenantIsolationCheck(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });

    it('should set tenant context variables', async () => {
        const tenant = { id: 'tenant-1', status: 'active', code: 'T1', schema_name: 'tenant_t1' };
        const user = { id: 'u1', tenant_id: 'tenant-1' };
        const ctx = createMockContext(tenant, user);

        await tenantIsolationCheck(ctx, mockNext);

        expect(ctx.set).toHaveBeenCalledWith('tenantId', 'tenant-1');
        expect(ctx.set).toHaveBeenCalledWith('tenantCode', 'T1');
        expect(ctx.set).toHaveBeenCalledWith('schemaName', 'tenant_t1');
    });

    it('should throw ForbiddenError on tenant mismatch', async () => {
        const tenant = { id: 'tenant-1', status: 'active', code: 'T1', schema_name: 'tenant_t1' };
        const user = { id: 'u1', tenant_id: 'tenant-2' }; // different tenant
        const ctx = createMockContext(tenant, user);

        await expect(tenantIsolationCheck(ctx, mockNext)).rejects.toThrow('Cross-tenant access is not permitted');
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

    it('should skip checks when no tenant (public routes)', async () => {
        const ctx = createMockContext(null, null);
        await tenantIsolationCheck(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });

    it('should skip checks when no user (anonymous)', async () => {
        const tenant = { id: 'tenant-1', status: 'active' };
        const ctx = createMockContext(tenant, null);
        await tenantIsolationCheck(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });

    it('should pass when user has no tenant_id (new user)', async () => {
        const tenant = { id: 'tenant-1', status: 'active', code: 'T1', schema_name: 'tenant_t1' };
        const user = { id: 'u1' }; // no tenant_id
        const ctx = createMockContext(tenant, user);

        await tenantIsolationCheck(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });
});

// ─── crossTenantAccessCheck ──────────────────────────────────

describe('crossTenantAccessCheck', () => {
    let mockNext: Next;

    beforeEach(() => {
        mockNext = vi.fn().mockResolvedValue(undefined);
    });

    it('should allow same-tenant access', async () => {
        const tenant = { id: 'tenant-1' };
        const user = { id: 'u1', tenant_id: 'tenant-1' };
        const ctx = createMockContext(tenant, user);

        await crossTenantAccessCheck(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });

    it('should deny cross-tenant for non-super-admin routes', async () => {
        const tenant = { id: 'tenant-1' };
        const user = { id: 'u1', tenant_id: 'tenant-2' };
        const ctx = createMockContext(tenant, user, { path: '/members' });

        await expect(crossTenantAccessCheck(ctx, mockNext)).rejects.toThrow('Cross-tenant access denied');
    });

    it('should allow super-admin cross-tenant access', async () => {
        const tenant = { id: 'tenant-1' };
        const user = { id: 'u1', tenant_id: 'tenant-2' };
        const ctx = createMockContext(tenant, user, { path: '/api/admin/super/tenants' });

        await crossTenantAccessCheck(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
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

    it('should skip checks when no tenant', async () => {
        const ctx = createMockContext(null, null, { method: 'DELETE', url: 'http://test.example.com/members/1' });
        await requireTenantFilter(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });
});
