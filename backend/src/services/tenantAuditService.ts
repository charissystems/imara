/**
 * Tenant Access Audit Service
 *
 * Centralised security audit layer that records all tenant-boundary events
 * across two persistence targets:
 *
 *   1. public.tenant_audit_log  – cross-tenant / infrastructure events
 *   2. <schema>.security_events – per-tenant security events
 *
 * Every method is fire-and-forget: failures are logged but never propagate
 * to callers, so auditing cannot break business flows.
 *
 * Requirements: SEC-002, SEC-008, SEC-009
 */

import { Kysely } from 'kysely';
import { getPool } from '../config/database';
import { appLogger } from '../middleware/logger';

// ────────────────────────────────────────────────────────────
//  Types
// ────────────────────────────────────────────────────────────

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export type TenantSecurityEventType =
    | 'CROSS_TENANT_ACCESS'
    | 'INVALID_SCHEMA_NAME'
    | 'DELETED_USER_ACCESS'
    | 'INACTIVE_TENANT_ACCESS'
    | 'CROSS_TENANT_SENSITIVE_OP'
    | 'SUPER_ADMIN_CROSS_TENANT'
    | 'SCHEMA_VALIDATION_FAILURE'
    | 'ROLE_ESCALATION_ATTEMPT'
    | 'CONNECTION_ISOLATION_FAILURE'
    | 'RLS_POLICY_VIOLATION'
    | 'SUSPICIOUS_QUERY_PATTERN'
    | 'TENANT_ACCESS_GRANTED'
    | 'TENANT_ACCESS_DENIED';

export interface TenantAccessEvent {
    /** Canonical event type */
    event_type: TenantSecurityEventType;
    severity: SecuritySeverity;
    description: string;

    /** Request context */
    user_id?: string;
    user_email?: string;
    ip_address?: string;
    user_agent?: string;
    request_id?: string;
    request_path?: string;
    request_method?: string;

    /** Tenant context */
    tenant_id?: string;
    tenant_code?: string;
    schema_name?: string;

    /** Extra payload for forensics */
    metadata?: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────
//  Public Audit Log (infrastructure-level)
// ────────────────────────────────────────────────────────────

/**
 * Write an event to public.tenant_audit_log.
 * Works even when a tenant schema is unreachable or invalid.
 */
export async function logToPublicAudit(event: TenantAccessEvent): Promise<void> {
    try {
        const pool = getPool();
        await pool.query(
            `INSERT INTO public.tenant_audit_log
                (schema_name, tenant_code, operation, details)
             VALUES ($1, $2, $3, $4)`,
            [
                event.schema_name || 'unknown',
                event.tenant_code || event.event_type,
                event.event_type,
                JSON.stringify({
                    severity: event.severity,
                    description: event.description,
                    user_id: event.user_id,
                    user_email: event.user_email,
                    ip_address: event.ip_address,
                    user_agent: event.user_agent,
                    request_id: event.request_id,
                    request_path: event.request_path,
                    request_method: event.request_method,
                    tenant_id: event.tenant_id,
                    timestamp: new Date().toISOString(),
                    ...event.metadata,
                }),
            ],
        );
    } catch (err) {
        appLogger.error('Failed to persist public audit event', err as Error, {
            event_type: event.event_type,
        });
    }
}

// ────────────────────────────────────────────────────────────
//  Per-Tenant Security Events
// ────────────────────────────────────────────────────────────

/**
 * Write an event to <schema>.security_events (per-tenant table).
 * Requires a Kysely instance scoped to the correct tenant schema.
 *
 * The security_events table's event_type CHECK constraint limits values
 * to: failed_login, successful_login, password_change, permission_change,
 * account_locked, unusual_activity, data_access, api_abuse.
 * We map our richer event types into the closest permitted bucket.
 */
export async function logToTenantSecurityEvents(
    db: Kysely<any>,
    event: TenantAccessEvent,
): Promise<void> {
    try {
        // Map our event types to the CHECK-constrained values
        const dbEventType = mapEventType(event.event_type);

        await (db as any)
            .insertInto('security_events')
            .values({
                user_id: event.user_id || null,
                staff_ip_address: event.ip_address || null,
                event_type: dbEventType,
                severity: event.severity,
                description: formatDescription(event),
                action_taken: resolveAction(event),
                requires_investigation: event.severity === 'critical' || event.severity === 'high',
                timestamp: new Date(),
                created_at: new Date(),
            })
            .execute();
    } catch (err) {
        appLogger.error('Failed to persist tenant security event', err as Error, {
            schema: event.schema_name,
            event_type: event.event_type,
        });
    }
}

// ────────────────────────────────────────────────────────────
//  Combined Audit (both targets)
// ────────────────────────────────────────────────────────────

/**
 * Log a security event to both public and tenant-specific audit tables.
 * If no tenant DB context is available, only the public log is written.
 */
export async function logTenantSecurityEvent(
    event: TenantAccessEvent,
    tenantDb?: Kysely<any>,
): Promise<void> {
    // Application-level structured log (always)
    const logLevel = event.severity === 'critical' || event.severity === 'high'
        ? 'error'
        : event.severity === 'medium' ? 'warn' : 'info';

    appLogger[logLevel](`[SECURITY] ${event.event_type}: ${event.description}`, undefined, {
        event_type: event.event_type,
        severity: event.severity,
        user_id: event.user_id,
        tenant_id: event.tenant_id,
        schema_name: event.schema_name,
        ip_address: event.ip_address,
        request_path: event.request_path,
        request_method: event.request_method,
        request_id: event.request_id,
    });

    // Fire both persistence paths in parallel (neither blocks)
    const jobs: Promise<void>[] = [logToPublicAudit(event)];

    if (tenantDb) {
        jobs.push(logToTenantSecurityEvents(tenantDb, event));
    }

    await Promise.allSettled(jobs);
}

// ────────────────────────────────────────────────────────────
//  Query Helpers (for admin / super-admin review)
// ────────────────────────────────────────────────────────────

export interface SecurityEventFilter {
    severity?: SecuritySeverity;
    event_type?: string;
    user_id?: string;
    start_date?: Date;
    end_date?: Date;
    limit?: number;
}

/**
 * Query tenant-level security events.
 * Intended for admin dashboards and compliance reports.
 */
export async function queryTenantSecurityEvents(
    db: Kysely<any>,
    filter: SecurityEventFilter = {},
): Promise<any[]> {
    try {
        let query = (db as any)
            .selectFrom('security_events')
            .selectAll()
            .orderBy('timestamp', 'desc');

        if (filter.severity) {
            query = query.where('severity', '=', filter.severity);
        }
        if (filter.event_type) {
            query = query.where('event_type', '=', filter.event_type);
        }
        if (filter.user_id) {
            query = query.where('user_id', '=', filter.user_id);
        }
        if (filter.start_date) {
            query = query.where('timestamp', '>=', filter.start_date);
        }
        if (filter.end_date) {
            query = query.where('timestamp', '<=', filter.end_date);
        }

        query = query.limit(filter.limit ?? 200);
        return await query.execute();
    } catch (err) {
        appLogger.error('Failed to query security events', err as Error);
        return [];
    }
}

/**
 * Query cross-tenant (public) audit log.
 * Intended for super-admin forensic review.
 */
export async function queryPublicAuditLog(
    filter: SecurityEventFilter & { schema_name?: string } = {},
): Promise<any[]> {
    try {
        const pool = getPool();
        const conditions: string[] = [];
        const params: any[] = [];
        let paramIdx = 0;

        if (filter.schema_name) {
            conditions.push(`schema_name = $${++paramIdx}`);
            params.push(filter.schema_name);
        }
        if (filter.event_type) {
            conditions.push(`operation = $${++paramIdx}`);
            params.push(filter.event_type);
        }
        if (filter.start_date) {
            conditions.push(`performed_at >= $${++paramIdx}`);
            params.push(filter.start_date);
        }
        if (filter.end_date) {
            conditions.push(`performed_at <= $${++paramIdx}`);
            params.push(filter.end_date);
        }

        const where = conditions.length > 0
            ? `WHERE ${conditions.join(' AND ')}`
            : '';

        const limit = filter.limit ?? 200;
        const result = await pool.query(
            `SELECT * FROM public.tenant_audit_log ${where}
             ORDER BY performed_at DESC LIMIT $${++paramIdx}`,
            [...params, limit],
        );

        return result.rows;
    } catch (err) {
        appLogger.error('Failed to query public audit log', err as Error);
        return [];
    }
}

// ────────────────────────────────────────────────────────────
//  Internal Helpers
// ────────────────────────────────────────────────────────────

/**
 * Map our rich event types to the CHECK-constrained `event_type` values
 * in the security_events table.
 */
function mapEventType(eventType: TenantSecurityEventType): string {
    const MAP: Record<TenantSecurityEventType, string> = {
        CROSS_TENANT_ACCESS: 'unusual_activity',
        INVALID_SCHEMA_NAME: 'unusual_activity',
        DELETED_USER_ACCESS: 'unusual_activity',
        INACTIVE_TENANT_ACCESS: 'unusual_activity',
        CROSS_TENANT_SENSITIVE_OP: 'unusual_activity',
        SUPER_ADMIN_CROSS_TENANT: 'data_access',
        SCHEMA_VALIDATION_FAILURE: 'unusual_activity',
        ROLE_ESCALATION_ATTEMPT: 'unusual_activity',
        CONNECTION_ISOLATION_FAILURE: 'unusual_activity',
        RLS_POLICY_VIOLATION: 'unusual_activity',
        SUSPICIOUS_QUERY_PATTERN: 'api_abuse',
        TENANT_ACCESS_GRANTED: 'data_access',
        TENANT_ACCESS_DENIED: 'unusual_activity',
    };
    return MAP[eventType] || 'unusual_activity';
}

/**
 * Build a rich description string for the security_events.description column.
 */
function formatDescription(event: TenantAccessEvent): string {
    const parts = [
        `[${event.event_type}]`,
        event.description,
        event.request_method && event.request_path
            ? `| ${event.request_method} ${event.request_path}`
            : '',
        event.request_id ? `| req=${event.request_id}` : '',
    ];
    return parts.filter(Boolean).join(' ');
}

/**
 * Determine the action_taken value based on event type.
 */
function resolveAction(event: TenantAccessEvent): string {
    switch (event.event_type) {
        case 'CROSS_TENANT_ACCESS':
        case 'CROSS_TENANT_SENSITIVE_OP':
            return 'Request blocked — 403 Forbidden';
        case 'DELETED_USER_ACCESS':
            return 'Request blocked — 401 Unauthorized';
        case 'INACTIVE_TENANT_ACCESS':
            return 'Request blocked — tenant suspended';
        case 'INVALID_SCHEMA_NAME':
        case 'SCHEMA_VALIDATION_FAILURE':
            return 'Request blocked — invalid schema';
        case 'SUPER_ADMIN_CROSS_TENANT':
            return 'Access permitted — super-admin override';
        case 'RLS_POLICY_VIOLATION':
            return 'Query blocked by RLS policy';
        default:
            return 'Logged for review';
    }
}
