-- ============================================================================
-- SYSTEM ADMINISTRATION
-- SACCO configuration, multi-branch support, settings, and platform management
-- ============================================================================

-- SACCO CONFIGURATION
CREATE TABLE IF NOT EXISTS template.sacco_configuration (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Organization Details
    organization_name varchar(255) NOT NULL,
    registration_number varchar(50),
    tax_identification_number varchar(50),
    
    -- Contact Information
    head_office_address jsonb,
    phone varchar(50),
    email varchar(200),
    website varchar(255),
    
    -- Logo & Branding
    logo_url varchar(500),
    color_scheme varchar(50),
    
    -- Financial Configuration
    currency_code char(3) DEFAULT 'UGX' NOT NULL,
    financial_year_start_month integer CHECK (financial_year_start_month >= 1 AND financial_year_start_month <= 12) DEFAULT 1,
    
    -- Regulatory Configuration
    regulator_name varchar(100),
    regulatory_reference varchar(100),
    compliance_framework varchar(100),
    
    -- System Settings
    system_timezone varchar(100) DEFAULT 'Africa/Kampala',
    language varchar(10) DEFAULT 'en',
    
    -- Feature Flags (MVP Configuration)
    features jsonb DEFAULT '{
        "mobile_money_integration": true,
        "fixed_deposits_enabled": true,
        "shares_enabled": true,
        "loans_enabled": true,
        "ussd_enabled": false,
        "mobile_app_enabled": false,
        "sms_notifications": true,
        "email_notifications": true,
        "two_factor_auth": true
    }'::jsonb,
    
    -- Rate Configuration
    interest_calculation_basis varchar(50) DEFAULT '365_days', -- 365_days or 360_days
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- BRANCHES
CREATE TABLE IF NOT EXISTS template.branches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    code varchar(20) NOT NULL UNIQUE,
    name varchar(100) NOT NULL,
    description text,
    
    -- Contact
    address jsonb,
    phone varchar(50),
    email varchar(200),
    
    -- Manager
    branch_manager_id uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    
    -- Status
    is_active boolean DEFAULT true,
    
    -- Operating Hours
    opening_time time,
    closing_time time,
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS branches_code_unique ON template.branches(code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS branches_active_idx ON template.branches(is_active);

-- SYSTEM SETTINGS
CREATE TABLE IF NOT EXISTS template.system_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    setting_key varchar(100) NOT NULL UNIQUE,
    setting_value text NOT NULL,
    value_type varchar(50) CHECK (value_type IN ('string', 'integer', 'boolean', 'json', 'decimal')) DEFAULT 'string',
    
    description text,
    
    is_configurable boolean DEFAULT true,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS system_settings_key_unique ON template.system_settings(setting_key);

-- EMAIL GATEWAY CONFIGURATION
CREATE TABLE IF NOT EXISTS template.email_gateways (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    provider varchar(50) NOT NULL CHECK (provider IN ('sendgrid', 'aws_ses', 'mailgun', 'smtp')),
    
    -- Configuration
    api_key varchar(500),
    api_secret varchar(500),
    from_email varchar(200) NOT NULL,
    from_name varchar(100),
    
    -- SMTP (if applicable)
    smtp_host varchar(255),
    smtp_port integer,
    smtp_username varchar(100),
    smtp_password varchar(100),
    smtp_use_tls boolean DEFAULT true,
    
    -- Status
    is_active boolean DEFAULT false,
    is_primary boolean DEFAULT false,
    
    -- Testing
    test_email varchar(200),
    last_test_at timestamptz,
    test_status varchar(20) CHECK (test_status IN ('pending', 'success', 'failed')),
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- SMS GATEWAY CONFIGURATION
CREATE TABLE IF NOT EXISTS template.sms_gateways (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    provider varchar(50) NOT NULL CHECK (provider IN ('africas_talking', 'twilio', 'nexmo', 'custom')),
    
    -- Configuration
    api_key varchar(500) NOT NULL,
    api_secret varchar(500),
    account_sid varchar(100), -- For Twilio
    auth_token varchar(500),  -- For Twilio
    
    -- Sender Configuration
    sender_id varchar(50) NOT NULL, -- Alphanumeric sender ID or short code
    
    -- Status
    is_active boolean DEFAULT false,
    is_primary boolean DEFAULT false,
    
    -- Failover
    failover_order integer,
    
    -- Testing
    test_phone varchar(50),
    last_test_at timestamptz,
    test_status varchar(20) CHECK (test_status IN ('pending', 'success', 'failed')),
    
    -- Rate Limiting
    rate_limit_per_second integer,
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- MOBILE MONEY INTEGRATION CONFIGURATION
CREATE TABLE IF NOT EXISTS template.mobile_money_configuration (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    provider varchar(50) NOT NULL CHECK (provider IN ('mtn_mobile_money', 'airtel_money', 'custom')),
    
    -- Credentials
    merchant_id varchar(100) NOT NULL,
    api_key varchar(500) NOT NULL,
    api_secret varchar(500),
    
    -- Endpoints
    api_endpoint varchar(500),
    
    -- Account
    account_number varchar(50),
    account_name varchar(100),
    
    -- Configuration
    sender_name varchar(50),
    
    -- Status
    is_active boolean DEFAULT false,
    
    -- Features
    supports_collection boolean DEFAULT true,
    supports_disbursement boolean DEFAULT true,
    supports_reconciliation boolean DEFAULT true,
    
    -- Testing
    test_mode boolean DEFAULT true,
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- NOTIFICATION SETTINGS
CREATE TABLE IF NOT EXISTS template.notification_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    notification_type varchar(100) NOT NULL,
    
    -- Channels
    sms_enabled boolean DEFAULT true,
    email_enabled boolean DEFAULT true,
    push_enabled boolean DEFAULT false,
    in_app_enabled boolean DEFAULT true,
    
    -- Template
    template_id uuid REFERENCES template.message_templates(id) ON DELETE SET NULL,
    
    -- Trigger Configuration
    trigger_condition jsonb, -- Configuration for when notification is sent
    
    -- Audit
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- INTEREST RATE CONFIGURATION
CREATE TABLE IF NOT EXISTS template.interest_rate_configuration (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    rate_type varchar(50) CHECK (rate_type IN ('savings', 'fixed_deposit', 'loan_default', 'default_penalty', 'overdraft')) NOT NULL,
    
    -- Rate Details
    rate_name varchar(100) NOT NULL,
    annual_percentage_rate numeric(10, 4) NOT NULL CHECK (annual_percentage_rate >= 0),
    
    -- Effective Period
    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    effective_to date,
    
    -- Status
    is_current boolean DEFAULT true,
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS interest_rate_type_idx ON template.interest_rate_configuration(rate_type);
CREATE INDEX IF NOT EXISTS interest_rate_current_idx ON template.interest_rate_configuration(is_current);

-- PENALTY CONFIGURATION
CREATE TABLE IF NOT EXISTS template.penalty_configuration (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    penalty_type varchar(100) NOT NULL,
    
    -- Amount
    penalty_amount_type varchar(50) CHECK (penalty_amount_type IN ('fixed', 'percentage')) NOT NULL,
    penalty_amount numeric(20, 4) NOT NULL,
    
    -- Application
    applies_to varchar(100), -- loan_late_payment, overdraft, etc.
    
    -- Effective Period
    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    effective_to date,
    
    -- Status
    is_active boolean DEFAULT true,
    
    description text,
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- TENANT/SACCO METADATA (Hidden from users, system use only)
CREATE TABLE IF NOT EXISTS template.tenant_metadata (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    metadata_key varchar(100) NOT NULL UNIQUE,
    metadata_value jsonb NOT NULL,
    
    description text,
    
    is_system_metadata boolean DEFAULT false,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- SCHEDULED JOBS/TASKS
CREATE TABLE IF NOT EXISTS template.scheduled_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    task_name varchar(100) NOT NULL UNIQUE,
    description text,
    
    -- Schedule
    cron_expression varchar(100) NOT NULL, -- e.g., "0 0 * * *" for daily at midnight
    
    -- Task Configuration
    task_type varchar(50) NOT NULL CHECK (task_type IN ('interest_accrual', 'statement_generation', 'backup', 'report_generation', 'penalty_calculation', 'reminder_sending')),
    
    task_params jsonb, -- Additional parameters
    
    -- Status
    is_active boolean DEFAULT true,
    
    -- Execution Tracking
    last_execution_at timestamptz,
    last_execution_status varchar(20) CHECK (last_execution_status IN ('success', 'failed', 'partial')),
    next_execution_at timestamptz,
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- SCHEDULED TASK LOGS
CREATE TABLE IF NOT EXISTS template.scheduled_task_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    task_id uuid NOT NULL REFERENCES template.scheduled_tasks(id) ON DELETE CASCADE,
    
    execution_start timestamptz NOT NULL,
    execution_end timestamptz,
    execution_status varchar(20) CHECK (execution_status IN ('success', 'failed', 'partial', 'skipped')) NOT NULL,
    
    records_processed integer,
    records_failed integer,
    
    error_message text,
    logs text,
    
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS task_logs_task_idx ON template.scheduled_task_logs(task_id);
CREATE INDEX IF NOT EXISTS task_logs_status_idx ON template.scheduled_task_logs(execution_status);
-- FEE SCHEDULES
CREATE TABLE IF NOT EXISTS template.fee_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code varchar(20) NOT NULL UNIQUE,
    name varchar(100) NOT NULL,
    description text,
    fee_type varchar(50) CHECK (fee_type IN ('registration', 'account_maintenance', 'withdrawal', 'loan_processing', 'late_payment', 'exit', 'transfer', 'statement', 'card_issuance', 'other')) NOT NULL,
    amount numeric(18,2) NOT NULL DEFAULT 0,
    calculation_method varchar(30) CHECK (calculation_method IN ('fixed', 'percentage', 'tiered')) NOT NULL DEFAULT 'fixed',
    percentage_rate numeric(5,2),
    minimum_fee numeric(18,2),
    maximum_fee numeric(18,2),
    applicable_to varchar(50) CHECK (applicable_to IN ('all_members', 'savings', 'loans', 'shares', 'fixed_deposits', 'transfers', 'withdrawals')) NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    effective_to date,
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS fee_schedules_type_idx ON template.fee_schedules(fee_type);
CREATE INDEX IF NOT EXISTS fee_schedules_active_idx ON template.fee_schedules(is_active) WHERE is_active = true;

-- TRANSACTION LIMITS
CREATE TABLE IF NOT EXISTS template.transaction_limits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    role varchar(50) NOT NULL,
    channel varchar(50) CHECK (channel IN ('teller', 'mobile', 'ussd', 'agent', 'portal', 'api')) NOT NULL,
    transaction_type varchar(50) CHECK (transaction_type IN ('deposit', 'withdrawal', 'transfer', 'loan_disbursement', 'loan_repayment', 'share_purchase')) NOT NULL,
    per_transaction_limit numeric(18,2) NOT NULL CHECK (per_transaction_limit > 0),
    daily_limit numeric(18,2) NOT NULL CHECK (daily_limit > 0),
    monthly_limit numeric(18,2),
    requires_approval_above numeric(18,2),
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    UNIQUE(role, channel, transaction_type)
);

CREATE INDEX IF NOT EXISTS transaction_limits_role_idx ON template.transaction_limits(role);
CREATE INDEX IF NOT EXISTS transaction_limits_channel_idx ON template.transaction_limits(channel);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE template.fee_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_rls_fee_schedules ON template.fee_schedules
    FOR ALL USING (current_setting('app.current_tenant', true) IS NOT NULL);

ALTER TABLE template.transaction_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_rls_transaction_limits ON template.transaction_limits
    FOR ALL USING (current_setting('app.current_tenant', true) IS NOT NULL);