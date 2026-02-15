-- ============================================================================
-- FIXED DEPOSITS
-- Term deposit management with maturity tracking and interest computation
-- ============================================================================

-- FIXED DEPOSIT PRODUCTS
CREATE TABLE IF NOT EXISTS template.fixed_deposit_products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    code varchar(20) NOT NULL UNIQUE,
    name varchar(100) NOT NULL,
    description text,
    
    -- Tenure Configuration
    tenure_days integer NOT NULL CHECK (tenure_days > 0),
    tenure_type varchar(50) CHECK (tenure_type IN ('days', 'months', 'years')) DEFAULT 'days',
    
    -- Amount Configuration
    minimum_amount numeric(20, 4) NOT NULL CHECK (minimum_amount > 0),
    maximum_amount numeric(20, 4),
    
    -- Interest Rate Configuration
    fixed_interest_rate numeric(10, 4) NOT NULL CHECK (fixed_interest_rate >= 0),
    interest_paid_frequency varchar(50) CHECK (interest_paid_frequency IN ('monthly', 'quarterly', 'semi_annual', 'annual', 'at_maturity')) DEFAULT 'at_maturity',
    interest_calculation_method varchar(50) CHECK (interest_calculation_method IN ('simple', 'compound')) DEFAULT 'simple',
    calculation_basis varchar(50) DEFAULT '365_days',
    
    -- Early Withdrawal
    allows_premature_withdrawal boolean DEFAULT false,
    premature_withdrawal_penalty_type varchar(50) CHECK (premature_withdrawal_penalty_type IN ('fixed_amount', 'percentage', 'interest_reduction')) DEFAULT 'percentage',
    premature_withdrawal_penalty numeric(10, 4) DEFAULT 0,
    
    -- Auto-Rollover Configuration
    allows_auto_rollover boolean DEFAULT true,
    default_rollover_type varchar(50) CHECK (default_rollover_type IN ('principal_only', 'principal_plus_interest', 'custom')) DEFAULT 'principal_plus_interest',
    
    -- Withholding Tax
    withholding_tax_rate numeric(10, 4) DEFAULT 0,
    
    -- Status
    is_active boolean DEFAULT true,
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS fd_products_code_unique ON template.fixed_deposit_products(code) WHERE deleted_at IS NULL;

-- FIXED DEPOSITS (Accounts)
CREATE TABLE IF NOT EXISTS template.fixed_deposits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    member_id uuid NOT NULL REFERENCES template.members(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES template.fixed_deposit_products(id) ON DELETE RESTRICT,
    
    certificate_number varchar(50) NOT NULL UNIQUE,
    
    -- Deposit Details
    principal_amount numeric(20, 4) NOT NULL CHECK (principal_amount > 0),
    currency_code char(3) DEFAULT 'UGX',
    interest_rate numeric(10, 4) NOT NULL,
    
    -- Dates
    deposit_date date NOT NULL DEFAULT CURRENT_DATE,
    maturity_date date NOT NULL,
    
    -- Interest Tracking
    total_interest_payable numeric(20, 4),
    interest_accrued numeric(20, 4) DEFAULT 0,
    interest_paid numeric(20, 4) DEFAULT 0,
    withholding_tax_amount numeric(20, 4) DEFAULT 0,
    
    -- Status
    status varchar(20) CHECK (status IN ('active', 'matured', 'closed', 'rolled_over')) DEFAULT 'active' NOT NULL,
    
    -- Maturity Action
    maturity_action varchar(50) CHECK (maturity_action IN ('auto_rollover', 'manual_action_pending', 'withdrawn')) DEFAULT 'manual_action_pending',
    maturity_action_date date,
    
    -- Certificates
    certificate_url varchar(500),
    
    -- Ledger entries
    deposit_transaction_id uuid REFERENCES template.transactions(id) ON DELETE SET NULL,
    
    -- Audit
    recorded_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS fixed_deposits_cert_unique ON template.fixed_deposits(certificate_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS fixed_deposits_member_idx ON template.fixed_deposits(member_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS fixed_deposits_status_idx ON template.fixed_deposits(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS fixed_deposits_maturity_idx ON template.fixed_deposits(maturity_date) WHERE status = 'active' AND deleted_at IS NULL;

-- FIXED DEPOSIT INTEREST SCHEDULES
CREATE TABLE IF NOT EXISTS template.fd_interest_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    fixed_deposit_id uuid NOT NULL REFERENCES template.fixed_deposits(id) ON DELETE CASCADE,
    
    -- Period Information
    interest_period_number integer NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    
    -- Calculation
    opening_balance numeric(20, 4),
    interest_accrued numeric(20, 4),
    interest_paid numeric(20, 4) DEFAULT 0,
    withholding_tax numeric(20, 4) DEFAULT 0,
    net_interest numeric(20, 4),
    
    -- Payment Details
    due_date date NOT NULL,
    payment_date date,
    payment_method varchar(50),
    
    -- Status
    status varchar(20) CHECK (status IN ('accrued', 'due', 'paid', 'waived')) DEFAULT 'accrued' NOT NULL,
    
    -- Audit
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS fd_interest_deposit_idx ON template.fd_interest_schedules(fixed_deposit_id);
CREATE INDEX IF NOT EXISTS fd_interest_period_idx ON template.fd_interest_schedules(period_start, period_end);

-- FIXED DEPOSIT MATURITY ALERTS
CREATE TABLE IF NOT EXISTS template.fd_maturity_alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    fixed_deposit_id uuid NOT NULL REFERENCES template.fixed_deposits(id) ON DELETE CASCADE,
    
    -- Alert Configuration
    days_before integer NOT NULL, -- 30, 14, or 7
    alert_date date NOT NULL,
    
    -- Delivery Status
    sent_to_member boolean DEFAULT false,
    sent_to_staff boolean DEFAULT false,
    sent_at timestamptz,
    
    -- Channel
    delivery_channel varchar(50) CHECK (delivery_channel IN ('sms', 'email', 'push_notification', 'system_notification')) DEFAULT 'sms',
    
    -- Audit
    created_at timestamptz DEFAULT now() NOT NULL,
    sent_by uuid REFERENCES template.staff(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS fd_alerts_deposit_idx ON template.fd_maturity_alerts(fixed_deposit_id);
CREATE INDEX IF NOT EXISTS fd_alerts_sent_idx ON template.fd_maturity_alerts(sent_to_member);

-- FIXED DEPOSIT ROLLOVERS
CREATE TABLE IF NOT EXISTS template.fd_rollovers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    original_fd_id uuid NOT NULL REFERENCES template.fixed_deposits(id) ON DELETE RESTRICT,
    new_fd_id uuid REFERENCES template.fixed_deposits(id) ON DELETE SET NULL,
    
    -- Rollover Details
    rollover_date date NOT NULL,
    rollover_type varchar(50) CHECK (rollover_type IN ('principal_only', 'principal_plus_interest', 'custom')) NOT NULL,
    
    -- Amounts
    principal_rolled numeric(20, 4) NOT NULL,
    interest_option varchar(50) CHECK (interest_option IN ('credited_to_savings', 'reinvested', 'paid_out')) DEFAULT 'reinvested',
    
    -- Status
    status varchar(20) CHECK (status IN ('pending', 'processed', 'cancelled')) DEFAULT 'pending' NOT NULL,
    
    -- Audit
    initiated_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    processed_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    processed_at timestamptz,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS fd_rollovers_original_idx ON template.fd_rollovers(original_fd_id);
CREATE INDEX IF NOT EXISTS fd_rollovers_new_idx ON template.fd_rollovers(new_fd_id);
-- MATURITY ALERTS (For Fixed Deposits)
CREATE TABLE IF NOT EXISTS template.maturity_alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Association
    alert_type varchar(50) CHECK (alert_type IN ('fixed_deposit', 'loan')) NOT NULL,
    fixed_deposit_id uuid REFERENCES template.fixed_deposits(id) ON DELETE CASCADE,
    loan_account_id uuid REFERENCES template.loan_accounts(id) ON DELETE CASCADE,
    
    member_id uuid NOT NULL REFERENCES template.members(id) ON DELETE CASCADE,
    
    -- Alert Configuration
    days_before integer NOT NULL CHECK (days_before > 0),
    alert_date date NOT NULL,
    maturity_date date NOT NULL,
    
    -- Delivery Status
    sent_to_member boolean DEFAULT false,
    sent_to_staff boolean DEFAULT false,
    sent_at timestamptz,
    
    -- Message
    template_id uuid REFERENCES template.message_templates(id) ON DELETE SET NULL,
    
    is_active boolean DEFAULT true,
    
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS maturity_alerts_member_idx ON template.maturity_alerts(member_id);
CREATE INDEX IF NOT EXISTS maturity_alerts_sent_idx ON template.maturity_alerts(sent_to_member);