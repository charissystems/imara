import { ColumnType, Generated, JSONColumnType } from 'kysely';
import { DateColumn, DecimalColumn, NullableDateColumn } from './common';

// ACCOUNTING (007)

export interface FinancialPeriodsTable {
    id: Generated<string>;
    name: string;
    start_date: DateColumn;
    end_date: DateColumn;
    status: ColumnType<'open' | 'pending_review' | 'closed', 'open' | 'pending_review' | 'closed'>;
    created_by: string | null;
    updated_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface AccountsTable {
    id: Generated<string>;
    code: string;
    name: string;
    description: string | null;
    parent_id: string | null;
    account_type: ColumnType<'asset' | 'liability' | 'equity' | 'income' | 'expense', 'asset' | 'liability' | 'equity' | 'income' | 'expense'>;
    normal_balance: ColumnType<'debit' | 'credit', 'debit' | 'credit'>;
    is_active: ColumnType<boolean, boolean | undefined>;
    allows_posting: ColumnType<boolean, boolean | undefined>;
    opening_balance: DecimalColumn;
    current_balance: DecimalColumn;
    created_by: string | null;
    updated_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface TransactionsTable {
    id: Generated<string>;
    code: string;
    member_id: string | null;
    category: ColumnType<'deposit' | 'withdrawal' | 'transfer' | 'reversal' | 'fee' | 'interest' | 'contribution' | 'loan_disbursement' | 'loan_repayment' | 'dividend' | 'manual', 'deposit' | 'withdrawal' | 'transfer' | 'reversal' | 'fee' | 'interest' | 'contribution' | 'loan_disbursement' | 'loan_repayment' | 'dividend' | 'manual'>;
    amount: DecimalColumn;
    currency_code: ColumnType<string, string | undefined>;
    transaction_date: DateColumn;
    payment_method: ColumnType<'cash' | 'mobile_money' | 'bank_transfer' | 'internal' | 'cheque' | 'system', 'cash' | 'mobile_money' | 'bank_transfer' | 'internal' | 'cheque' | 'system'>;
    reference_code: string | null;
    debit_account_id: string;
    credit_account_id: string;
    financial_period_id: string | null;
    is_locked: ColumnType<boolean, boolean | undefined>;
    is_reconciled: ColumnType<boolean, boolean | undefined>;
    reconciled_by: string | null;
    reconciled_at: NullableDateColumn;
    description: string;
    notes: string | null;
    source_type: string | null;
    source_id: string | null;
    recorded_by: string | null;
    approved_by: string | null;
    approved_at: NullableDateColumn;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface ManualJournalEntriesTable {
    id: Generated<string>;
    journal_number: string;
    financial_period_id: string | null;
    description: string;
    entry_date: DateColumn;
    status: ColumnType<'draft' | 'submitted' | 'approved' | 'rejected' | 'posted', 'draft' | 'submitted' | 'approved' | 'rejected' | 'posted'>;
    created_by: string | null;
    submitted_by: string | null;
    submitted_at: NullableDateColumn;
    approved_by: string | null;
    approved_at: NullableDateColumn;
    created_at: DateColumn;
    updated_at: DateColumn;
}

export interface ManualJournalLinesTable {
    id: Generated<string>;
    journal_entry_id: string;
    line_number: ColumnType<number, number>;
    account_id: string;
    debit_amount: DecimalColumn;
    credit_amount: DecimalColumn;
    description: string | null;
    created_at: DateColumn;
}

export interface BudgetsTable {
    id: Generated<string>;
    budget_number: string;
    financial_period_id: string;
    name: string;
    description: string | null;
    status: ColumnType<'draft' | 'approved' | 'active' | 'closed', 'draft' | 'approved' | 'active' | 'closed'>;
    is_approved: ColumnType<boolean, boolean | undefined>;
    created_by: string | null;
    approved_by: string | null;
    approved_at: NullableDateColumn;
    created_at: DateColumn;
    updated_at: DateColumn;
}

export interface BudgetLinesTable {
    id: Generated<string>;
    budget_id: string;
    account_id: string;
    budgeted_amount: DecimalColumn;
    actual_amount: DecimalColumn;
    variance: DecimalColumn;
    variance_percentage: DecimalColumn;
    notes: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
}

export interface TrialBalanceTable {
    id: Generated<string>;
    financial_period_id: string;
    account_id: string;
    opening_balance: DecimalColumn | null;
    debit_transactions: DecimalColumn;
    credit_transactions: DecimalColumn;
    closing_balance: DecimalColumn | null;
    created_at: DateColumn;
    updated_at: DateColumn;
}
