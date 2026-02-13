-- TRANSACTIONS
CREATE TABLE IF NOT EXISTS template.transactions(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reference
    code varchar(20) NOT NULL UNIQUE, -- Transaction Reference Number
    
    -- Association
    member_id uuid NOT NULL REFERENCES template.members(id) ON DELETE RESTRICT, -- Protect transaction history

    -- Transaction Details
    category varchar(50) CHECK (category IN ('deposit', 'withdrawal', 'transfer', 'reversal', 'fee', 'interest', 'contribution')) NOT NULL,
    amount numeric(20, 4) CHECK (amount >= 0) NOT NULL, -- Amount is always positive; direction is handled by Debit/Credit
    currency_code char(3) DEFAULT 'UGX',
    transaction_date date CHECK (transaction_date <= CURRENT_DATE) NOT NULL,
    
    -- Payment Method (External movement)
    payment_method varchar(50) CHECK (payment_method IN ('cash', 'mobile_money', 'bank_transfer', 'internal', 'cheque')) NOT NULL,
    reference_code varchar(100), -- External Reference (e.g. Momo Ref, Bank Slip No)

    -- DOUBLE ENTRY CORE
    -- Every transaction must have a source (Credit) and destination (Debit)
    debit_account_id uuid NOT NULL REFERENCES template.accounts(id) ON DELETE RESTRICT,
    credit_account_id uuid NOT NULL REFERENCES template.accounts(id) ON DELETE RESTRICT,

    -- Period and locking
    financial_period_id uuid REFERENCES template.financial_periods(id) ON DELETE SET NULL,
    is_locked boolean DEFAULT false, -- Prevents editing

    -- Reconciliation
    is_reconciled boolean DEFAULT false,
    reconciled_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    reconciled_at timestamptz,

    -- Description
    description text,
    notes text,

    -- Audit
    recorded_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_at timestamptz,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

-- INDEXES
CREATE INDEX IF NOT EXISTS transactions_member_idx ON template.transactions(member_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS transactions_accounts_idx ON template.transactions(debit_account_id, credit_account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS transactions_date_idx ON template.transactions(transaction_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS transactions_period_idx ON template.transactions(financial_period_id) WHERE deleted_at IS NULL;