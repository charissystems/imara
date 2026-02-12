-- INVOICES
CREATE TABLE IF NOT EXISTS template.invoices(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    member_id uuid NOT NULL REFERENCES template.members(id) ON DELETE RESTRICT,
    invoice_number varchar(20) NOT NULL UNIQUE,
    
    -- Dates
    issue_date date DEFAULT CURRENT_DATE NOT NULL,
    due_date date NOT NULL,
    
    -- Amounts
    total_amount numeric(20, 4) CHECK (total_amount > 0) NOT NULL,
    tax_amount numeric(20, 4) CHECK (tax_amount >= 0) DEFAULT 0,
    discount_amount numeric(20, 4) CHECK (discount_amount >= 0) DEFAULT 0,
    paid_amount numeric(20, 4) CHECK (paid_amount >= 0) DEFAULT 0,
    
    -- Status Logic
    status varchar(50) CHECK (status IN ('draft', 'sent', 'viewed', 'partial', 'paid', 'overdue', 'cancelled', 'void')) DEFAULT 'draft' NOT NULL,

    -- Metadata
    notes text,
    
    -- Audit
    created_by uuid,
    updated_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

-- INDEXES
CREATE INDEX IF NOT EXISTS invoices_member_idx ON template.invoices(member_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS invoices_status_idx ON template.invoices(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS invoices_due_idx ON template.invoices(due_date) WHERE status NOT IN ('paid', 'cancelled', 'void') AND deleted_at IS NULL;
