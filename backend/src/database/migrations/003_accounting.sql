-- ============================================================================
-- ACCOUNTING & FINANCIAL MANAGEMENT
-- Double-entry accounting system with chart of accounts, transactions, 
-- financial periods, and reporting
-- ============================================================================

-- FINANCIAL PERIODS
CREATE TABLE IF NOT EXISTS template.financial_periods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identification
    name varchar(100) NOT NULL,
    
    -- Duration
    start_date date NOT NULL,
    end_date date NOT NULL,

    -- Status
    status varchar(20) CHECK (status IN ('open', 'pending_review', 'closed')) DEFAULT 'open' NOT NULL,
    
    -- Constraints to ensure logic
    CONSTRAINT periods_end_after_start CHECK (end_date >= start_date),

    -- Audit 
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS financial_periods_dates_idx ON template.financial_periods(start_date, end_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS financial_periods_status_idx ON template.financial_periods(status) WHERE deleted_at IS NULL;

-- CHART OF ACCOUNTS
CREATE TABLE IF NOT EXISTS template.accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identification
    code varchar(20) NOT NULL UNIQUE,
    name varchar(255) NOT NULL,
    description text,
    
    -- Hierarchy
    parent_id uuid REFERENCES template.accounts(id) ON DELETE SET NULL,
    
    -- Accounting Properties
    account_type varchar(50) NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense')),
    normal_balance varchar(10) NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
    
    -- Status
    is_active boolean DEFAULT true NOT NULL,
    allows_posting boolean DEFAULT true,
    
    -- Balance Snapshot
    opening_balance numeric(20, 4) DEFAULT 0,
    current_balance numeric(20, 4) DEFAULT 0,
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_code_unique ON template.accounts(code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS accounts_type_idx ON template.accounts(account_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS accounts_parent_idx ON template.accounts(parent_id) WHERE deleted_at IS NULL;

-- TRANSACTIONS (Double-Entry Journal Entries)
CREATE TABLE IF NOT EXISTS template.transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reference
    code varchar(20) NOT NULL UNIQUE,
    
    -- Association (Optional - some transactions are SACCO-level)
    member_id uuid REFERENCES template.members(id) ON DELETE RESTRICT,

    -- Transaction Details
    category varchar(50) CHECK (category IN ('deposit', 'withdrawal', 'transfer', 'reversal', 'fee', 'interest', 'contribution', 'loan_disbursement', 'loan_repayment', 'dividend', 'manual')) NOT NULL,
    amount numeric(20, 4) CHECK (amount >= 0) NOT NULL,
    currency_code char(3) DEFAULT 'UGX' NOT NULL,
    transaction_date date CHECK (transaction_date <= CURRENT_DATE) NOT NULL,
    
    -- Payment Method
    payment_method varchar(50) CHECK (payment_method IN ('cash', 'mobile_money', 'bank_transfer', 'internal', 'cheque', 'system')) NOT NULL,
    reference_code varchar(100),

    -- Double Entry Core
    debit_account_id uuid NOT NULL REFERENCES template.accounts(id) ON DELETE RESTRICT,
    credit_account_id uuid NOT NULL REFERENCES template.accounts(id) ON DELETE RESTRICT,

    -- Period & Locking
    financial_period_id uuid REFERENCES template.financial_periods(id) ON DELETE SET NULL,
    is_locked boolean DEFAULT false,

    -- Reconciliation
    is_reconciled boolean DEFAULT false,
    reconciled_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    reconciled_at timestamptz,

    -- Description
    description text NOT NULL,
    notes text,
    
    -- Source Reference (Link to originating transaction)
    source_type varchar(50), -- deposit, withdrawal, loan_repayment, etc.
    source_id uuid,

    -- Audit
    recorded_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_at timestamptz,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS transactions_code_unique ON template.transactions(code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS transactions_member_idx ON template.transactions(member_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS transactions_accounts_idx ON template.transactions(debit_account_id, credit_account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS transactions_date_idx ON template.transactions(transaction_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS transactions_period_idx ON template.transactions(financial_period_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS transactions_category_idx ON template.transactions(category) WHERE deleted_at IS NULL;

-- MANUAL JOURNAL ENTRIES
CREATE TABLE IF NOT EXISTS template.manual_journal_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    journal_number varchar(30) NOT NULL UNIQUE,
    financial_period_id uuid REFERENCES template.financial_periods(id) ON DELETE SET NULL,
    
    -- Description
    description text NOT NULL,
    entry_date date NOT NULL DEFAULT CURRENT_DATE,
    
    -- Status
    status varchar(20) CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'posted')) DEFAULT 'draft' NOT NULL,
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    submitted_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    submitted_at timestamptz,
    approved_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_at timestamptz,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS manual_entries_number_unique ON template.manual_journal_entries(journal_number);
CREATE INDEX IF NOT EXISTS manual_entries_status_idx ON template.manual_journal_entries(status);

-- MANUAL JOURNAL ENTRY LINES
CREATE TABLE IF NOT EXISTS template.manual_journal_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    journal_entry_id uuid NOT NULL REFERENCES template.manual_journal_entries(id) ON DELETE CASCADE,
    
    line_number integer NOT NULL,
    
    account_id uuid NOT NULL REFERENCES template.accounts(id) ON DELETE RESTRICT,
    
    -- Amount
    debit_amount numeric(20, 4) DEFAULT 0,
    credit_amount numeric(20, 4) DEFAULT 0,
    
    description text,
    
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS manual_lines_entry_idx ON template.manual_journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS manual_lines_account_idx ON template.manual_journal_lines(account_id);

-- BUDGETS (Optional for MVP but included)
CREATE TABLE IF NOT EXISTS template.budgets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    budget_number varchar(30) NOT NULL UNIQUE,
    financial_period_id uuid NOT NULL REFERENCES template.financial_periods(id) ON DELETE CASCADE,
    
    -- Budget Details
    name varchar(100) NOT NULL,
    description text,
    
    -- Status
    status varchar(20) CHECK (status IN ('draft', 'approved', 'active', 'closed')) DEFAULT 'draft' NOT NULL,
    
    -- Approved Flag
    is_approved boolean DEFAULT false,
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_at timestamptz,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS budgets_number_unique ON template.budgets(budget_number);
CREATE INDEX IF NOT EXISTS budgets_period_idx ON template.budgets(financial_period_id);
CREATE INDEX IF NOT EXISTS budgets_status_idx ON template.budgets(status);

-- BUDGET LINES
CREATE TABLE IF NOT EXISTS template.budget_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    budget_id uuid NOT NULL REFERENCES template.budgets(id) ON DELETE CASCADE,
    
    account_id uuid NOT NULL REFERENCES template.accounts(id) ON DELETE RESTRICT,
    
    -- Amounts
    budgeted_amount numeric(20, 4) NOT NULL CHECK (budgeted_amount >= 0),
    actual_amount numeric(20, 4) DEFAULT 0,
    variance numeric(20, 4) DEFAULT 0,
    variance_percentage numeric(10, 4) DEFAULT 0,
    
    notes text,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS budget_lines_budget_idx ON template.budget_lines(budget_id);
CREATE INDEX IF NOT EXISTS budget_lines_account_idx ON template.budget_lines(account_id);

-- TRIAL BALANCE (View/Materialized View for reporting)
CREATE TABLE IF NOT EXISTS template.trial_balance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    financial_period_id uuid NOT NULL REFERENCES template.financial_periods(id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES template.accounts(id) ON DELETE CASCADE,
    
    opening_balance numeric(20, 4),
    debit_transactions numeric(20, 4) DEFAULT 0,
    credit_transactions numeric(20, 4) DEFAULT 0,
    closing_balance numeric(20, 4),
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS trial_balance_period_idx ON template.trial_balance(financial_period_id);
CREATE INDEX IF NOT EXISTS trial_balance_account_idx ON template.trial_balance(account_id);

-- ─────────────────────────────────────────────────────────────────────
-- PERFORMANCE INDEXES
-- ─────────────────────────────────────────────────────────────────────

-- GL postings: accounting report queries by account + date
CREATE INDEX IF NOT EXISTS idx_gl_postings_account_date
    ON template.gl_postings(account_code, posting_date);

-- Transactions: date-range + type filtering (most report queries)
CREATE INDEX IF NOT EXISTS idx_transactions_date_type
    ON template.transactions(transaction_date, transaction_type, status)
    WHERE deleted_at IS NULL;

-- Transactions: per-account statement queries
CREATE INDEX IF NOT EXISTS idx_transactions_account_date
    ON template.transactions(related_account_id, transaction_date DESC)
    WHERE deleted_at IS NULL;

-- Statistics targets
ALTER TABLE template.transactions ALTER COLUMN transaction_date SET STATISTICS 1000;
