import { ColumnType, Generated } from 'kysely';
import { DateColumn, DecimalColumn, NullableDateColumn } from './common';

// FIXED DEPOSITS (005)

export interface FixedDepositProductsTable {
    id: Generated<string>;
    code: string;
    name: string;
    description: string | null;
    tenure_days: ColumnType<number, number>;
    tenure_type: ColumnType<'days' | 'months' | 'years', 'days' | 'months' | 'years'>;
    minimum_amount: DecimalColumn;
    maximum_amount: DecimalColumn | null;
    fixed_interest_rate: DecimalColumn;
    interest_paid_frequency: ColumnType<'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'at_maturity', 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'at_maturity'>;
    interest_calculation_method: ColumnType<'simple' | 'compound', 'simple' | 'compound'>;
    calculation_basis: ColumnType<string, string | undefined>;
    allows_premature_withdrawal: ColumnType<boolean, boolean | undefined>;
    premature_withdrawal_penalty_type: ColumnType<'fixed_amount' | 'percentage' | 'interest_reduction', 'fixed_amount' | 'percentage' | 'interest_reduction'>;
    premature_withdrawal_penalty: DecimalColumn;
    allows_auto_rollover: ColumnType<boolean, boolean | undefined>;
    default_rollover_type: ColumnType<'principal_only' | 'principal_plus_interest' | 'custom', 'principal_only' | 'principal_plus_interest' | 'custom'>;
    withholding_tax_rate: DecimalColumn;
    is_active: ColumnType<boolean, boolean | undefined>;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface FixedDepositsTable {
    id: Generated<string>;
    member_id: string;
    product_id: string;
    certificate_number: string;
    principal_amount: DecimalColumn;
    currency_code: ColumnType<string, string | undefined>;
    interest_rate: DecimalColumn;
    deposit_date: DateColumn;
    maturity_date: DateColumn;
    total_interest_payable: DecimalColumn | null;
    interest_accrued: DecimalColumn;
    interest_paid: DecimalColumn;
    withholding_tax_amount: DecimalColumn;
    status: ColumnType<'active' | 'matured' | 'closed' | 'rolled_over', 'active' | 'matured' | 'closed' | 'rolled_over'>;
    maturity_action: ColumnType<'auto_rollover' | 'manual_action_pending' | 'withdrawn', 'auto_rollover' | 'manual_action_pending' | 'withdrawn'>;
    maturity_action_date: NullableDateColumn;
    certificate_url: string | null;
    deposit_transaction_id: string | null;
    recorded_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface FdInterestSchedulesTable {
    id: Generated<string>;
    fixed_deposit_id: string;
    interest_period_number: ColumnType<number, number>;
    period_start: DateColumn;
    period_end: DateColumn;
    opening_balance: DecimalColumn | null;
    interest_accrued: DecimalColumn | null;
    interest_paid: DecimalColumn;
    withholding_tax: DecimalColumn;
    net_interest: DecimalColumn | null;
    due_date: DateColumn;
    payment_date: NullableDateColumn;
    payment_method: string | null;
    status: ColumnType<'accrued' | 'due' | 'paid' | 'waived', 'accrued' | 'due' | 'paid' | 'waived'>;
    created_at: DateColumn;
    updated_at: DateColumn;
}

export interface FdMaturityAlertsTable {
    id: Generated<string>;
    fixed_deposit_id: string;
    days_before: ColumnType<number, number>;
    alert_date: DateColumn;
    sent_to_member: ColumnType<boolean, boolean | undefined>;
    sent_to_staff: ColumnType<boolean, boolean | undefined>;
    sent_at: NullableDateColumn;
    delivery_channel: ColumnType<'sms' | 'email' | 'push_notification' | 'system_notification', 'sms' | 'email' | 'push_notification' | 'system_notification'>;
    created_at: DateColumn;
    sent_by: string | null;
}

export interface FdRolloversTable {
    id: Generated<string>;
    original_fd_id: string;
    new_fd_id: string | null;
    rollover_date: DateColumn;
    rollover_type: ColumnType<'principal_only' | 'principal_plus_interest' | 'custom', 'principal_only' | 'principal_plus_interest' | 'custom'>;
    principal_rolled: DecimalColumn;
    interest_option: ColumnType<'credited_to_savings' | 'reinvested' | 'paid_out', 'credited_to_savings' | 'reinvested' | 'paid_out'>;
    status: ColumnType<'pending' | 'processed' | 'cancelled', 'pending' | 'processed' | 'cancelled'>;
    initiated_by: string | null;
    processed_by: string | null;
    processed_at: NullableDateColumn;
    created_at: DateColumn;
    updated_at: DateColumn;
}
