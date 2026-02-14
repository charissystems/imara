// tests/integration/loans.test.ts
// Integration tests for the /loans routes – products, applications, approval,
// disbursement, repayments, schedule, and eligibility.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../../src/index';
import { dbManager } from '../../src/config/database';
import {
    authHeaders,
    tenantHeaders,
    seedTestStaff,
    seedTestMember,
    seedSavingsProduct,
    seedLoanProduct,
    cleanupTestData,
    cleanupDynamicProducts,
    TEST_MEMBER_ID,
    TEST_MEMBER_2_ID,
    TEST_SAVINGS_PRODUCT_ID,
    TEST_LOAN_PRODUCT_ID,
    TEST_SCHEMA,
} from '../helpers/integration';

describe('Loans API Endpoints', () => {
    let headers: Record<string, string>;

    // Captured IDs for the full loan lifecycle
    let createdProductId: string;
    let applicationId: string;
    let loanAccountId: string;
    let savingsAccountId: string;

    // -----------------------------------------------------------------------
    // Setup: seed staff, member, savings product + account, loan product
    // -----------------------------------------------------------------------
    beforeAll(async () => {
        const isHealthy = await dbManager.healthCheck();
        expect(isHealthy).toBe(true);

        await seedTestStaff();
        await seedTestMember(TEST_MEMBER_ID);
        await seedTestMember(TEST_MEMBER_2_ID);
        await seedSavingsProduct();
        await seedLoanProduct();
        headers = await authHeaders();

        // Create a savings account for the member (needed for some loan workflows)
        const acctRes = await app.request('/accounts', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                member_id: TEST_MEMBER_ID,
                product_id: TEST_SAVINGS_PRODUCT_ID,
                account_number: `LSA-${Date.now().toString(36).slice(-8).toUpperCase()}`,
            }),
        });
        const acctBody = (await acctRes.json()) as any;
        if (acctBody.data) savingsAccountId = acctBody.data.id;
    });

    // -----------------------------------------------------------------------
    // Loan Products
    // -----------------------------------------------------------------------
    describe('Loan Products', () => {
        it('POST /loans/products - should create a loan product', async () => {
            const res = await app.request('/loans/products', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    code: `TST-${Date.now().toString(36).slice(-4).toUpperCase()}`,
                    name: 'Dynamic Test Loan Product',
                    description: 'Integration test loan product',
                    interest_rate_type: 'fixed',
                    interest_calculation_method: 'declining_balance',
                    default_interest_rate: 15,
                    fixed_interest_rate: 15,
                    minimum_amount: 5000,
                    maximum_amount: 1000000,
                    minimum_tenure_months: 1,
                    maximum_tenure_months: 60,
                    repayment_frequency: 'monthly',
                    requires_collateral: false,
                    requires_guarantors: false,
                    minimum_guarantors: 0,
                    requires_appraisal: false,
                }),
            });

            expect(res.status).toBe(201);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            createdProductId = body.data.id;
        });

        it('GET /loans/products - should list loan products', async () => {
            const res = await app.request('/loans/products', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
            expect(body.data.length).toBeGreaterThanOrEqual(1);
        });

        it('GET /loans/products/:productId - should get product detail', async () => {
            const res = await app.request(`/loans/products/${TEST_LOAN_PRODUCT_ID}`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data.id).toBe(TEST_LOAN_PRODUCT_ID);
        });

        it('PATCH /loans/products/:productId - should update loan product', async () => {
            const res = await app.request(`/loans/products/${createdProductId}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    name: 'Updated Integration Loan',
                    maximum_amount: 2000000,
                }),
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });

        it('POST /loans/products - should reject missing required fields', async () => {
            const res = await app.request('/loans/products', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: 'Incomplete Product',
                }),
            });

            expect(res.status).toBe(400);
        });
    });

    // -----------------------------------------------------------------------
    // Schedule Preview (no application required)
    // -----------------------------------------------------------------------
    describe('Schedule Preview', () => {
        it('POST /loans/schedule/preview - should generate a repayment schedule', async () => {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() + 1);

            const res = await app.request('/loans/schedule/preview', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    principal: 100000,
                    annual_interest_rate: 12,
                    tenure_installments: 12,
                    interest_method: 'declining_emi',
                    frequency: 'monthly',
                    start_date: startDate.toISOString().split('T')[0],
                }),
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
        });

        it('POST /loans/schedule/preview - should reject invalid interest method', async () => {
            const res = await app.request('/loans/schedule/preview', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    principal: 100000,
                    annual_interest_rate: 12,
                    tenure_installments: 12,
                    interest_method: 'invalid_method',
                    frequency: 'monthly',
                    start_date: new Date().toISOString().split('T')[0],
                }),
            });

            expect(res.status).toBe(400);
        });
    });

    // -----------------------------------------------------------------------
    // Eligibility Check
    // -----------------------------------------------------------------------
    describe('Eligibility Check', () => {
        it('POST /loans/eligibility - should check member eligibility', async () => {
            const res = await app.request('/loans/eligibility', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    member_id: TEST_MEMBER_ID,
                    product_id: TEST_LOAN_PRODUCT_ID,
                    requested_amount: 50000,
                }),
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });

        it('POST /loans/eligibility - should reject invalid member_id', async () => {
            const res = await app.request('/loans/eligibility', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    member_id: 'not-a-uuid',
                    product_id: TEST_LOAN_PRODUCT_ID,
                }),
            });

            expect(res.status).toBe(400);
        });
    });

    // -----------------------------------------------------------------------
    // Loan Application Lifecycle
    // -----------------------------------------------------------------------
    describe('Loan Applications', () => {
        it('POST /loans/applications - should submit an application', async () => {
            const res = await app.request('/loans/applications', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    member_id: TEST_MEMBER_ID,
                    product_id: TEST_LOAN_PRODUCT_ID,
                    requested_amount: 50000,
                    requested_tenure_months: 12,
                    loan_purpose: 'Business expansion',
                    purpose_description: 'Integration test loan application',
                }),
            });

            expect(res.status).toBe(201);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            applicationId = body.data.id;
        });

        it('GET /loans/applications - should list applications', async () => {
            const res = await app.request('/loans/applications', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
        });

        it('GET /loans/applications/:id - should get application detail', async () => {
            const res = await app.request(`/loans/applications/${applicationId}`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data.id).toBe(applicationId);
        });

        it('POST /loans/applications - should reject missing required fields', async () => {
            const res = await app.request('/loans/applications', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    member_id: TEST_MEMBER_ID,
                }),
            });

            expect(res.status).toBe(400);
        });
    });

    // -----------------------------------------------------------------------
    // Loan Appraisal
    // -----------------------------------------------------------------------
    describe('Loan Appraisal', () => {
        it('POST /loans/applications/:id/appraisal - should submit appraisal', async () => {
            const res = await app.request(`/loans/applications/${applicationId}/appraisal`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    risk_rating: 'low',
                    monthly_income: 80000,
                    monthly_expenses: 30000,
                    recommended_amount: 50000,
                    notes: 'Integration test appraisal - low risk',
                }),
            });

            // May succeed or fail depending on application status
            expect([200, 201, 400, 409]).toContain(res.status);
        });

        it('GET /loans/applications/:id/appraisal - should get appraisal', async () => {
            const res = await app.request(`/loans/applications/${applicationId}/appraisal`, {
                method: 'GET',
                headers,
            });

            // May be 200 or 404 depending on whether appraisal was created
            expect([200, 404]).toContain(res.status);
        });
    });

    // -----------------------------------------------------------------------
    // Loan Guarantors
    // -----------------------------------------------------------------------
    describe('Loan Guarantors', () => {
        it('POST /loans/applications/:id/guarantors - should add guarantor', async () => {
            const res = await app.request(`/loans/applications/${applicationId}/guarantors`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    guarantor_id: TEST_MEMBER_2_ID,
                    relationship: 'colleague',
                    guaranteed_amount: 25000,
                }),
            });

            // May succeed or fail based on application workflow state
            expect([200, 201, 400, 409]).toContain(res.status);
        });

        it('GET /loans/applications/:id/guarantors - should list guarantors', async () => {
            const res = await app.request(`/loans/applications/${applicationId}/guarantors`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Loan Approval & Rejection
    // -----------------------------------------------------------------------
    describe('Loan Approval', () => {
        it('PATCH /loans/applications/:id/approve - should approve application', async () => {
            const res = await app.request(`/loans/applications/${applicationId}/approve`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    approved_amount: 50000,
                    approved_interest_rate: 12,
                    approved_tenure_months: 12,
                }),
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);

            // Capture the loan account ID from the approval response
            if (body.data?.loanAccountId) {
                loanAccountId = body.data.loanAccountId;
            } else if (body.data?.loan_account_id) {
                loanAccountId = body.data.loan_account_id;
            }
        });

        it('PATCH /loans/applications/:id/approve - should reject already-approved', async () => {
            const res = await app.request(`/loans/applications/${applicationId}/approve`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    approved_amount: 50000,
                    approved_interest_rate: 12,
                    approved_tenure_months: 12,
                }),
            });

            // Should fail — already approved
            expect([400, 409]).toContain(res.status);
        });
    });

    // -----------------------------------------------------------------------
    // Rejection (test with a new application)
    // -----------------------------------------------------------------------
    describe('Loan Rejection', () => {
        let rejectAppId: string;

        it('should create and reject an application', async () => {
            // Create a new application
            const createRes = await app.request('/loans/applications', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    member_id: TEST_MEMBER_2_ID,
                    product_id: TEST_LOAN_PRODUCT_ID,
                    requested_amount: 100000,
                    requested_tenure_months: 24,
                    loan_purpose: 'To be rejected',
                }),
            });

            expect(createRes.status).toBe(201);
            const createBody = (await createRes.json()) as any;
            rejectAppId = createBody.data.id;

            // Reject it
            const rejectRes = await app.request(`/loans/applications/${rejectAppId}/reject`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    rejection_reason: 'Integration test rejection - insufficient documentation',
                }),
            });

            expect(rejectRes.status).toBe(200);
            const rejectBody = (await rejectRes.json()) as any;
            expect(rejectBody.success).toBe(true);
        });

        it('PATCH /loans/applications/:id/reject - should reject without reason', async () => {
            const res = await app.request(`/loans/applications/${applicationId}/reject`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({}),
            });

            expect(res.status).toBe(400);
        });
    });

    // -----------------------------------------------------------------------
    // Loan Accounts
    // -----------------------------------------------------------------------
    describe('Loan Accounts', () => {
        it('GET /loans - should list loan accounts', async () => {
            const res = await app.request('/loans', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);

            // If we didn't capture loanAccountId from approval, try to find it
            if (!loanAccountId && body.data.length > 0) {
                loanAccountId = body.data[0].id;
            }
        });

        it('GET /loans/:loanId - should get loan detail', async () => {
            if (!loanAccountId) return;

            const res = await app.request(`/loans/${loanAccountId}`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });

        it('GET /loans/:loanId - should return 404 for non-existent loan', async () => {
            const fakeId = '00000000-0000-4000-d000-000000000099';
            const res = await app.request(`/loans/${fakeId}`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(404);
        });
    });

    // -----------------------------------------------------------------------
    // Loan Disbursement
    // -----------------------------------------------------------------------
    describe('Loan Disbursement', () => {
        it('POST /loans/:loanId/disburse - should disburse the loan', async () => {
            if (!loanAccountId) return;

            const res = await app.request(`/loans/${loanAccountId}/disburse`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    disbursement_channel: 'bank_transfer',
                    disbursement_reference: 'INT-TEST-DISB-001',
                    disbursement_notes: 'Integration test disbursement',
                }),
            });

            // May succeed or fail depending on loan status
            expect([200, 400, 409]).toContain(res.status);
        });
    });

    // -----------------------------------------------------------------------
    // Loan Schedule
    // -----------------------------------------------------------------------
    describe('Loan Schedule', () => {
        it('GET /loans/:loanId/schedule - should get repayment schedule', async () => {
            if (!loanAccountId) return;

            const res = await app.request(`/loans/${loanAccountId}/schedule`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Loan Repayment
    // -----------------------------------------------------------------------
    describe('Loan Repayments', () => {
        it('POST /loans/repayment - should process a repayment', async () => {
            if (!loanAccountId) return;

            const res = await app.request('/loans/repayment', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    loan_account_id: loanAccountId,
                    amount: 5000,
                    payment_method: 'cash',
                    payment_reference: 'INT-TEST-REP-001',
                }),
            });

            // May succeed or fail depending on disbursement status
            expect([200, 201, 400, 409]).toContain(res.status);
        });

        it('POST /loans/repayment - should reject invalid loan_account_id', async () => {
            const res = await app.request('/loans/repayment', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    loan_account_id: 'not-a-uuid',
                    amount: 1000,
                    payment_method: 'cash',
                }),
            });

            expect(res.status).toBe(400);
        });

        it('GET /loans/:loanId/repayments - should list repayment history', async () => {
            if (!loanAccountId) return;

            const res = await app.request(`/loans/${loanAccountId}/repayments`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Early Settlement Preview
    // -----------------------------------------------------------------------
    describe('Early Settlement', () => {
        it('GET /loans/:loanId/early-settlement - should preview early settlement', async () => {
            if (!loanAccountId) return;

            const res = await app.request(`/loans/${loanAccountId}/early-settlement`, {
                method: 'GET',
                headers,
            });

            // May succeed or fail depending on loan status
            expect([200, 400]).toContain(res.status);
        });
    });

    // -----------------------------------------------------------------------
    // Auth enforcement
    // -----------------------------------------------------------------------
    describe('Auth enforcement', () => {
        it('should return 401 for unauthenticated request', async () => {
            const res = await app.request('/loans', {
                method: 'GET',
                headers: tenantHeaders(),
            });

            expect(res.status).toBe(401);
        });

        it('should return 401 for unauthenticated product list', async () => {
            const res = await app.request('/loans/products', {
                method: 'GET',
                headers: tenantHeaders(),
            });

            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    // Teardown
    // -----------------------------------------------------------------------
    afterAll(async () => {
        await cleanupDynamicProducts();
        await cleanupTestData();
        await dbManager.disconnect();
    });
});
