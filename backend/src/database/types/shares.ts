import { ColumnType, Generated } from 'kysely';
import { DateColumn, DecimalColumn, NullableDateColumn } from './common';

// SHARES (004)

export interface ShareClassesTable {
    id: Generated<string>;
    code: string;
    name: string;
    description: string | null;
    par_value: DecimalColumn;
    current_price: DecimalColumn;
    minimum_shares: ColumnType<number, number | undefined>;
    maximum_shares: number | null;
    dividend_eligible: ColumnType<boolean, boolean | undefined>;
    dividend_percentage: DecimalColumn | null;
    is_active: ColumnType<boolean, boolean | undefined>;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface ShareHoldingsTable {
    id: Generated<string>;
    member_id: string;
    share_class_id: string;
    total_shares: ColumnType<number, number>;
    average_cost_per_share: DecimalColumn | null;
    total_invested: DecimalColumn | null;
    certificate_number: string;
    certificate_url: string | null;
    purchase_date: DateColumn;
    last_transfer_date: NullableDateColumn;
    is_locked: ColumnType<boolean, boolean | undefined>;
    lock_expiry_date: NullableDateColumn;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface ShareTransactionsTable {
    id: Generated<string>;
    share_holding_id: string;
    member_id: string;
    transaction_type: ColumnType<'purchase' | 'transfer_out' | 'transfer_in' | 'dividend' | 'bonus' | 'retirement', 'purchase' | 'transfer_out' | 'transfer_in' | 'dividend' | 'bonus' | 'retirement'>;
    quantity: ColumnType<number, number>;
    unit_price: DecimalColumn | null;
    total_amount: DecimalColumn | null;
    currency_code: ColumnType<string, string | undefined>;
    counterparty_member_id: string | null;
    related_transaction_id: string | null;
    transaction_date: DateColumn;
    transaction_id: string | null;
    status: ColumnType<'pending' | 'completed' | 'rejected' | 'reversed', 'pending' | 'completed' | 'rejected' | 'reversed'>;
    description: string | null;
    recorded_by: string | null;
    approved_by: string | null;
    approved_at: NullableDateColumn;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface DividendDeclarationsTable {
    id: Generated<string>;
    share_class_id: string;
    financial_period_id: string | null;
    dividend_number: string;
    dividend_per_share: DecimalColumn;
    total_dividend_amount: DecimalColumn | null;
    withholding_tax_rate: DecimalColumn;
    payment_date: DateColumn;
    record_date: DateColumn;
    weighted_holding_method: ColumnType<string, string | undefined>;
    status: ColumnType<'draft' | 'approved' | 'processing' | 'completed', 'draft' | 'approved' | 'processing' | 'completed'>;
    created_by: string | null;
    approved_by: string | null;
    approved_at: NullableDateColumn;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface ShareRegisterTable {
    id: Generated<string>;
    member_id: string;
    share_class_id: string;
    opening_balance: ColumnType<number, number>;
    transaction_quantity: number | null;
    closing_balance: number | null;
    transaction_date: DateColumn;
    reference_type: string | null;
    reference_id: string | null;
    created_at: DateColumn;
}
