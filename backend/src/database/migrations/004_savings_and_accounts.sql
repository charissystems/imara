-- ============================================================================
-- SAVINGS & WITHDRAWALS
-- Savings accounts, deposits, withdrawals, transfers, and interest management
-- ============================================================================

-- SAVINGS PRODUCTS
CREATE TABLE IF NOT EXISTS template.savings_products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    code varchar(20) NOT NULL UNIQUE,
    name varchar(100) NOT NULL,
    description text,
    
    -- Interest Configuration
    interest_rate numeric(10, 4) NOT NULL CHECK (interest_rate >= 0), -- Annual percentage
    interest_paid_frequency varchar(50) CHECK (interest_paid_frequency IN ('monthly', 'quarterly', 'annually', 'on_withdrawal')) DEFAULT 'monthly',
    interest_calculation_method varchar(50) CHECK (interest_calculation_method IN ('simple', 'compound')) DEFAULT 'simple',
    calculation_basis varchar(50) DEFAULT '365_days', -- 365_days or 360_days
    
    -- Account Requirements
    minimum_balance numeric(20, 4) DEFAULT 0,
    maximum_balance numeric(20, 4),
    
    -- Withdrawal Configuration
    allows_overdraft boolean DEFAULT false,
    overdraft_limit numeric(20, 4) DEFAULT 0,
    overdraft_interest_rate numeric(10, 4),
    
    -- Status
    is_active boolean DEFAULT true,
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS savings_products_code_unique ON template.savings_products(code) WHERE deleted_at IS NULL;

-- SAVINGS ACCOUNTS
CREATE TABLE IF NOT EXISTS template.savings_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    member_id uuid NOT NULL REFERENCES template.members(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES template.savings_products(id) ON DELETE RESTRICT,
    
    account_number varchar(30) NOT NULL UNIQUE,
    
    -- Account Status
    status varchar(20) CHECK (status IN ('active', 'dormant', 'closed', 'suspended')) DEFAULT 'active' NOT NULL,
    
    -- Balance Tracking
    principal_balance numeric(20, 4) DEFAULT 0,
    interest_accrued numeric(20, 4) DEFAULT 0,
    interest_paid numeric(20, 4) DEFAULT 0,
    
    -- Dates
    opened_date date NOT NULL DEFAULT CURRENT_DATE,
    closed_date date,
    
    -- Restrictions
    is_frozen boolean DEFAULT false,
    freeze_reason text,
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS savings_accounts_number_unique ON template.savings_accounts(account_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS savings_accounts_member_idx ON template.savings_accounts(member_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS savings_accounts_status_idx ON template.savings_accounts(status) WHERE deleted_at IS NULL;

-- DEPOSITS
CREATE TABLE IF NOT EXISTS template.deposits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    savings_account_id uuid NOT NULL REFERENCES template.savings_accounts(id) ON DELETE CASCADE,
    member_id uuid NOT NULL REFERENCES template.members(id) ON DELETE CASCADE,
    
    deposit_number varchar(30) NOT NULL UNIQUE,
    
    -- Transaction Details
    amount numeric(20, 4) NOT NULL CHECK (amount > 0),
    currency_code char(3) DEFAULT 'UGX',
    deposit_date date NOT NULL DEFAULT CURRENT_DATE,
    
    -- Payment Method
    payment_method varchar(50) CHECK (payment_method IN ('cash', 'mobile_money', 'bank_transfer', 'cheque', 'internal')) NOT NULL,
    payment_reference varchar(100),
    
    -- Status
    status varchar(20) CHECK (status IN ('pending', 'posted', 'rejected', 'reversed')) DEFAULT 'pending' NOT NULL,
    
    -- Ledger Entry
    transaction_id uuid REFERENCES template.transactions(id) ON DELETE SET NULL,
    
    -- Description & Audit
    description text,
    recorded_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_at timestamptz,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS deposits_number_unique ON template.deposits(deposit_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS deposits_account_idx ON template.deposits(savings_account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS deposits_member_idx ON template.deposits(member_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS deposits_date_idx ON template.deposits(deposit_date) WHERE deleted_at IS NULL;

-- WITHDRAWALS
CREATE TABLE IF NOT EXISTS template.withdrawals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    savings_account_id uuid NOT NULL REFERENCES template.savings_accounts(id) ON DELETE CASCADE,
    member_id uuid NOT NULL REFERENCES template.members(id) ON DELETE CASCADE,
    
    withdrawal_number varchar(30) NOT NULL UNIQUE,
    
    -- Transaction Details
    amount numeric(20, 4) NOT NULL CHECK (amount > 0),
    currency_code char(3) DEFAULT 'UGX',
    withdrawal_date date NOT NULL DEFAULT CURRENT_DATE,
    
    -- Payout Method
    payout_method varchar(50) CHECK (payout_method IN ('cash', 'mobile_money', 'bank_transfer', 'cheque')) NOT NULL,
    payout_reference varchar(100),
    payout_account varchar(100), -- Bank account, mobile money number, etc.
    
    -- Status
    status varchar(20) CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'reversed')) DEFAULT 'pending' NOT NULL,
    
    -- Ledger Entry
    transaction_id uuid REFERENCES template.transactions(id) ON DELETE SET NULL,
    
    -- Description & Audit
    description text,
    requested_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_at timestamptz,
    processed_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    processed_at timestamptz,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS withdrawals_number_unique ON template.withdrawals(withdrawal_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS withdrawals_account_idx ON template.withdrawals(savings_account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS withdrawals_member_idx ON template.withdrawals(member_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS withdrawals_status_idx ON template.withdrawals(status) WHERE deleted_at IS NULL;

-- INTERNAL TRANSFERS
CREATE TABLE IF NOT EXISTS template.internal_transfers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    from_account_id uuid NOT NULL REFERENCES template.savings_accounts(id) ON DELETE CASCADE,
    to_account_id uuid NOT NULL REFERENCES template.savings_accounts(id) ON DELETE CASCADE,
    
    transfer_number varchar(30) NOT NULL UNIQUE,
    
    -- Transaction Details
    amount numeric(20, 4) NOT NULL CHECK (amount > 0),
    currency_code char(3) DEFAULT 'UGX',
    transfer_date date NOT NULL DEFAULT CURRENT_DATE,
    
    -- Status
    status varchar(20) CHECK (status IN ('pending', 'posted', 'rejected', 'reversed')) DEFAULT 'pending' NOT NULL,
    
    -- Ledger Entries
    from_transaction_id uuid REFERENCES template.transactions(id) ON DELETE SET NULL,
    to_transaction_id uuid REFERENCES template.transactions(id) ON DELETE SET NULL,
    
    -- Description & Audit
    description text,
    initiated_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_at timestamptz,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS transfers_number_unique ON template.internal_transfers(transfer_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS transfers_from_account_idx ON template.internal_transfers(from_account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS transfers_to_account_idx ON template.internal_transfers(to_account_id) WHERE deleted_at IS NULL;

-- INTEREST SCHEDULES
-- Tracks interest accrual for savings accounts
CREATE TABLE IF NOT EXISTS template.interest_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    savings_account_id uuid NOT NULL REFERENCES template.savings_accounts(id) ON DELETE CASCADE,
    
    -- Period Information
    period_start date NOT NULL,
    period_end date NOT NULL,
    
    -- Interest Calculation
    opening_balance numeric(20, 4),
    closing_balance numeric(20, 4),
    average_balance numeric(20, 4),
    interest_rate numeric(10, 4),
    interest_accrued numeric(20, 4),
    
    -- Status
    is_posted boolean DEFAULT false,
    posted_at timestamptz,
    
    -- Audit
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS interest_schedules_account_idx ON template.interest_schedules(savings_account_id);
CREATE INDEX IF NOT EXISTS interest_schedules_period_idx ON template.interest_schedules(period_start, period_end);
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
-- ─────────────────────────────────────────────────────────────────────
-- PERFORMANCE INDEXES
-- ─────────────────────────────────────────────────────────────────────

-- Savings accounts: member lookup with balance (most balance-check queries)
CREATE INDEX IF NOT EXISTS idx_savings_accounts_member_balance
    ON template.savings_accounts(member_id, status)
    INCLUDE (principal_balance, account_number)
    WHERE deleted_at IS NULL;

-- Savings accounts: product-based interest posting batch
CREATE INDEX IF NOT EXISTS idx_savings_accounts_product_active
    ON template.savings_accounts(product_id, status, is_frozen)
    WHERE status = 'active' AND is_frozen = false AND deleted_at IS NULL;

-- FK index: savings_accounts → member
CREATE INDEX IF NOT EXISTS idx_savings_accounts_member_fk
    ON template.savings_accounts(member_id)
    WHERE deleted_at IS NULL;

-- FK index: savings_accounts → product
CREATE INDEX IF NOT EXISTS idx_savings_accounts_product_fk
    ON template.savings_accounts(product_id)
    WHERE deleted_at IS NULL;

-- Deposits: per-account chronological lookup
CREATE INDEX IF NOT EXISTS idx_deposits_account_date
    ON template.deposits(savings_account_id, deposit_date DESC)
    WHERE deleted_at IS NULL;

-- Withdrawals: per-account + status (approval workflows)
CREATE INDEX IF NOT EXISTS idx_withdrawals_account_status
    ON template.withdrawals(savings_account_id, status, withdrawal_date DESC)
    WHERE deleted_at IS NULL;

-- Withdrawals: pending-only partial index (approval queue)
CREATE INDEX IF NOT EXISTS idx_withdrawals_pending
    ON template.withdrawals(status, requested_date)
    WHERE status = 'pending' AND deleted_at IS NULL;

-- Transfers: source and destination account lookups
CREATE INDEX IF NOT EXISTS idx_transfers_source_date
    ON template.transfers(source_account_id, transfer_date DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_transfers_destination_date
    ON template.transfers(destination_account_id, transfer_date DESC)
    WHERE deleted_at IS NULL;

-- Interest schedules: batch posting job (unposted schedules only)
CREATE INDEX IF NOT EXISTS idx_interest_schedules_posting
    ON template.interest_schedules(savings_account_id, is_posted, period_start)
    WHERE is_posted = false;

-- Statistics targets
ALTER TABLE template.savings_accounts ALTER COLUMN member_id SET STATISTICS 1000;
