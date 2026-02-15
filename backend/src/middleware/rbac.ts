/**
 * Role-Based Access Control Middleware
 * Enforces permission-based access control across different user roles
 * 
 * Roles defined in spec:
 * - system_administrator: Manages tenants, global configuration
 * - sacco_administrator: Configures SACCO-specific products, workflows
 * - teller: Handles daily OTC transactions
 * - loan_officer: Processes loan applications, appraisals
 * - accountant: Manages ledgers, reconciliation, reporting
 * - auditor: Read-only access to audit trails and reports
 * - member: Self-service access to own accounts
 * - agent: Field agent processing transactions
 */

import { Context, Next } from 'hono';
import { Env } from './types';
import { appLogger } from './logger';
import { ForbiddenError, UnauthorizedError } from './errorHandler';

/**
 * User roles in the system
 */
export enum UserRole {
    SYSTEM_ADMIN = 'system_administrator',
    SACCO_ADMIN = 'sacco_administrator',
    TELLER = 'teller',
    LOAN_OFFICER = 'loan_officer',
    ACCOUNTANT = 'accountant',
    AUDITOR = 'auditor',
    MEMBER = 'member',
    AGENT = 'agent',
}

/**
 * Permission definition
 */
export interface Permission {
    resource: string; // e.g., 'members', 'loans', 'accounts'
    action: 'create' | 'read' | 'update' | 'delete' | 'approve' | 'export';
}

/**
 * Role-to-permissions mapping
 */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
    [UserRole.SYSTEM_ADMIN]: [
        { resource: '*', action: 'create' },
        { resource: '*', action: 'read' },
        { resource: '*', action: 'update' },
        { resource: '*', action: 'delete' },
        { resource: '*', action: 'approve' },
        { resource: '*', action: 'export' },
    ],
    [UserRole.SACCO_ADMIN]: [
        { resource: 'members', action: 'create' },
        { resource: 'members', action: 'read' },
        { resource: 'members', action: 'update' },
        { resource: 'members', action: 'delete' },
        { resource: 'loan_products', action: 'create' },
        { resource: 'loan_products', action: 'read' },
        { resource: 'loan_products', action: 'update' },
        { resource: 'savings_products', action: 'create' },
        { resource: 'savings_products', action: 'read' },
        { resource: 'savings_products', action: 'update' },
        { resource: 'savings', action: 'create' },
        { resource: 'savings', action: 'read' },
        { resource: 'savings', action: 'update' },
        { resource: 'shares', action: 'create' },
        { resource: 'shares', action: 'read' },
        { resource: 'shares', action: 'update' },
        { resource: 'shares', action: 'approve' },
        { resource: 'fixed_deposits', action: 'create' },
        { resource: 'fixed_deposits', action: 'read' },
        { resource: 'fixed_deposits', action: 'update' },
        { resource: 'workflow', action: 'create' },
        { resource: 'workflows', action: 'create' },
        { resource: 'workflows', action: 'read' },
        { resource: 'workflows', action: 'update' },
        { resource: 'chart_of_accounts', action: 'create' },
        { resource: 'chart_of_accounts', action: 'read' },
        { resource: 'chart_of_accounts', action: 'update' },
        { resource: 'chart_of_accounts', action: 'approve' },
        { resource: 'journal_entries', action: 'create' },
        { resource: 'journal_entries', action: 'read' },
        { resource: 'journal_entries', action: 'approve' },
        { resource: 'financial_periods', action: 'create' },
        { resource: 'financial_periods', action: 'read' },
        { resource: 'financial_periods', action: 'approve' },
        { resource: 'loans', action: 'create' },
        { resource: 'loans', action: 'read' },
        { resource: 'loans', action: 'update' },
        { resource: 'loans', action: 'approve' },
        { resource: 'loan_applications', action: 'create' },
        { resource: 'loan_applications', action: 'read' },
        { resource: 'loan_applications', action: 'update' },
        { resource: 'loan_applications', action: 'approve' },
        { resource: 'staff', action: 'create' },
        { resource: 'staff', action: 'read' },
        { resource: 'staff', action: 'update' },
        { resource: 'reports', action: 'read' },
        { resource: 'reports', action: 'export' },
        { resource: 'accounts', action: 'create' },
        { resource: 'accounts', action: 'read' },
        { resource: 'accounts', action: 'update' },
        { resource: 'deposits', action: 'create' },
        { resource: 'deposits', action: 'read' },
        { resource: 'withdrawals', action: 'create' },
        { resource: 'withdrawals', action: 'read' },
        { resource: 'withdrawals', action: 'approve' },
        { resource: 'transfers', action: 'create' },
        { resource: 'transfers', action: 'read' },
        // Messaging
        { resource: 'messaging', action: 'create' },
        { resource: 'messaging', action: 'read' },
        { resource: 'messaging', action: 'update' },
        { resource: 'messaging', action: 'delete' },
        { resource: 'messaging', action: 'approve' },
        // Audit
        { resource: 'audit_logs', action: 'read' },
        // Beneficiaries
        { resource: 'beneficiaries', action: 'create' },
        { resource: 'beneficiaries', action: 'read' },
        { resource: 'beneficiaries', action: 'update' },
        { resource: 'beneficiaries', action: 'delete' },
        // Standing Instructions
        { resource: 'standing_instructions', action: 'create' },
        { resource: 'standing_instructions', action: 'read' },
        { resource: 'standing_instructions', action: 'update' },
        { resource: 'standing_instructions', action: 'delete' },
        // Account Liens
        { resource: 'account_liens', action: 'create' },
        { resource: 'account_liens', action: 'read' },
        { resource: 'account_liens', action: 'update' },
        { resource: 'account_liens', action: 'delete' },
        // Member Credentials
        { resource: 'member_credentials', action: 'create' },
        { resource: 'member_credentials', action: 'read' },
        { resource: 'member_credentials', action: 'update' },
        // Configuration & Admin
        { resource: 'configuration', action: 'create' },
        { resource: 'configuration', action: 'read' },
        { resource: 'configuration', action: 'update' },
        { resource: 'configuration', action: 'delete' },
        { resource: 'fee_schedules', action: 'create' },
        { resource: 'fee_schedules', action: 'read' },
        { resource: 'fee_schedules', action: 'update' },
        { resource: 'fee_schedules', action: 'delete' },
        { resource: 'transaction_limits', action: 'create' },
        { resource: 'transaction_limits', action: 'read' },
        { resource: 'transaction_limits', action: 'update' },
        { resource: 'transaction_limits', action: 'delete' },
        { resource: 'transactions', action: 'update' },
        { resource: 'transactions', action: 'approve' },
    ],
    [UserRole.TELLER]: [
        { resource: 'members', action: 'read' },
        { resource: 'accounts', action: 'read' },
        { resource: 'deposits', action: 'create' },
        { resource: 'deposits', action: 'read' },
        { resource: 'withdrawals', action: 'create' },
        { resource: 'withdrawals', action: 'read' },
        { resource: 'withdrawals', action: 'approve' }, // For withdrawal limits
        { resource: 'transfers', action: 'create' },
        { resource: 'transfers', action: 'read' },
        { resource: 'savings', action: 'create' },
        { resource: 'savings', action: 'read' },
        { resource: 'shares', action: 'create' },
        { resource: 'shares', action: 'read' },
        { resource: 'fixed_deposits', action: 'create' },
        { resource: 'fixed_deposits', action: 'read' },
        { resource: 'reports', action: 'read' },
        // Messaging
        { resource: 'messaging', action: 'create' },
        { resource: 'messaging', action: 'read' },
        // Beneficiaries
        { resource: 'beneficiaries', action: 'create' },
        { resource: 'beneficiaries', action: 'read' },
        // Standing Instructions
        { resource: 'standing_instructions', action: 'create' },
        { resource: 'standing_instructions', action: 'read' },
        // Account Liens
        { resource: 'account_liens', action: 'read' },
    ],
    [UserRole.LOAN_OFFICER]: [
        { resource: 'members', action: 'read' },
        { resource: 'accounts', action: 'read' },
        { resource: 'loans', action: 'create' },
        { resource: 'loans', action: 'read' },
        { resource: 'loans', action: 'update' },
        { resource: 'loan_applications', action: 'create' },
        { resource: 'loan_applications', action: 'read' },
        { resource: 'loan_applications', action: 'update' },
        { resource: 'loan_applications', action: 'approve' },
        { resource: 'repayments', action: 'create' },
        { resource: 'repayments', action: 'read' },
        { resource: 'reports', action: 'read' },
        // Account Liens (for loan collateral)
        { resource: 'account_liens', action: 'create' },
        { resource: 'account_liens', action: 'read' },
    ],
    [UserRole.ACCOUNTANT]: [
        { resource: 'members', action: 'read' },
        { resource: 'accounts', action: 'read' },
        { resource: 'transactions', action: 'read' },
        { resource: 'chart_of_accounts', action: 'create' },
        { resource: 'chart_of_accounts', action: 'read' },
        { resource: 'chart_of_accounts', action: 'update' },
        { resource: 'chart_of_accounts', action: 'approve' },
        { resource: 'journal_entries', action: 'create' },
        { resource: 'journal_entries', action: 'read' },
        { resource: 'journal_entries', action: 'update' },
        { resource: 'journal_entries', action: 'approve' },
        { resource: 'financial_periods', action: 'create' },
        { resource: 'financial_periods', action: 'read' },
        { resource: 'financial_periods', action: 'update' },
        { resource: 'financial_periods', action: 'approve' },
        { resource: 'bank_reconciliation', action: 'create' },
        { resource: 'bank_reconciliation', action: 'read' },
        { resource: 'bank_reconciliation', action: 'approve' },
        { resource: 'reports', action: 'read' },
        { resource: 'reports', action: 'export' },
    ],
    [UserRole.AUDITOR]: [
        { resource: 'members', action: 'read' },
        { resource: 'accounts', action: 'read' },
        { resource: 'transactions', action: 'read' },
        { resource: 'audit_logs', action: 'read' },
        { resource: 'journal_entries', action: 'read' },
        { resource: 'reports', action: 'read' },
        { resource: 'reports', action: 'export' },
        // Additional read-only access
        { resource: 'messaging', action: 'read' },
        { resource: 'beneficiaries', action: 'read' },
        { resource: 'account_liens', action: 'read' },
        { resource: 'fee_schedules', action: 'read' },
        { resource: 'transaction_limits', action: 'read' },
        { resource: 'configuration', action: 'read' },
    ],
    [UserRole.MEMBER]: [
        { resource: 'accounts', action: 'read' }, // Own accounts only
        { resource: 'transactions', action: 'read' }, // Own transactions only
        { resource: 'loan_applications', action: 'create' }, // Own applications
        { resource: 'loan_applications', action: 'read' }, // Own applications
        { resource: 'deposits', action: 'create' }, // Own deposits
        { resource: 'deposits', action: 'read' }, // Own deposits
        { resource: 'withdrawals', action: 'create' }, // Own withdrawals
        { resource: 'withdrawals', action: 'read' }, // Own withdrawals
        { resource: 'shares', action: 'read' }, // Own share holdings
        { resource: 'fixed_deposits', action: 'read' }, // Own FDs
        { resource: 'statements', action: 'read' }, // Own statements
        { resource: 'statements', action: 'export' }, // Download own statements
        // Own beneficiaries & standing instructions
        { resource: 'beneficiaries', action: 'read' },
        { resource: 'standing_instructions', action: 'read' },
    ],
    [UserRole.AGENT]: [
        { resource: 'members', action: 'read' },
        { resource: 'accounts', action: 'read' },
        { resource: 'deposits', action: 'create' },
        { resource: 'deposits', action: 'read' },
        { resource: 'withdrawals', action: 'create' },
        { resource: 'withdrawals', action: 'read' },
        { resource: 'transfers', action: 'create' },
        { resource: 'transfers', action: 'read' },
        { resource: 'reports', action: 'read' },
    ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(userRole: string, resource: string, action: string): boolean {
    const role = userRole as UserRole;
    const permissions = ROLE_PERMISSIONS[role];

    if (!permissions) {
        return false;
    }

    // Check wildcard permissions (system admin)
    const hasWildcard = permissions.some(p => p.resource === '*' && p.action === action);
    if (hasWildcard) {
        return true;
    }

    // Check specific permission
    return permissions.some(p => p.resource === resource && p.action === action);
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(userRole: string): Permission[] {
    const role = userRole as UserRole;
    return ROLE_PERMISSIONS[role] || [];
}

/**
 * Enforce permission check middleware factory
 * Usage: app.post('/loans/approve', enforcePermission('loans', 'approve'), handler)
 */
export function enforcePermission(resource: string, action: string) {
    return async (c: Context<Env>, next: Next) => {
        const user = c.get('user');

        if (!user || !user.role) {
            throw new UnauthorizedError('Authentication required');
        }

        if (!hasPermission(user.role, resource, action)) {
            appLogger.warn('Permission denied', {
                user_id: user.id,
                user_role: user.role,
                required_resource: resource,
                required_action: action,
                path: c.req.path,
                requestId: c.get('requestId'),
            });

            throw new ForbiddenError(
                `Permission denied. This operation requires: ${resource}:${action}`
            );
        }

        await next();
    };
}

/**
 * Enforce multiple permissions (any match)
 * Usage: app.post('/approve', enforceAnyPermission([{resource: 'loans', action: 'approve'}, ...]), handler)
 */
export function enforceAnyPermission(permissions: Permission[]) {
    return async (c: Context<Env>, next: Next) => {
        const user = c.get('user');

        if (!user || !user.role) {
            throw new UnauthorizedError('Authentication required');
        }

        const hasAny = permissions.some(p => hasPermission(user.role!, p.resource, p.action));

        if (!hasAny) {
            appLogger.warn('Any permission denied', {
                user_id: user.id,
                user_role: user.role,
                required_permissions: permissions,
                path: c.req.path,
                requestId: c.get('requestId'),
            });

            const permString = permissions
                .map(p => `${p.resource}:${p.action}`)
                .join(' OR ');

            throw new ForbiddenError(
                `Permission denied. This operation requires one of: ${permString}`
            );
        }

        await next();
    };
}

/**
 * Enforce all permissions (all must match)
 * Usage: app.post('/critical', enforceAllPermissions([...]), handler)
 */
export function enforceAllPermissions(permissions: Permission[]) {
    return async (c: Context<Env>, next: Next) => {
        const user = c.get('user');

        if (!user || !user.role) {
            throw new UnauthorizedError('Authentication required');
        }

        const hasAll = permissions.every(p => hasPermission(user.role!, p.resource, p.action));

        if (!hasAll) {
            appLogger.warn('All permissions denied', {
                user_id: user.id,
                user_role: user.role,
                required_permissions: permissions,
                path: c.req.path,
                requestId: c.get('requestId'),
            });

            const permString = permissions
                .map(p => `${p.resource}:${p.action}`)
                .join(' AND ');

            throw new ForbiddenError(
                `Permission denied. This operation requires all of: ${permString}`
            );
        }

        await next();
    };
}

/**
 * Role-based access control middleware
 * Sets up role context for route handlers
 */
export async function rbacMiddleware(c: Context<Env>, next: Next) {
    const user = c.get('user');

    if (user && user.role) {
        // Attach permissions to context
        const permissions = getRolePermissions(user.role);
        c.set('userPermissions', permissions);

        appLogger.debug('RBAC check', {
            user_id: user.id,
            user_role: user.role,
            permissionCount: permissions.length,
        });
    }

    await next();
}

/**
 * Export role enum and utilities
 */
export const RoleUtils = {
    hasPermission,
    getRolePermissions,
    enforcePermission,
    enforceAnyPermission,
    enforceAllPermissions,
};
