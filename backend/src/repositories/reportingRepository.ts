/**
 * Reporting Repository
 * Database queries for financial reports, operational reports, and dashboard KPIs
 *
 * Implements requirements:
 * - ACC-008: Generate standard financial statements
 * - RPT-001: Trial Balance, Balance Sheet, Income Statement, Cash Flow
 * - RPT-002: Operational reports (members, savings, loans, arrears, NPL)
 * - RPT-003: Dashboard KPIs
 */

import { sql } from 'kysely';
import { BaseRepository } from './baseRepository';

// ── Report Result Types ──

export interface TrialBalanceRow {
    account_code: string;
    account_name: string;
    account_type: string;
    normal_balance: string;
    debit_balance: string;
    credit_balance: string;
}

export interface BalanceSheetRow {
    account_code: string;
    account_name: string;
    account_type: string;
    balance: string;
    category: string;
}

export interface IncomeStatementRow {
    account_code: string;
    account_name: string;
    account_type: string;
    amount: string;
}

export interface CashFlowRow {
    category: string;
    description: string;
    amount: string;
    transaction_date: string;
}

export interface MemberListingRow {
    id: string;
    member_number: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string | null;
    status: string;
    joined_date: string;
    savings_balance: string;
    shares_balance: string;
    loans_balance: string;
}

export interface SavingsSummaryRow {
    product_name: string;
    product_code: string;
    total_accounts: string;
    active_accounts: string;
    total_balance: string;
    total_deposits: string;
    total_withdrawals: string;
    total_interest_accrued: string;
}

export interface LoanPortfolioRow {
    product_name: string;
    product_code: string;
    total_accounts: string;
    active_accounts: string;
    total_disbursed: string;
    principal_outstanding: string;
    interest_outstanding: string;
    penalties_outstanding: string;
    total_outstanding: string;
}

export interface ArrearsAgeingRow {
    loan_number: string;
    member_number: string;
    member_name: string;
    product_name: string;
    disbursement_date: string;
    total_outstanding: string;
    days_overdue: number;
    overdue_amount: string;
    ageing_bucket: string;
}

export interface NplReportRow {
    loan_number: string;
    member_number: string;
    member_name: string;
    product_name: string;
    disbursement_date: string;
    status: string;
    principal_outstanding: string;
    interest_outstanding: string;
    penalties_outstanding: string;
    total_outstanding: string;
    days_in_default: number;
    npl_category: string;
}

export interface DailyTransactionRow {
    id: string;
    code: string;
    category: string;
    amount: string;
    transaction_date: string;
    payment_method: string;
    description: string;
    member_name: string | null;
    debit_account: string;
    credit_account: string;
}

export interface DashboardKPIs {
    total_members: number;
    active_members: number;
    new_members_this_month: number;
    total_savings_balance: string;
    total_deposits_today: string;
    total_withdrawals_today: string;
    total_loan_portfolio: string;
    active_loans: number;
    total_disbursed_this_month: string;
    total_repayments_this_month: string;
    total_arrears: string;
    loans_in_arrears: number;
    npl_count: number;
    npl_amount: string;
    total_shares_value: string;
    total_fixed_deposits: string;
    par_30: string;
    par_90: string;
}

export interface RecentActivityRow {
    id: string;
    type: string;
    description: string;
    amount: string | null;
    created_at: string;
    actor: string | null;
}

export class ReportingRepository extends BaseRepository {
    constructor(schemaName: string) {
        super(schemaName);
    }

    // ── Financial Reports ──

    async getTrialBalance(periodId?: string): Promise<TrialBalanceRow[]> {
        return this.executeSafely(async () => {
            let query = this.db
                .selectFrom('accounts')
                .select([
                    'accounts.code as account_code',
                    'accounts.name as account_name',
                    'accounts.account_type',
                    'accounts.normal_balance',
                    'accounts.current_balance',
                ])
                .where('accounts.is_active', '=', true)
                .where('accounts.deleted_at', 'is', null)
                .orderBy('accounts.code', 'asc');

            const accounts = await query.execute();

            return accounts.map((a) => {
                const balance = parseFloat(String(a.current_balance || '0'));
                return {
                    account_code: a.code,
                    account_name: a.name,
                    account_type: a.account_type,
                    normal_balance: a.normal_balance,
                    debit_balance: a.normal_balance === 'debit' ? Math.max(0, balance).toFixed(4) : Math.max(0, -balance).toFixed(4),
                    credit_balance: a.normal_balance === 'credit' ? Math.max(0, balance).toFixed(4) : Math.max(0, -balance).toFixed(4),
                };
            });
        }, 'getTrialBalance');
    }

    async getBalanceSheet(asOfDate: Date): Promise<BalanceSheetRow[]> {
        return this.executeSafely(async () => {
            const accounts = await this.db
                .selectFrom('accounts')
                .select([
                    'accounts.code as account_code',
                    'accounts.name as account_name',
                    'accounts.account_type',
                    'accounts.normal_balance',
                    'accounts.current_balance',
                ])
                .where('accounts.is_active', '=', true)
                .where('accounts.deleted_at', 'is', null)
                .where('accounts.account_type', 'in', ['asset', 'liability', 'equity'])
                .orderBy('accounts.account_type', 'asc')
                .orderBy('accounts.code', 'asc')
                .execute();

            return accounts.map((a) => {
                const balance = parseFloat(String(a.current_balance || '0'));
                return {
                    account_code: a.code,
                    account_name: a.name,
                    account_type: a.account_type,
                    balance: Math.abs(balance).toFixed(4),
                    category: a.account_type,
                };
            });
        }, 'getBalanceSheet');
    }

    async getIncomeStatement(periodStart: Date, periodEnd: Date): Promise<IncomeStatementRow[]> {
        return this.executeSafely(async () => {
            const rows = await this.db
                .selectFrom('transactions')
                .innerJoin('accounts as da', 'da.id', 'transactions.debit_account_id')
                .innerJoin('accounts as ca', 'ca.id', 'transactions.credit_account_id')
                .select([
                    'transactions.amount',
                    'da.code as debit_code',
                    'da.name as debit_name',
                    'da.account_type as debit_type',
                    'ca.code as credit_code',
                    'ca.name as credit_name',
                    'ca.account_type as credit_type',
                ])
                .where('transactions.transaction_date', '>=', periodStart)
                .where('transactions.transaction_date', '<=', periodEnd)
                .where('transactions.deleted_at', 'is', null)
                .execute();

            const accountMap = new Map<string, { code: string; name: string; type: string; amount: number }>();

            for (const row of rows) {
                const amount = parseFloat(String(row.amount || '0'));

                // Income accounts appear as credits
                if (row.credit_type === 'income') {
                    const key = row.credit_code;
                    const existing = accountMap.get(key) || { code: row.credit_code, name: row.credit_name, type: 'income', amount: 0 };
                    existing.amount += amount;
                    accountMap.set(key, existing);
                }

                // Expense accounts appear as debits
                if (row.debit_type === 'expense') {
                    const key = row.debit_code;
                    const existing = accountMap.get(key) || { code: row.debit_code, name: row.debit_name, type: 'expense', amount: 0 };
                    existing.amount += amount;
                    accountMap.set(key, existing);
                }
            }

            return Array.from(accountMap.values()).map((a) => ({
                account_code: a.code,
                account_name: a.name,
                account_type: a.type,
                amount: a.amount.toFixed(4),
            }));
        }, 'getIncomeStatement');
    }

    async getCashFlowStatement(periodStart: Date, periodEnd: Date): Promise<CashFlowRow[]> {
        return this.executeSafely(async () => {
            const rows = await this.db
                .selectFrom('transactions')
                .select([
                    'transactions.category',
                    'transactions.description',
                    'transactions.amount',
                    'transactions.transaction_date',
                ])
                .where('transactions.transaction_date', '>=', periodStart)
                .where('transactions.transaction_date', '<=', periodEnd)
                .where('transactions.deleted_at', 'is', null)
                .where('transactions.payment_method', 'in', ['cash', 'mobile_money', 'bank_transfer'])
                .orderBy('transactions.transaction_date', 'asc')
                .execute();

            return rows.map((r) => ({
                category: this.classifyCashFlowCategory(r.category),
                description: r.description,
                amount: String(r.amount),
                transaction_date: String(r.transaction_date),
            }));
        }, 'getCashFlowStatement');
    }

    private classifyCashFlowCategory(txnCategory: string): string {
        switch (txnCategory) {
            case 'deposit':
            case 'withdrawal':
            case 'loan_repayment':
            case 'loan_disbursement':
            case 'interest':
            case 'fee':
                return 'operating';
            case 'dividend':
            case 'contribution':
                return 'financing';
            case 'transfer':
            case 'manual':
            case 'reversal':
            default:
                return 'other';
        }
    }

    // ── Operational Reports ──

    async getMemberListing(filters?: {
        status?: string;
        search?: string;
        limit?: number;
        offset?: number;
    }): Promise<{ data: MemberListingRow[]; total: number }> {
        return this.executeSafely(async () => {
            let query = this.db
                .selectFrom('members')
                .leftJoin('member_accounts', 'member_accounts.member_id', 'members.id')
                .select([
                    'members.id',
                    'members.member_number',
                    'members.first_name',
                    'members.last_name',
                    'members.phone',
                    'members.email',
                    'members.status',
                    'members.joined_date',
                    sql<string>`COALESCE(member_accounts.savings_balance, 0)`.as('savings_balance'),
                    sql<string>`COALESCE(member_accounts.shares_balance, 0)`.as('shares_balance'),
                    sql<string>`COALESCE(member_accounts.loans_balance, 0)`.as('loans_balance'),
                ])
                .where('members.deleted_at', 'is', null);

            if (filters?.status) {
                query = query.where('members.status', '=', filters.status as any);
            }
            if (filters?.search) {
                const term = `%${filters.search}%`;
                query = query.where((eb) =>
                    eb.or([
                        eb('members.first_name', 'ilike', term),
                        eb('members.last_name', 'ilike', term),
                        eb('members.member_number', 'ilike', term),
                        eb('members.phone', 'ilike', term),
                    ])
                );
            }

            const countResult = await this.db
                .selectFrom('members')
                .select(sql<number>`COUNT(*)::int`.as('total'))
                .where('members.deleted_at', 'is', null)
                .executeTakeFirst();

            const total = countResult?.total ?? 0;

            query = query.orderBy('members.member_number', 'asc');
            if (filters?.limit) query = query.limit(filters.limit);
            if (filters?.offset) query = query.offset(filters.offset);

            const data = await query.execute();

            return {
                data: data.map((d) => ({
                    id: d.id,
                    member_number: d.member_number,
                    first_name: d.first_name,
                    last_name: d.last_name,
                    phone: d.phone,
                    email: d.email,
                    status: d.status,
                    joined_date: String(d.joined_date),
                    savings_balance: String(d.savings_balance),
                    shares_balance: String(d.shares_balance),
                    loans_balance: String(d.loans_balance),
                })),
                total,
            };
        }, 'getMemberListing');
    }

    async getSavingsSummary(): Promise<SavingsSummaryRow[]> {
        return this.executeSafely(async () => {
            const rows = await this.db
                .selectFrom('savings_products')
                .leftJoin('savings_accounts', 'savings_accounts.product_id', 'savings_products.id')
                .select([
                    'savings_products.name as product_name',
                    'savings_products.code as product_code',
                    sql<string>`COUNT(savings_accounts.id)::text`.as('total_accounts'),
                    sql<string>`COUNT(CASE WHEN savings_accounts.status = 'active' THEN 1 END)::text`.as('active_accounts'),
                    sql<string>`COALESCE(SUM(savings_accounts.principal_balance), 0)`.as('total_balance'),
                    sql<string>`COALESCE(SUM(savings_accounts.interest_accrued), 0)`.as('total_interest_accrued'),
                ])
                .where('savings_products.deleted_at', 'is', null)
                .groupBy(['savings_products.id', 'savings_products.name', 'savings_products.code'])
                .orderBy('savings_products.name', 'asc')
                .execute();

            // Get deposit/withdrawal totals per product
            const depositRows = await this.db
                .selectFrom('deposits')
                .innerJoin('savings_accounts', 'savings_accounts.id', 'deposits.savings_account_id')
                .select([
                    'savings_accounts.product_id',
                    sql<string>`COALESCE(SUM(deposits.amount), 0)`.as('total_deposits'),
                ])
                .where('deposits.status', '=', 'posted')
                .where('deposits.deleted_at', 'is', null)
                .groupBy('savings_accounts.product_id')
                .execute();

            const withdrawalRows = await this.db
                .selectFrom('withdrawals')
                .innerJoin('savings_accounts', 'savings_accounts.id', 'withdrawals.savings_account_id')
                .select([
                    'savings_accounts.product_id',
                    sql<string>`COALESCE(SUM(withdrawals.amount), 0)`.as('total_withdrawals'),
                ])
                .where('withdrawals.status', 'in', ['approved', 'completed'])
                .where('withdrawals.deleted_at', 'is', null)
                .groupBy('savings_accounts.product_id')
                .execute();

            const depositMap = new Map(depositRows.map((d) => [d.product_id, String(d.total_deposits)]));
            const withdrawalMap = new Map(withdrawalRows.map((w) => [w.product_id, String(w.total_withdrawals)]));

            // We need to get product IDs, so re-query with IDs
            const productIds = await this.db
                .selectFrom('savings_products')
                .select(['savings_products.id', 'savings_products.code'])
                .where('savings_products.deleted_at', 'is', null)
                .execute();
            const codeToId = new Map(productIds.map((p) => [p.code, p.id]));

            return rows.map((r) => {
                const productId = codeToId.get(r.product_code) || '';
                return {
                    product_name: r.product_name,
                    product_code: r.product_code,
                    total_accounts: r.total_accounts,
                    active_accounts: r.active_accounts,
                    total_balance: String(r.total_balance),
                    total_deposits: depositMap.get(productId) || '0',
                    total_withdrawals: withdrawalMap.get(productId) || '0',
                    total_interest_accrued: String(r.total_interest_accrued),
                };
            });
        }, 'getSavingsSummary');
    }

    async getLoanPortfolio(): Promise<LoanPortfolioRow[]> {
        return this.executeSafely(async () => {
            const rows = await this.db
                .selectFrom('loan_products')
                .leftJoin('loan_accounts', 'loan_accounts.product_id', 'loan_products.id')
                .select([
                    'loan_products.name as product_name',
                    'loan_products.code as product_code',
                    sql<string>`COUNT(loan_accounts.id)::text`.as('total_accounts'),
                    sql<string>`COUNT(CASE WHEN loan_accounts.status = 'active' THEN 1 END)::text`.as('active_accounts'),
                    sql<string>`COALESCE(SUM(loan_accounts.disbursement_amount), 0)`.as('total_disbursed'),
                    sql<string>`COALESCE(SUM(loan_accounts.principal_outstanding), 0)`.as('principal_outstanding'),
                    sql<string>`COALESCE(SUM(loan_accounts.interest_outstanding), 0)`.as('interest_outstanding'),
                    sql<string>`COALESCE(SUM(loan_accounts.penalties_outstanding), 0)`.as('penalties_outstanding'),
                    sql<string>`COALESCE(SUM(loan_accounts.total_outstanding), 0)`.as('total_outstanding'),
                ])
                .where('loan_products.deleted_at', 'is', null)
                .groupBy(['loan_products.id', 'loan_products.name', 'loan_products.code'])
                .orderBy('loan_products.name', 'asc')
                .execute();

            return rows.map((r) => ({
                product_name: r.product_name,
                product_code: r.product_code,
                total_accounts: r.total_accounts,
                active_accounts: r.active_accounts,
                total_disbursed: String(r.total_disbursed),
                principal_outstanding: String(r.principal_outstanding),
                interest_outstanding: String(r.interest_outstanding),
                penalties_outstanding: String(r.penalties_outstanding),
                total_outstanding: String(r.total_outstanding),
            }));
        }, 'getLoanPortfolio');
    }

    async getArrearsAgeing(): Promise<ArrearsAgeingRow[]> {
        return this.executeSafely(async () => {
            const rows = await this.db
                .selectFrom('loan_schedules')
                .innerJoin('loan_accounts', 'loan_accounts.id', 'loan_schedules.loan_account_id')
                .innerJoin('members', 'members.id', 'loan_accounts.member_id')
                .innerJoin('loan_products', 'loan_products.id', 'loan_accounts.product_id')
                .select([
                    'loan_accounts.loan_number',
                    'members.member_number',
                    sql<string>`members.first_name || ' ' || members.last_name`.as('member_name'),
                    'loan_products.name as product_name',
                    'loan_accounts.disbursement_date',
                    'loan_accounts.total_outstanding',
                    'loan_schedules.days_overdue',
                    'loan_schedules.total_payment as overdue_amount',
                ])
                .where('loan_schedules.status', '=', 'overdue')
                .where('loan_accounts.deleted_at', 'is', null)
                .orderBy('loan_schedules.days_overdue', 'desc')
                .execute();

            return rows.map((r) => {
                const daysOverdue = r.days_overdue ?? 0;
                return {
                    loan_number: r.loan_number,
                    member_number: r.member_number,
                    member_name: r.member_name,
                    product_name: r.product_name,
                    disbursement_date: String(r.disbursement_date || ''),
                    total_outstanding: String(r.total_outstanding || '0'),
                    days_overdue: daysOverdue,
                    overdue_amount: String(r.overdue_amount || '0'),
                    ageing_bucket: this.getAgeingBucket(daysOverdue),
                };
            });
        }, 'getArrearsAgeing');
    }

    private getAgeingBucket(daysOverdue: number): string {
        if (daysOverdue <= 30) return '1-30 days';
        if (daysOverdue <= 60) return '31-60 days';
        if (daysOverdue <= 90) return '61-90 days';
        if (daysOverdue <= 180) return '91-180 days';
        if (daysOverdue <= 365) return '181-365 days';
        return '365+ days';
    }

    async getNplReport(): Promise<NplReportRow[]> {
        return this.executeSafely(async () => {
            const rows = await this.db
                .selectFrom('loan_accounts')
                .innerJoin('members', 'members.id', 'loan_accounts.member_id')
                .innerJoin('loan_products', 'loan_products.id', 'loan_accounts.product_id')
                .select([
                    'loan_accounts.loan_number',
                    'members.member_number',
                    sql<string>`members.first_name || ' ' || members.last_name`.as('member_name'),
                    'loan_products.name as product_name',
                    'loan_accounts.disbursement_date',
                    'loan_accounts.status',
                    'loan_accounts.principal_outstanding',
                    'loan_accounts.interest_outstanding',
                    'loan_accounts.penalties_outstanding',
                    'loan_accounts.total_outstanding',
                ])
                .where('loan_accounts.status', 'in', ['defaulted', 'written_off'])
                .where('loan_accounts.deleted_at', 'is', null)
                .orderBy('loan_accounts.total_outstanding', 'desc')
                .execute();

            // Get max overdue days for each loan
            const loanIds = rows.map((r) => r.loan_number);
            const overdueDays = loanIds.length > 0
                ? await this.db
                    .selectFrom('loan_schedules')
                    .innerJoin('loan_accounts', 'loan_accounts.id', 'loan_schedules.loan_account_id')
                    .select([
                        'loan_accounts.loan_number',
                        sql<number>`MAX(loan_schedules.days_overdue)`.as('max_overdue'),
                    ])
                    .where('loan_accounts.loan_number', 'in', loanIds)
                    .groupBy('loan_accounts.loan_number')
                    .execute()
                : [];

            const overdueMap = new Map(overdueDays.map((o) => [o.loan_number, o.max_overdue ?? 0]));

            return rows.map((r) => {
                const daysInDefault = overdueMap.get(r.loan_number) || 0;
                return {
                    loan_number: r.loan_number,
                    member_number: r.member_number,
                    member_name: r.member_name,
                    product_name: r.product_name,
                    disbursement_date: String(r.disbursement_date || ''),
                    status: r.status,
                    principal_outstanding: String(r.principal_outstanding || '0'),
                    interest_outstanding: String(r.interest_outstanding || '0'),
                    penalties_outstanding: String(r.penalties_outstanding || '0'),
                    total_outstanding: String(r.total_outstanding || '0'),
                    days_in_default: daysInDefault,
                    npl_category: this.getNplCategory(daysInDefault),
                };
            });
        }, 'getNplReport');
    }

    private getNplCategory(daysOverdue: number): string {
        if (daysOverdue <= 90) return 'Substandard';
        if (daysOverdue <= 180) return 'Doubtful';
        return 'Loss';
    }

    async getDailyTransactions(date: Date, filters?: {
        category?: string;
        limit?: number;
        offset?: number;
    }): Promise<{ data: DailyTransactionRow[]; total: number }> {
        return this.executeSafely(async () => {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);

            let query = this.db
                .selectFrom('transactions')
                .innerJoin('accounts as da', 'da.id', 'transactions.debit_account_id')
                .innerJoin('accounts as ca', 'ca.id', 'transactions.credit_account_id')
                .leftJoin('members', 'members.id', 'transactions.member_id')
                .select([
                    'transactions.id',
                    'transactions.code',
                    'transactions.category',
                    'transactions.amount',
                    'transactions.transaction_date',
                    'transactions.payment_method',
                    'transactions.description',
                    sql<string>`CASE WHEN members.id IS NOT NULL THEN members.first_name || ' ' || members.last_name ELSE NULL END`.as('member_name'),
                    sql<string>`da.code || ' - ' || da.name`.as('debit_account'),
                    sql<string>`ca.code || ' - ' || ca.name`.as('credit_account'),
                ])
                .where('transactions.transaction_date', '>=', startOfDay)
                .where('transactions.transaction_date', '<=', endOfDay)
                .where('transactions.deleted_at', 'is', null);

            if (filters?.category) {
                query = query.where('transactions.category', '=', filters.category as any);
            }

            const countQuery = this.db
                .selectFrom('transactions')
                .select(sql<number>`COUNT(*)::int`.as('total'))
                .where('transactions.transaction_date', '>=', startOfDay)
                .where('transactions.transaction_date', '<=', endOfDay)
                .where('transactions.deleted_at', 'is', null);

            const countResult = await countQuery.executeTakeFirst();
            const total = countResult?.total ?? 0;

            query = query.orderBy('transactions.transaction_date', 'desc');
            if (filters?.limit) query = query.limit(filters.limit);
            if (filters?.offset) query = query.offset(filters.offset);

            const data = await query.execute();

            return {
                data: data.map((d) => ({
                    id: d.id,
                    code: d.code,
                    category: d.category,
                    amount: String(d.amount),
                    transaction_date: String(d.transaction_date),
                    payment_method: d.payment_method,
                    description: d.description,
                    member_name: d.member_name,
                    debit_account: d.debit_account,
                    credit_account: d.credit_account,
                })),
                total,
            };
        }, 'getDailyTransactions');
    }

    // ── Dashboard KPIs ──

    async getDashboardKPIs(): Promise<DashboardKPIs> {
        return this.executeSafely(async () => {
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            // Members
            const memberStats = await this.db
                .selectFrom('members')
                .select([
                    sql<number>`COUNT(*)::int`.as('total_members'),
                    sql<number>`COUNT(CASE WHEN status = 'active' THEN 1 END)::int`.as('active_members'),
                    sql<number>`COUNT(CASE WHEN joined_date >= ${startOfMonth} THEN 1 END)::int`.as('new_this_month'),
                ])
                .where('members.deleted_at', 'is', null)
                .executeTakeFirstOrThrow();

            // Savings
            const savingsStats = await this.db
                .selectFrom('savings_accounts')
                .select([
                    sql<string>`COALESCE(SUM(principal_balance), 0)`.as('total_balance'),
                ])
                .where('savings_accounts.deleted_at', 'is', null)
                .executeTakeFirstOrThrow();

            const depositsToday = await this.db
                .selectFrom('deposits')
                .select(sql<string>`COALESCE(SUM(amount), 0)`.as('total'))
                .where('deposits.deposit_date', '>=', startOfDay)
                .where('deposits.status', '=', 'posted')
                .where('deposits.deleted_at', 'is', null)
                .executeTakeFirstOrThrow();

            const withdrawalsToday = await this.db
                .selectFrom('withdrawals')
                .select(sql<string>`COALESCE(SUM(amount), 0)`.as('total'))
                .where('withdrawals.withdrawal_date', '>=', startOfDay)
                .where('withdrawals.status', 'in', ['approved', 'completed'])
                .where('withdrawals.deleted_at', 'is', null)
                .executeTakeFirstOrThrow();

            // Loans
            const loanStats = await this.db
                .selectFrom('loan_accounts')
                .select([
                    sql<string>`COALESCE(SUM(total_outstanding), 0)`.as('total_portfolio'),
                    sql<number>`COUNT(CASE WHEN status = 'active' THEN 1 END)::int`.as('active_loans'),
                ])
                .where('loan_accounts.deleted_at', 'is', null)
                .executeTakeFirstOrThrow();

            const disbursedThisMonth = await this.db
                .selectFrom('loan_accounts')
                .select(sql<string>`COALESCE(SUM(disbursement_amount), 0)`.as('total'))
                .where('loan_accounts.disbursement_date', '>=', startOfMonth)
                .where('loan_accounts.deleted_at', 'is', null)
                .executeTakeFirstOrThrow();

            const repaymentsThisMonth = await this.db
                .selectFrom('loan_repayments')
                .select(sql<string>`COALESCE(SUM(total_payment), 0)`.as('total'))
                .where('loan_repayments.repayment_date', '>=', startOfMonth)
                .where('loan_repayments.status', '=', 'posted')
                .where('loan_repayments.deleted_at', 'is', null)
                .executeTakeFirstOrThrow();

            // Arrears
            const arrearsStats = await this.db
                .selectFrom('loan_schedules')
                .innerJoin('loan_accounts', 'loan_accounts.id', 'loan_schedules.loan_account_id')
                .select([
                    sql<string>`COALESCE(SUM(loan_schedules.total_payment), 0)`.as('total_arrears'),
                    sql<number>`COUNT(DISTINCT loan_accounts.id)::int`.as('loans_in_arrears'),
                ])
                .where('loan_schedules.status', '=', 'overdue')
                .where('loan_accounts.deleted_at', 'is', null)
                .executeTakeFirstOrThrow();

            // NPL
            const nplStats = await this.db
                .selectFrom('loan_accounts')
                .select([
                    sql<number>`COUNT(*)::int`.as('npl_count'),
                    sql<string>`COALESCE(SUM(total_outstanding), 0)`.as('npl_amount'),
                ])
                .where('loan_accounts.status', 'in', ['defaulted', 'written_off'])
                .where('loan_accounts.deleted_at', 'is', null)
                .executeTakeFirstOrThrow();

            // PAR (Portfolio at Risk)
            const totalPortfolio = parseFloat(String(loanStats.total_portfolio)) || 1;

            const par30 = await this.db
                .selectFrom('loan_schedules')
                .innerJoin('loan_accounts', 'loan_accounts.id', 'loan_schedules.loan_account_id')
                .select(sql<string>`COALESCE(SUM(loan_accounts.total_outstanding), 0)`.as('at_risk'))
                .where('loan_schedules.status', '=', 'overdue')
                .where('loan_schedules.days_overdue', '>=', 30)
                .where('loan_accounts.deleted_at', 'is', null)
                .executeTakeFirstOrThrow();

            const par90 = await this.db
                .selectFrom('loan_schedules')
                .innerJoin('loan_accounts', 'loan_accounts.id', 'loan_schedules.loan_account_id')
                .select(sql<string>`COALESCE(SUM(loan_accounts.total_outstanding), 0)`.as('at_risk'))
                .where('loan_schedules.status', '=', 'overdue')
                .where('loan_schedules.days_overdue', '>=', 90)
                .where('loan_accounts.deleted_at', 'is', null)
                .executeTakeFirstOrThrow();

            // Shares
            const sharesStats = await this.db
                .selectFrom('share_holdings')
                .select(sql<string>`COALESCE(SUM(total_invested), 0)`.as('total_value'))
                .where('share_holdings.deleted_at', 'is', null)
                .executeTakeFirstOrThrow();

            // Fixed Deposits
            const fdStats = await this.db
                .selectFrom('fixed_deposits')
                .select(sql<string>`COALESCE(SUM(principal_amount), 0)`.as('total'))
                .where('fixed_deposits.status', '=', 'active')
                .where('fixed_deposits.deleted_at', 'is', null)
                .executeTakeFirstOrThrow();

            const par30Value = parseFloat(String(par30.at_risk)) || 0;
            const par90Value = parseFloat(String(par90.at_risk)) || 0;

            return {
                total_members: memberStats.total_members,
                active_members: memberStats.active_members,
                new_members_this_month: memberStats.new_this_month,
                total_savings_balance: String(savingsStats.total_balance),
                total_deposits_today: String(depositsToday.total),
                total_withdrawals_today: String(withdrawalsToday.total),
                total_loan_portfolio: String(loanStats.total_portfolio),
                active_loans: loanStats.active_loans,
                total_disbursed_this_month: String(disbursedThisMonth.total),
                total_repayments_this_month: String(repaymentsThisMonth.total),
                total_arrears: String(arrearsStats.total_arrears),
                loans_in_arrears: arrearsStats.loans_in_arrears,
                npl_count: nplStats.npl_count,
                npl_amount: String(nplStats.npl_amount),
                total_shares_value: String(sharesStats.total_value),
                total_fixed_deposits: String(fdStats.total),
                par_30: ((par30Value / totalPortfolio) * 100).toFixed(2),
                par_90: ((par90Value / totalPortfolio) * 100).toFixed(2),
            };
        }, 'getDashboardKPIs');
    }

    async getRecentActivity(limit: number = 20): Promise<RecentActivityRow[]> {
        return this.executeSafely(async () => {
            // Union recent transactions and audit log entries
            const transactions = await this.db
                .selectFrom('transactions')
                .select([
                    'transactions.id',
                    'transactions.category as type',
                    'transactions.description',
                    sql<string>`transactions.amount::text`.as('amount'),
                    'transactions.created_at',
                    'transactions.recorded_by as actor',
                ])
                .where('transactions.deleted_at', 'is', null)
                .orderBy('transactions.created_at', 'desc')
                .limit(limit)
                .execute();

            const activities = await this.db
                .selectFrom('activity_log')
                .select([
                    'activity_log.id',
                    'activity_log.action as type',
                    'activity_log.description',
                    sql<string>`NULL`.as('amount'),
                    'activity_log.created_at',
                    'activity_log.performed_by as actor',
                ])
                .orderBy('activity_log.created_at', 'desc')
                .limit(limit)
                .execute();

            const combined = [...transactions, ...activities]
                .sort((a, b) => new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime())
                .slice(0, limit);

            return combined.map((r) => ({
                id: r.id,
                type: r.type,
                description: r.description,
                amount: r.amount,
                created_at: String(r.created_at),
                actor: r.actor,
            }));
        }, 'getRecentActivity');
    }
}
