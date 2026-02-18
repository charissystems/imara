-- ============================================================================
-- AUDIT & SECURITY
-- Audit trails, activity logs, security events, and compliance tracking
-- ============================================================================

-- AUDIT LOG
CREATE TABLE IF NOT EXISTS template.audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User Information
    user_id uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    user_ip_address varchar(45),
    user_agent text,
    
    -- Action Details
    action varchar(100) NOT NULL,
    entity_type varchar(100) NOT NULL,
    entity_id uuid,
    entity_name varchar(255),
    
    -- Change Details
    change_type varchar(20) CHECK (change_type IN ('create', 'update', 'delete', 'view', 'export', 'authenticate', 'permission_change')) NOT NULL,
    
    -- Old and New Values
    old_values jsonb,
    new_values jsonb,
    
    -- Status
    status varchar(20) CHECK (status IN ('success', 'failure')) DEFAULT 'success',
    error_message text,
    
    -- Metadata
    timestamp timestamptz DEFAULT now() NOT NULL,
    duration_ms integer, -- Query/operation duration
    
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_log_user_idx ON template.audit_log(user_id);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON template.audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_log_timestamp_idx ON template.audit_log(timestamp);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON template.audit_log(action);

-- ACTIVITY LOG (High-frequency, shorter retention)
CREATE TABLE IF NOT EXISTS template.activity_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User Information
    user_id uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    
    -- Activity Details
    activity_type varchar(100) NOT NULL,
    description text,
    
    -- Associated Data
    entity_type varchar(100),
    entity_id uuid,
    
    -- Metadata
    metadata jsonb,
    
    timestamp timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS activity_log_user_idx ON template.activity_log(user_id);
CREATE INDEX IF NOT EXISTS activity_log_type_idx ON template.activity_log(activity_type);
CREATE INDEX IF NOT EXISTS activity_log_timestamp_idx ON template.activity_log(timestamp);

-- DATA EXPORT LOG
CREATE TABLE IF NOT EXISTS template.data_export_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    export_number varchar(30) NOT NULL UNIQUE,
    
    -- Exporter
    exported_by uuid NOT NULL REFERENCES template.staff(id) ON DELETE RESTRICT,
    
    -- Export Details
    entity_type varchar(100) NOT NULL,
    export_format varchar(20) CHECK (export_format IN ('csv', 'excel', 'pdf', 'json')) NOT NULL,
    
    -- Filter Applied
    filters jsonb, -- What data was exported
    record_count integer,
    file_size_bytes bigint,
    file_path varchar(500),
    
    -- Security
    encryption_used boolean DEFAULT false,
    password_protected boolean DEFAULT false,
    
    -- Audit
    export_timestamp timestamptz DEFAULT now() NOT NULL,
    download_timestamp timestamptz,
    
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS data_export_number_unique ON template.data_export_log(export_number);
CREATE INDEX IF NOT EXISTS data_export_user_idx ON template.data_export_log(exported_by);
CREATE INDEX IF NOT EXISTS data_export_timestamp_idx ON template.data_export_log(export_timestamp);

-- SECURITY EVENTS
CREATE TABLE IF NOT EXISTS template.security_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User
    user_id uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    staff_ip_address varchar(45),
    
    -- Event Details
    event_type varchar(100) NOT NULL CHECK (event_type IN ('failed_login', 'successful_login', 'password_change', 'permission_change', 'account_locked', 'unusual_activity', 'data_access', 'api_abuse')),
    severity varchar(20) CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
    
    description text NOT NULL,
    
    -- Response
    action_taken varchar(255),
    requires_investigation boolean DEFAULT false,
    
    -- Audit
    timestamp timestamptz DEFAULT now() NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS security_events_user_idx ON template.security_events(user_id);
CREATE INDEX IF NOT EXISTS security_events_type_idx ON template.security_events(event_type);
CREATE INDEX IF NOT EXISTS security_events_severity_idx ON template.security_events(severity);
CREATE INDEX IF NOT EXISTS security_events_timestamp_idx ON template.security_events(timestamp);

-- TWO-FACTOR AUTHENTICATION LOG
CREATE TABLE IF NOT EXISTS template.two_factor_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    staff_id uuid NOT NULL REFERENCES template.staff(id) ON DELETE CASCADE,
    
    -- 2FA Attempt
    method varchar(50) CHECK (method IN ('sms', 'authenticator_app', 'backup_code')) NOT NULL,
    status varchar(20) CHECK (status IN ('success', 'failure', 'expired')) DEFAULT 'failure',
    
    -- Metadata
    ip_address varchar(45),
    device_info text,
    
    -- Constraints
    attempt_timestamp timestamptz DEFAULT now() NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS two_factor_log_staff_idx ON template.two_factor_log(staff_id);
CREATE INDEX IF NOT EXISTS two_factor_log_timestamp_idx ON template.two_factor_log(attempt_timestamp);

-- PERMISSION AUDIT
CREATE TABLE IF NOT EXISTS template.permission_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    staff_id uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    permission_id uuid NOT NULL REFERENCES template.permissions(id) ON DELETE CASCADE,
    
    -- Change Type
    change_type varchar(50) CHECK (change_type IN ('granted', 'revoked', 'modified')) NOT NULL,
    
    -- Previous & Current Values
    previous_value jsonb,
    new_value jsonb,
    
    -- Reason
    reason text,
    
    -- Who Made the Change
    changed_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    
    change_timestamp timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS permission_audit_staff_idx ON template.permission_audit(staff_id);
CREATE INDEX IF NOT EXISTS permission_audit_timestamp_idx ON template.permission_audit(change_timestamp);

-- RECONCILIATION AUDIT
CREATE TABLE IF NOT EXISTS template.reconciliation_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    reconciliation_number varchar(30) NOT NULL UNIQUE,
    
    -- Reconciliation Details
    reconciliation_type varchar(50) CHECK (reconciliation_type IN ('bank', 'account', 'loan', 'savings')) NOT NULL,
    
    -- Period
    reconciliation_date date NOT NULL DEFAULT CURRENT_DATE,
    
    period_start date,
    period_end date,
    
    -- Reconciliation Data
    expected_balance numeric(20, 4),
    actual_balance numeric(20, 4),
    variance numeric(20, 4),
    
    -- Items
    total_items integer,
    matched_items integer,
    unmatched_items integer,
    
    -- Status
    status varchar(20) CHECK (status IN ('in_progress', 'completed', 'resolved', 'escalated')) DEFAULT 'in_progress',
    
    -- Audit
    performed_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_at timestamptz,
    
    notes text,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS reconciliation_audit_number_unique ON template.reconciliation_audit(reconciliation_number);
CREATE INDEX IF NOT EXISTS reconciliation_audit_type_idx ON template.reconciliation_audit(reconciliation_type);
CREATE INDEX IF NOT EXISTS reconciliation_audit_date_idx ON template.reconciliation_audit(reconciliation_date);

-- UNMATCHED RECONCILIATION ITEMS
CREATE TABLE IF NOT EXISTS template.unmatched_reconciliation_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    reconciliation_id uuid NOT NULL REFERENCES template.reconciliation_audit(id) ON DELETE CASCADE,
    
    -- Item Details
    reference_code varchar(100),
    item_date date,
    amount numeric(20, 4),
    description text,
    
    -- Origin
    origin varchar(50) CHECK (origin IN ('system', 'external', 'both')) NOT NULL,
    
    -- Resolution
    resolution_status varchar(20) CHECK (resolution_status IN ('pending', 'resolved', 'requires_investigation')) DEFAULT 'pending',
    resolution_notes text,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS unmatched_items_reconciliation_idx ON template.unmatched_reconciliation_items(reconciliation_id);
CREATE INDEX IF NOT EXISTS unmatched_items_status_idx ON template.unmatched_reconciliation_items(resolution_status);

-- API ACCESS LOG
CREATE TABLE IF NOT EXISTS template.api_access_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Request Details
    api_key_id uuid,
    user_id uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    
    endpoint varchar(255) NOT NULL,
    method varchar(10) NOT NULL,
    
    request_timestamp timestamptz DEFAULT now() NOT NULL,
    response_status integer,
    response_time_ms integer,
    
    -- Security
    ip_address varchar(45),
    user_agent text,
    
    -- Payload
    request_size_bytes bigint,
    response_size_bytes bigint,
    
    -- Audit
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS api_access_user_idx ON template.api_access_log(user_id);
CREATE INDEX IF NOT EXISTS api_access_timestamp_idx ON template.api_access_log(request_timestamp);
CREATE INDEX IF NOT EXISTS api_access_endpoint_idx ON template.api_access_log(endpoint);
-- ACCESS LOGS FOR CONFIGURATION CHANGES
CREATE TABLE IF NOT EXISTS template.configuration_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    configuration_type varchar(100) NOT NULL,
    configuration_id uuid,
    
    change_type varchar(50) CHECK (change_type IN ('create', 'update', 'delete')) NOT NULL,
    
    old_values jsonb,
    new_values jsonb,
    
    changed_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    change_timestamp timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS config_audit_type_idx ON template.configuration_audit_log(configuration_type);
CREATE INDEX IF NOT EXISTS config_audit_timestamp_idx ON template.configuration_audit_log(change_timestamp);
-- ─────────────────────────────────────────────────────────────────────
-- PERFORMANCE INDEXES
-- ─────────────────────────────────────────────────────────────────────

-- Audit log: per-user time-ordered queries (compliance and investigation)
CREATE INDEX IF NOT EXISTS idx_audit_log_user_time
    ON template.audit_log(user_id, created_at DESC);

-- Audit log: entity-level change history (e.g. "all changes to loan X")
CREATE INDEX IF NOT EXISTS idx_audit_log_entity
    ON template.audit_log(entity_type, entity_id, created_at DESC);
