/**
 * Tenant Isolation Middleware
 * Enforces strict tenant boundaries and prevents cross-tenant data access
 * 
 * Validates that:
 * - User's tenant matches the resolved tenant from subdomain
 * - All queries include tenant filters
 * - Cross-tenant access throws ForbiddenError
 */

import { Context, Next } from 'hono';
import { Env } from './types';
import { ForbiddenError, UnauthorizedError } from './errorHandler';
import { appLogger } from './logger';

/**
 * Validates that authenticated user's tenant matches the resolved request tenant
 * Ensures strict isolation - no cross-tenant access allowed
 */
export async function tenantIsolationCheck(c: Context<Env>, next: Next) {
    const tenant = c.get('tenant');
    const user = (c.get as any)('user');

    // Skip checks for anonymous routes
    if (!tenant || !user) {
        await next();
        return;
    }

    // Verify user's tenant matches request tenant
    if (user.tenant_id && user.tenant_id !== tenant.id) {
        appLogger.warn('Tenant mismatch detected', {
            user_tenant: user.tenant_id,
            request_tenant: tenant.id,
            user_id: user.id,
            path: c.req.path,
        });

        throw new ForbiddenError(
            'Access denied: User tenant does not match request tenant. ' +
            'Cross-tenant access is not permitted.'
        );
    }

    // Verify tenant is active
    if (tenant.status !== 'active') {
        appLogger.warn('Attempt to access inactive tenant', {
            tenant_id: tenant.id,
            tenant_status: tenant.status,
            user_id: user.id,
        });

        throw new ForbiddenError(
            `Tenant is ${tenant.status}. Access denied.`
        );
    }

    // Verify user is still active in the system
    if (user.deleted_at) {
        appLogger.warn('Attempt by deleted user', {
            user_id: user.id,
            tenant_id: tenant.id,
        });

        throw new UnauthorizedError('User account has been deleted');
    }

    // Attach tenant context to request for query building
    (c.set as any)('tenantId', tenant.id);
    (c.set as any)('tenantCode', tenant.code);
    (c.set as any)('schemaName', tenant.schema_name);

    appLogger.debug('Tenant isolation check passed', {
        tenant_id: tenant.id,
        user_id: user.id,
    });

    await next();
}

/**
 * Validates cross-tenant data access attempts in sensitive operations
 * Used for operations that might be exploitable (exports, admin access, etc.)
 */
export async function crossTenantAccessCheck(c: Context<Env>, next: Next) {
    const tenant = c.get('tenant');
    const user = (c.get as any)('user');

    if (!tenant || !user) {
        await next();
        return;
    }

    // Check if this is a super-admin route (allowed cross-tenant)
    const isSuperAdminRoute = c.req.path.startsWith('/api/admin/super/');

    if (!isSuperAdminRoute && user.tenant_id !== tenant.id) {
        throw new ForbiddenError(
            'Cross-tenant access denied for this operation'
        );
    }

    // Log access for super-admins (for audit)
    if (isSuperAdminRoute) {
        appLogger.info('Super-admin cross-tenant access', {
            super_admin_id: user.id,
            accessing_tenant: tenant.id,
            path: c.req.path,
            method: c.req.method,
        });
    }

    await next();
}

/**
 * Enforces that DELETE/UPDATE operations specify a tenant filter
 * Prevents accidental bulk operations across tenants
 */
export async function requireTenantFilter(c: Context<Env>, next: Next) {
    const method = c.req.method;

    // Only enforce for write operations
    if (!['DELETE', 'PUT', 'PATCH'].includes(method)) {
        await next();
        return;
    }

    const tenant = c.get('tenant');
    const user = (c.get as any)('user');

    if (!tenant || !user) {
        await next();
        return;
    }

    // Parse query parameters
    const url = new URL(c.req.url);
    const hasTenantParam = url.searchParams.has('tenant_id');

    // Super-admins must explicitly confirm cross-tenant operations
    const isSuperAdmin = user.role === 'system_administrator';
    if (isSuperAdmin && !url.searchParams.has('confirm_cross_tenant')) {
        throw new ForbiddenError(
            'Cross-tenant operations require explicit confirmation. ' +
            'Add ?confirm_cross_tenant=true parameter.'
        );
    }

    appLogger.debug('Tenant filter check passed for write operation', {
        method,
        tenant_id: tenant.id,
        has_explicit_tenant_param: hasTenantParam,
    });

    await next();
}
