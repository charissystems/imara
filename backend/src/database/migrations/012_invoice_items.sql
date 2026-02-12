-- INVOICE ITEMS
CREATE TABLE IF NOT EXISTS template.invoice_items(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    invoice_id uuid NOT NULL REFERENCES template.invoices(id) ON DELETE CASCADE,
    
    -- Item Details
    description varchar(255) NOT NULL,
    quantity numeric(10, 2) CHECK (quantity > 0) DEFAULT 1,
    unit_price numeric(20, 4) CHECK (unit_price > 0) NOT NULL,
    
    -- Totals
    tax_rate numeric(5, 2) CHECK (tax_rate >= 0) DEFAULT 0, -- Percentage
    discount_amount numeric(20, 4) CHECK (discount_amount >= 0) DEFAULT 0,
    subtotal numeric(20, 4) GENERATED ALWAYS AS ((quantity * unit_price) - discount_amount) STORED,
    
    -- Reference to account (Debit)
    -- Allows knowing which account (e.g. "School Fees", "Shop Sales") this invoice item impacts
    account_id uuid REFERENCES template.accounts(id) ON DELETE SET NULL,

    -- Audit
    created_by uuid,
    updated_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

-- INDEXES
CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON template.invoice_items(invoice_id) WHERE deleted_at IS NULL;
