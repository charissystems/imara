-- CONTRIBUTIONS
-- Defines the types of contributions members make (Savings, Shares, Social Fund, etc.)
CREATE TABLE IF NOT EXISTS template.contributions(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identification
    code varchar(20) NOT NULL,
    name varchar(100) NOT NULL,
    description text,
    
    -- Configuration
    frequency varchar(50) CHECK (frequency IN ('weekly', 'bi-weekly', 'monthly', 'quarterly', 'annually', 'one-time')) DEFAULT 'monthly' NOT NULL,
    
    -- Amount Rules
    fixed_amount numeric(20, 4) CHECK (fixed_amount > 0), -- If set, amount is fixed
    minimum_amount numeric(20, 4) CHECK (minimum_amount > 0), -- If set, flexible but min applies
    maximum_amount numeric(20, 4) CHECK (maximum_amount > 0), -- If set, flexible but max applies
    
    -- Behavior
    is_mandatory boolean DEFAULT false,
    is_withdrawable boolean DEFAULT true,
    max_withdrawal_percentage numeric(5, 2) CHECK (max_withdrawal_percentage BETWEEN 0 AND 100), -- e.g. Can only withdraw 80% of shares
    
    -- Integration
    account_id uuid REFERENCES template.accounts(id) ON DELETE SET NULL, -- Which GL account does this go to?

    -- Audit
    created_by uuid,
    updated_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

-- INDEXES
CREATE UNIQUE INDEX IF NOT EXISTS contributions_code_unique ON template.contributions(code) WHERE deleted_at IS NULL;

-- TRIGGER: update_updated_at
CREATE TRIGGER trigger_contributions_updated_at
    BEFORE UPDATE ON template.contributions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
