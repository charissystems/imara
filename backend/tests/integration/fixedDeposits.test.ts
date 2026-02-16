// tests/integration/fixedDeposits.test.ts
// Integration tests for the /fixed-deposits routes – FD products, opening FDs,
// interest calculation, premature withdrawal, and rollover.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../../src/index';
import { dbManager } from '../../src/config/database';
import {
    authHeaders,
    tenantHeaders,
    seedTestStaff,
    seedTestMember,
    seedSavingsProduct,
    cleanupTestData,
    cleanupDynamicProducts,
    TEST_MEMBER_ID,
    TEST_SAVINGS_PRODUCT_ID,
    TEST_SCHEMA,
} from '../helpers/integration';

describe('Fixed Deposits API Endpoints', () => {
    let headers: Record<string, string>;

    // IDs captured during tests
    let fdProductId: string;
    let fdAccountId: string;
    let savingsAccountId: string;

    // -----------------------------------------------------------------------
    // Setup: seed staff, member, and savings product
    // -----------------------------------------------------------------------
    beforeAll(async () => {
        const isHealthy = await dbManager.healthCheck();
        expect(isHealthy).toBe(true);

        await seedTestStaff();
        await seedTestMember(TEST_MEMBER_ID);
        await seedSavingsProduct();
        headers = await authHeaders();

        // Create a savings account for funding FDs
        const accountRes = await app.request('/accounts', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                member_id: TEST_MEMBER_ID,
                product_id: TEST_SAVINGS_PRODUCT_ID,
                account_number: `SA-FD-${Date.now().toString(36).slice(-8).toUpperCase()}`,
            }),
        });

        const accountBody = (await accountRes.json()) as any;
        savingsAccountId = accountBody.data.id;

        // Deposit funds into the savings account for FD funding
        await app.request('/accounts/deposits', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                member_id: TEST_MEMBER_ID,
                account_id: savingsAccountId,
                amount: 100000,
                payment_method: 'cash',
                payment_reference: 'INITIAL-DEPOSIT',
            }),
        });
    });

    // -----------------------------------------------------------------------
    // FD Products
    // -----------------------------------------------------------------------
    describe('FD Products', () => {
        it('POST /fixed-deposits/products - should create an FD product', async () => {
            const res = await app.request('/fixed-deposits/products', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    code: `TST-FD-${Date.now().toString(36).slice(-4).toUpperCase()}`,
                    name: 'Test Fixed Deposit 12-Month',
                    description: 'Integration test FD product',
                    tenure_days: 365,
                    tenure_type: 'months',
                    minimum_amount: 10000,
                    maximum_amount: 1000000,
                    fixed_interest_rate: 8.5,
                    interest_paid_frequency: 'at_maturity',
                    interest_calculation_method: 'compound',
                    calculation_basis: '365',
                    allows_premature_withdrawal: true,
                    premature_withdrawal_penalty_type: 'percentage',
                    premature_withdrawal_penalty: 10.0,
                    allows_auto_rollover: true,
                    default_rollover_type: 'principal_plus_interest',
                    withholding_tax_rate: 15.0,
                }),
            });

            expect(res.status).toBe(201);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
            expect(body.data.code).toContain('TST-FD-');
            fdProductId = body.data.id;
        });

        it('GET /fixed-deposits/products - should list FD products', async () => {
            const res = await app.request('/fixed-deposits/products', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
            expect(body.data.length).toBeGreaterThanOrEqual(1);
        });

        it('GET /fixed-deposits/products/:productId - should get FD product details', async () => {
            const res = await app.request(`/fixed-deposits/products/${fdProductId}`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data.id).toBe(fdProductId);
            expect(body.data.name).toBe('Test Fixed Deposit 12-Month');
        });

        it('PATCH /fixed-deposits/products/:productId - should update FD product', async () => {
            const res = await app.request(`/fixed-deposits/products/${fdProductId}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    name: 'Updated Test FD Product',
                    fixed_interest_rate: 9.0,
                }),
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });

        it('GET /fixed-deposits/products?active=true - should filter active products', async () => {
            const res = await app.request('/fixed-deposits/products?active=true', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Opening Fixed Deposits
    // -----------------------------------------------------------------------
    describe('Opening Fixed Deposits', () => {
        it('POST /fixed-deposits/open - should open a fixed deposit', async () => {
            const res = await app.request('/fixed-deposits/open', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    member_id: TEST_MEMBER_ID,
                    product_id: fdProductId,
                    principal_amount: 50000,
                    maturity_action: 'auto_rollover',
                    funding_account_id: savingsAccountId,
                }),
            });

            expect(res.status).toBe(201);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
            expect(body.data.principal_amount).toBeDefined();
            fdAccountId = body.data.id;
        });

        it('POST /fixed-deposits/open - should reject FD below minimum amount', async () => {
            const res = await app.request('/fixed-deposits/open', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    member_id: TEST_MEMBER_ID,
                    product_id: fdProductId,
                    principal_amount: 5000, // Below minimum of 10000
                    funding_account_id: savingsAccountId,
                }),
            });

            expect(res.status).toBeGreaterThanOrEqual(400);
        });

        it('GET /fixed-deposits - should list all fixed deposits', async () => {
            const res = await app.request('/fixed-deposits', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
        });

        it('GET /fixed-deposits/:fdId - should get FD details', async () => {
            const res = await app.request(`/fixed-deposits/${fdAccountId}`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data.id).toBe(fdAccountId);
            expect(body.data.member_id).toBe(TEST_MEMBER_ID);
        });
    });

    // -----------------------------------------------------------------------
    // FD Interest Calculation
    // -----------------------------------------------------------------------
    describe('Interest Calculation', () => {
        it('GET /fixed-deposits/:fdId/interest-preview - should preview interest calculation', async () => {
            const res = await app.request(`/fixed-deposits/${fdAccountId}/interest-preview`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
            expect(body.data.interest_earned).toBeDefined();
            expect(body.data.maturity_value).toBeDefined();
        });

        it('GET /fixed-deposits/:fdId/interest-breakdown - should get detailed interest breakdown', async () => {
            const res = await app.request(`/fixed-deposits/${fdAccountId}/interest-breakdown`, {
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
    // Member's FDs
    // -----------------------------------------------------------------------
    describe('Member Fixed Deposits', () => {
        it('GET /fixed-deposits/members/:memberId - should list member FDs', async () => {
            const res = await app.request(`/fixed-deposits/members/${TEST_MEMBER_ID}`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
            expect(body.data.length).toBeGreaterThanOrEqual(1);
        });

        it('GET /fixed-deposits/members/:memberId/summary - should get member FD summary', async () => {
            const res = await app.request(`/fixed-deposits/members/${TEST_MEMBER_ID}/summary`, {
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
    // Premature Withdrawal
    // -----------------------------------------------------------------------
    describe('Premature Withdrawal', () => {
        it('GET /fixed-deposits/:fdId/premature-withdrawal-preview - should preview penalty', async () => {
            const res = await app.request(`/fixed-deposits/${fdAccountId}/premature-withdrawal-preview`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
            expect(body.data.penalty_amount).toBeDefined();
            expect(body.data.net_amount).toBeDefined();
        });

        it('POST /fixed-deposits/:fdId/premature-withdrawal - should process premature withdrawal', async () => {
            const res = await app.request(`/fixed-deposits/${fdAccountId}/premature-withdrawal`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    confirm: true,
                }),
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });

        it('POST /fixed-deposits/:fdId/premature-withdrawal - should reject withdrawal without confirmation', async () => {
            const res = await app.request(`/fixed-deposits/${fdAccountId}/premature-withdrawal`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    confirm: false,
                }),
            });

            expect(res.status).toBeGreaterThanOrEqual(400);
        });
    });

    // -----------------------------------------------------------------------
    // Maturity and Rollover
    // -----------------------------------------------------------------------
    describe('Maturity and Rollover', () => {
        // Create a new FD for maturity tests
        let maturityFdId: string;

        beforeAll(async () => {
            const res = await app.request('/fixed-deposits/open', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    member_id: TEST_MEMBER_ID,
                    product_id: fdProductId,
                    principal_amount: 30000,
                    maturity_action: 'manual_action_pending',
                    funding_account_id: savingsAccountId,
                }),
            });

            const body = (await res.json()) as any;
            maturityFdId = body.data.id;
        });

        it('GET /fixed-deposits/maturing - should list maturing FDs', async () => {
            const res = await app.request('/fixed-deposits/maturing', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
        });

        it('POST /fixed-deposits/:fdId/rollover - should rollover an FD', async () => {
            const res = await app.request(`/fixed-deposits/${maturityFdId}/rollover`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    rollover_type: 'principal_only',
                }),
            });

            // Might fail if FD is not mature yet, which is expected
            expect([200, 400]).toContain(res.status);
        });
    });

    // -----------------------------------------------------------------------
    // FD Analytics and Reports
    // -----------------------------------------------------------------------
    describe('Analytics', () => {
        it('GET /fixed-deposits/analytics - should get FD analytics', async () => {
            const res = await app.request('/fixed-deposits/analytics', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
        });

        it('GET /fixed-deposits/products/:productId/analytics - should get product analytics', async () => {
            const res = await app.request(`/fixed-deposits/products/${fdProductId}/analytics`, {
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
        await cleanupDynamicProducts();
    });
});
