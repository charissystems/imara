import { ColumnType, Generated, JSONColumnType } from 'kysely';
import { DateColumn, DecimalColumn, NullableDateColumn } from './common';

// LOANS (006)

export interface LoanProductsTable {
    id: Generated<string>;
    code: string;
    name: string;
    description: string | null;
    minimum_amount: DecimalColumn;
    maximum_amount: DecimalColumn;
    minimum_tenure_months: ColumnType<number, number>;
    maximum_tenure_months: ColumnType<number, number>;
    interest_rate_type: ColumnType<'fixed' | 'variable', 'fixed' | 'variable'>;
    fixed_interest_rate: DecimalColumn | null;
    interest_calculation_method: ColumnType<'simple' | 'compound' | 'declining_balance', 'simple' | 'compound' | 'declining_balance'>;
    repayment_frequency: ColumnType<'weekly' | 'bi_weekly' | 'monthly' | 'quarterly', 'weekly' | 'bi_weekly' | 'monthly' | 'quarterly'>;
    requires_collateral: ColumnType<boolean, boolean | undefined>;
    requires_guarantors: ColumnType<boolean, boolean | undefined>;
    minimum_guarantors: ColumnType<number, number | undefined>;
    requires_appraisal: ColumnType<boolean, boolean | undefined>;
    requires_insurance: ColumnType<boolean, boolean | undefined>;
    default_interest_rate: DecimalColumn | null;
    late_payment_penalty_type: ColumnType<'fixed_amount' | 'percentage_of_payment', 'fixed_amount' | 'percentage_of_payment'>;
    late_payment_penalty: DecimalColumn;
    approval_levels: ColumnType<number, number | undefined>;
    requires_credit_committee: ColumnType<boolean, boolean | undefined>;
    is_active: ColumnType<boolean, boolean | undefined>;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface LoanApplicationsTable {
    id: Generated<string>;
    application_number: string;
    member_id: string;
    product_id: string;
    requested_amount: DecimalColumn;
    requested_tenure_months: ColumnType<number, number>;
    currency_code: ColumnType<string, string | undefined>;
    loan_purpose: string;
    purpose_description: string | null;
    status: ColumnType<'draft' | 'submitted' | 'under_appraisal' | 'appraisal_complete' | 'under_approval' | 'approved' | 'rejected' | 'withdrawn', 'draft' | 'submitted' | 'under_appraisal' | 'appraisal_complete' | 'under_approval' | 'approved' | 'rejected' | 'withdrawn'>;
    application_date: DateColumn;
    submitted_date: NullableDateColumn;
    decision_date: NullableDateColumn;
    rejection_reason: string | null;
    documents: JSONColumnType<Record<string, unknown>> | null;
    submitted_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface LoanAppraisalsTable {
    id: Generated<string>;
    application_id: string;
    appraiser_id: string;
    appraisal_date: DateColumn;
    monthly_income: DecimalColumn | null;
    monthly_expenses: DecimalColumn | null;
    disposable_income: DecimalColumn | null;
    credit_score: number | null;
    credit_history_summary: string | null;
    existing_loans_balance: DecimalColumn | null;
    debt_to_income_ratio: DecimalColumn | null;
    collateral_description: string | null;
    collateral_estimated_value: DecimalColumn | null;
    collateral_type: string | null;
    recommended_amount: DecimalColumn | null;
    recommended_tenure_months: number | null;
    recommended_interest_rate: DecimalColumn | null;
    risk_rating: ColumnType<'low' | 'moderate' | 'high', 'low' | 'moderate' | 'high'>;
    risk_factors: string | null;
    status: ColumnType<'in_progress' | 'completed' | 'awaiting_review', 'in_progress' | 'completed' | 'awaiting_review'>;
    notes: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
}

export interface LoanGuarantorsTable {
    id: Generated<string>;
    application_id: string;
    guarantor_id: string;
    guarantor_number: ColumnType<number, number>;
    relationship: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    guaranteed_amount: DecimalColumn;
    consent_obtained: ColumnType<boolean, boolean | undefined>;
    consent_date: NullableDateColumn;
    created_by: string | null;
    created_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface LoanAccountsTable {
    id: Generated<string>;
    loan_number: string;
    application_id: string;
    member_id: string;
    product_id: string;
    approved_amount: DecimalColumn;
    approved_tenure_months: ColumnType<number, number>;
    approved_interest_rate: DecimalColumn;
    currency_code: ColumnType<string, string | undefined>;
    disbursement_date: NullableDateColumn;
    disbursement_amount: DecimalColumn | null;
    status: ColumnType<'approved_pending_disbursement' | 'active' | 'closed' | 'defaulted' | 'written_off', 'approved_pending_disbursement' | 'active' | 'closed' | 'defaulted' | 'written_off'>;
    principal_outstanding: DecimalColumn | null;
    interest_outstanding: DecimalColumn | null;
    penalties_outstanding: DecimalColumn | null;
    total_outstanding: DecimalColumn | null;
    loan_start_date: NullableDateColumn;
    loan_end_date: NullableDateColumn;
    insurance_required: ColumnType<boolean, boolean | undefined>;
    insurance_certificate_uri: string | null;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface LoanSchedulesTable {
    id: Generated<string>;
    loan_account_id: string;
    installment_number: ColumnType<number, number>;
    due_date: DateColumn;
    paid_date: NullableDateColumn;
    opening_balance: DecimalColumn | null;
    principal_payment: DecimalColumn;
    interest_payment: DecimalColumn;
    penalty_payment: DecimalColumn;
    total_payment: DecimalColumn | null;
    closing_balance: DecimalColumn | null;
    status: ColumnType<'scheduled' | 'partial' | 'paid' | 'overdue' | 'written_off', 'scheduled' | 'partial' | 'paid' | 'overdue' | 'written_off'>;
    days_overdue: ColumnType<number, number | undefined>;
    payment_method: string | null;
    payment_reference: string | null;
    transaction_id: string | null;
    recorded_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
}

export interface LoanRepaymentsTable {
    id: Generated<string>;
    loan_account_id: string;
    schedule_id: string | null;
    repayment_number: string;
    repayment_date: DateColumn;
    principal_payment: DecimalColumn;
    interest_payment: DecimalColumn;
    penalty_payment: DecimalColumn;
    total_payment: DecimalColumn;
    currency_code: ColumnType<string, string | undefined>;
    payment_method: ColumnType<'cash' | 'mobile_money' | 'bank_transfer' | 'cheque' | 'internal', 'cash' | 'mobile_money' | 'bank_transfer' | 'cheque' | 'internal'>;
    payment_reference: string | null;
    status: ColumnType<'pending' | 'posted' | 'reversed', 'pending' | 'posted' | 'reversed'>;
    transaction_id: string | null;
    recorded_by: string | null;
    approved_by: string | null;
    approved_at: NullableDateColumn;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface LoanRecoveryActionsTable {
    id: Generated<string>;
    loan_account_id: string;
    action_type: ColumnType<'reminder' | 'warning_letter' | 'formal_demand' | 'legal_action' | 'write_off', 'reminder' | 'warning_letter' | 'formal_demand' | 'legal_action' | 'write_off'>;
    action_date: DateColumn;
    description: string;
    outcome: string | null;
    amount_recovered: DecimalColumn;
    assigned_to: string | null;
    status: ColumnType<'pending' | 'in_progress' | 'completed', 'pending' | 'in_progress' | 'completed'>;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
}
