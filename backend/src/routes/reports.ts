/**
 * Reports & Dashboard Routes
 * API endpoints for financial statements, operational reports, dashboard KPIs, and exports
 *
 * Implements requirements:
 * - ACC-008: Generate standard financial statements
 * - RPT-001-004: Reports with export capabilities
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '../middleware/types';
import { validate, getValidatedData, commonSchemas } from '../middleware/validation';
import { ValidationError } from '../middleware/errorHandler';
import { ReportingService } from '../services/reportingService';
import {
    ExportService,
    ExportFormat,
    TRIAL_BALANCE_COLUMNS,
    BALANCE_SHEET_COLUMNS,
    INCOME_STATEMENT_COLUMNS,
    CASH_FLOW_COLUMNS,
    MEMBER_LISTING_COLUMNS,
    SAVINGS_SUMMARY_COLUMNS,
    LOAN_PORTFOLIO_COLUMNS,
    ARREARS_AGEING_COLUMNS,
    NPL_REPORT_COLUMNS,
    DAILY_TRANSACTIONS_COLUMNS,
} from '../services/exportService';
import { enforcePermission } from '../middleware/rbac';

export const reportRoutes = new Hono<Env>();

// Enforce read permission on all report routes
reportRoutes.use('*', enforcePermission('reports', 'read'));

const exportService = new ExportService();

// ── Validation Schemas ──

const periodSchema = z.object({
    period_start: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid start date'),
    period_end: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid end date'),
}).refine((data) => {
    const start = new Date(data.period_start);
    const end = new Date(data.period_end);
    return end >= start;
}, {
    message: 'End date must be after or equal to start date',
    path: ['period_end'],
});

const dateSchema = z.object({
    date: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid date').optional(),
});

const memberListingSchema = z.object({
    status: z.enum(['active', 'inactive', 'suspended', 'closed']).optional(),
    search: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
    offset: z.coerce.number().int().min(0).optional(),
});

const dailyTxnSchema = z.object({
    date: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid date').optional(),
    category: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
    offset: z.coerce.number().int().min(0).optional(),
});

const exportSchema = z.object({
    format: z.enum(['pdf', 'excel', 'csv']),
});

// ── Helper ──

function getService(c: any): ReportingService {
    const { schema_name } = c.get('tenant')!;
    return new ReportingService(schema_name);
}

function getUserId(c: any): string {
    return c.get('user')?.email || 'system';
}

function getTenantName(c: any): string {
    return c.get('tenant')?.sacco_name || '';
}

async function handleExport(
    format: ExportFormat,
    title: string,
    columns: any[],
    data: any[],
    totals: any,
    generatedBy: string,
    tenantName: string
): Promise<{ buffer: ArrayBuffer; contentType: string; extension: string }> {
    const options = { title, columns, data, totals, generatedBy, tenantName, generatedAt: new Date() };

    switch (format) {
        case 'pdf': {
            const buf = await exportService.generatePdf(options);
            return { buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, contentType: 'application/pdf', extension: 'pdf' };
        }
        case 'excel': {
            const buf = await exportService.generateExcel(options);
            return { buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' };
        }
        case 'csv': {
            const buf = await exportService.generateCsv(options);
            return { buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, contentType: 'text/csv', extension: 'csv' };
        }
    }
}

function slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ════════════════════════════════════════════════════════════
// FINANCIAL REPORTS
// ════════════════════════════════════════════════════════════

// ── Trial Balance ──

reportRoutes.get('/financial/trial-balance', async (c) => {
    const service = getService(c);
    const report = await service.generateTrialBalance(getUserId(c));
    return c.json({ success: true, data: report });
});

reportRoutes.get('/financial/trial-balance/export', async (c) => {
    const format = (c.req.query('format') || 'pdf') as ExportFormat;
    if (!['pdf', 'excel', 'csv'].includes(format)) throw new ValidationError('Invalid export format');

    const service = getService(c);
    const report = await service.generateTrialBalance(getUserId(c));
    const result = await handleExport(
        format, 'Trial Balance', TRIAL_BALANCE_COLUMNS,
        report.rows, report.totals, getUserId(c), getTenantName(c)
    );

    return new Response(result.buffer, {
        headers: {
            'Content-Type': result.contentType,
            'Content-Disposition': `attachment; filename="trial-balance-${new Date().toISOString().split('T')[0]}.${result.extension}"`,
        },
    });
});

// ── Balance Sheet ──

reportRoutes.get('/financial/balance-sheet', async (c) => {
    const asOfDate = c.req.query('as_of_date') ? new Date(c.req.query('as_of_date')!) : undefined;
    const service = getService(c);
    const report = await service.generateBalanceSheet(getUserId(c), asOfDate);
    return c.json({ success: true, data: report });
});

reportRoutes.get('/financial/balance-sheet/export', async (c) => {
    const format = (c.req.query('format') || 'pdf') as ExportFormat;
    if (!['pdf', 'excel', 'csv'].includes(format)) throw new ValidationError('Invalid export format');

    const asOfDate = c.req.query('as_of_date') ? new Date(c.req.query('as_of_date')!) : undefined;
    const service = getService(c);
    const report = await service.generateBalanceSheet(getUserId(c), asOfDate);

    const allRows = [...report.assets, ...report.liabilities, ...report.equity];
    const result = await handleExport(
        format, 'Balance Sheet', BALANCE_SHEET_COLUMNS,
        allRows, report.totals, getUserId(c), getTenantName(c)
    );

    return new Response(result.buffer, {
        headers: {
            'Content-Type': result.contentType,
            'Content-Disposition': `attachment; filename="balance-sheet-${new Date().toISOString().split('T')[0]}.${result.extension}"`,
        },
    });
});

// ── Income Statement (P&L) ──

reportRoutes.get('/financial/income-statement', validate(periodSchema, 'query'), async (c) => {
    const { period_start, period_end } = getValidatedData<z.infer<typeof periodSchema>>(c);
    const service = getService(c);
    const report = await service.generateIncomeStatement(
        getUserId(c), new Date(period_start), new Date(period_end)
    );
    return c.json({ success: true, data: report });
});

reportRoutes.get('/financial/income-statement/export', validate(periodSchema, 'query'), async (c) => {
    const { period_start, period_end } = getValidatedData<z.infer<typeof periodSchema>>(c);
    const format = (c.req.query('format') || 'pdf') as ExportFormat;
    if (!['pdf', 'excel', 'csv'].includes(format)) throw new ValidationError('Invalid export format');

    const service = getService(c);
    const report = await service.generateIncomeStatement(
        getUserId(c), new Date(period_start), new Date(period_end)
    );

    const allRows = [...report.revenue, ...report.expenses];
    const result = await handleExport(
        format,
        `Income Statement (${period_start} to ${period_end})`,
        INCOME_STATEMENT_COLUMNS,
        allRows, report.totals, getUserId(c), getTenantName(c)
    );

    return new Response(result.buffer, {
        headers: {
            'Content-Type': result.contentType,
            'Content-Disposition': `attachment; filename="income-statement-${period_start}-to-${period_end}.${result.extension}"`,
        },
    });
});

// ── Cash Flow Statement ──

reportRoutes.get('/financial/cash-flow', validate(periodSchema, 'query'), async (c) => {
    const { period_start, period_end } = getValidatedData<z.infer<typeof periodSchema>>(c);
    const service = getService(c);
    const report = await service.generateCashFlowStatement(
        getUserId(c), new Date(period_start), new Date(period_end)
    );
    return c.json({ success: true, data: report });
});

reportRoutes.get('/financial/cash-flow/export', validate(periodSchema, 'query'), async (c) => {
    const { period_start, period_end } = getValidatedData<z.infer<typeof periodSchema>>(c);
    const format = (c.req.query('format') || 'pdf') as ExportFormat;
    if (!['pdf', 'excel', 'csv'].includes(format)) throw new ValidationError('Invalid export format');

    const service = getService(c);
    const report = await service.generateCashFlowStatement(
        getUserId(c), new Date(period_start), new Date(period_end)
    );

    const allRows = [...report.operating, ...report.financing, ...report.other];
    const result = await handleExport(
        format,
        `Cash Flow Statement (${period_start} to ${period_end})`,
        CASH_FLOW_COLUMNS,
        allRows, report.totals, getUserId(c), getTenantName(c)
    );

    return new Response(result.buffer, {
        headers: {
            'Content-Type': result.contentType,
            'Content-Disposition': `attachment; filename="cash-flow-${period_start}-to-${period_end}.${result.extension}"`,
        },
    });
});

// ════════════════════════════════════════════════════════════
// OPERATIONAL REPORTS
// ════════════════════════════════════════════════════════════

// ── Member Listing ──

reportRoutes.get('/operational/member-listing', async (c) => {
    const status = c.req.query('status') as any;
    const search = c.req.query('search');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined;
    const offset = c.req.query('offset') ? parseInt(c.req.query('offset')!, 10) : undefined;

    const service = getService(c);
    const report = await service.generateMemberListing(getUserId(c), { status, search, limit, offset });
    return c.json({ success: true, data: report.data, meta: { total: report.total } });
});

reportRoutes.get('/operational/member-listing/export', async (c) => {
    const format = (c.req.query('format') || 'pdf') as ExportFormat;
    if (!['pdf', 'excel', 'csv'].includes(format)) throw new ValidationError('Invalid export format');

    const service = getService(c);
    const report = await service.generateMemberListing(getUserId(c));

    const result = await handleExport(
        format, 'Member Listing', MEMBER_LISTING_COLUMNS,
        report.data, undefined, getUserId(c), getTenantName(c)
    );

    return new Response(result.buffer, {
        headers: {
            'Content-Type': result.contentType,
            'Content-Disposition': `attachment; filename="member-listing-${new Date().toISOString().split('T')[0]}.${result.extension}"`,
        },
    });
});

// ── Savings Summary ──

reportRoutes.get('/operational/savings-summary', async (c) => {
    const service = getService(c);
    const report = await service.generateSavingsSummary(getUserId(c));
    return c.json({ success: true, data: report.data, meta: report.meta, totals: report.totals });
});

reportRoutes.get('/operational/savings-summary/export', async (c) => {
    const format = (c.req.query('format') || 'pdf') as ExportFormat;
    if (!['pdf', 'excel', 'csv'].includes(format)) throw new ValidationError('Invalid export format');

    const service = getService(c);
    const report = await service.generateSavingsSummary(getUserId(c));

    const result = await handleExport(
        format, 'Savings Summary', SAVINGS_SUMMARY_COLUMNS,
        report.data, report.totals, getUserId(c), getTenantName(c)
    );

    return new Response(result.buffer, {
        headers: {
            'Content-Type': result.contentType,
            'Content-Disposition': `attachment; filename="savings-summary-${new Date().toISOString().split('T')[0]}.${result.extension}"`,
        },
    });
});

// ── Loan Portfolio ──

reportRoutes.get('/operational/loan-portfolio', async (c) => {
    const service = getService(c);
    const report = await service.generateLoanPortfolio(getUserId(c));
    return c.json({ success: true, data: report.data, meta: report.meta, totals: report.totals });
});

reportRoutes.get('/operational/loan-portfolio/export', async (c) => {
    const format = (c.req.query('format') || 'pdf') as ExportFormat;
    if (!['pdf', 'excel', 'csv'].includes(format)) throw new ValidationError('Invalid export format');

    const service = getService(c);
    const report = await service.generateLoanPortfolio(getUserId(c));

    const result = await handleExport(
        format, 'Loan Portfolio', LOAN_PORTFOLIO_COLUMNS,
        report.data, report.totals, getUserId(c), getTenantName(c)
    );

    return new Response(result.buffer, {
        headers: {
            'Content-Type': result.contentType,
            'Content-Disposition': `attachment; filename="loan-portfolio-${new Date().toISOString().split('T')[0]}.${result.extension}"`,
        },
    });
});

// ── Arrears Ageing ──

reportRoutes.get('/operational/arrears-ageing', async (c) => {
    const service = getService(c);
    const report = await service.generateArrearsAgeing(getUserId(c));
    return c.json({ success: true, data: report.data, meta: report.meta, totals: report.totals });
});

reportRoutes.get('/operational/arrears-ageing/export', async (c) => {
    const format = (c.req.query('format') || 'pdf') as ExportFormat;
    if (!['pdf', 'excel', 'csv'].includes(format)) throw new ValidationError('Invalid export format');

    const service = getService(c);
    const report = await service.generateArrearsAgeing(getUserId(c));

    const result = await handleExport(
        format, 'Arrears Ageing Report', ARREARS_AGEING_COLUMNS,
        report.data, report.totals, getUserId(c), getTenantName(c)
    );

    return new Response(result.buffer, {
        headers: {
            'Content-Type': result.contentType,
            'Content-Disposition': `attachment; filename="arrears-ageing-${new Date().toISOString().split('T')[0]}.${result.extension}"`,
        },
    });
});

// ── NPL Report ──

reportRoutes.get('/operational/npl-report', async (c) => {
    const service = getService(c);
    const report = await service.generateNplReport(getUserId(c));
    return c.json({ success: true, data: report.data, meta: report.meta, totals: report.totals });
});

reportRoutes.get('/operational/npl-report/export', async (c) => {
    const format = (c.req.query('format') || 'pdf') as ExportFormat;
    if (!['pdf', 'excel', 'csv'].includes(format)) throw new ValidationError('Invalid export format');

    const service = getService(c);
    const report = await service.generateNplReport(getUserId(c));

    const result = await handleExport(
        format, 'NPL Report', NPL_REPORT_COLUMNS,
        report.data, report.totals, getUserId(c), getTenantName(c)
    );

    return new Response(result.buffer, {
        headers: {
            'Content-Type': result.contentType,
            'Content-Disposition': `attachment; filename="npl-report-${new Date().toISOString().split('T')[0]}.${result.extension}"`,
        },
    });
});

// ── Daily Transactions ──

reportRoutes.get('/operational/transactions', async (c) => {
    const date = c.req.query('date') ? new Date(c.req.query('date')!) : new Date();
    const category = c.req.query('category');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined;
    const offset = c.req.query('offset') ? parseInt(c.req.query('offset')!, 10) : undefined;

    const service = getService(c);
    const report = await service.generateDailyTransactions(getUserId(c), date, { category, limit, offset });
    return c.json({ success: true, data: report.data, meta: report.meta, total: report.total, summary: report.summary });
});

// Alias for daily-transactions
reportRoutes.get('/operational/daily-transactions', async (c) => {
    const date = c.req.query('date') ? new Date(c.req.query('date')!) : new Date();
    const category = c.req.query('category');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined;
    const offset = c.req.query('offset') ? parseInt(c.req.query('offset')!, 10) : undefined;

    const service = getService(c);
    const report = await service.generateDailyTransactions(getUserId(c), date, { category, limit, offset });
    return c.json({ success: true, data: report.data, meta: report.meta, total: report.total, summary: report.summary });
});

reportRoutes.get('/operational/transactions/export', async (c) => {
    const format = (c.req.query('format') || 'pdf') as ExportFormat;
    if (!['pdf', 'excel', 'csv'].includes(format)) throw new ValidationError('Invalid export format');

    const date = c.req.query('date') ? new Date(c.req.query('date')!) : new Date();
    const service = getService(c);
    const report = await service.generateDailyTransactions(getUserId(c), date);

    const dateStr = date.toISOString().split('T')[0];
    const result = await handleExport(
        format, `Daily Transactions - ${dateStr}`, DAILY_TRANSACTIONS_COLUMNS,
        report.data, { totalAmount: report.summary.totalAmount, totalTransactions: report.total },
        getUserId(c), getTenantName(c)
    );

    return new Response(result.buffer, {
        headers: {
            'Content-Type': result.contentType,
            'Content-Disposition': `attachment; filename="daily-transactions-${dateStr}.${result.extension}"`,
        },
    });
});

// ════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════

reportRoutes.get('/dashboard', async (c) => {
    const service = getService(c);
    const dashboard = await service.getDashboard(getUserId(c));
    return c.json({ success: true, data: dashboard });
});

reportRoutes.get('/dashboard/kpis', async (c) => {
    const service = getService(c);
    const dashboard = await service.getDashboard(getUserId(c));
    const kpis = dashboard.kpis;

    // Structure KPIs into categories for the dashboard
    return c.json({
        success: true,
        data: {
            membership: {
                total_members: kpis.total_members,
                active_members: kpis.active_members,
                new_members_this_month: kpis.new_members_this_month,
            },
            savings: {
                total_savings_balance: kpis.total_savings_balance,
                total_deposits_today: kpis.total_deposits_today,
                total_withdrawals_today: kpis.total_withdrawals_today,
            },
            loans: {
                total_loan_portfolio: kpis.total_loan_portfolio,
                active_loans: kpis.active_loans,
                total_disbursed_this_month: kpis.total_disbursed_this_month,
                total_repayments_this_month: kpis.total_repayments_this_month,
                total_arrears: kpis.total_arrears,
                loans_in_arrears: kpis.loans_in_arrears,
                npl_count: kpis.npl_count,
                npl_amount: kpis.npl_amount,
                par_30: kpis.par_30,
                par_90: kpis.par_90,
            },
            shares: {
                total_shares_value: kpis.total_shares_value,
            },
            fixed_deposits: {
                total_fixed_deposits: kpis.total_fixed_deposits,
            },
        },
    });
});

reportRoutes.get('/dashboard/activity', async (c) => {
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 20;
    const { schema_name } = c.get('tenant')!;
    const { ReportingRepository } = await import('../repositories/reportingRepository');
    const repo = new ReportingRepository(schema_name);
    const activity = await repo.getRecentActivity(limit);
    return c.json({ success: true, data: activity, meta: { count: activity.length } });
});

reportRoutes.get("/dashboard/alerts", async (c) => {
    const service = getService(c);
    const dashboard = await service.getDashboard(getUserId(c));
    return c.json({ success: true, data: dashboard.alerts });
});

reportRoutes.get("/dashboard/trends", async (c) => {
    const service = getService(c);
    const dashboard = await service.getDashboard(getUserId(c));
    // For now, return KPIs as trends data
    return c.json({ success: true, data: dashboard.kpis });
});

