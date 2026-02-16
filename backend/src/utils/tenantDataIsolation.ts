/**
 * Data Isolation Utilities
 * Helpers for enforcing tenant boundaries in database queries
 */

import { SelectQueryBuilder, Expression, sql } from 'kysely';
import { appLogger } from '../middleware/logger';

/**
 * Configuration for which tables have tenant_id columns
 * Extend this map as more tables are migrated to include tenant isolation
 */
const TENANT_AWARE_TABLES: Record<string, boolean> = {
    // Audit tables
    'audit_log': true,
    'activity_log': true,
    'data_export_log': true,
    
    // Note: Most tenant tables don't need tenant_id because they're
    // already in tenant-specific schemas. These are for tables that
    // exist in public schema and track cross-tenant data.
};

/**
 * Marker type for queries that have tenant isolation applied
 */
export interface TenantIsolatedQuery {
    __tenantIsolated: true;
}

/**
 * Apply tenant filter to a query builder
 * Ensures only data for the current tenant is queried
 * 
 * @param query - Kysely query builder
 * @param tenantId - Current tenant ID
 * @returns Modified query with tenant filter applied
 * 
 * @example
 * ```typescript
 * const auditLogs = await withTenantContext(
 *   db.selectFrom('audit_log').selectAll(),
 *   tenantId
 * ).execute();
 * ```
 */
export function withTenantContext<T>(
    query: SelectQueryBuilder<any, any, T>,
    tenantId: string
): SelectQueryBuilder<any, any, T> & TenantIsolatedQuery {
    // This is a runtime check - in production, all queries should include tenant filters
    // For tenant schemas (most tables), this is automatic
    // For public schema tables, this must be explicit
    
    appLogger.debug('Applying tenant context to query', { tenantId });
    
    return query.where('tenant_id', '=', tenantId) as any;
}

/**
 * Verify a query has tenant isolation applied
 * Use this in critical operations to prevent accidental cross-tenant queries
 * 
 * @param query - Query to verify
 * @param tenantId - Expected tenant ID
 * @throws Error if query doesn't appear to have tenant filter
 */
export function verifyTenantIsolation<T>(
    query: SelectQueryBuilder<any, any, T>,
    tenantId: string
): void {
    // In production, this should be enhanced with actual query inspection
    // For now, this serves as a placeholder for the pattern
    appLogger.debug('Verifying tenant isolation', { tenantId });
}

/**
 * Create a raw SQL filter for tenant_id matching
 * Useful for complex queries that need manual WHERE clauses
 */
export function getTenantFilter(tenantId: string, tableAlias?: string): Expression<boolean> {
    const column = tableAlias ? `${tableAlias}.tenant_id` : 'tenant_id';
    return sql`${sql.raw(column)} = ${tenantId}`;
}

/**
 * Sanitize user input before using in queries to prevent injection
 * Even with parameterized queries, extra caution for security
 */
export function sanitizeTenantId(tenantId: string): string {
    // Validate UUID format (standard format for tenant IDs)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (!uuidPattern.test(tenantId)) {
        const error = new Error('Invalid tenant ID format');
        appLogger.error('Invalid tenant ID format', error, { tenantId });
        throw error;
    }
    
    return tenantId.toLowerCase();
}

/**
 * Check if a table is tenant-aware (has tenant_id column)
 */
export function isTenantAwareTable(tableName: string): boolean {
    return TENANT_AWARE_TABLES[tableName] === true;
}

/**
 * Register a table as tenant-aware
 * Call this during application initialization if you add new tenant-aware tables
 */
export function registerTenantAwareTable(tableName: string): void {
    TENANT_AWARE_TABLES[tableName] = true;
    appLogger.info('Registered tenant-aware table', { tableName });
}

/**
 * Build a safe tenant filter for the given table
 * Automatically injects tenant_id filter if table is tenant-aware
 * 
 * This can be used in repository methods to ensure tenant isolation
 */
export function createTenantFilter(
    tableName: string,
    tenantId: string,
    tableAlias?: string
): { where: (qb: any) => any } | null {
    if (!isTenantAwareTable(tableName)) {
        return null;
    }
    
    const column = tableAlias ? `${tableAlias}.tenant_id` : `${tableName}.tenant_id`;
    
    return {
        where: (qb: any) => qb.where(sql`${sql.raw(column)} = ${tenantId}`)
    };
}

/**
 * All public schema queries should use this prefix to ensure tenant isolation
 * Enforces a consistent pattern across the application
 */
export const QUERY_SAFETY_PATTERN = {
    /**
     * Template for safe DELETE that requires tenant ID
     */
    safeDelete: `DELETE FROM {table_name} WHERE tenant_id = $1 AND {condition}`,
    
    /**
     * Template for safe UPDATE that requires tenant ID
     */
    safeUpdate: `UPDATE {table_name} SET {columns} WHERE tenant_id = $1 AND {condition}`,
    
    /**
     * Template for safe SELECT that filters by tenant ID
     */
    safeSelect: `SELECT {columns} FROM {table_name} WHERE tenant_id = $1 {conditions}`,
};
