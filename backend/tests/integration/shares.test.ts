// tests/integration/shares.test.ts
// Integration tests for the /shares routes – share classes, purchases, transfers,
// holdings, and dividend declarations/distributions.
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
    TEST_MEMBER_2_ID,
    TEST_SCHEMA,
} from '../helpers/integration';

describe('Shares API Endpoints', () => {
    let headers: Record<string, string>;

    // IDs captured during tests
    let shareClassId: string;
    let purchaseId: string;
    let transferId: string;
    let dividendDeclarationId: string;

    // -----------------------------------------------------------------------
    // Setup: seed staff and members
    // -----------------------------------------------------------------------
    beforeAll(async () => {
        const isHealthy = await dbManager.healthCheck();
        expect(isHealthy).toBe(true);

        await seedTestStaff();
        await seedTestMember(TEST_MEMBER_ID);
        await seedTestMember(TEST_MEMBER_2_ID);
        headers = await authHeaders();
    });

    // -----------------------------------------------------------------------
    // Share Classes
    // -----------------------------------------------------------------------
    describe('Share Classes', () => {
        it('POST /shares/classes - should create a share class', async () => {
            const res = await app.request('/shares/classes', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    code: `TST-SC-${Date.now().toString(36).slice(-4).toUpperCase()}`,
                    name: 'Test Share Class',
                    description: 'Integration test share class',
                    par_value: 100,
                    current_price: 110,
                    minimum_shares: 10,
                    maximum_shares: 1000,
                    dividend_eligible: true,
                    dividend_percentage: 12.0,
                }),
            });

            expect(res.status).toBe(201);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
            expect(body.data.code).toContain('TST-SC-');
            shareClassId = body.data.id;
        });

        it('GET /shares/classes - should list all share classes', async () => {
            const res = await app.request('/shares/classes', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
            expect(body.data.length).toBeGreaterThanOrEqual(1);
        });

        it('GET /shares/classes/:classId - should get share class details', async () => {
            const res = await app.request(`/shares/classes/${shareClassId}`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data.id).toBe(shareClassId);
            expect(body.data.name).toBe('Test Share Class');
        });

        it('PATCH /shares/classes/:classId - should update share class', async () => {
            const res = await app.request(`/shares/classes/${shareClassId}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    name: 'Updated Test Share Class',
                    current_price: 115,
                    dividend_percentage: 15.0,
                }),
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });

        it('GET /shares/classes?active=true - should filter active classes only', async () => {
            const res = await app.request('/shares/classes?active=true', {
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
    // Share Purchases
    // -----------------------------------------------------------------------
    describe('Share Purchases', () => {
        it('POST /shares/purchase - should purchase shares for a member', async () => {
            const res = await app.request('/shares/purchase', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    member_id: TEST_MEMBER_ID,
                    share_class_id: shareClassId,
                    quantity: 50,
                    unit_price: 115,
                    payment_method: 'cash',
                    payment_reference: 'CASH-001',
                }),
            });

            expect(res.status).toBe(201);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
            purchaseId = body.data.id;
        });

        it('POST /shares/purchase - should reject purchase below minimum shares', async () => {
            const res = await app.request('/shares/purchase', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    member_id: TEST_MEMBER_ID,
                    share_class_id: shareClassId,
                    quantity: 5, // Below minimum of 10
                    payment_method: 'cash',
                }),
            });

            expect(res.status).toBeGreaterThanOrEqual(400);
        });

        it('GET /shares/purchases/:purchaseId - should get purchase details', async () => {
            const res = await app.request(`/shares/purchases/${purchaseId}`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data.id).toBe(purchaseId);
        });
    });

    // -----------------------------------------------------------------------
    // Member Holdings
    // -----------------------------------------------------------------------
    describe('Member Holdings', () => {
        it('GET /shares/members/:memberId/holdings - should get member holdings', async () => {
            const res = await app.request(`/shares/members/${TEST_MEMBER_ID}/holdings`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
            if (body.data.length > 0) {
                expect(body.data[0].member_id).toBe(TEST_MEMBER_ID);
            }
        });

        it('GET /shares/members/:memberId/transactions - should list member share transactions', async () => {
            const res = await app.request(`/shares/members/${TEST_MEMBER_ID}/transactions`, {
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
    // Share Transfers
    // -----------------------------------------------------------------------
    describe('Share Transfers', () => {
        // First, ensure second member has some shares to transfer later
        beforeAll(async () => {
            await app.request('/shares/purchase', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    member_id: TEST_MEMBER_2_ID,
                    share_class_id: shareClassId,
                    quantity: 30,
                    payment_method: 'cash',
                }),
            });
        });

        it('POST /shares/transfer - should transfer shares between members', async () => {
            const res = await app.request('/shares/transfer', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    from_member_id: TEST_MEMBER_ID,
                    to_member_id: TEST_MEMBER_2_ID,
                    share_class_id: shareClassId,
                    quantity: 10,
                    transfer_price: 115,
                }),
            });

            expect(res.status).toBe(201);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
            transferId = body.data.id;
        });

        it('POST /shares/transfer - should reject transfer with insufficient shares', async () => {
            const res = await app.request('/shares/transfer', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    from_member_id: TEST_MEMBER_ID,
                    to_member_id: TEST_MEMBER_2_ID,
                    share_class_id: shareClassId,
                    quantity: 10000, // More than available
                    transfer_price: 115,
                }),
            });

            expect(res.status).toBeGreaterThanOrEqual(400);
        });

        it('GET /shares/transfers/:transferId - should get transfer details', async () => {
            const res = await app.request(`/shares/transfers/${transferId}`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data.id).toBe(transferId);
        });
    });

    // -----------------------------------------------------------------------
    // Dividend Declarations
    // -----------------------------------------------------------------------
    describe('Dividend Declarations', () => {
        it('POST /shares/dividends/declare - should declare dividends', async () => {
            const recordDate = new Date();
            recordDate.setDate(recordDate.getDate() + 1);
            const paymentDate = new Date();
            paymentDate.setDate(paymentDate.getDate() + 7);

            const res = await app.request('/shares/dividends/declare', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    share_class_id: shareClassId,
                    dividend_per_share: 5.0,
                    record_date: recordDate.toISOString().split('T')[0],
                    payment_date: paymentDate.toISOString().split('T')[0],
                    withholding_tax_rate: 10.0,
                }),
            });

            expect(res.status).toBe(201);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
            dividendDeclarationId = body.data.id;
        });

        it('GET /shares/dividends/declarations - should list dividend declarations', async () => {
            const res = await app.request('/shares/dividends/declarations', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
        });

        it('GET /shares/dividends/declarations/:declarationId - should get declaration details', async () => {
            const res = await app.request(`/shares/dividends/declarations/${dividendDeclarationId}`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data.id).toBe(dividendDeclarationId);
        });

        it('POST /shares/dividends/declarations/:declarationId/approve - should approve dividend', async () => {
            const res = await app.request(`/shares/dividends/declarations/${dividendDeclarationId}/approve`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    action: 'approve',
                }),
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Share Certificates
    // -----------------------------------------------------------------------
    describe('Share Certificates', () => {
        it('GET /shares/members/:memberId/certificate - should generate share certificate', async () => {
            const res = await app.request(`/shares/members/${TEST_MEMBER_ID}/certificate`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
            expect(body.data.member_id).toBe(TEST_MEMBER_ID);
        });
    });

    // -----------------------------------------------------------------------
    // Analytics
    // -----------------------------------------------------------------------
    describe('Share Analytics', () => {
        it('GET /shares/classes/:classId/analytics - should get share class analytics', async () => {
            const res = await app.request(`/shares/classes/${shareClassId}/analytics`, {
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
    // Cleanup
    // -----------------------------------------------------------------------
    afterAll(async () => {
        await cleanupTestData();
    });
});
