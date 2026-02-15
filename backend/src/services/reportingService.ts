/**
 * Reporting Service
 * Business logic for financial statements, operational reports, and dashboard
 *
 * Implements requirements:
 * - ACC-008: Generate standard financial statements
 * - RPT-001: Trial Balance, Balance Sheet, Income Statement, Cash Flow
 * - RPT-002: Operational reports
 * - RPT-003: Dashboard with KPIs
 */

import { appLogger } from '../middleware/logger';
import { CacheService } from './cacheService';
import {
    ReportingRepository,
    TrialBalanceRow,
    BalanceSheetRow,
    IncomeStatementRow,
    CashFlowRow,
    MemberListingRow,
    SavingsSummaryRow,
    LoanPortfolioRow,
    ArrearsAgeingRow,
    NplReportRow,
    DailyTransactionRow,
    DashboardKPIs,
    RecentActivityRow,
} from '../repositories/reportingRepository';

// ── Report Envelope Types ──

export interface ReportMeta {
    reportName: string;
    generatedAt: Date;
    generatedBy: string;
    tenantName?: string;
    periodStart?: Date;
    periodEnd?: Date;
    asOfDate?: Date;
    filters?: Record<string, any>;
}

export interface TrialBalanceReport {
    meta: ReportMeta;
    rows: TrialBalanceRow[];
    totals: {
        totalDebits: string;
        totalCredits: string;
        balanced: boolean;
    };
}

export interface BalanceSheetReport {
    meta: ReportMeta;
    assets: BalanceSheetRow[];
    liabilities: BalanceSheetRow[];
    equity: BalanceSheetRow[];
    totals: {
        totalAssets: string;
        totalLiabilities: string;
        totalEquity: string;
        totalLiabilitiesAndEquity: string;
        balanced: boolean;
    };
}

export interface IncomeStatementReport {
    meta: ReportMeta;
    revenue: IncomeStatementRow[];
    expenses: IncomeStatementRow[];
    totals: {
        totalRevenue: string;
        totalExpenses: string;
        netIncome: string;
    };
}

export interface CashFlowReport {
    meta: ReportMeta;
    operating: CashFlowRow[];
    financing: CashFlowRow[];
    other: CashFlowRow[];
    totals: {
        operatingTotal: string;
        financingTotal: string;
        otherTotal: string;
        netCashFlow: string;
    };
}

export interface MemberListingReport {
    meta: ReportMeta;
    data: MemberListingRow[];
    total: number;
}

export interface SavingsSummaryReport {
    meta: ReportMeta;
    data: SavingsSummaryRow[];
    totals: {
        totalAccounts: number;
        activeAccounts: number;
        totalBalance: string;
        totalDeposits: string;
        totalWithdrawals: string;
    };
}

export interface LoanPortfolioReport {
    meta: ReportMeta;
    data: LoanPortfolioRow[];
    totals: {
        totalAccounts: number;
        activeAccounts: number;
        totalDisbursed: string;
        totalOutstanding: string;
    };
}

export interface ArrearsAgeingReport {
    meta: ReportMeta;
    data: ArrearsAgeingRow[];
    buckets: Array<{
        bucket: string;
        count: number;
        amount: string;
    }>;
    totals: {
        totalLoansInArrears: number;
        totalArrearsAmount: string;
    };
}

export interface NplReportResult {
    meta: ReportMeta;
    data: NplReportRow[];
    summary: {
        substandard: { count: number; amount: string };
        doubtful: { count: number; amount: string };
        loss: { count: number; amount: string };
    };
    totals: {
        totalNplLoans: number;
        totalNplAmount: string;
    };
}

export interface DailyTransactionsReport {
    meta: ReportMeta;
    data: DailyTransactionRow[];
    total: number;
    summary: {
        totalAmount: string;
        byCategory: Array<{ category: string; count: number; amount: string }>;
    };
}

export interface DashboardData {
    kpis: DashboardKPIs;
    recentActivity: RecentActivityRow[];
    alerts: DashboardAlert[];
}

export interface DashboardAlert {
    type: 'warning' | 'danger' | 'info';
    title: string;
    message: string;
}

export class ReportingService {
    private repo: ReportingRepository;
    private cache: CacheService;

    constructor(schemaName: string) {
        this.repo = new ReportingRepository(schemaName);
        this.cache = new CacheService(schemaName);
    }

    // ── Financial Reports ──

    async generateTrialBalance(generatedBy: string, periodId?: string): Promise<TrialBalanceReport> {
        const cacheKey = `trial-balance:${periodId || 'current'}`;
        return this.cache.getOrSet('reports', cacheKey, async () => {
            appLogger.info('Generating trial balance', { generatedBy, periodId });

            const rows = await this.repo.getTrialBalance(periodId);

            const totalDebits = rows.reduce((sum, r) => sum + parseFloat(r.debit_balance), 0);
            const totalCredits = rows.reduce((sum, r) => sum + parseFloat(r.credit_balance), 0);

            return {
                meta: {
                    reportName: 'Trial Balance',
                    generatedAt: new Date(),
                    generatedBy,
                    asOfDate: new Date(),
                },
                rows,
                totals: {
                    totalDebits: totalDebits.toFixed(4),
                    totalCredits: totalCredits.toFixed(4),
                    balanced: Math.abs(totalDebits - totalCredits) < 0.01,
                },
            };
        });
    }

    async generateBalanceSheet(generatedBy: string, asOfDate?: Date): Promise<BalanceSheetReport> {
        const date = asOfDate || new Date();
        const dateKey = date.toISOString().split('T')[0];
        const cacheKey = `balance-sheet:${dateKey}`;
        return this.cache.getOrSet('reports', cacheKey, async () => {
            appLogger.info('Generating balance sheet', { generatedBy, asOfDate: date });

            const rows = await this.repo.getBalanceSheet(date);

            const assets = rows.filter((r) => r.account_type === 'asset');
            const liabilities = rows.filter((r) => r.account_type === 'liability');
            const equity = rows.filter((r) => r.account_type === 'equity');

            const totalAssets = assets.reduce((sum, r) => sum + parseFloat(r.balance), 0);
            const totalLiabilities = liabilities.reduce((sum, r) => sum + parseFloat(r.balance), 0);
            const totalEquity = equity.reduce((sum, r) => sum + parseFloat(r.balance), 0);
            const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

            return {
                meta: {
                    reportName: 'Balance Sheet',
                    generatedAt: new Date(),
                    generatedBy,
                    asOfDate: date,
                },
                assets,
                liabilities,
                equity,
                totals: {
                    totalAssets: totalAssets.toFixed(4),
                    totalLiabilities: totalLiabilities.toFixed(4),
                    totalEquity: totalEquity.toFixed(4),
                    totalLiabilitiesAndEquity: totalLiabilitiesAndEquity.toFixed(4),
                    balanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01,
                },
            };
        });
    }

    async generateIncomeStatement(
        generatedBy: string,
        periodStart: Date,
        periodEnd: Date
    ): Promise<IncomeStatementReport> {
        const startKey = periodStart.toISOString().split('T')[0];
        const endKey = periodEnd.toISOString().split('T')[0];
        const cacheKey = `income-stmt:${startKey}:${endKey}`;
        return this.cache.getOrSet('reports', cacheKey, async () => {
            appLogger.info('Generating income statement', { generatedBy, periodStart, periodEnd });

            const rows = await this.repo.getIncomeStatement(periodStart, periodEnd);

            const revenue = rows.filter((r) => r.account_type === 'income');
            const expenses = rows.filter((r) => r.account_type === 'expense');

            const totalRevenue = revenue.reduce((sum, r) => sum + parseFloat(r.amount), 0);
            const totalExpenses = expenses.reduce((sum, r) => sum + parseFloat(r.amount), 0);

            return {
                meta: {
                    reportName: 'Income Statement (Profit & Loss)',
                    generatedAt: new Date(),
                    generatedBy,
                    periodStart,
                    periodEnd,
                },
                revenue,
                expenses,
                totals: {
                    totalRevenue: totalRevenue.toFixed(4),
                    totalExpenses: totalExpenses.toFixed(4),
                    netIncome: (totalRevenue - totalExpenses).toFixed(4),
                },
            };
        });
    }

    async generateCashFlowStatement(
        generatedBy: string,
        periodStart: Date,
        periodEnd: Date
    ): Promise<CashFlowReport> {
        const startKey = periodStart.toISOString().split('T')[0];
        const endKey = periodEnd.toISOString().split('T')[0];
        const cacheKey = `cash-flow:${startKey}:${endKey}`;
        return this.cache.getOrSet('reports', cacheKey, async () => {
            appLogger.info('Generating cash flow statement', { generatedBy, periodStart, periodEnd });

            const rows = await this.repo.getCashFlowStatement(periodStart, periodEnd);

            const operating = rows.filter((r) => r.category === 'operating');
            const financing = rows.filter((r) => r.category === 'financing');
            const other = rows.filter((r) => r.category === 'other');

            const operatingTotal = operating.reduce((sum, r) => sum + parseFloat(r.amount), 0);
            const financingTotal = financing.reduce((sum, r) => sum + parseFloat(r.amount), 0);
            const otherTotal = other.reduce((sum, r) => sum + parseFloat(r.amount), 0);

            return {
                meta: {
                    reportName: 'Cash Flow Statement',
                    generatedAt: new Date(),
                    generatedBy,
                    periodStart,
                    periodEnd,
                },
                operating,
                financing,
                other,
                totals: {
                    operatingTotal: operatingTotal.toFixed(4),
                    financingTotal: financingTotal.toFixed(4),
                    otherTotal: otherTotal.toFixed(4),
                    netCashFlow: (operatingTotal + financingTotal + otherTotal).toFixed(4),
                },
            };
        });
    }

    // ── Operational Reports ──

    async generateMemberListing(
        generatedBy: string,
        filters?: { status?: string; search?: string; limit?: number; offset?: number }
    ): Promise<MemberListingReport> {
        // Member listing with filters is not cached (dynamic search/pagination)
        // Only cache the unfiltered full listing
        const isFilteredRequest = filters?.search || filters?.status;
        if (isFilteredRequest) {
            appLogger.info('Generating member listing (uncached, filtered)', { generatedBy, filters });
            const result = await this.repo.getMemberListing(filters);
            return {
                meta: { reportName: 'Member Listing', generatedAt: new Date(), generatedBy, filters },
                data: result.data,
                total: result.total,
            };
        }

        const cacheKey = `member-listing:${filters?.limit || 'all'}:${filters?.offset || 0}`;
        return this.cache.getOrSet('members', cacheKey, async () => {
            appLogger.info('Generating member listing', { generatedBy, filters });
            const result = await this.repo.getMemberListing(filters);
            return {
                meta: { reportName: 'Member Listing', generatedAt: new Date(), generatedBy, filters },
                data: result.data,
                total: result.total,
            };
        });
    }

    async generateSavingsSummary(generatedBy: string): Promise<SavingsSummaryReport> {
        return this.cache.getOrSet('reports', 'savings-summary', async () => {
            appLogger.info('Generating savings summary', { generatedBy });

            const data = await this.repo.getSavingsSummary();

            const totalAccounts = data.reduce((sum, r) => sum + parseInt(r.total_accounts, 10), 0);
            const activeAccounts = data.reduce((sum, r) => sum + parseInt(r.active_accounts, 10), 0);
            const totalBalance = data.reduce((sum, r) => sum + parseFloat(r.total_balance || '0'), 0);
            const totalDeposits = data.reduce((sum, r) => sum + parseFloat(r.total_deposits || '0'), 0);
            const totalWithdrawals = data.reduce((sum, r) => sum + parseFloat(r.total_withdrawals || '0'), 0);

            return {
                meta: { reportName: 'Savings Summary', generatedAt: new Date(), generatedBy },
                data,
                totals: {
                    totalAccounts,
                    activeAccounts,
                    totalBalance: totalBalance.toFixed(4),
                    totalDeposits: totalDeposits.toFixed(4),
                    totalWithdrawals: totalWithdrawals.toFixed(4),
                },
            };
        });
    }

    async generateLoanPortfolio(generatedBy: string): Promise<LoanPortfolioReport> {
        return this.cache.getOrSet('reports', 'loan-portfolio', async () => {
            appLogger.info('Generating loan portfolio', { generatedBy });

            const data = await this.repo.getLoanPortfolio();

            const totalAccounts = data.reduce((sum, r) => sum + parseInt(r.total_accounts, 10), 0);
            const activeAccounts = data.reduce((sum, r) => sum + parseInt(r.active_accounts, 10), 0);
            const totalDisbursed = data.reduce((sum, r) => sum + parseFloat(r.total_disbursed || '0'), 0);
            const totalOutstanding = data.reduce((sum, r) => sum + parseFloat(r.total_outstanding || '0'), 0);

            return {
                meta: { reportName: 'Loan Portfolio', generatedAt: new Date(), generatedBy },
                data,
                totals: {
                    totalAccounts,
                    activeAccounts,
                    totalDisbursed: totalDisbursed.toFixed(4),
                    totalOutstanding: totalOutstanding.toFixed(4),
                },
            };
        });
    }

    async generateArrearsAgeing(generatedBy: string): Promise<ArrearsAgeingReport> {
        return this.cache.getOrSet('reports', 'arrears-ageing', async () => {
            appLogger.info('Generating arrears ageing', { generatedBy });

            const data = await this.repo.getArrearsAgeing();

            const bucketMap = new Map<string, { count: number; amount: number }>();
            for (const row of data) {
                const bucket = row.ageing_bucket;
                const existing = bucketMap.get(bucket) || { count: 0, amount: 0 };
                existing.count += 1;
                existing.amount += parseFloat(row.overdue_amount || '0');
                bucketMap.set(bucket, existing);
            }

            const BUCKET_ORDER = ['1-30 days', '31-60 days', '61-90 days', '91-180 days', '181-365 days', '365+ days'];
            const buckets = BUCKET_ORDER
                .filter((b) => bucketMap.has(b))
                .map((b) => ({
                    bucket: b,
                    count: bucketMap.get(b)!.count,
                    amount: bucketMap.get(b)!.amount.toFixed(4),
                }));

            const totalArrearsAmount = data.reduce((sum, r) => sum + parseFloat(r.overdue_amount || '0'), 0);

            return {
                meta: { reportName: 'Arrears Ageing Report', generatedAt: new Date(), generatedBy },
                data,
                buckets,
                totals: {
                    totalLoansInArrears: data.length,
                    totalArrearsAmount: totalArrearsAmount.toFixed(4),
                },
            };
        });
    }

    async generateNplReport(generatedBy: string): Promise<NplReportResult> {
        return this.cache.getOrSet('reports', 'npl-report', async () => {
            appLogger.info('Generating NPL report', { generatedBy });

            const data = await this.repo.getNplReport();

            const categories = { substandard: { count: 0, amount: 0 }, doubtful: { count: 0, amount: 0 }, loss: { count: 0, amount: 0 } };
            for (const row of data) {
                const cat = row.npl_category.toLowerCase() as keyof typeof categories;
                if (categories[cat]) {
                    categories[cat].count += 1;
                    categories[cat].amount += parseFloat(row.total_outstanding || '0');
                }
            }

            const totalAmount = data.reduce((sum, r) => sum + parseFloat(r.total_outstanding || '0'), 0);

            return {
                meta: { reportName: 'Non-Performing Loans (NPL) Report', generatedAt: new Date(), generatedBy },
                data,
                summary: {
                    substandard: { count: categories.substandard.count, amount: categories.substandard.amount.toFixed(4) },
                    doubtful: { count: categories.doubtful.count, amount: categories.doubtful.amount.toFixed(4) },
                    loss: { count: categories.loss.count, amount: categories.loss.amount.toFixed(4) },
                },
                totals: {
                    totalNplLoans: data.length,
                    totalNplAmount: totalAmount.toFixed(4),
                },
            };
        });
    }

    async generateDailyTransactions(
        generatedBy: string,
        date: Date,
        filters?: { category?: string; limit?: number; offset?: number }
    ): Promise<DailyTransactionsReport> {
        const dateKey = date.toISOString().split('T')[0];
        const cacheKey = `daily-txn:${dateKey}:${filters?.category || 'all'}:${filters?.limit || 'all'}:${filters?.offset || 0}`;
        return this.cache.getOrSet('reports', cacheKey, async () => {
            appLogger.info('Generating daily transactions', { generatedBy, date, filters });

            const result = await this.repo.getDailyTransactions(date, filters);

            // Summarize by category
            const catMap = new Map<string, { count: number; amount: number }>();
            for (const row of result.data) {
                const existing = catMap.get(row.category) || { count: 0, amount: 0 };
                existing.count += 1;
                existing.amount += parseFloat(row.amount || '0');
                catMap.set(row.category, existing);
            }

            const totalAmount = result.data.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);

            return {
                meta: {
                    reportName: 'Daily Transactions Report',
                    generatedAt: new Date(),
                    generatedBy,
                    asOfDate: date,
                    filters,
                },
                data: result.data,
                total: result.total,
                summary: {
                    totalAmount: totalAmount.toFixed(4),
                    byCategory: Array.from(catMap.entries()).map(([category, stats]) => ({
                        category,
                        count: stats.count,
                        amount: stats.amount.toFixed(4),
                    })),
                },
            };
        });
    }

    // ── Dashboard ──

    async getDashboard(generatedBy: string): Promise<DashboardData> {
        return this.cache.getOrSet('dashboard', 'main', async () => {
            appLogger.info('Generating dashboard data', { generatedBy });

            const [kpis, recentActivity] = await Promise.all([
                this.repo.getDashboardKPIs(),
                this.repo.getRecentActivity(20),
            ]);

            const alerts = this.generateAlerts(kpis);

            return { kpis, recentActivity, alerts };
        });
    }

    private generateAlerts(kpis: DashboardKPIs): DashboardAlert[] {
        const alerts: DashboardAlert[] = [];

        const par30 = parseFloat(kpis.par_30);
        const par90 = parseFloat(kpis.par_90);

        if (par30 > 10) {
            alerts.push({
                type: 'danger',
                title: 'High Portfolio at Risk (PAR 30)',
                message: `PAR 30 is ${par30.toFixed(2)}% — exceeds 10% threshold. Review arrears management.`,
            });
        } else if (par30 > 5) {
            alerts.push({
                type: 'warning',
                title: 'Elevated Portfolio at Risk (PAR 30)',
                message: `PAR 30 is ${par30.toFixed(2)}% — approaching 10% threshold.`,
            });
        }

        if (par90 > 5) {
            alerts.push({
                type: 'danger',
                title: 'High NPL Risk (PAR 90)',
                message: `PAR 90 is ${par90.toFixed(2)}% — exceeds 5% threshold. Immediate action required.`,
            });
        }

        if (kpis.npl_count > 0) {
            alerts.push({
                type: 'warning',
                title: 'Non-Performing Loans',
                message: `${kpis.npl_count} loan(s) classified as NPL totalling ${kpis.npl_amount}.`,
            });
        }

        if (kpis.loans_in_arrears > 0) {
            alerts.push({
                type: 'info',
                title: 'Loans in Arrears',
                message: `${kpis.loans_in_arrears} loan(s) currently in arrears totalling ${kpis.total_arrears}.`,
            });
        }

        return alerts;
    }
}

export function initReportingService(schemaName: string): ReportingService {
    return new ReportingService(schemaName);
}
