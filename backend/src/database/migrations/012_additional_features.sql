-- ============================================================================
-- ADDITIONAL FEATURES (012)
-- Beneficiaries, account liens, standing instructions, member credentials,
-- fee schedules, and transaction limits
-- ============================================================================

-- BENEFICIARIES
CREATE TABLE IF NOT EXISTS template.beneficiaries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id uuid NOT NULL REFERENCES template.members(id) ON DELETE CASCADE,
    account_id uuid REFERENCES template.savings_accounts(id) ON DELETE SET NULL,
    full_name varchar(200) NOT NULL,
    relationship varchar(100) NOT NULL,
    phone varchar(20),
    email varchar(200),
    national_id varchar(50),
    percentage_share numeric(5,2) NOT NULL DEFAULT 0 CHECK (percentage_share >= 0 AND percentage_share <= 100),
    is_primary boolean NOT NULL DEFAULT false,
    status varchar(20) CHECK (status IN ('active', 'inactive', 'removed')) NOT NULL DEFAULT 'active',
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS beneficiaries_member_idx ON template.beneficiaries(member_id);
CREATE INDEX IF NOT EXISTS beneficiaries_account_idx ON template.beneficiaries(account_id);
CREATE INDEX IF NOT EXISTS beneficiaries_status_idx ON template.beneficiaries(status);

-- ACCOUNT LIENS
CREATE TABLE IF NOT EXISTS template.account_liens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES template.savings_accounts(id) ON DELETE RESTRICT,
    amount numeric(18,2) NOT NULL CHECK (amount > 0),
    reason text NOT NULL,
    lien_type varchar(50) CHECK (lien_type IN ('loan_collateral', 'legal_hold', 'manual')) NOT NULL DEFAULT 'manual',
    placed_by uuid NOT NULL REFERENCES template.staff(id) ON DELETE RESTRICT,
    placed_at timestamptz NOT NULL DEFAULT now(),
    released_at timestamptz,
    released_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    release_reason text,
    related_loan_id uuid REFERENCES template.loan_accounts(id) ON DELETE SET NULL,
    status varchar(20) CHECK (status IN ('active', 'released', 'expired')) NOT NULL DEFAULT 'active',
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS account_liens_account_idx ON template.account_liens(account_id);
CREATE INDEX IF NOT EXISTS account_liens_status_idx ON template.account_liens(status);
CREATE INDEX IF NOT EXISTS account_liens_loan_idx ON template.account_liens(related_loan_id);

-- STANDING INSTRUCTIONS
CREATE TABLE IF NOT EXISTS template.standing_instructions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id uuid NOT NULL REFERENCES template.members(id) ON DELETE CASCADE,
    instruction_type varchar(50) CHECK (instruction_type IN ('savings_split', 'loan_repayment', 'transfer', 'share_purchase')) NOT NULL,
    source_account_id uuid NOT NULL REFERENCES template.savings_accounts(id) ON DELETE RESTRICT,
    destination_account_id uuid REFERENCES template.savings_accounts(id) ON DELETE SET NULL,
    destination_external jsonb,
    amount numeric(18,2) NOT NULL CHECK (amount > 0),
    frequency varchar(20) CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annually')) NOT NULL,
    start_date date NOT NULL,
    end_date date,
    next_execution_date date NOT NULL,
    last_execution_date date,
    execution_count integer NOT NULL DEFAULT 0,
    max_executions integer,
    status varchar(20) CHECK (status IN ('active', 'paused', 'completed', 'cancelled')) NOT NULL DEFAULT 'active',
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS standing_instructions_member_idx ON template.standing_instructions(member_id);
CREATE INDEX IF NOT EXISTS standing_instructions_source_idx ON template.standing_instructions(source_account_id);
CREATE INDEX IF NOT EXISTS standing_instructions_next_exec_idx ON template.standing_instructions(next_execution_date) WHERE status = 'active';

-- MEMBER CREDENTIALS (PINs for member self-service)
CREATE TABLE IF NOT EXISTS template.member_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id uuid NOT NULL UNIQUE REFERENCES template.members(id) ON DELETE CASCADE,
    pin_hash varchar(255) NOT NULL,
    pin_salt varchar(100) NOT NULL,
    pin_attempts integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 5,
    is_locked boolean NOT NULL DEFAULT false,
    locked_at timestamptz,
    last_pin_change timestamptz NOT NULL DEFAULT now(),
    force_change boolean NOT NULL DEFAULT false,
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS member_credentials_member_idx ON template.member_credentials(member_id);

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

ALTER TABLE template.beneficiaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_rls_beneficiaries ON template.beneficiaries
    FOR ALL USING (current_setting('app.current_tenant', true) IS NOT NULL);

ALTER TABLE template.account_liens ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_rls_account_liens ON template.account_liens
    FOR ALL USING (current_setting('app.current_tenant', true) IS NOT NULL);

ALTER TABLE template.standing_instructions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_rls_standing_instructions ON template.standing_instructions
    FOR ALL USING (current_setting('app.current_tenant', true) IS NOT NULL);

ALTER TABLE template.member_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_rls_member_credentials ON template.member_credentials
    FOR ALL USING (current_setting('app.current_tenant', true) IS NOT NULL);

ALTER TABLE template.fee_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_rls_fee_schedules ON template.fee_schedules
    FOR ALL USING (current_setting('app.current_tenant', true) IS NOT NULL);

ALTER TABLE template.transaction_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_rls_transaction_limits ON template.transaction_limits
    FOR ALL USING (current_setting('app.current_tenant', true) IS NOT NULL);
