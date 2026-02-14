-- ============================================================================
-- LOAN MANAGEMENT
-- Full credit lifecycle: products, applications, appraisals, approvals, 
-- disbursements, repayments, and recovery
-- ============================================================================

-- LOAN PRODUCTS
CREATE TABLE IF NOT EXISTS template.loan_products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    code varchar(20) NOT NULL UNIQUE,
    name varchar(100) NOT NULL,
    description text,
    
    -- Loan Amount
    minimum_amount numeric(20, 4) NOT NULL CHECK (minimum_amount > 0),
    maximum_amount numeric(20, 4) NOT NULL CHECK (maximum_amount > 0),
    
    -- Loan Tenure
    minimum_tenure_months integer NOT NULL CHECK (minimum_tenure_months > 0),
    maximum_tenure_months integer NOT NULL CHECK (maximum_tenure_months > 0),
    
    -- Interest Rate
    interest_rate_type varchar(50) CHECK (interest_rate_type IN ('fixed', 'variable')) DEFAULT 'fixed',
    fixed_interest_rate numeric(10, 4),
    interest_calculation_method varchar(50) CHECK (interest_calculation_method IN ('simple', 'compound', 'declining_balance')) DEFAULT 'declining_balance',
    
    -- Repayment
    repayment_frequency varchar(50) CHECK (repayment_frequency IN ('weekly', 'bi_weekly', 'monthly', 'quarterly')) DEFAULT 'monthly',
    
    -- Requirements
    requires_collateral boolean DEFAULT false,
    requires_guarantors boolean DEFAULT false,
    minimum_guarantors integer DEFAULT 0,
    requires_appraisal boolean DEFAULT true,
    requires_insurance boolean DEFAULT false,
    
    -- Penalties
    default_interest_rate numeric(10, 4),
    late_payment_penalty_type varchar(50) CHECK (late_payment_penalty_type IN ('fixed_amount', 'percentage_of_payment')) DEFAULT 'percentage_of_payment',
    late_payment_penalty numeric(10, 4) DEFAULT 0,
    
    -- Approval Requirements
    approval_levels integer DEFAULT 1 CHECK (approval_levels >= 1),
    requires_credit_committee boolean DEFAULT false,
    
    -- Status
    is_active boolean DEFAULT true,
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS loan_products_code_unique ON template.loan_products(code) WHERE deleted_at IS NULL;

-- LOAN APPLICATIONS
CREATE TABLE IF NOT EXISTS template.loan_applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    application_number varchar(30) NOT NULL UNIQUE,
    member_id uuid NOT NULL REFERENCES template.members(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES template.loan_products(id) ON DELETE RESTRICT,
    
    -- Application Details
    requested_amount numeric(20, 4) NOT NULL CHECK (requested_amount > 0),
    requested_tenure_months integer NOT NULL CHECK (requested_tenure_months > 0),
    currency_code char(3) DEFAULT 'UGX',
    
    -- Purpose
    loan_purpose varchar(100) NOT NULL,
    purpose_description text,
    
    -- Status
    status varchar(20) CHECK (status IN ('draft', 'submitted', 'under_appraisal', 'appraisal_complete', 'under_approval', 'approved', 'rejected', 'withdrawn')) DEFAULT 'draft' NOT NULL,
    
    -- Dates
    application_date date NOT NULL DEFAULT CURRENT_DATE,
    submitted_date date,
    decision_date date,
    
    -- Decision (if rejected)
    rejection_reason text,
    
    -- Attachments
    documents jsonb, -- Array of document URLs
    
    -- Audit
    submitted_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS loan_apps_number_unique ON template.loan_applications(application_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS loan_apps_member_idx ON template.loan_applications(member_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS loan_apps_status_idx ON template.loan_applications(status) WHERE deleted_at IS NULL;

-- LOAN APPRAISALS
CREATE TABLE IF NOT EXISTS template.loan_appraisals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    application_id uuid NOT NULL REFERENCES template.loan_applications(id) ON DELETE CASCADE,
    
    -- Appraisal Details
    appraiser_id uuid NOT NULL REFERENCES template.staff(id) ON DELETE RESTRICT,
    appraisal_date date NOT NULL DEFAULT CURRENT_DATE,
    
    -- Financial Analysis
    monthly_income numeric(20, 4),
    monthly_expenses numeric(20, 4),
    disposable_income numeric(20, 4),
    
    -- Credit Analysis
    credit_score integer CHECK (credit_score >= 0 AND credit_score <= 1000),
    credit_history_summary text,
    existing_loans_balance numeric(20, 4),
    debt_to_income_ratio numeric(10, 4),
    
    -- Collateral Assessment
    collateral_description text,
    collateral_estimated_value numeric(20, 4),
    collateral_type varchar(50),
    
    -- Recommendation
    recommended_amount numeric(20, 4),
    recommended_tenure_months integer,
    recommended_interest_rate numeric(10, 4),
    
    -- Risk Assessment
    risk_rating varchar(20) CHECK (risk_rating IN ('low', 'moderate', 'high')) DEFAULT 'moderate',
    risk_factors text,
    
    -- Status
    status varchar(20) CHECK (status IN ('in_progress', 'completed', 'awaiting_review')) DEFAULT 'in_progress' NOT NULL,
    
    -- Comment
    notes text,
    
    -- Audit
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS loan_appraisals_app_idx ON template.loan_appraisals(application_id);
CREATE INDEX IF NOT EXISTS loan_appraisals_appraiser_idx ON template.loan_appraisals(appraiser_id);

-- LOAN GUARANTORS
CREATE TABLE IF NOT EXISTS template.loan_guarantors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    application_id uuid NOT NULL REFERENCES template.loan_applications(id) ON DELETE CASCADE,
    guarantor_id uuid NOT NULL REFERENCES template.members(id) ON DELETE CASCADE,
    
    -- Guarantor Details
    guarantor_number integer NOT NULL, -- 1st, 2nd, etc.
    relationship varchar(100),
    contact_phone varchar(50),
    contact_email varchar(200),
    
    -- Liability
    guaranteed_amount numeric(20, 4) NOT NULL,
    
    -- Status
    consent_obtained boolean DEFAULT false,
    consent_date date,
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS guarantors_application_idx ON template.loan_guarantors(application_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS guarantors_member_idx ON template.loan_guarantors(guarantor_id) WHERE deleted_at IS NULL;

-- LOAN ACCOUNTS
CREATE TABLE IF NOT EXISTS template.loan_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    loan_number varchar(30) NOT NULL UNIQUE,
    application_id uuid NOT NULL REFERENCES template.loan_applications(id) ON DELETE RESTRICT,
    member_id uuid NOT NULL REFERENCES template.members(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES template.loan_products(id) ON DELETE RESTRICT,
    
    -- Approved Loan Details
    approved_amount numeric(20, 4) NOT NULL CHECK (approved_amount > 0),
    approved_tenure_months integer NOT NULL CHECK (approved_tenure_months > 0),
    approved_interest_rate numeric(10, 4) NOT NULL CHECK (approved_interest_rate >= 0),
    
    currency_code char(3) DEFAULT 'UGX',
    
    -- Disbursement
    disbursement_date date,
    disbursement_amount numeric(20, 4),
    
    -- Status
    status varchar(40) CHECK (status IN ('approved_pending_disbursement', 'active', 'closed', 'defaulted', 'written_off')) DEFAULT 'approved_pending_disbursement' NOT NULL,
    
    -- Balances
    principal_outstanding numeric(20, 4),
    interest_outstanding numeric(20, 4),
    penalties_outstanding numeric(20, 4),
    total_outstanding numeric(20, 4),
    
    -- Dates
    loan_start_date date,
    loan_end_date date,
    
    -- Insurance (if required)
    insurance_required boolean DEFAULT false,
    insurance_certificate_uri varchar(500),
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS loan_accounts_number_unique ON template.loan_accounts(loan_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS loan_accounts_member_idx ON template.loan_accounts(member_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS loan_accounts_status_idx ON template.loan_accounts(status) WHERE deleted_at IS NULL;

-- LOAN SCHEDULES
CREATE TABLE IF NOT EXISTS template.loan_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    loan_account_id uuid NOT NULL REFERENCES template.loan_accounts(id) ON DELETE CASCADE,
    
    installment_number integer NOT NULL CHECK (installment_number > 0),
    
    -- Dates
    due_date date NOT NULL,
    paid_date date,
    
    -- Amounts
    opening_balance numeric(20, 4),
    principal_payment numeric(20, 4) NOT NULL,
    interest_payment numeric(20, 4) NOT NULL,
    penalty_payment numeric(20, 4) DEFAULT 0,
    total_payment numeric(20, 4),
    closing_balance numeric(20, 4),
    
    -- Payment Status
    status varchar(20) CHECK (status IN ('scheduled', 'partial', 'paid', 'overdue', 'written_off')) DEFAULT 'scheduled' NOT NULL,
    days_overdue integer DEFAULT 0,
    
    -- Payment Details
    payment_method varchar(50),
    payment_reference varchar(100),
    
    -- Transactions
    transaction_id uuid REFERENCES template.transactions(id) ON DELETE SET NULL,
    
    -- Audit
    recorded_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS loan_schedules_loan_idx ON template.loan_schedules(loan_account_id);
CREATE INDEX IF NOT EXISTS loan_schedules_due_idx ON template.loan_schedules(due_date) WHERE status IN ('scheduled', 'overdue');
CREATE INDEX IF NOT EXISTS loan_schedules_status_idx ON template.loan_schedules(status);

-- LOAN REPAYMENTS
CREATE TABLE IF NOT EXISTS template.loan_repayments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    loan_account_id uuid NOT NULL REFERENCES template.loan_accounts(id) ON DELETE CASCADE,
    schedule_id uuid REFERENCES template.loan_schedules(id) ON DELETE SET NULL,
    
    repayment_number varchar(30) NOT NULL UNIQUE,
    
    -- Repayment Details
    repayment_date date NOT NULL DEFAULT CURRENT_DATE,
    principal_payment numeric(20, 4) NOT NULL CHECK (principal_payment >= 0),
    interest_payment numeric(20, 4) NOT NULL CHECK (interest_payment >= 0),
    penalty_payment numeric(20, 4) DEFAULT 0,
    total_payment numeric(20, 4) NOT NULL,
    
    currency_code char(3) DEFAULT 'UGX',
    
    -- Payment Method
    payment_method varchar(50) CHECK (payment_method IN ('cash', 'mobile_money', 'bank_transfer', 'cheque', 'internal')) NOT NULL,
    payment_reference varchar(100),
    
    -- Status
    status varchar(20) CHECK (status IN ('pending', 'posted', 'reversed')) DEFAULT 'pending' NOT NULL,
    
    -- Ledger Entry
    transaction_id uuid REFERENCES template.transactions(id) ON DELETE SET NULL,
    
    -- Audit
    recorded_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_at timestamptz,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS loan_repayments_number_unique ON template.loan_repayments(repayment_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS loan_repayments_loan_idx ON template.loan_repayments(loan_account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS loan_repayments_status_idx ON template.loan_repayments(status) WHERE deleted_at IS NULL;

-- LOAN RECOVERY ACTIONS
CREATE TABLE IF NOT EXISTS template.loan_recovery_actions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    loan_account_id uuid NOT NULL REFERENCES template.loan_accounts(id) ON DELETE CASCADE,
    
    -- Action Details
    action_type varchar(50) CHECK (action_type IN ('reminder', 'warning_letter', 'formal_demand', 'legal_action', 'write_off')) NOT NULL,
    action_date date NOT NULL DEFAULT CURRENT_DATE,
    
    -- Description
    description text NOT NULL,
    outcome text,
    
    -- Amount Details
    amount_recovered numeric(20, 4) DEFAULT 0,
    
    -- Staff
    assigned_to uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    
    -- Status
    status varchar(20) CHECK (status IN ('pending', 'in_progress', 'completed')) DEFAULT 'pending' NOT NULL,
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS loan_recovery_loan_idx ON template.loan_recovery_actions(loan_account_id);
CREATE INDEX IF NOT EXISTS loan_recovery_status_idx ON template.loan_recovery_actions(status);
