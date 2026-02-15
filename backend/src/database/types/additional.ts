import { ColumnType, Generated, JSONColumnType } from 'kysely';
import { DateColumn, NullableDateColumn, DecimalColumn } from './common';

// ADDITIONAL FEATURES (012)

export interface BeneficiariesTable {
    id: Generated<string>;
    member_id: string;
    account_id: string | null;
    full_name: string;
    relationship: string;
    phone: string | null;
    email: string | null;
    national_id: string | null;
    percentage_share: DecimalColumn;
    is_primary: ColumnType<boolean, boolean | undefined>;
    status: ColumnType<'active' | 'inactive' | 'removed', 'active' | 'inactive' | 'removed' | undefined>;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface AccountLiensTable {
    id: Generated<string>;
    account_id: string;
    amount: DecimalColumn;
    reason: string;
    lien_type: ColumnType<'loan_collateral' | 'legal_hold' | 'manual', 'loan_collateral' | 'legal_hold' | 'manual' | undefined>;
    placed_by: string;
    placed_at: DateColumn;
    released_at: NullableDateColumn;
    released_by: string | null;
    release_reason: string | null;
    related_loan_id: string | null;
    status: ColumnType<'active' | 'released' | 'expired', 'active' | 'released' | 'expired' | undefined>;
    created_at: DateColumn;
    updated_at: DateColumn;
}

export interface StandingInstructionsTable {
    id: Generated<string>;
    member_id: string;
    instruction_type: ColumnType<'savings_split' | 'loan_repayment' | 'transfer' | 'share_purchase', 'savings_split' | 'loan_repayment' | 'transfer' | 'share_purchase'>;
    source_account_id: string;
    destination_account_id: string | null;
    destination_external: JSONColumnType<Record<string, unknown>> | null;
    amount: DecimalColumn;
    frequency: ColumnType<'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annually', 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annually'>;
    start_date: DateColumn;
    end_date: NullableDateColumn;
    next_execution_date: DateColumn;
    last_execution_date: NullableDateColumn;
    execution_count: ColumnType<number, number | undefined>;
    max_executions: number | null;
    status: ColumnType<'active' | 'paused' | 'completed' | 'cancelled', 'active' | 'paused' | 'completed' | 'cancelled' | undefined>;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface MemberCredentialsTable {
    id: Generated<string>;
    member_id: string;
    pin_hash: string;
    pin_salt: string;
    pin_attempts: ColumnType<number, number | undefined>;
    max_attempts: ColumnType<number, number | undefined>;
    is_locked: ColumnType<boolean, boolean | undefined>;
    locked_at: NullableDateColumn;
    last_pin_change: DateColumn;
    force_change: ColumnType<boolean, boolean | undefined>;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
}

export interface FeeSchedulesTable {
    id: Generated<string>;
    code: string;
    name: string;
    description: string | null;
    fee_type: ColumnType<
        'registration' | 'account_maintenance' | 'withdrawal' | 'loan_processing' | 'late_payment' | 'exit' | 'transfer' | 'statement' | 'card_issuance' | 'other',
        'registration' | 'account_maintenance' | 'withdrawal' | 'loan_processing' | 'late_payment' | 'exit' | 'transfer' | 'statement' | 'card_issuance' | 'other'
    >;
    amount: DecimalColumn;
    calculation_method: ColumnType<'fixed' | 'percentage' | 'tiered', 'fixed' | 'percentage' | 'tiered' | undefined>;
    percentage_rate: DecimalColumn | null;
    minimum_fee: DecimalColumn | null;
    maximum_fee: DecimalColumn | null;
    applicable_to: ColumnType<
        'all_members' | 'savings' | 'loans' | 'shares' | 'fixed_deposits' | 'transfers' | 'withdrawals',
        'all_members' | 'savings' | 'loans' | 'shares' | 'fixed_deposits' | 'transfers' | 'withdrawals'
    >;
    is_active: ColumnType<boolean, boolean | undefined>;
    effective_from: DateColumn;
    effective_to: NullableDateColumn;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface TransactionLimitsTable {
    id: Generated<string>;
    role: string;
    channel: ColumnType<'teller' | 'mobile' | 'ussd' | 'agent' | 'portal' | 'api', 'teller' | 'mobile' | 'ussd' | 'agent' | 'portal' | 'api'>;
    transaction_type: ColumnType<
        'deposit' | 'withdrawal' | 'transfer' | 'loan_disbursement' | 'loan_repayment' | 'share_purchase',
        'deposit' | 'withdrawal' | 'transfer' | 'loan_disbursement' | 'loan_repayment' | 'share_purchase'
    >;
    per_transaction_limit: DecimalColumn;
    daily_limit: DecimalColumn;
    monthly_limit: DecimalColumn | null;
    requires_approval_above: DecimalColumn | null;
    is_active: ColumnType<boolean, boolean | undefined>;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}
