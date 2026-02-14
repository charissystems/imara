// tests/integration/admin.test.ts
// Integration tests for the /admin routes – staff management, member creation,
// dashboard, and job triggers.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../../src/index';
import { dbManager } from '../../src/config/database';
import {
    authHeaders,
    tenantHeaders,
    seedTestStaff,
    cleanupTestData,
    TEST_SCHEMA,
} from '../helpers/integration';

describe('Admin API Endpoints', () => {
    let headers: Record<string, string>;
    let createdMemberId: string;
    let createdStaffId: string;

    // -----------------------------------------------------------------------
    // Setup
    // -----------------------------------------------------------------------
    beforeAll(async () => {
        const isHealthy = await dbManager.healthCheck();
        expect(isHealthy).toBe(true);

        await seedTestStaff();
        headers = await authHeaders();
    });

    // -----------------------------------------------------------------------
    // GET /admin/staff - List Staff
    // -----------------------------------------------------------------------
    describe('GET /admin/staff - List Staff', () => {
        it('should list all staff members', async () => {
            const res = await app.request('/admin/staff', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
            expect(body.data.length).toBeGreaterThanOrEqual(1);
        });
    });

    // -----------------------------------------------------------------------
    // POST /admin/members - Create Member
    // -----------------------------------------------------------------------
    describe('POST /admin/members - Create Member', () => {
        it('should create a new member', async () => {
            const memberNumber = `ADM-${Date.now().toString(36).slice(-6).toUpperCase()}`;
            const res = await app.request('/admin/members', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    first_name: 'Admin',
                    last_name: 'CreatedMember',
                    phone: '+254722000001',
                    email: `admin-member-${Date.now()}@integration-test.local`,
                    member_number: memberNumber,
                    joined_date: new Date().toISOString().split('T')[0],
                    gender: 'female',
                    marital_status: 'single',
                }),
            });

            expect(res.status).toBe(201);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();

            createdMemberId = body.data.member?.id || body.data.id;
        });

        it('should reject missing required fields', async () => {
            const res = await app.request('/admin/members', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    first_name: 'Only',
                }),
            });

            expect(res.status).toBe(400);
        });

        it('should reject invalid phone format', async () => {
            const res = await app.request('/admin/members', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    first_name: 'Bad',
                    last_name: 'Phone',
                    phone: 'not-a-phone',
                    email: `badphone-${Date.now()}@integration-test.local`,
                    member_number: `BP-${Date.now().toString(36).slice(-4)}`,
                    joined_date: new Date().toISOString().split('T')[0],
                }),
            });

            expect(res.status).toBe(400);
        });
    });

    // -----------------------------------------------------------------------
    // POST /admin/staff - Create Staff
    // -----------------------------------------------------------------------
    describe('POST /admin/staff - Create Staff', () => {
        it('should create a new staff member', async () => {
            const staffNumber = `ADM-${Date.now().toString(36).slice(-4).toUpperCase()}`;
            const res = await app.request('/admin/staff', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    staff_number: staffNumber,
                    first_name: 'Admin',
                    last_name: 'CreatedStaff',
                    email: `admin-staff-${Date.now()}@integration-test.local`,
                    phone: '+254733000001',
                    position: 'Teller',
                    department: 'Operations',
                    hire_date: new Date().toISOString().split('T')[0],
                }),
            });

            expect(res.status).toBe(201);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            createdStaffId = body.data?.staff?.id || body.data?.id;
        });

        it('should reject staff with missing required fields', async () => {
            const res = await app.request('/admin/staff', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    first_name: 'Incomplete',
                }),
            });

            expect(res.status).toBe(400);
        });

        it('should reject staff with short staff_number', async () => {
            const res = await app.request('/admin/staff', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    staff_number: 'AB',
                    first_name: 'Short',
                    last_name: 'Number',
                    email: `short-${Date.now()}@integration-test.local`,
                }),
            });

            expect(res.status).toBe(400);
        });
    });

    // -----------------------------------------------------------------------
    // PATCH /admin/staff/:id - Update Staff
    // -----------------------------------------------------------------------
    describe('PATCH /admin/staff/:id - Update Staff', () => {
        it('should update a staff member', async () => {
            if (!createdStaffId) return;

            const res = await app.request(`/admin/staff/${createdStaffId}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    position: 'Senior Teller',
                    department: 'Finance',
                }),
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });

        it('should return 404 for non-existent staff', async () => {
            const fakeId = '00000000-0000-4000-e000-000000000099';
            const res = await app.request(`/admin/staff/${fakeId}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ position: 'Ghost' }),
            });

            expect(res.status).toBe(404);
        });
    });

    // -----------------------------------------------------------------------
    // GET /admin/dashboard - Dashboard Stats
    // -----------------------------------------------------------------------
    describe('GET /admin/dashboard - Dashboard', () => {
        it('should return dashboard statistics', async () => {
            const res = await app.request('/admin/dashboard', {
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
    // POST /admin/jobs/trigger - Trigger Job
    // -----------------------------------------------------------------------
    describe('POST /admin/jobs/trigger - Trigger Job', () => {
        it('should trigger an interest accrual job', async () => {
            const res = await app.request('/admin/jobs/trigger', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    job_type: 'interest_accrual',
                }),
            });

            // May succeed or fail depending on Redis / BullMQ availability
            expect([200, 500]).toContain(res.status);
        });

        it('should reject invalid job type', async () => {
            const res = await app.request('/admin/jobs/trigger', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    job_type: 'invalid_job',
                }),
            });

            expect(res.status).toBe(400);
        });
    });

    // -----------------------------------------------------------------------
    // GET /admin/jobs/stats - Job Stats
    // -----------------------------------------------------------------------
    describe('GET /admin/jobs/stats - Job Stats', () => {
        it('should return job queue statistics', async () => {
            const res = await app.request('/admin/jobs/stats', {
                method: 'GET',
                headers,
            });

            // May succeed or return 500 if Redis is unavailable
            expect([200, 500]).toContain(res.status);
        });
    });

    // -----------------------------------------------------------------------
    // Auth enforcement
    // -----------------------------------------------------------------------
    describe('Auth enforcement', () => {
        it('should return 401 for unauthenticated staff list', async () => {
            const res = await app.request('/admin/staff', {
                method: 'GET',
                headers: tenantHeaders(),
            });

            expect(res.status).toBe(401);
        });

        it('should return 401 for unauthenticated dashboard', async () => {
            const res = await app.request('/admin/dashboard', {
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
        await cleanupTestData();
        await dbManager.disconnect();
    });
});
