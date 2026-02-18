-- ============================================================================
-- SHARES MODULE
-- Share capital management, certificates, certificates, and dividend distribution
-- ============================================================================

-- SHARE CLASSES
CREATE TABLE IF NOT EXISTS template.share_classes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    code varchar(20) NOT NULL UNIQUE,
    name varchar(100) NOT NULL,
    description text,
    
    -- Pricing
    par_value numeric(20, 4) NOT NULL CHECK (par_value > 0),
    current_price numeric(20, 4) NOT NULL CHECK (current_price > 0),
    
    -- Holding Limits
    minimum_shares integer DEFAULT 1 CHECK (minimum_shares > 0),
    maximum_shares integer,
    
    -- Dividend Configuration
    dividend_eligible boolean DEFAULT true,
    dividend_percentage numeric(10, 4), -- Annual dividend percentage
    
    -- Status
    is_active boolean DEFAULT true,
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS share_classes_code_unique ON template.share_classes(code) WHERE deleted_at IS NULL;

-- SHARE HOLDINGS
CREATE TABLE IF NOT EXISTS template.share_holdings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    member_id uuid NOT NULL REFERENCES template.members(id) ON DELETE CASCADE,
    share_class_id uuid NOT NULL REFERENCES template.share_classes(id) ON DELETE RESTRICT,
    
    -- Holdings Summary
    total_shares integer NOT NULL CHECK (total_shares > 0),
    average_cost_per_share numeric(20, 4),
    total_invested numeric(20, 4),
    
    -- Certificates
    certificate_number varchar(50) NOT NULL UNIQUE,
    certificate_url varchar(500),
    
    -- Purchase Information
    purchase_date date NOT NULL DEFAULT CURRENT_DATE,
    last_transfer_date date,
    
    -- Restrictions
    is_locked boolean DEFAULT false,
    lock_expiry_date date,
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS share_holdings_certificate_unique ON template.share_holdings(certificate_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS share_holdings_member_idx ON template.share_holdings(member_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS share_holdings_class_idx ON template.share_holdings(share_class_id) WHERE deleted_at IS NULL;

-- SHARE TRANSACTIONS
CREATE TABLE IF NOT EXISTS template.share_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    share_holding_id uuid NOT NULL REFERENCES template.share_holdings(id) ON DELETE CASCADE,
    member_id uuid NOT NULL REFERENCES template.members(id) ON DELETE CASCADE,
    
    transaction_type varchar(50) CHECK (transaction_type IN ('purchase', 'transfer_out', 'transfer_in', 'dividend', 'bonus', 'retirement')) NOT NULL,
    
    -- Transaction Details
    quantity integer NOT NULL CHECK (quantity > 0),
    unit_price numeric(20, 4),
    total_amount numeric(20, 4),
    currency_code char(3) DEFAULT 'UGX',
    
    -- References
    counterparty_member_id uuid REFERENCES template.members(id) ON DELETE SET NULL, -- For transfers
    related_transaction_id uuid REFERENCES template.share_transactions(id) ON DELETE SET NULL,
    
    -- Ledger Entry
    transaction_date date NOT NULL DEFAULT CURRENT_DATE,
    transaction_id uuid REFERENCES template.transactions(id) ON DELETE SET NULL,
    
    -- Status
    status varchar(20) CHECK (status IN ('pending', 'completed', 'rejected', 'reversed')) DEFAULT 'pending' NOT NULL,
    
    -- Audit
    description text,
    recorded_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_at timestamptz,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS share_transactions_holding_idx ON template.share_transactions(share_holding_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS share_transactions_member_idx ON template.share_transactions(member_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS share_transactions_type_idx ON template.share_transactions(transaction_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS share_transactions_date_idx ON template.share_transactions(transaction_date) WHERE deleted_at IS NULL;

-- DIVIDEND DECLARATIONS
CREATE TABLE IF NOT EXISTS template.dividend_declarations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    share_class_id uuid NOT NULL REFERENCES template.share_classes(id) ON DELETE RESTRICT,
    financial_period_id uuid REFERENCES template.financial_periods(id) ON DELETE SET NULL,
    
    -- Dividend Details
    dividend_number varchar(30) NOT NULL UNIQUE,
    dividend_per_share numeric(20, 4) NOT NULL CHECK (dividend_per_share > 0),
    total_dividend_amount numeric(20, 4),
    
    -- Withholding Tax
    withholding_tax_rate numeric(10, 4) DEFAULT 0,
    
    -- Payment Information
    payment_date date NOT NULL,
    record_date date NOT NULL,
    
    -- Configuration
    weighted_holding_method varchar(50) DEFAULT 'average_annual',
    
    -- Status
    status varchar(20) CHECK (status IN ('draft', 'approved', 'processing', 'completed')) DEFAULT 'draft' NOT NULL,
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_at timestamptz,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS dividend_declarations_number_unique ON template.dividend_declarations(dividend_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dividend_declarations_class_idx ON template.dividend_declarations(share_class_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dividend_declarations_status_idx ON template.dividend_declarations(status) WHERE deleted_at IS NULL;

-- SHARE REGISTER
-- Comprehensive historical record of all share transactions
CREATE TABLE IF NOT EXISTS template.share_register (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    member_id uuid NOT NULL REFERENCES template.members(id) ON DELETE CASCADE,
    share_class_id uuid NOT NULL REFERENCES template.share_classes(id) ON DELETE CASCADE,
    
    -- Running Balance
    opening_balance integer NOT NULL DEFAULT 0,
    transaction_quantity integer,
    closing_balance integer,
    
    -- Transaction Reference
    transaction_date date NOT NULL,
    reference_type varchar(50), -- shares_transaction_id, dividend_id, etc.
    reference_id uuid,
    
    -- Audit
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS share_register_member_idx ON template.share_register(member_id);
CREATE INDEX IF NOT EXISTS share_register_class_idx ON template.share_register(share_class_id);
CREATE INDEX IF NOT EXISTS share_register_date_idx ON template.share_register(transaction_date);

-- ─────────────────────────────────────────────────────────────────────
-- PERFORMANCE INDEXES
-- ─────────────────────────────────────────────────────────────────────

-- Share holdings: member portfolio queries
CREATE INDEX IF NOT EXISTS idx_share_holdings_member
    ON template.share_holdings(member_id, share_class_id)
    WHERE deleted_at IS NULL;

-- Share transactions: audit trail / history queries
CREATE INDEX IF NOT EXISTS idx_share_transactions_holding_date
    ON template.share_transactions(holding_id, transaction_date DESC);
