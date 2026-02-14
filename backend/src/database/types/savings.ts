import { ColumnType, Generated } from 'kysely';
import { DateColumn, DecimalColumn, NullableDateColumn } from './common';

// SAVINGS & ACCOUNTS (003)

export interface SavingsProductsTable {
    id: Generated<string>;
    code: string;
    name: string;
    description: string | null;
    interest_rate: DecimalColumn;
    interest_paid_frequency: ColumnType<'monthly' | 'quarterly' | 'annually' | 'on_withdrawal', 'monthly' | 'quarterly' | 'annually' | 'on_withdrawal'>;
    interest_calculation_method: ColumnType<'simple' | 'compound', 'simple' | 'compound'>;
    calculation_basis: ColumnType<string, string | undefined>;
    minimum_balance: DecimalColumn;
    maximum_balance: DecimalColumn | null;
    allows_overdraft: ColumnType<boolean, boolean | undefined>;
    overdraft_limit: DecimalColumn;
    overdraft_interest_rate: DecimalColumn | null;
    is_active: ColumnType<boolean, boolean | undefined>;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface SavingsAccountsTable {
    id: Generated<string>;
    member_id: string;
    product_id: string;
    account_number: string;
    status: ColumnType<'active' | 'dormant' | 'closed' | 'suspended', 'active' | 'dormant' | 'closed' | 'suspended'>;
    principal_balance: DecimalColumn;
    interest_accrued: DecimalColumn;
    interest_paid: DecimalColumn;
    opened_date: DateColumn;
    closed_date: NullableDateColumn;
    is_frozen: ColumnType<boolean, boolean | undefined>;
    freeze_reason: string | null;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface DepositsTable {
    id: Generated<string>;
    savings_account_id: string;
    member_id: string;
    deposit_number: string;
    amount: DecimalColumn;
    currency_code: ColumnType<string, string | undefined>;
    deposit_date: DateColumn;
    payment_method: ColumnType<'cash' | 'mobile_money' | 'bank_transfer' | 'cheque' | 'internal', 'cash' | 'mobile_money' | 'bank_transfer' | 'cheque' | 'internal'>;
    payment_reference: string | null;
    status: ColumnType<'pending' | 'posted' | 'rejected' | 'reversed', 'pending' | 'posted' | 'rejected' | 'reversed'>;
    transaction_id: string | null;
    description: string | null;
    recorded_by: string | null;
    approved_by: string | null;
    approved_at: NullableDateColumn;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface WithdrawalsTable {
    id: Generated<string>;
    savings_account_id: string;
    member_id: string;
    withdrawal_number: string;
    amount: DecimalColumn;
    currency_code: ColumnType<string, string | undefined>;
    withdrawal_date: DateColumn;
    payout_method: ColumnType<'cash' | 'mobile_money' | 'bank_transfer' | 'cheque', 'cash' | 'mobile_money' | 'bank_transfer' | 'cheque'>;
    payout_reference: string | null;
    payout_account: string | null;
    status: ColumnType<'pending' | 'approved' | 'rejected' | 'completed' | 'reversed', 'pending' | 'approved' | 'rejected' | 'completed' | 'reversed'>;
    transaction_id: string | null;
    description: string | null;
    requested_by: string | null;
    approved_by: string | null;
    approved_at: NullableDateColumn;
    processed_by: string | null;
    processed_at: NullableDateColumn;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface InternalTransfersTable {
    id: Generated<string>;
    from_account_id: string;
    to_account_id: string;
    transfer_number: string;
    amount: DecimalColumn;
    currency_code: ColumnType<string, string | undefined>;
    transfer_date: DateColumn;
    status: ColumnType<'pending' | 'posted' | 'rejected' | 'reversed', 'pending' | 'posted' | 'rejected' | 'reversed'>;
    from_transaction_id: string | null;
    to_transaction_id: string | null;
    description: string | null;
    initiated_by: string | null;
    approved_by: string | null;
    approved_at: NullableDateColumn;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface InterestSchedulesTable {
    id: Generated<string>;
    savings_account_id: string;
    period_start: DateColumn;
    period_end: DateColumn;
    opening_balance: DecimalColumn | null;
    closing_balance: DecimalColumn | null;
    average_balance: DecimalColumn | null;
    interest_rate: DecimalColumn | null;
    interest_accrued: DecimalColumn | null;
    is_posted: ColumnType<boolean, boolean | undefined>;
    posted_at: NullableDateColumn;
    created_at: DateColumn;
    updated_at: DateColumn;
}
