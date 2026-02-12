-- FINANCIAL PERIODS
CREATE TABLE IF NOT EXISTS template.financial_periods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identification
    name varchar(100) NOT NULL, -- e.g. "October 2023" or "FY 2023 Q4"
    
    -- Duration
    start_date date NOT NULL,
    end_date date NOT NULL,

    -- Status
    status varchar(20) CHECK (status IN ('open', 'pending_review', 'closed')) DEFAULT 'open',
    
    -- Constraints to ensure logic
    CONSTRAINT periods_end_after_start CHECK (end_date >= start_date),

    -- Audit 
    created_by uuid,
    updated_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

-- INDEXES
CREATE INDEX IF NOT EXISTS financial_periods_dates_idx ON template.financial_periods(start_date, end_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS financial_periods_status_idx ON template.financial_periods(status) WHERE deleted_at IS NULL;
