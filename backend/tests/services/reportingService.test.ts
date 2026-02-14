/**
 * Reporting Service Tests
 * Tests for financial statements, operational reports, and dashboard
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportingService } from '../../src/services/reportingService';

// Mock the repository
const mockRepoInstance = {
    getTrialBalance: vi.fn(),
    getBalanceSheet: vi.fn(),
    getIncomeStatement: vi.fn(),
    getCashFlowStatement: vi.fn(),
    getMemberListing: vi.fn(),
    getSavingsSummary: vi.fn(),
    getLoanPortfolio: vi.fn(),
    getArrearsAgeing: vi.fn(),
    getNplReport: vi.fn(),
    getDailyTransactions: vi.fn(),
    getDashboardKPIs: vi.fn(),
    getRecentActivity: vi.fn(),
};

vi.mock('../../src/repositories/reportingRepository', () => {
    return {
        ReportingRepository: class {
            constructor() {
                return mockRepoInstance;
            }
        },
    };
});

// Mock logger
vi.mock('../../src/middleware/logger', () => ({
    appLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock database
vi.mock('../../src/config/database', () => ({
    getTenantDb: vi.fn().mockReturnValue({}),
}));

describe('ReportingService', () => {
    let service: ReportingService;
    let mockRepo: any;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new ReportingService('test_schema');
        mockRepo = mockRepoInstance;
    });

    // ── Trial Balance ──

    describe('generateTrialBalance', () => {
        it('should generate trial balance with correct totals', async () => {
            mockRepo.getTrialBalance.mockResolvedValue([
                { account_code: '1100', account_name: 'Cash', account_type: 'asset', normal_balance: 'debit', debit_balance: '50000.0000', credit_balance: '0.0000' },
                { account_code: '2100', account_name: 'Deposits', account_type: 'liability', normal_balance: 'credit', debit_balance: '0.0000', credit_balance: '30000.0000' },
                { account_code: '3100', account_name: 'Capital', account_type: 'equity', normal_balance: 'credit', debit_balance: '0.0000', credit_balance: '20000.0000' },
            ]);

            const report = await service.generateTrialBalance('admin@test.com');

            expect(report.meta.reportName).toBe('Trial Balance');
            expect(report.rows).toHaveLength(3);
            expect(report.totals.totalDebits).toBe('50000.0000');
            expect(report.totals.totalCredits).toBe('50000.0000');
            expect(report.totals.balanced).toBe(true);
        });

        it('should detect unbalanced trial balance', async () => {
            mockRepo.getTrialBalance.mockResolvedValue([
                { account_code: '1100', account_name: 'Cash', account_type: 'asset', normal_balance: 'debit', debit_balance: '50000.0000', credit_balance: '0.0000' },
                { account_code: '2100', account_name: 'Deposits', account_type: 'liability', normal_balance: 'credit', debit_balance: '0.0000', credit_balance: '30000.0000' },
            ]);

            const report = await service.generateTrialBalance('admin@test.com');

            expect(report.totals.balanced).toBe(false);
        });

        it('should handle empty trial balance', async () => {
            mockRepo.getTrialBalance.mockResolvedValue([]);

            const report = await service.generateTrialBalance('admin@test.com');

            expect(report.rows).toHaveLength(0);
            expect(report.totals.totalDebits).toBe('0.0000');
            expect(report.totals.totalCredits).toBe('0.0000');
            expect(report.totals.balanced).toBe(true);
        });
    });

    // ── Balance Sheet ──

    describe('generateBalanceSheet', () => {
        it('should separate balance sheet into categories', async () => {
            mockRepo.getBalanceSheet.mockResolvedValue([
                { account_code: '1100', account_name: 'Cash', account_type: 'asset', balance: '100000.0000', category: 'asset' },
                { account_code: '1700', account_name: 'Loans Receivable', account_type: 'asset', balance: '200000.0000', category: 'asset' },
                { account_code: '2100', account_name: 'Member Deposits', account_type: 'liability', balance: '250000.0000', category: 'liability' },
                { account_code: '3100', account_name: 'Share Capital', account_type: 'equity', balance: '50000.0000', category: 'equity' },
            ]);

            const report = await service.generateBalanceSheet('admin@test.com');

            expect(report.assets).toHaveLength(2);
            expect(report.liabilities).toHaveLength(1);
            expect(report.equity).toHaveLength(1);
            expect(report.totals.totalAssets).toBe('300000.0000');
            expect(report.totals.totalLiabilities).toBe('250000.0000');
            expect(report.totals.totalEquity).toBe('50000.0000');
            expect(report.totals.totalLiabilitiesAndEquity).toBe('300000.0000');
            expect(report.totals.balanced).toBe(true);
        });

        it('should detect unbalanced balance sheet', async () => {
            mockRepo.getBalanceSheet.mockResolvedValue([
                { account_code: '1100', account_name: 'Cash', account_type: 'asset', balance: '100000.0000', category: 'asset' },
                { account_code: '2100', account_name: 'Deposits', account_type: 'liability', balance: '50000.0000', category: 'liability' },
            ]);

            const report = await service.generateBalanceSheet('admin@test.com');

            expect(report.totals.balanced).toBe(false);
        });

        it('should use provided as-of date', async () => {
            mockRepo.getBalanceSheet.mockResolvedValue([]);
            const asOfDate = new Date('2026-01-31');

            const report = await service.generateBalanceSheet('admin@test.com', asOfDate);

            expect(report.meta.asOfDate).toEqual(asOfDate);
        });
    });

    // ── Income Statement ──

    describe('generateIncomeStatement', () => {
        it('should calculate net income correctly', async () => {
            mockRepo.getIncomeStatement.mockResolvedValue([
                { account_code: '4100', account_name: 'Interest Income', account_type: 'income', amount: '80000.0000' },
                { account_code: '4200', account_name: 'Fee Income', account_type: 'income', amount: '10000.0000' },
                { account_code: '5100', account_name: 'Staff Costs', account_type: 'expense', amount: '30000.0000' },
                { account_code: '5200', account_name: 'Admin Costs', account_type: 'expense', amount: '15000.0000' },
            ]);

            const start = new Date('2026-01-01');
            const end = new Date('2026-01-31');
            const report = await service.generateIncomeStatement('admin@test.com', start, end);

            expect(report.revenue).toHaveLength(2);
            expect(report.expenses).toHaveLength(2);
            expect(report.totals.totalRevenue).toBe('90000.0000');
            expect(report.totals.totalExpenses).toBe('45000.0000');
            expect(report.totals.netIncome).toBe('45000.0000');
        });

        it('should handle net loss', async () => {
            mockRepo.getIncomeStatement.mockResolvedValue([
                { account_code: '4100', account_name: 'Interest Income', account_type: 'income', amount: '10000.0000' },
                { account_code: '5100', account_name: 'Staff Costs', account_type: 'expense', amount: '30000.0000' },
            ]);

            const report = await service.generateIncomeStatement('admin@test.com', new Date(), new Date());

            expect(parseFloat(report.totals.netIncome)).toBeLessThan(0);
        });

        it('should include period dates in meta', async () => {
            mockRepo.getIncomeStatement.mockResolvedValue([]);
            const start = new Date('2026-01-01');
            const end = new Date('2026-06-30');

            const report = await service.generateIncomeStatement('admin@test.com', start, end);

            expect(report.meta.periodStart).toEqual(start);
            expect(report.meta.periodEnd).toEqual(end);
        });
    });

    // ── Cash Flow Statement ──

    describe('generateCashFlowStatement', () => {
        it('should categorize cash flows', async () => {
            mockRepo.getCashFlowStatement.mockResolvedValue([
                { category: 'operating', description: 'Deposit', amount: '5000.0000', transaction_date: '2026-01-15' },
                { category: 'operating', description: 'Withdrawal', amount: '2000.0000', transaction_date: '2026-01-16' },
                { category: 'financing', description: 'Dividend', amount: '1000.0000', transaction_date: '2026-01-20' },
                { category: 'other', description: 'Transfer', amount: '500.0000', transaction_date: '2026-01-25' },
            ]);

            const report = await service.generateCashFlowStatement('admin@test.com', new Date(), new Date());

            expect(report.operating).toHaveLength(2);
            expect(report.financing).toHaveLength(1);
            expect(report.other).toHaveLength(1);
            expect(report.totals.operatingTotal).toBe('7000.0000');
            expect(report.totals.financingTotal).toBe('1000.0000');
            expect(report.totals.netCashFlow).toBe('8500.0000');
        });
    });

    // ── Operational Reports ──

    describe('generateMemberListing', () => {
        it('should return member data with totals', async () => {
            mockRepo.getMemberListing.mockResolvedValue({
                data: [
                    { id: '1', member_number: 'M001', first_name: 'John', last_name: 'Doe', phone: '+256700000001', email: 'john@test.com', status: 'active', joined_date: '2025-01-01', savings_balance: '10000', shares_balance: '5000', loans_balance: '20000' },
                    { id: '2', member_number: 'M002', first_name: 'Jane', last_name: 'Doe', phone: '+256700000002', email: null, status: 'active', joined_date: '2025-06-01', savings_balance: '25000', shares_balance: '10000', loans_balance: '0' },
                ],
                total: 2,
            });

            const report = await service.generateMemberListing('admin@test.com');

            expect(report.data).toHaveLength(2);
            expect(report.total).toBe(2);
            expect(report.meta.reportName).toBe('Member Listing');
        });

        it('should pass filters to repository', async () => {
            mockRepo.getMemberListing.mockResolvedValue({ data: [], total: 0 });
            const filters = { status: 'active', search: 'john', limit: 10, offset: 0 };

            await service.generateMemberListing('admin@test.com', filters);

            expect(mockRepo.getMemberListing).toHaveBeenCalledWith(filters);
        });
    });

    describe('generateSavingsSummary', () => {
        it('should aggregate savings product totals', async () => {
            mockRepo.getSavingsSummary.mockResolvedValue([
                { product_name: 'Regular Savings', product_code: 'SAV01', total_accounts: '100', active_accounts: '85', total_balance: '5000000', total_deposits: '6000000', total_withdrawals: '1000000', total_interest_accrued: '100000' },
                { product_name: 'Premium Savings', product_code: 'SAV02', total_accounts: '20', active_accounts: '18', total_balance: '2000000', total_deposits: '2500000', total_withdrawals: '500000', total_interest_accrued: '50000' },
            ]);

            const report = await service.generateSavingsSummary('admin@test.com');

            expect(report.data).toHaveLength(2);
            expect(report.totals.totalAccounts).toBe(120);
            expect(report.totals.activeAccounts).toBe(103);
        });
    });

    describe('generateLoanPortfolio', () => {
        it('should aggregate loan product totals', async () => {
            mockRepo.getLoanPortfolio.mockResolvedValue([
                { product_name: 'Personal Loan', product_code: 'LN01', total_accounts: '50', active_accounts: '40', total_disbursed: '10000000', principal_outstanding: '5000000', interest_outstanding: '500000', penalties_outstanding: '100000', total_outstanding: '5600000' },
            ]);

            const report = await service.generateLoanPortfolio('admin@test.com');

            expect(report.data).toHaveLength(1);
            expect(report.totals.totalAccounts).toBe(50);
            expect(report.totals.activeAccounts).toBe(40);
        });
    });

    describe('generateArrearsAgeing', () => {
        it('should calculate ageing buckets', async () => {
            mockRepo.getArrearsAgeing.mockResolvedValue([
                { loan_number: 'L001', member_number: 'M001', member_name: 'John Doe', product_name: 'Personal', disbursement_date: '2025-01-01', total_outstanding: '100000', days_overdue: 15, overdue_amount: '20000', ageing_bucket: '1-30 days' },
                { loan_number: 'L002', member_number: 'M002', member_name: 'Jane Doe', product_name: 'Personal', disbursement_date: '2025-01-01', total_outstanding: '200000', days_overdue: 45, overdue_amount: '50000', ageing_bucket: '31-60 days' },
                { loan_number: 'L003', member_number: 'M003', member_name: 'Bob Smith', product_name: 'Business', disbursement_date: '2025-01-01', total_outstanding: '500000', days_overdue: 100, overdue_amount: '150000', ageing_bucket: '91-180 days' },
            ]);

            const report = await service.generateArrearsAgeing('admin@test.com');

            expect(report.data).toHaveLength(3);
            expect(report.buckets).toHaveLength(3);
            expect(report.totals.totalLoansInArrears).toBe(3);
            expect(parseFloat(report.totals.totalArrearsAmount)).toBe(220000);
        });
    });

    describe('generateNplReport', () => {
        it('should classify NPL categories', async () => {
            mockRepo.getNplReport.mockResolvedValue([
                { loan_number: 'L001', member_number: 'M001', member_name: 'John Doe', product_name: 'Personal', disbursement_date: '2025-01-01', status: 'defaulted', principal_outstanding: '100000', interest_outstanding: '10000', penalties_outstanding: '5000', total_outstanding: '115000', days_in_default: 60, npl_category: 'Substandard' },
                { loan_number: 'L002', member_number: 'M002', member_name: 'Jane Doe', product_name: 'Business', disbursement_date: '2024-06-01', status: 'defaulted', principal_outstanding: '300000', interest_outstanding: '50000', penalties_outstanding: '20000', total_outstanding: '370000', days_in_default: 120, npl_category: 'Doubtful' },
                { loan_number: 'L003', member_number: 'M003', member_name: 'Bob Smith', product_name: 'Agriculture', disbursement_date: '2024-01-01', status: 'written_off', principal_outstanding: '500000', interest_outstanding: '80000', penalties_outstanding: '40000', total_outstanding: '620000', days_in_default: 200, npl_category: 'Loss' },
            ]);

            const report = await service.generateNplReport('admin@test.com');

            expect(report.data).toHaveLength(3);
            expect(report.summary.substandard.count).toBe(1);
            expect(report.summary.doubtful.count).toBe(1);
            expect(report.summary.loss.count).toBe(1);
            expect(report.totals.totalNplLoans).toBe(3);
        });
    });

    describe('generateDailyTransactions', () => {
        it('should summarize by category', async () => {
            mockRepo.getDailyTransactions.mockResolvedValue({
                data: [
                    { id: '1', code: 'TXN001', category: 'deposit', amount: '5000', transaction_date: '2026-01-15', payment_method: 'cash', description: 'Deposit', member_name: 'John', debit_account: '1100', credit_account: '2100' },
                    { id: '2', code: 'TXN002', category: 'deposit', amount: '3000', transaction_date: '2026-01-15', payment_method: 'mobile_money', description: 'Deposit', member_name: 'Jane', debit_account: '1120', credit_account: '2100' },
                    { id: '3', code: 'TXN003', category: 'withdrawal', amount: '1000', transaction_date: '2026-01-15', payment_method: 'cash', description: 'Withdrawal', member_name: 'Bob', debit_account: '2100', credit_account: '1100' },
                ],
                total: 3,
            });

            const report = await service.generateDailyTransactions('admin@test.com', new Date('2026-01-15'));

            expect(report.data).toHaveLength(3);
            expect(report.total).toBe(3);
            expect(report.summary.byCategory).toHaveLength(2);
            expect(parseFloat(report.summary.totalAmount)).toBe(9000);
        });
    });

    // ── Dashboard ──

    describe('getDashboard', () => {
        const mockKPIs = {
            total_members: 500,
            active_members: 450,
            new_members_this_month: 12,
            total_savings_balance: '25000000',
            total_deposits_today: '500000',
            total_withdrawals_today: '200000',
            total_loan_portfolio: '50000000',
            active_loans: 200,
            total_disbursed_this_month: '5000000',
            total_repayments_this_month: '3000000',
            total_arrears: '2000000',
            loans_in_arrears: 15,
            npl_count: 5,
            npl_amount: '3000000',
            total_shares_value: '10000000',
            total_fixed_deposits: '8000000',
            par_30: '8.00',
            par_90: '3.00',
        };

        it('should return complete dashboard data', async () => {
            mockRepo.getDashboardKPIs.mockResolvedValue(mockKPIs);
            mockRepo.getRecentActivity.mockResolvedValue([
                { id: '1', type: 'deposit', description: 'Deposit from M001', amount: '5000', created_at: '2026-01-15', actor: 'admin' },
            ]);

            const dashboard = await service.getDashboard('admin@test.com');

            expect(dashboard.kpis).toBeDefined();
            expect(dashboard.kpis.total_members).toBe(500);
            expect(dashboard.kpis.active_loans).toBe(200);
            expect(dashboard.recentActivity).toHaveLength(1);
            expect(dashboard.alerts).toBeDefined();
        });

        it('should generate PAR 30 warning when above 5%', async () => {
            mockRepo.getDashboardKPIs.mockResolvedValue({ ...mockKPIs, par_30: '7.50' });
            mockRepo.getRecentActivity.mockResolvedValue([]);

            const dashboard = await service.getDashboard('admin@test.com');

            const par30Alert = dashboard.alerts.find((a) => a.title.includes('PAR 30'));
            expect(par30Alert).toBeDefined();
            expect(par30Alert!.type).toBe('warning');
        });

        it('should generate PAR 30 danger when above 10%', async () => {
            mockRepo.getDashboardKPIs.mockResolvedValue({ ...mockKPIs, par_30: '12.00' });
            mockRepo.getRecentActivity.mockResolvedValue([]);

            const dashboard = await service.getDashboard('admin@test.com');

            const par30Alert = dashboard.alerts.find((a) => a.title.includes('PAR 30'));
            expect(par30Alert).toBeDefined();
            expect(par30Alert!.type).toBe('danger');
        });

        it('should generate PAR 90 danger when above 5%', async () => {
            mockRepo.getDashboardKPIs.mockResolvedValue({ ...mockKPIs, par_90: '6.50' });
            mockRepo.getRecentActivity.mockResolvedValue([]);

            const dashboard = await service.getDashboard('admin@test.com');

            const par90Alert = dashboard.alerts.find((a) => a.title.includes('PAR 90'));
            expect(par90Alert).toBeDefined();
            expect(par90Alert!.type).toBe('danger');
        });

        it('should generate NPL alert when NPL loans exist', async () => {
            mockRepo.getDashboardKPIs.mockResolvedValue(mockKPIs);
            mockRepo.getRecentActivity.mockResolvedValue([]);

            const dashboard = await service.getDashboard('admin@test.com');

            const nplAlert = dashboard.alerts.find((a) => a.title.includes('Non-Performing'));
            expect(nplAlert).toBeDefined();
        });

        it('should generate arrears info alert', async () => {
            mockRepo.getDashboardKPIs.mockResolvedValue(mockKPIs);
            mockRepo.getRecentActivity.mockResolvedValue([]);

            const dashboard = await service.getDashboard('admin@test.com');

            const arrearsAlert = dashboard.alerts.find((a) => a.title.includes('Arrears'));
            expect(arrearsAlert).toBeDefined();
            expect(arrearsAlert!.type).toBe('info');
        });

        it('should return no alerts when all KPIs are healthy', async () => {
            mockRepo.getDashboardKPIs.mockResolvedValue({
                ...mockKPIs,
                par_30: '2.00',
                par_90: '1.00',
                npl_count: 0,
                npl_amount: '0',
                loans_in_arrears: 0,
                total_arrears: '0',
            });
            mockRepo.getRecentActivity.mockResolvedValue([]);

            const dashboard = await service.getDashboard('admin@test.com');

            expect(dashboard.alerts).toHaveLength(0);
        });
    });
});
