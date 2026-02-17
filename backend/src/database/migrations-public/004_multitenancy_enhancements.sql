-- ============================================================================
-- MULTITENANCY ENHANCEMENTS
-- Tenant isolation, backup/restore capability, and cross-tenant analytics
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- 1. TENANT CONTEXT TRACKING
-- Add tenant_id to key tables for super-admin visibility
-- ─────────────────────────────────────────────────────────────

-- Add tenant_id to template tables for super-admin cross-tenant auditing.
-- These tables are only created when the first tenant is provisioned
-- (via tenant migrations), so we guard each statement with an existence
-- check to keep this migration idempotent on a fresh database.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'template' AND table_name = 'audit_log'
    ) THEN
        ALTER TABLE template.audit_log ADD COLUMN IF NOT EXISTS tenant_id uuid;
        CREATE INDEX IF NOT EXISTS audit_log_tenant_idx
            ON template.audit_log(tenant_id, timestamp DESC);
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'template' AND table_name = 'activity_log'
    ) THEN
        ALTER TABLE template.activity_log ADD COLUMN IF NOT EXISTS tenant_id uuid;
        CREATE INDEX IF NOT EXISTS activity_log_tenant_idx
            ON template.activity_log(tenant_id, timestamp DESC);
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'template' AND table_name = 'data_export_log'
    ) THEN
        ALTER TABLE template.data_export_log ADD COLUMN IF NOT EXISTS tenant_id uuid;
        CREATE INDEX IF NOT EXISTS data_export_tenant_idx
            ON template.data_export_log(tenant_id);
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. ENHANCED TENANT MIGRATION TRACKING
-- Track more details about schema migrations per tenant
-- ─────────────────────────────────────────────────────────────

-- Create table in public schema (if doesn't exist)
-- This extends the basic tenant_migrations table with more context
CREATE TABLE IF NOT EXISTS public.tenant_migration_details (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_migration_id uuid NOT NULL REFERENCES public.tenant_migrations(id) ON DELETE CASCADE,
    
    -- Migration Details
    migration_status varchar(20) CHECK (migration_status IN ('pending', 'running', 'success', 'failed', 'rolled_back')) DEFAULT 'pending',
    
    -- Execution Context
    started_at timestamptz,
    completed_at timestamptz,
    duration_ms integer,
    
    error_details text,
    error_code varchar(50),
    
    -- Rollback Information
    rollback_applied_at timestamptz,
    rollback_reason text,
    
    -- Statistics
    tables_created integer DEFAULT 0,
    tables_modified integer DEFAULT 0,
    rows_affected integer DEFAULT 0,
    
    -- Metadata
    migration_hash varchar(64),
    checksum varchar(64)
);

CREATE INDEX IF NOT EXISTS tenant_migration_details_status_idx 
    ON public.tenant_migration_details(migration_status);
CREATE INDEX IF NOT EXISTS tenant_migration_details_created_idx 
    ON public.tenant_migration_details(started_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 3. TENANT SETUP CHECKLIST
-- Track onboarding completion state per tenant
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_setup_checklist (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
    
    -- Onboarding Steps
    schema_created boolean DEFAULT false,
    schema_created_at timestamptz,
    
    admin_user_created boolean DEFAULT false,
    admin_user_created_at timestamptz,
    
    initial_config_completed boolean DEFAULT false,
    initial_config_completed_at timestamptz,
    
    branding_configured boolean DEFAULT false,
    branding_configured_at timestamptz,
    
    first_member_registered boolean DEFAULT false,
    first_member_registered_at timestamptz,
    
    first_transaction_posted boolean DEFAULT false,
    first_transaction_posted_at timestamptz,
    
    email_configured boolean DEFAULT false,
    email_configured_at timestamptz,
    
    sms_configured boolean DEFAULT false,
    sms_configured_at timestamptz,
    
    mobile_money_connected boolean DEFAULT false,
    mobile_money_connected_at timestamptz,
    
    -- Overall Progress
    onboarding_completed_at timestamptz,
    onboarding_completed_by uuid, -- Staff ID who completed onboarding
    
    -- Audit
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS setup_checklist_completed_idx 
    ON public.tenant_setup_checklist(onboarding_completed_at) 
    WHERE onboarding_completed_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 4. TENANT BACKUPS & RECOVERY
-- Track schema backups for disaster recovery per tenant
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_backups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    
    -- Backup Identification
    backup_number varchar(50) NOT NULL UNIQUE,
    backup_type varchar(20) CHECK (backup_type IN ('full', 'incremental', 'diff', 'manual')) DEFAULT 'full',
    
    -- Location and Size
    backup_location varchar(500) NOT NULL, -- S3 path or local path
    backup_size_bytes bigint,
    
    -- Backup Status
    status varchar(20) CHECK (status IN ('created', 'verifying', 'verified', 'failed', 'expired')) DEFAULT 'created',
    verification_timestamp timestamptz,
    verification_result varchar(50),
    
    -- Retention
    created_at timestamptz DEFAULT now() NOT NULL,
    expires_at timestamptz,
    retention_days integer DEFAULT 30,
    
    -- Restore Metadata
    can_restore boolean DEFAULT false,
    last_restored_at timestamptz,
    restored_to_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
    
    -- Metadata
    backed_by uuid, -- Staff ID if manual
    backup_reason text,
    checksum varchar(64)
);

CREATE INDEX IF NOT EXISTS backups_tenant_idx ON public.tenant_backups(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS backups_status_idx ON public.tenant_backups(status) WHERE status IN ('created', 'verified');
CREATE INDEX IF NOT EXISTS backups_expires_idx ON public.tenant_backups(expires_at) WHERE expires_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 5. TENANT PURGE LOG
-- Track data deletion/purge events for compliance
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_purge_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    
    -- Purge Details
    purge_type varchar(50) CHECK (purge_type IN ('soft_delete', 'hard_delete', 'anonymize', 'full_purge')) NOT NULL,
    
    -- What was purged
    entity_type varchar(100), -- 'members', 'transactions', 'all', etc.
    records_affected integer,
    
    -- Audit Trail
    initiated_by uuid,
    initiated_at timestamptz DEFAULT now() NOT NULL,
    completed_at timestamptz,
    status varchar(20) CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
    
    -- Recovery
    backup_before_purge varchar(500), -- Backup file path reference
    can_rollback boolean DEFAULT false,
    rollback_completed_at timestamptz,
    
    -- Compliance
    compliance_reason text,
    regulatory_reference varchar(100)
);

CREATE INDEX IF NOT EXISTS purge_log_tenant_idx ON public.tenant_purge_log(tenant_id, initiated_at DESC);
CREATE INDEX IF NOT EXISTS purge_log_status_idx ON public.tenant_purge_log(status);

-- ─────────────────────────────────────────────────────────────
-- 6. TENANT RESOURCE USAGE TRACKING
-- Monitor resource consumption per tenant for billing/analytics
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_resource_usage (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    
    -- Usage Period
    usage_date date NOT NULL,
    
    -- Metrics
    active_users integer DEFAULT 0,
    total_members integer DEFAULT 0,
    total_transactions bigint DEFAULT 0,
    storage_used_bytes bigint DEFAULT 0,
    api_calls bigint DEFAULT 0,
    sms_sent integer DEFAULT 0,
    email_sent integer DEFAULT 0,
    
    -- Billing
    billable_members integer DEFAULT 0, -- Members charged in billing
    cost_estimate numeric(12, 2),
    
    -- Performance
    query_count bigint DEFAULT 0,
    avg_query_time_ms numeric(10, 2),
    max_query_time_ms numeric(10, 2),
    
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS resource_usage_date_idx 
    ON public.tenant_resource_usage(tenant_id, usage_date);
CREATE INDEX IF NOT EXISTS resource_usage_period_idx 
    ON public.tenant_resource_usage(usage_date DESC);

-- ─────────────────────────────────────────────────────────────
-- 7. TENANT FEATURE USAGE LOG
-- Track which features are used for product analytics
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_feature_usage (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    
    -- Feature Identification
    feature_name varchar(100) NOT NULL,
    feature_module varchar(50) NOT NULL,
    
    -- Usage
    first_used_at timestamptz,
    last_used_at timestamptz,
    usage_count integer DEFAULT 0,
    
    -- Engagement
    is_active boolean DEFAULT true,
    adoption_percentage numeric(5, 2), -- 0-100
    
    -- Metadata
    user_id uuid,
    context jsonb
);

CREATE INDEX IF NOT EXISTS feature_usage_tenant_idx 
    ON public.tenant_feature_usage(tenant_id, last_used_at DESC);
CREATE INDEX IF NOT EXISTS feature_usage_active_idx 
    ON public.tenant_feature_usage(is_active) WHERE is_active = true;

-- ─────────────────────────────────────────────────────────────
-- 8. TENANT DATA RETENTION POLICIES
-- Define and enforce data retention per tenant
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_retention_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
    
    -- Audit Log Retention
    audit_log_retention_days integer DEFAULT 365,
    activity_log_retention_days integer DEFAULT 90,
    
    -- Transaction Retention
    transaction_retention_years integer DEFAULT 7, -- Regulatory requirement
    
    -- Member Data Retention
    deleted_member_retention_days integer DEFAULT 365,
    
    -- Automatic Purge
    auto_purge_enabled boolean DEFAULT true,
    next_purge_date date,
    
    -- Compliance
    regulatory_framework varchar(100),
    
    -- Audit
    created_by uuid,
    updated_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS retention_policies_next_purge_idx 
    ON public.tenant_retention_policies(next_purge_date) 
    WHERE auto_purge_enabled = true;

-- ─────────────────────────────────────────────────────────────
-- 9. FUNCTIONS FOR BACKUP & RESTORE
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.backup_tenant_schema(
    p_tenant_id uuid,
    p_backup_reason text DEFAULT 'Manual backup'
)
RETURNS TABLE (
    backup_id uuid,
    backup_location varchar,
    status varchar
) AS $$
DECLARE
    v_schema_name varchar;
    v_backup_number varchar;
    v_backup_id uuid;
    v_location varchar;
BEGIN
    -- Validate tenant exists
    SELECT schema_name INTO v_schema_name 
    FROM public.tenants 
    WHERE id = p_tenant_id AND deleted_at IS NULL;
    
    IF v_schema_name IS NULL THEN
        RAISE EXCEPTION 'Tenant not found: %', p_tenant_id;
    END IF;
    
    -- Generate backup identifier
    v_backup_number := 'BKP_' || p_tenant_id::text || '_' || to_char(now(), 'YYYYMMDDHH24MISS');
    v_backup_id := gen_random_uuid();
    v_location := '/backups/tenant/' || v_schema_name || '/' || v_backup_number;
    
    -- Create backup record
    INSERT INTO public.tenant_backups (
        id, tenant_id, backup_number, backup_location, 
        backup_type, status, backed_by, backup_reason
    ) VALUES (
        v_backup_id, p_tenant_id, v_backup_number, v_location,
        'full', 'created', current_user::uuid, p_backup_reason
    );
    
    -- Note: Actual backup logic (pg_dump, S3 upload, etc.) 
    -- would be handled by application code or separate job scheduler
    
    RETURN QUERY SELECT v_backup_id, v_location::varchar, 'created'::varchar;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.record_tenant_migration_completion(
    p_tenant_id uuid,
    p_migration_name varchar,
    p_status varchar,
    p_duration_ms integer,
    p_error_details text DEFAULT NULL
)
RETURNS void AS $$
DECLARE
    v_migration_id uuid;
    v_detail_id uuid;
BEGIN
    -- Find or create migration record
    SELECT id INTO v_migration_id
    FROM public.tenant_migrations
    WHERE tenant_id = p_tenant_id 
      AND migration_name = p_migration_name
    LIMIT 1;
    
    IF v_migration_id IS NULL THEN
        INSERT INTO public.tenant_migrations (tenant_id, migration_name, migration_version)
        VALUES (p_tenant_id, p_migration_name, 1)
        RETURNING id INTO v_migration_id;
    END IF;
    
    -- Record detailed migration info
    INSERT INTO public.tenant_migration_details (
        tenant_migration_id,
        migration_status,
        started_at,
        completed_at,
        duration_ms,
        error_details
    ) VALUES (
        v_migration_id,
        p_status::varchar,
        now() - (p_duration_ms || ' ms')::interval,
        now(),
        p_duration_ms,
        p_error_details
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────
-- 10. TENANT DATA ISOLATION CHECKS (Documentation)
-- ─────────────────────────────────────────────────────────────

COMMENT ON TABLE public.tenant_backups IS 
    'Stores references to tenant schema backups for disaster recovery';

COMMENT ON COLUMN public.tenant_backups.backup_location IS 
    'Path to backup file (S3, GCS, or local storage); managed by backup service';

COMMENT ON TABLE public.tenant_purge_log IS 
    'Compliance audit trail for data deletion and purging operations';

COMMENT ON TABLE public.tenant_retention_policies IS 
    'GDPR/regulatory compliance: defines data retention periods per tenant';
