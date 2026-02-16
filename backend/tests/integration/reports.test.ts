// tests/integration/reports.test.ts
// Integration tests for the /reports routes – financial statements, operational reports,
// dashboard KPIs, and export functionality (PDF, Excel, CSV).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../../src/index';
import { dbManager } from '../../src/config/database';
import {
    authHeaders,
    tenantHeaders,
    seedTestStaff,
    seedTestMember,
    cleanupTestData,
    TEST_MEMBER_ID,
    TEST_SCHEMA,
} from '../helpers/integration';

describe('Reports API Endpoints', () => {
    let headers: Record<string, string>;

    // -----------------------------------------------------------------------
    // Setup: seed staff and member
    // -----------------------------------------------------------------------
    beforeAll(async () => {
        const isHealthy = await dbManager.healthCheck();
        expect(isHealthy).toBe(true);

        await seedTestStaff();
        await seedTestMember(TEST_MEMBER_ID);
        headers = await authHeaders();
    });

    // -----------------------------------------------------------------------
    // Financial Reports
    // -----------------------------------------------------------------------
    describe('Financial Reports', () => {
        it('GET /reports/financial/trial-balance - should generate trial balance', async () => {
            const res = await app.request('/reports/financial/trial-balance', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
            expect(body.data.rows).toBeDefined();
            expect(Array.isArray(body.data.rows)).toBe(true);
        });

        it('GET /reports/financial/trial-balance/export?format=csv - should export trial balance as CSV', async () => {
            const res = await app.request('/reports/financial/trial-balance/export?format=csv', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            expect(res.headers.get('content-type')).toContain('text/csv');
            expect(res.headers.get('content-disposition')).toContain('trial-balance');
        });

        it('GET /reports/financial/balance-sheet - should generate balance sheet', async () => {
            const res = await app.request('/reports/financial/balance-sheet', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
            expect(body.data.assets).toBeDefined();
            expect(body.data.liabilities).toBeDefined();
            expect(body.data.equity).toBeDefined();
        });

        it('GET /reports/financial/balance-sheet?as_of_date=2026-01-31 - should accept date parameter', async () => {
            const res = await app.request('/reports/financial/balance-sheet?as_of_date=2026-01-31', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });

        it('GET /reports/financial/balance-sheet/export?format=pdf - should export balance sheet as PDF', async () => {
            const res = await app.request('/reports/financial/balance-sheet/export?format=pdf', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            expect(res.headers.get('content-type')).toContain('application/pdf');
        });

        it('GET /reports/financial/income-statement - should generate income statement', async () => {
            const startDate = '2026-01-01';
            const endDate = '2026-01-31';
            const res = await app.request(
                `/reports/financial/income-statement?period_start=${startDate}&period_end=${endDate}`,
                {
                    method: 'GET',
                    headers,
                }
            );

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
            expect(body.data.revenue).toBeDefined();
            expect(body.data.expenses).toBeDefined();
        });

        it('GET /reports/financial/income-statement - should reject invalid date range', async () => {
            const startDate = '2026-02-01';
            const endDate = '2026-01-01'; // End before start
            const res = await app.request(
                `/reports/financial/income-statement?period_start=${startDate}&period_end=${endDate}`,
                {
                    method: 'GET',
                    headers,
                }
            );

            expect(res.status).toBeGreaterThanOrEqual(400);
        });

        it('GET /reports/financial/income-statement/export?format=excel - should export as Excel', async () => {
            const startDate = '2026-01-01';
            const endDate = '2026-01-31';
            const res = await app.request(
                `/reports/financial/income-statement/export?period_start=${startDate}&period_end=${endDate}&format=excel`,
                {
                    method: 'GET',
                    headers,
                }
            );

            expect(res.status).toBe(200);
            expect(res.headers.get('content-type')).toContain('spreadsheetml.sheet');
        });

        it('GET /reports/financial/cash-flow - should generate cash flow statement', async () => {
            const startDate = '2026-01-01';
            const endDate = '2026-01-31';
            const res = await app.request(
                `/reports/financial/cash-flow?period_start=${startDate}&period_end=${endDate}`,
                {
                    method: 'GET',
                    headers,
                }
            );

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
        });
    });

    // -----------------------------------------------------------------------
    // Operational Reports
    // -----------------------------------------------------------------------
    describe('Operational Reports', () => {
        it('GET /reports/operational/member-listing - should list members', async () => {
            const res = await app.request('/reports/operational/member-listing', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
        });

        it('GET /reports/operational/member-listing?status=active - should filter by status', async () => {
            const res = await app.request('/reports/operational/member-listing?status=active', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });

        it('GET /reports/operational/member-listing/export?format=csv - should export member list', async () => {
            const res = await app.request('/reports/operational/member-listing/export?format=csv', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            expect(res.headers.get('content-type')).toContain('text/csv');
        });

        it('GET /reports/operational/savings-summary - should generate savings summary', async () => {
            const res = await app.request('/reports/operational/savings-summary', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
        });

        it('GET /reports/operational/loan-portfolio - should generate loan portfolio report', async () => {
            const res = await app.request('/reports/operational/loan-portfolio', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
        });

        it('GET /reports/operational/loan-portfolio/export?format=excel - should export loan portfolio', async () => {
            const res = await app.request('/reports/operational/loan-portfolio/export?format=excel', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            expect(res.headers.get('content-type')).toContain('spreadsheetml.sheet');
        });

        it('GET /reports/operational/arrears-ageing - should generate arrears ageing report', async () => {
            const res = await app.request('/reports/operational/arrears-ageing', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
        });

        it('GET /reports/operational/npl-report - should generate NPL report', async () => {
            const res = await app.request('/reports/operational/npl-report', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
        });

        it('GET /reports/operational/daily-transactions - should list daily transactions', async () => {
            const res = await app.request('/reports/operational/daily-transactions', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
        });

        it('GET /reports/operational/daily-transactions?date=2026-02-15 - should filter by date', async () => {
            const res = await app.request('/reports/operational/daily-transactions?date=2026-02-15', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Dashboard KPIs
    // -----------------------------------------------------------------------
    describe('Dashboard KPIs', () => {
        it('GET /reports/dashboard/kpis - should get dashboard KPIs', async () => {
            const res = await app.request('/reports/dashboard/kpis', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
            expect(body.data.membership).toBeDefined();
            expect(body.data.savings).toBeDefined();
            expect(body.data.loans).toBeDefined();
        });

        it('GET /reports/dashboard/alerts - should get dashboard alerts', async () => {
            const res = await app.request('/reports/dashboard/alerts', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
        });

        it('GET /reports/dashboard/trends - should get trends data', async () => {
            const res = await app.request('/reports/dashboard/trends', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
        });
    });

    // -----------------------------------------------------------------------
    // Export Format Validation
    // -----------------------------------------------------------------------
    describe('Export Format Validation', () => {
        it('should reject invalid export format', async () => {
            const res = await app.request('/reports/financial/trial-balance/export?format=xml', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBeGreaterThanOrEqual(400);
        });

        it('should default to PDF when no format specified', async () => {
            const res = await app.request('/reports/financial/trial-balance/export', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            expect(res.headers.get('content-type')).toContain('application/pdf');
        });
    });

    // -----------------------------------------------------------------------
    // Pagination and Filtering
    // -----------------------------------------------------------------------
    describe('Pagination', () => {
        it('GET /reports/operational/member-listing?limit=10&offset=0 - should paginate', async () => {
            const res = await app.request('/reports/operational/member-listing?limit=10&offset=0', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });

        it('GET /reports/operational/member-listing?search=test - should search members', async () => {
            const res = await app.request('/reports/operational/member-listing?search=test', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Cleanup
    // -----------------------------------------------------------------------
    afterAll(async () => {
        await cleanupTestData();
    });
});
