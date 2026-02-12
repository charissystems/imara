-- CHART OF ACCOUNTS
CREATE TABLE IF NOT EXISTS template.accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identification
    code varchar(20) NOT NULL, -- e.g., "1000", "1200"
    name varchar(255) NOT NULL,
    description text,
    
    -- Hierarchy
    parent_id uuid REFERENCES template.accounts(id) ON DELETE SET NULL, -- Allows nested accounts (e.g. 'Cash' -> 'Petty Cash')
    
    -- Accounting Properties
    account_type varchar(50) NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense')),
    normal_balance varchar(10) NOT NULL CHECK (normal_balance IN ('debit', 'credit')), -- Helps calculate balances
    
    -- Status
    is_active boolean DEFAULT true,
    allows_posting boolean DEFAULT true, -- Some parent accounts are just for categorization
    
    -- Balance Tracking (Optional snapshot)
    opening_balance numeric(20, 4) DEFAULT 0,
    current_balance numeric(20, 4) DEFAULT 0, -- Triggers usually update this
    
    -- Audit
    created_by uuid,
    updated_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

-- INDEXES
CREATE UNIQUE INDEX IF NOT EXISTS accounts_code_unique ON template.accounts(code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS accounts_type_idx ON template.accounts(account_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS accounts_parent_idx ON template.accounts(parent_id) WHERE deleted_at IS NULL;
