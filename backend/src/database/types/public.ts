import { ColumnType, Generated, JSONColumnType } from 'kysely';
import { DateColumn, NullableDateColumn } from './common';

/*
 * PUBLIC / REGISTRY SCHEMA (GLOBAL DATA)
 * Tables existing in the 'public' schema, accessible across all tenants (Tenants, Currencies, Migrations)
 */

export interface TenantsTable {
    id: Generated<string>;

    // Identification
    code: string;
    sacco_name: string;
    short_name: string | null;
    subdomain: string;
    schema_name: string;

    // Contact
    contact_email: string;
    contact_phone: string;
    website: string | null;
    address: JSONColumnType<Record<string, unknown>>;

    // Branding & Subscription
    branding: JSONColumnType<{
        logo_url?: string | null;
        primary_color?: string;
        secondary_color?: string;
    }>;
    subscription_tier: string;
    subscription_expires_at: NullableDateColumn;
    max_users: number;
    max_members: number;

    // Status
    status: 'active' | 'suspended' | 'inactive';
    is_active: ColumnType<boolean, boolean | undefined>;
    settings: JSONColumnType<Record<string, unknown>>;

    // Audit
    created_by: string | null;
    updated_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface TenantMigrationsTable {
    id: Generated<string>;
    tenant_id: string;
    migration_name: string;
    migration_version: number;
    applied_at: DateColumn;
    executed_by: string | null;
}

export interface TenantAuditLogTable {
    id: Generated<string>;
    schema_name: string;
    tenant_code: string | null;
    operation: string; // 'CREATE', 'DROP', 'SOFT_DELETE', etc.
    performed_by: string;
    performed_at: DateColumn;
    details: JSONColumnType<Record<string, unknown>>;
    error_message: string | null;
}

export interface CurrenciesTable {
    code: string;
    name: string;
    symbol: string;
    decimal_places: number;
    is_active: ColumnType<boolean | undefined, boolean>;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface TenantBackupsTable {
    id: Generated<string>;
    tenant_id: string;
    backup_number: string;
    backup_type: ColumnType<string, string | undefined>;
    backup_location: string;
    backup_size_bytes: number | null;
    status: ColumnType<string, string | undefined>;
    verification_timestamp: DateColumn | null;
    verification_result: string | null;
    created_at: DateColumn;
    expires_at: DateColumn | null;
    retention_days: ColumnType<number, number | undefined>;
    can_restore: ColumnType<boolean, boolean | undefined>;
    last_restored_at: DateColumn | null;
    restored_to_tenant_id: string | null;
    backed_by: string | null;
    backup_reason: string | null;
    checksum: string | null;
}

export interface TenantRetentionPoliciesTable {
    id: Generated<string>;
    tenant_id: string;
    audit_log_retention_days: ColumnType<number, number | undefined>;
    activity_log_retention_days: ColumnType<number, number | undefined>;
    transaction_retention_years: ColumnType<number, number | undefined>;
    deleted_member_retention_days: ColumnType<number, number | undefined>;
    auto_purge_enabled: ColumnType<boolean, boolean | undefined>;
    next_purge_date: DateColumn | null;
    last_purge_run_at: DateColumn | null;
    created_at: DateColumn;
    updated_at: DateColumn;
}

/*
 * IDENTITY & ACCESS MANAGEMENT (IAM)
 * Definitions for Roles, Permissions, and their relationships to control system access
 */

export interface RolesTable {
    id: Generated<string>;
    name: string;
    display_name: string | null;
    description: string | null;
    is_system_role: ColumnType<boolean, boolean | undefined>;
    is_active: ColumnType<boolean, boolean | undefined>;
    hierarchy_level: ColumnType<number, number | undefined, number>;
    created_by: string | null;
    updated_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface PermissionsTable {
    id: Generated<string>;
    resource: string;
    action: string;
    scope: ColumnType<string, string | undefined, string>;
    name: string;
    description: string | null;
    is_system_permission: ColumnType<boolean, boolean | undefined>;
    requires_approval: ColumnType<boolean, boolean | undefined>;
    approval_threshold: number | null;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface RolePermissionsTable {
    id: Generated<string>;
    role_id: string;
    permission_id: string;
    is_granted: ColumnType<boolean, boolean | undefined>;
    conditions: JSONColumnType<Record<string, unknown>> | null;
    restrictions: JSONColumnType<Record<string, unknown>> | null;
    granted_by: string | null;
    granted_at: DateColumn;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}
