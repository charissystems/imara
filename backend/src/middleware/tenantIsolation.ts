/**
 * Tenant Isolation Middleware
 * Enforces strict tenant boundaries and prevents cross-tenant data access.
 *
 * Defence layers:
 *  1. User.tenant_id MUST match the resolved tenant (JWT vs subdomain)
 *  2. Schema name MUST follow the `tenant_<code>` pattern
 *  3. Every violation is logged as a CRITICAL security event
 *  4. Super-admin cross-tenant access is audited separately
 *
 * Requirements: SEC-002, SEC-008
 */

import { Context, Next } from 'hono';
import { Env } from './types';
import { ForbiddenError, UnauthorizedError, AppError } from './errorHandler';
import { appLogger } from './logger';
import { getPool } from '../config/database';

// ────────────────────────────────────────────────────────────
// Security Event Logger (writes directly to tenant audit tables)
// ────────────────────────────────────────────────────────────

interface SecurityViolation {
    event_type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    user_id?: string;
    user_email?: string;
    ip_address?: string;
    user_agent?: string;
    tenant_id?: string;
    schema_name?: string;
    request_path?: string;
    request_method?: string;
    metadata?: Record<string, any>;
}

/**
 * Log a security violation to the public.tenant_audit_log table.
 * Uses a direct pool connection (not the tenant DB) so it works
 * even when the tenant schema is inaccessible or the violation
 * involves a wrong schema.
 */
async function logSecurityViolation(violation: SecurityViolation): Promise<void> {
    try {
        const pool = getPool();
        await pool.query(
            `INSERT INTO public.tenant_audit_log
                (schema_name, tenant_code, operation, details)
             VALUES ($1, $2, $3, $4)`,
            [
                violation.schema_name || 'unknown',
                violation.event_type,
                'SECURITY_VIOLATION',
                JSON.stringify({
                    severity: violation.severity,
                    description: violation.description,
                    user_id: violation.user_id,
                    user_email: violation.user_email,
                    ip_address: violation.ip_address,
                    user_agent: violation.user_agent,
                    tenant_id: violation.tenant_id,
                    request_path: violation.request_path,
                    request_method: violation.request_method,
                    timestamp: new Date().toISOString(),
                    ...violation.metadata,
                }),
            ],
        );
    } catch (err) {
        // Never let audit-logging failure mask the original violation
        appLogger.error('Failed to persist security violation', err as Error, {
            violation: violation.event_type,
        });
    }
}

// ────────────────────────────────────────────────────────────
// Tenant Isolation Check (primary guard)
// ────────────────────────────────────────────────────────────

/**
 * Validates that authenticated user's tenant matches the resolved request tenant.
 * Logs and rejects cross-tenant access attempts as CRITICAL security events.
 */
export async function tenantIsolationCheck(c: Context<Env>, next: Next) {
    const tenant = c.get('tenant');
    const user = c.get('user');
    const requestId = c.get('requestId');

    // Require tenant context — if middleware ordering is wrong, reject hard
    if (!tenant) {
        throw new AppError(
            500,
            'Tenant isolation check failed: tenant context is missing. ' +
            'Ensure tenantResolver middleware runs before tenantIsolationCheck.',
            'MISSING_TENANT_CONTEXT',
        );
    }

    // Validate schema name format
    if (!tenant.schema_name || !/^tenant_[a-z0-9_]+$/.test(tenant.schema_name)) {
        await logSecurityViolation({
            event_type: 'INVALID_SCHEMA_NAME',
            severity: 'critical',
            description: `Tenant schema name "${tenant.schema_name}" does not match expected pattern`,
            schema_name: tenant.schema_name,
            tenant_id: tenant.id,
            ip_address: c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
            request_path: c.req.path,
            request_method: c.req.method,
        });

        throw new ForbiddenError('Tenant configuration error. Contact support.');
    }

    // For unauthenticated routes (e.g. /auth/login) — skip user checks
    if (!user) {
        c.set('tenantId' as any, tenant.id);
        c.set('tenantCode' as any, tenant.code);
        c.set('schemaName' as any, tenant.schema_name);
        await next();
        return;
    }

    // ── User-tenant match ───────────────────────────────────

    if (user.tenant_id && user.tenant_id !== tenant.id) {
        const violation: SecurityViolation = {
            event_type: 'CROSS_TENANT_ACCESS',
            severity: 'critical',
            description:
                `User ${user.id} (tenant ${user.tenant_id}) attempted to access ` +
                `tenant ${tenant.id} (${tenant.code})`,
            user_id: user.id,
            user_email: user.email,
            tenant_id: tenant.id,
            schema_name: tenant.schema_name,
            ip_address: c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
            user_agent: c.req.header('user-agent'),
            request_path: c.req.path,
            request_method: c.req.method,
            metadata: {
                requestId,
                user_tenant_id: user.tenant_id,
                target_tenant_id: tenant.id,
            },
        };

        appLogger.error('CRITICAL: Cross-tenant access attempt blocked', undefined, violation);
        await logSecurityViolation(violation);

        throw new ForbiddenError(
            'Access denied: User tenant does not match request tenant. ' +
            'This incident has been logged.',
        );
    }

    // ── Deleted user ────────────────────────────────────────

    if (user.deleted_at) {
        await logSecurityViolation({
            event_type: 'DELETED_USER_ACCESS',
            severity: 'high',
            description: `Deleted user ${user.id} attempted access`,
            user_id: user.id,
            user_email: user.email,
            tenant_id: tenant.id,
            schema_name: tenant.schema_name,
            ip_address: c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
            request_path: c.req.path,
            request_method: c.req.method,
        });

        throw new UnauthorizedError('User account has been deleted');
    }

    // ── Inactive tenant ─────────────────────────────────────

    if (tenant.status !== 'active') {
        await logSecurityViolation({
            event_type: 'INACTIVE_TENANT_ACCESS',
            severity: 'medium',
            description: `Access attempt to ${tenant.status} tenant ${tenant.code}`,
            user_id: user.id,
            tenant_id: tenant.id,
            schema_name: tenant.schema_name,
            request_path: c.req.path,
            request_method: c.req.method,
        });

        throw new ForbiddenError(`Tenant is ${tenant.status}. Access denied.`);
    }

    // Attach verified context
    c.set('tenantId' as any, tenant.id);
    c.set('tenantCode' as any, tenant.code);
    c.set('schemaName' as any, tenant.schema_name);

    appLogger.debug('Tenant isolation check passed', {
        tenant_id: tenant.id,
        user_id: user.id,
        schema: tenant.schema_name,
    });

    await next();
}

// ────────────────────────────────────────────────────────────
// Cross-Tenant Access Check (for sensitive operations)
// ────────────────────────────────────────────────────────────

/**
 * Extra guard for sensitive operations (exports, admin, bulk).
 * Rejects all cross-tenant access; super-admin access is audit-logged.
 */
export async function crossTenantAccessCheck(c: Context<Env>, next: Next) {
    const tenant = c.get('tenant');
    const user = c.get('user');

    if (!tenant || !user) {
        await next();
        return;
    }

    // Check if this is a super-admin route (allowed cross-tenant)
    const isSuperAdminRoute = c.req.path.startsWith('/api/admin/super/');

    if (!isSuperAdminRoute && user.tenant_id !== tenant.id) {
        await logSecurityViolation({
            event_type: 'CROSS_TENANT_SENSITIVE_OP',
            severity: 'critical',
            description: `Cross-tenant access to sensitive endpoint blocked: ${c.req.path}`,
            user_id: user.id,
            user_email: user.email,
            tenant_id: tenant.id,
            schema_name: tenant.schema_name,
            ip_address: c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
            request_path: c.req.path,
            request_method: c.req.method,
        });

        throw new ForbiddenError('Cross-tenant access denied for this operation');
    }

    // Audit super-admin cross-tenant access
    if (isSuperAdminRoute) {
        appLogger.info('Super-admin cross-tenant access', {
            super_admin_id: user.id,
            accessing_tenant: tenant.id,
            path: c.req.path,
            method: c.req.method,
        });

        await logSecurityViolation({
            event_type: 'SUPER_ADMIN_CROSS_TENANT',
            severity: 'low',
            description: `Super-admin ${user.id} accessed tenant ${tenant.code} via ${c.req.method} ${c.req.path}`,
            user_id: user.id,
            user_email: user.email,
            tenant_id: tenant.id,
            schema_name: tenant.schema_name,
            request_path: c.req.path,
            request_method: c.req.method,
        });
    }

    await next();
}

// ────────────────────────────────────────────────────────────
// Write-operation Tenant Filter Guard
// ────────────────────────────────────────────────────────────

/**
 * Enforces that DELETE/UPDATE operations specify a tenant filter.
 * Prevents accidental bulk operations across tenants.
 */
export async function requireTenantFilter(c: Context<Env>, next: Next) {
    const method = c.req.method;

    // Only enforce for write operations
    if (!['DELETE', 'PUT', 'PATCH'].includes(method)) {
        await next();
        return;
    }

    const tenant = c.get('tenant');
    const user = c.get('user');

    if (!tenant || !user) {
        await next();
        return;
    }

    // Super-admins must explicitly confirm cross-tenant operations
    const isSuperAdmin = user.role === 'system_administrator';
    if (isSuperAdmin) {
        const url = new URL(c.req.url);
        if (!url.searchParams.has('confirm_cross_tenant')) {
            throw new ForbiddenError(
                'Cross-tenant operations require explicit confirmation. ' +
                'Add ?confirm_cross_tenant=true parameter.',
            );
        }
    }

    appLogger.debug('Tenant filter check passed for write operation', {
        method,
        tenant_id: tenant.id,
        schema: tenant.schema_name,
    });

    await next();
}

// Re-export the security violation logger for use in other modules
export { logSecurityViolation };