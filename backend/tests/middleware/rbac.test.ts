// tests/middleware/rbac.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Context, Next } from 'hono';
import {
    UserRole,
    hasPermission,
    getRolePermissions,
    enforcePermission,
    enforceAnyPermission,
    enforceAllPermissions,
    RoleUtils,
} from '../../src/middleware/rbac';

/**
 * RBAC Middleware Tests
 * Tests role-permission matrix, hasPermission logic, and middleware enforcement
 */

// ─── hasPermission (Pure Function) ───────────────────────────

describe('hasPermission', () => {
    // ── System Administrator ──────────────────────────────────

    describe('SYSTEM_ADMIN (wildcard)', () => {
        it('should grant any resource:action combination', () => {
            expect(hasPermission(UserRole.SYSTEM_ADMIN, 'members', 'create')).toBe(true);
            expect(hasPermission(UserRole.SYSTEM_ADMIN, 'loans', 'approve')).toBe(true);
            expect(hasPermission(UserRole.SYSTEM_ADMIN, 'reports', 'export')).toBe(true);
            expect(hasPermission(UserRole.SYSTEM_ADMIN, 'anything', 'delete')).toBe(true);
        });

        it('should grant all action types', () => {
            const actions = ['create', 'read', 'update', 'delete', 'approve', 'export'];
            for (const action of actions) {
                expect(hasPermission(UserRole.SYSTEM_ADMIN, 'test_resource', action)).toBe(true);
            }
        });
    });

    // ── SACCO Administrator ──────────────────────────────────

    describe('SACCO_ADMIN', () => {
        it('should grant member CRUD', () => {
            expect(hasPermission(UserRole.SACCO_ADMIN, 'members', 'create')).toBe(true);
            expect(hasPermission(UserRole.SACCO_ADMIN, 'members', 'read')).toBe(true);
            expect(hasPermission(UserRole.SACCO_ADMIN, 'members', 'update')).toBe(true);
            expect(hasPermission(UserRole.SACCO_ADMIN, 'members', 'delete')).toBe(true);
        });

        it('should grant loan product management', () => {
            expect(hasPermission(UserRole.SACCO_ADMIN, 'loan_products', 'create')).toBe(true);
            expect(hasPermission(UserRole.SACCO_ADMIN, 'loan_products', 'read')).toBe(true);
            expect(hasPermission(UserRole.SACCO_ADMIN, 'loan_products', 'update')).toBe(true);
        });

        it('should grant savings product management', () => {
            expect(hasPermission(UserRole.SACCO_ADMIN, 'savings_products', 'create')).toBe(true);
            expect(hasPermission(UserRole.SACCO_ADMIN, 'savings_products', 'read')).toBe(true);
            expect(hasPermission(UserRole.SACCO_ADMIN, 'savings_products', 'update')).toBe(true);
        });

        it('should grant chart of accounts and journal management', () => {
            expect(hasPermission(UserRole.SACCO_ADMIN, 'chart_of_accounts', 'create')).toBe(true);
            expect(hasPermission(UserRole.SACCO_ADMIN, 'chart_of_accounts', 'approve')).toBe(true);
            expect(hasPermission(UserRole.SACCO_ADMIN, 'journal_entries', 'create')).toBe(true);
            expect(hasPermission(UserRole.SACCO_ADMIN, 'journal_entries', 'approve')).toBe(true);
        });

        it('should grant loan approval', () => {
            expect(hasPermission(UserRole.SACCO_ADMIN, 'loans', 'approve')).toBe(true);
            expect(hasPermission(UserRole.SACCO_ADMIN, 'loan_applications', 'approve')).toBe(true);
        });

        it('should grant report access', () => {
            expect(hasPermission(UserRole.SACCO_ADMIN, 'reports', 'read')).toBe(true);
            expect(hasPermission(UserRole.SACCO_ADMIN, 'reports', 'export')).toBe(true);
        });

        it('should deny audit log access', () => {
            expect(hasPermission(UserRole.SACCO_ADMIN, 'audit_logs', 'read')).toBe(false);
        });
    });

    // ── Teller ────────────────────────────────────────────────

    describe('TELLER', () => {
        it('should grant deposit and withdrawal operations', () => {
            expect(hasPermission(UserRole.TELLER, 'deposits', 'create')).toBe(true);
            expect(hasPermission(UserRole.TELLER, 'deposits', 'read')).toBe(true);
            expect(hasPermission(UserRole.TELLER, 'withdrawals', 'create')).toBe(true);
            expect(hasPermission(UserRole.TELLER, 'withdrawals', 'read')).toBe(true);
        });

        it('should grant transfer creation', () => {
            expect(hasPermission(UserRole.TELLER, 'transfers', 'create')).toBe(true);
            expect(hasPermission(UserRole.TELLER, 'transfers', 'read')).toBe(true);
        });

        it('should grant read-only member access', () => {
            expect(hasPermission(UserRole.TELLER, 'members', 'read')).toBe(true);
            expect(hasPermission(UserRole.TELLER, 'members', 'create')).toBe(false);
            expect(hasPermission(UserRole.TELLER, 'members', 'update')).toBe(false);
            expect(hasPermission(UserRole.TELLER, 'members', 'delete')).toBe(false);
        });

        it('should deny loan management', () => {
            expect(hasPermission(UserRole.TELLER, 'loans', 'create')).toBe(false);
            expect(hasPermission(UserRole.TELLER, 'loans', 'approve')).toBe(false);
        });
    });

    // ── Loan Officer ─────────────────────────────────────────

    describe('LOAN_OFFICER', () => {
        it('should grant loan application management', () => {
            expect(hasPermission(UserRole.LOAN_OFFICER, 'loan_applications', 'create')).toBe(true);
            expect(hasPermission(UserRole.LOAN_OFFICER, 'loan_applications', 'read')).toBe(true);
            expect(hasPermission(UserRole.LOAN_OFFICER, 'loan_applications', 'update')).toBe(true);
            expect(hasPermission(UserRole.LOAN_OFFICER, 'loan_applications', 'approve')).toBe(true);
        });

        it('should grant loan CRUD', () => {
            expect(hasPermission(UserRole.LOAN_OFFICER, 'loans', 'create')).toBe(true);
            expect(hasPermission(UserRole.LOAN_OFFICER, 'loans', 'read')).toBe(true);
            expect(hasPermission(UserRole.LOAN_OFFICER, 'loans', 'update')).toBe(true);
        });

        it('should grant repayment processing', () => {
            expect(hasPermission(UserRole.LOAN_OFFICER, 'repayments', 'create')).toBe(true);
            expect(hasPermission(UserRole.LOAN_OFFICER, 'repayments', 'read')).toBe(true);
        });

        it('should deny member management', () => {
            expect(hasPermission(UserRole.LOAN_OFFICER, 'members', 'create')).toBe(false);
            expect(hasPermission(UserRole.LOAN_OFFICER, 'members', 'update')).toBe(false);
        });
    });

    // ── Accountant ───────────────────────────────────────────

    describe('ACCOUNTANT', () => {
        it('should grant chart of accounts full access', () => {
            expect(hasPermission(UserRole.ACCOUNTANT, 'chart_of_accounts', 'create')).toBe(true);
            expect(hasPermission(UserRole.ACCOUNTANT, 'chart_of_accounts', 'read')).toBe(true);
            expect(hasPermission(UserRole.ACCOUNTANT, 'chart_of_accounts', 'update')).toBe(true);
            expect(hasPermission(UserRole.ACCOUNTANT, 'chart_of_accounts', 'approve')).toBe(true);
        });

        it('should grant journal entry management', () => {
            expect(hasPermission(UserRole.ACCOUNTANT, 'journal_entries', 'create')).toBe(true);
            expect(hasPermission(UserRole.ACCOUNTANT, 'journal_entries', 'read')).toBe(true);
            expect(hasPermission(UserRole.ACCOUNTANT, 'journal_entries', 'update')).toBe(true);
            expect(hasPermission(UserRole.ACCOUNTANT, 'journal_entries', 'approve')).toBe(true);
        });

        it('should grant financial period management', () => {
            expect(hasPermission(UserRole.ACCOUNTANT, 'financial_periods', 'create')).toBe(true);
            expect(hasPermission(UserRole.ACCOUNTANT, 'financial_periods', 'read')).toBe(true);
            expect(hasPermission(UserRole.ACCOUNTANT, 'financial_periods', 'update')).toBe(true);
            expect(hasPermission(UserRole.ACCOUNTANT, 'financial_periods', 'approve')).toBe(true);
        });

        it('should grant bank reconciliation', () => {
            expect(hasPermission(UserRole.ACCOUNTANT, 'bank_reconciliation', 'create')).toBe(true);
            expect(hasPermission(UserRole.ACCOUNTANT, 'bank_reconciliation', 'approve')).toBe(true);
        });

        it('should deny member or loan management', () => {
            expect(hasPermission(UserRole.ACCOUNTANT, 'members', 'create')).toBe(false);
            expect(hasPermission(UserRole.ACCOUNTANT, 'loans', 'create')).toBe(false);
        });
    });

    // ── Auditor ──────────────────────────────────────────────

    describe('AUDITOR', () => {
        it('should grant read-only access to audit logs', () => {
            expect(hasPermission(UserRole.AUDITOR, 'audit_logs', 'read')).toBe(true);
        });

        it('should grant read-only access to reports', () => {
            expect(hasPermission(UserRole.AUDITOR, 'reports', 'read')).toBe(true);
            expect(hasPermission(UserRole.AUDITOR, 'reports', 'export')).toBe(true);
        });

        it('should grant read access to accounts and transactions', () => {
            expect(hasPermission(UserRole.AUDITOR, 'accounts', 'read')).toBe(true);
            expect(hasPermission(UserRole.AUDITOR, 'transactions', 'read')).toBe(true);
        });

        it('should deny all write operations', () => {
            expect(hasPermission(UserRole.AUDITOR, 'members', 'create')).toBe(false);
            expect(hasPermission(UserRole.AUDITOR, 'members', 'update')).toBe(false);
            expect(hasPermission(UserRole.AUDITOR, 'members', 'delete')).toBe(false);
            expect(hasPermission(UserRole.AUDITOR, 'loans', 'create')).toBe(false);
            expect(hasPermission(UserRole.AUDITOR, 'loans', 'approve')).toBe(false);
        });
    });

    // ── Member (Self-Service) ────────────────────────────────

    describe('MEMBER', () => {
        it('should grant own account access', () => {
            expect(hasPermission(UserRole.MEMBER, 'accounts', 'read')).toBe(true);
            expect(hasPermission(UserRole.MEMBER, 'transactions', 'read')).toBe(true);
            expect(hasPermission(UserRole.MEMBER, 'statements', 'read')).toBe(true);
            expect(hasPermission(UserRole.MEMBER, 'statements', 'export')).toBe(true);
        });

        it('should grant own deposit and withdrawal', () => {
            expect(hasPermission(UserRole.MEMBER, 'deposits', 'create')).toBe(true);
            expect(hasPermission(UserRole.MEMBER, 'withdrawals', 'create')).toBe(true);
        });

        it('should grant own loan application', () => {
            expect(hasPermission(UserRole.MEMBER, 'loan_applications', 'create')).toBe(true);
            expect(hasPermission(UserRole.MEMBER, 'loan_applications', 'read')).toBe(true);
        });

        it('should deny approval and admin operations', () => {
            expect(hasPermission(UserRole.MEMBER, 'loans', 'approve')).toBe(false);
            expect(hasPermission(UserRole.MEMBER, 'members', 'create')).toBe(false);
            expect(hasPermission(UserRole.MEMBER, 'staff', 'create')).toBe(false);
        });
    });

    // ── Agent ────────────────────────────────────────────────

    describe('AGENT', () => {
        it('should grant deposit and withdrawal operations', () => {
            expect(hasPermission(UserRole.AGENT, 'deposits', 'create')).toBe(true);
            expect(hasPermission(UserRole.AGENT, 'withdrawals', 'create')).toBe(true);
            expect(hasPermission(UserRole.AGENT, 'transfers', 'create')).toBe(true);
        });

        it('should deny loan and admin operations', () => {
            expect(hasPermission(UserRole.AGENT, 'loans', 'create')).toBe(false);
            expect(hasPermission(UserRole.AGENT, 'loans', 'approve')).toBe(false);
            expect(hasPermission(UserRole.AGENT, 'staff', 'create')).toBe(false);
        });
    });

    // ── Edge Cases ───────────────────────────────────────────

    describe('Edge cases', () => {
        it('should deny permission for unknown role', () => {
            expect(hasPermission('nonexistent_role', 'members', 'read')).toBe(false);
        });

        it('should deny permission for empty role', () => {
            expect(hasPermission('', 'members', 'read')).toBe(false);
        });

        it('should deny permission for unknown resource on non-wildcard role', () => {
            expect(hasPermission(UserRole.TELLER, 'nonexistent_resource', 'read')).toBe(false);
        });

        it('should deny permission for unknown action', () => {
            expect(hasPermission(UserRole.TELLER, 'deposits', 'nonexistent_action')).toBe(false);
        });
    });
});

// ─── getRolePermissions ──────────────────────────────────────

describe('getRolePermissions', () => {
    it('should return permissions array for valid role', () => {
        const perms = getRolePermissions(UserRole.TELLER);
        expect(Array.isArray(perms)).toBe(true);
        expect(perms.length).toBeGreaterThan(0);
        expect(perms[0]).toHaveProperty('resource');
        expect(perms[0]).toHaveProperty('action');
    });

    it('should return wildcard permissions for system admin', () => {
        const perms = getRolePermissions(UserRole.SYSTEM_ADMIN);
        const wildcards = perms.filter(p => p.resource === '*');
        expect(wildcards.length).toBe(6); // all 6 actions
    });

    it('should return empty array for unknown role', () => {
        const perms = getRolePermissions('unknown_role');
        expect(perms).toEqual([]);
    });

    it('should include all expected resources for accountant', () => {
        const perms = getRolePermissions(UserRole.ACCOUNTANT);
        const resources = [...new Set(perms.map(p => p.resource))];
        expect(resources).toContain('chart_of_accounts');
        expect(resources).toContain('journal_entries');
        expect(resources).toContain('financial_periods');
        expect(resources).toContain('bank_reconciliation');
        expect(resources).toContain('reports');
    });
});

// ─── enforcePermission Middleware ────────────────────────────

describe('enforcePermission', () => {
    let mockNext: Next;

    const createMockContext = (user: any): Context => ({
        get: vi.fn((key: string) => {
            if (key === 'user') return user;
            if (key === 'requestId') return 'test-req-id';
            return undefined;
        }),
        set: vi.fn(),
        req: { path: '/test', method: 'POST' } as any,
    } as unknown as Context);

    beforeEach(() => {
        mockNext = vi.fn().mockResolvedValue(undefined);
    });

    it('should call next() when user has permission', async () => {
        const ctx = createMockContext({ id: 'u1', role: UserRole.SACCO_ADMIN });
        const middleware = enforcePermission('members', 'create');
        await middleware(ctx as any, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });

    it('should throw UnauthorizedError when no user', async () => {
        const ctx = createMockContext(null);
        const middleware = enforcePermission('members', 'create');
        await expect(middleware(ctx as any, mockNext)).rejects.toThrow('Authentication required');
    });

    it('should throw UnauthorizedError when user has no role', async () => {
        const ctx = createMockContext({ id: 'u1', role: undefined });
        const middleware = enforcePermission('members', 'create');
        await expect(middleware(ctx as any, mockNext)).rejects.toThrow('Authentication required');
    });

    it('should throw ForbiddenError when user lacks permission', async () => {
        const ctx = createMockContext({ id: 'u1', role: UserRole.MEMBER });
        const middleware = enforcePermission('members', 'create');
        await expect(middleware(ctx as any, mockNext)).rejects.toThrow('Permission denied');
    });

    it('should include resource:action in error message', async () => {
        const ctx = createMockContext({ id: 'u1', role: UserRole.AUDITOR });
        const middleware = enforcePermission('loans', 'approve');
        await expect(middleware(ctx as any, mockNext)).rejects.toThrow('loans:approve');
    });
});

// ─── enforceAnyPermission Middleware ─────────────────────────

describe('enforceAnyPermission', () => {
    let mockNext: Next;

    const createMockContext = (user: any): Context => ({
        get: vi.fn((key: string) => {
            if (key === 'user') return user;
            if (key === 'requestId') return 'test-req-id';
            return undefined;
        }),
        set: vi.fn(),
        req: { path: '/test', method: 'POST' } as any,
    } as unknown as Context);

    beforeEach(() => {
        mockNext = vi.fn().mockResolvedValue(undefined);
    });

    it('should call next when user has any of the listed permissions', async () => {
        const ctx = createMockContext({ id: 'u1', role: UserRole.TELLER });
        const middleware = enforceAnyPermission([
            { resource: 'loans', action: 'approve' },
            { resource: 'deposits', action: 'create' },
        ]);
        await middleware(ctx as any, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });

    it('should throw ForbiddenError when user has none of the permissions', async () => {
        const ctx = createMockContext({ id: 'u1', role: UserRole.MEMBER });
        const middleware = enforceAnyPermission([
            { resource: 'loans', action: 'approve' },
            { resource: 'members', action: 'delete' },
        ]);
        await expect(middleware(ctx as any, mockNext)).rejects.toThrow('Permission denied');
    });

    it('should throw UnauthorizedError when no user', async () => {
        const ctx = createMockContext(null);
        const middleware = enforceAnyPermission([
            { resource: 'deposits', action: 'create' },
        ]);
        await expect(middleware(ctx as any, mockNext)).rejects.toThrow('Authentication required');
    });
});

// ─── enforceAllPermissions Middleware ─────────────────────────

describe('enforceAllPermissions', () => {
    let mockNext: Next;

    const createMockContext = (user: any): Context => ({
        get: vi.fn((key: string) => {
            if (key === 'user') return user;
            if (key === 'requestId') return 'test-req-id';
            return undefined;
        }),
        set: vi.fn(),
        req: { path: '/test', method: 'POST' } as any,
    } as unknown as Context);

    beforeEach(() => {
        mockNext = vi.fn().mockResolvedValue(undefined);
    });

    it('should call next when user has all permissions', async () => {
        const ctx = createMockContext({ id: 'u1', role: UserRole.ACCOUNTANT });
        const middleware = enforceAllPermissions([
            { resource: 'chart_of_accounts', action: 'create' },
            { resource: 'journal_entries', action: 'create' },
        ]);
        await middleware(ctx as any, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });

    it('should throw ForbiddenError when user is missing one permission', async () => {
        const ctx = createMockContext({ id: 'u1', role: UserRole.TELLER });
        const middleware = enforceAllPermissions([
            { resource: 'deposits', action: 'create' },
            { resource: 'loans', action: 'approve' }, // Teller doesn't have this
        ]);
        await expect(middleware(ctx as any, mockNext)).rejects.toThrow('Permission denied');
    });

    it('should include AND in error message', async () => {
        const ctx = createMockContext({ id: 'u1', role: UserRole.MEMBER });
        const middleware = enforceAllPermissions([
            { resource: 'members', action: 'delete' },
            { resource: 'loans', action: 'approve' },
        ]);
        await expect(middleware(ctx as any, mockNext)).rejects.toThrow('all of');
    });
});

// ─── RoleUtils Export ────────────────────────────────────────

describe('RoleUtils', () => {
    it('should export all utility functions', () => {
        expect(RoleUtils.hasPermission).toBe(hasPermission);
        expect(RoleUtils.getRolePermissions).toBe(getRolePermissions);
        expect(RoleUtils.enforcePermission).toBe(enforcePermission);
        expect(RoleUtils.enforceAnyPermission).toBe(enforceAnyPermission);
        expect(RoleUtils.enforceAllPermissions).toBe(enforceAllPermissions);
    });
});

// ─── UserRole Enum ───────────────────────────────────────────

describe('UserRole enum', () => {
    it('should contain all 8 roles', () => {
        expect(Object.keys(UserRole).length).toBe(8);
    });

    it('should have correct values', () => {
        expect(UserRole.SYSTEM_ADMIN).toBe('system_administrator');
        expect(UserRole.SACCO_ADMIN).toBe('sacco_administrator');
        expect(UserRole.TELLER).toBe('teller');
        expect(UserRole.LOAN_OFFICER).toBe('loan_officer');
        expect(UserRole.ACCOUNTANT).toBe('accountant');
        expect(UserRole.AUDITOR).toBe('auditor');
        expect(UserRole.MEMBER).toBe('member');
        expect(UserRole.AGENT).toBe('agent');
    });
});
