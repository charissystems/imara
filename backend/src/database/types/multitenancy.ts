/**
 * Multitenancy and administration types
 * Backup, restore, setup tracking, and tenant resource monitoring
 */

import { Generated, Insertable, Selectable, Updateable } from 'kysely';
import { DecimalColumn, DateColumn, NullableDateColumn } from './common';

// ─────────────────────────────────────────────────────────────
// SETUP & ONBOARDING
// ─────────────────────────────────────────────────────────────

export interface TenantSetupChecklist {
  id: Generated<string>;
  tenant_id: string;

  // Onboarding Steps
  schema_created: Generated<boolean>;
  schema_created_at: NullableDateColumn;

  admin_user_created: Generated<boolean>;
  admin_user_created_at: NullableDateColumn;

  initial_config_completed: Generated<boolean>;
  initial_config_completed_at: NullableDateColumn;

  branding_configured: Generated<boolean>;
  branding_configured_at: NullableDateColumn;

  first_member_registered: Generated<boolean>;
  first_member_registered_at: NullableDateColumn;

  first_transaction_posted: Generated<boolean>;
  first_transaction_posted_at: NullableDateColumn;

  email_configured: Generated<boolean>;
  email_configured_at: NullableDateColumn;

  sms_configured: Generated<boolean>;
  sms_configured_at: NullableDateColumn;

  mobile_money_connected: Generated<boolean>;
  mobile_money_connected_at: NullableDateColumn;

  // Overall Progress
  onboarding_completed_at: NullableDateColumn;
  onboarding_completed_by: string | null;

  // Audit
  created_at: Generated<DateColumn>;
  updated_at: Generated<DateColumn>;
}

export type TenantSetupChecklistSelectable = Selectable<TenantSetupChecklist>;
export type TenantSetupChecklistInsertable = Insertable<TenantSetupChecklist>;
export type TenantSetupChecklistUpdateable = Updateable<TenantSetupChecklist>;

// ─────────────────────────────────────────────────────────────
// BACKUPS & DISASTER RECOVERY
// ─────────────────────────────────────────────────────────────

export interface TenantBackup {
  id: Generated<string>;
  tenant_id: string;

  // Backup Identification
  backup_number: string;
  backup_type: 'full' | 'incremental' | 'diff' | 'manual';

  // Location and Size
  backup_location: string;
  backup_size_bytes: number | null;

  // Backup Status
  status: 'created' | 'verifying' | 'verified' | 'failed' | 'expired';
  verification_timestamp: NullableDateColumn;
  verification_result: string | null;

  // Retention
  created_at: Generated<DateColumn>;
  expires_at: NullableDateColumn;
  retention_days: Generated<number>;

  // Restore Metadata
  can_restore: Generated<boolean>;
  last_restored_at: NullableDateColumn;
  restored_to_tenant_id: string | null;

  // Metadata
  backed_by: string | null;
  backup_reason: string | null;
  checksum: string | null;
}

export type TenantBackupSelectable = Selectable<TenantBackup>;
export type TenantBackupInsertable = Insertable<TenantBackup>;
export type TenantBackupUpdateable = Updateable<TenantBackup>;

// ─────────────────────────────────────────────────────────────
// DATA PURGE & COMPLIANCE
// ─────────────────────────────────────────────────────────────

export interface TenantPurgeLog {
  id: Generated<string>;
  tenant_id: string;

  // Purge Details
  purge_type: 'soft_delete' | 'hard_delete' | 'anonymize' | 'full_purge';

  // What was purged
  entity_type: string | null;
  records_affected: number | null;

  // Audit Trail
  initiated_by: string | null;
  initiated_at: Generated<DateColumn>;
  completed_at: NullableDateColumn;
  status: Generated<'pending' | 'processing' | 'completed' | 'failed'>;

  // Recovery
  backup_before_purge: string | null;
  can_rollback: Generated<boolean>;
  rollback_completed_at: NullableDateColumn;

  // Compliance
  compliance_reason: string | null;
  regulatory_reference: string | null;
}

export type TenantPurgeLogSelectable = Selectable<TenantPurgeLog>;
export type TenantPurgeLogInsertable = Insertable<TenantPurgeLog>;
export type TenantPurgeLogUpdateable = Updateable<TenantPurgeLog>;

// ─────────────────────────────────────────────────────────────
// RESOURCE USAGE TRACKING
// ─────────────────────────────────────────────────────────────

export interface TenantResourceUsage {
  id: Generated<string>;
  tenant_id: string;

  // Usage Period
  usage_date: DateColumn;

  // Metrics
  active_users: Generated<number>;
  total_members: Generated<number>;
  total_transactions: Generated<number>;
  storage_used_bytes: Generated<number>;
  api_calls: Generated<number>;
  sms_sent: Generated<number>;
  email_sent: Generated<number>;

  // Billing
  billable_members: Generated<number>;
  cost_estimate: DecimalColumn | null;

  // Performance
  query_count: Generated<number>;
  avg_query_time_ms: DecimalColumn | null;
  max_query_time_ms: DecimalColumn | null;

  created_at: Generated<DateColumn>;
}

export type TenantResourceUsageSelectable = Selectable<TenantResourceUsage>;
export type TenantResourceUsageInsertable = Insertable<TenantResourceUsage>;
export type TenantResourceUsageUpdateable = Updateable<TenantResourceUsage>;

// ─────────────────────────────────────────────────────────────
// FEATURE USAGE & ANALYTICS
// ─────────────────────────────────────────────────────────────

export interface TenantFeatureUsage {
  id: Generated<string>;
  tenant_id: string;

  // Feature Identification
  feature_name: string;
  feature_module: string;

  // Usage
  first_used_at: NullableDateColumn;
  last_used_at: NullableDateColumn;
  usage_count: Generated<number>;

  // Engagement
  is_active: Generated<boolean>;
  adoption_percentage: DecimalColumn | null;

  // Metadata
  user_id: string | null;
  context: Record<string, unknown> | null;
}

export type TenantFeatureUsageSelectable = Selectable<TenantFeatureUsage>;
export type TenantFeatureUsageInsertable = Insertable<TenantFeatureUsage>;
export type TenantFeatureUsageUpdateable = Updateable<TenantFeatureUsage>;

// ─────────────────────────────────────────────────────────────
// DATA RETENTION POLICIES
// ─────────────────────────────────────────────────────────────

export interface TenantRetentionPolicy {
  id: Generated<string>;
  tenant_id: string;

  // Audit Log Retention
  audit_log_retention_days: Generated<number>;
  activity_log_retention_days: Generated<number>;

  // Transaction Retention
  transaction_retention_years: Generated<number>;

  // Member Data Retention
  deleted_member_retention_days: Generated<number>;

  // Automatic Purge
  auto_purge_enabled: Generated<boolean>;
  next_purge_date: NullableDateColumn;

  // Compliance
  regulatory_framework: string | null;

  // Audit
  created_by: string | null;
  updated_by: string | null;
  created_at: Generated<DateColumn>;
  updated_at: Generated<DateColumn>;
}

export type TenantRetentionPolicySelectable = Selectable<TenantRetentionPolicy>;
export type TenantRetentionPolicyInsertable = Insertable<TenantRetentionPolicy>;
export type TenantRetentionPolicyUpdateable = Updateable<TenantRetentionPolicy>;

// ─────────────────────────────────────────────────────────────
// MIGRATION TRACKING ENHANCEMENTS
// ─────────────────────────────────────────────────────────────

export interface TenantMigrationDetail {
  id: Generated<string>;
  tenant_migration_id: string;

  // Migration Details
  migration_status: 'pending' | 'running' | 'success' | 'failed' | 'rolled_back';

  // Execution Context
  started_at: NullableDateColumn;
  completed_at: NullableDateColumn;
  duration_ms: number | null;

  error_details: string | null;
  error_code: string | null;

  // Rollback Information
  rollback_applied_at: NullableDateColumn;
  rollback_reason: string | null;

  // Statistics
  tables_created: Generated<number>;
  tables_modified: Generated<number>;
  rows_affected: Generated<number>;

  // Metadata
  migration_hash: string | null;
  checksum: string | null;
}

export type TenantMigrationDetailSelectable = Selectable<TenantMigrationDetail>;
export type TenantMigrationDetailInsertable = Insertable<TenantMigrationDetail>;
export type TenantMigrationDetailUpdateable = Updateable<TenantMigrationDetail>;
