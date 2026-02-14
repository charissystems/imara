// tests/routes/members.test.ts
// Integration tests – exercises the full Hono middleware stack against a real DB.
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

describe('Member API Endpoints', () => {
    let headers: Record<string, string>;
    let memberId: string;
    const memberNumber = `M${Date.now().toString(36).slice(-8).toUpperCase()}`;

    // -----------------------------------------------------------------------
    // Setup: seed staff row & pre-generate auth headers
    // -----------------------------------------------------------------------
    beforeAll(async () => {
        const isHealthy = await dbManager.healthCheck();
        expect(isHealthy).toBe(true);

        await seedTestStaff();
        headers = await authHeaders();
    });

    // -----------------------------------------------------------------------
    // POST /members – create
    // -----------------------------------------------------------------------
    describe('POST /members - Create Member', () => {
        it('should create a new member with valid data', async () => {
            const res = await app.request('/members', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    first_name: 'John',
                    last_name: 'Doe',
                    phone: '+254700000000',
                    email: `john-${Date.now()}@integration-test.local`,
                    member_number: memberNumber,
                    status: 'active',
                }),
            });

            expect(res.status).toBe(201);

            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data.member.member_number).toBe(memberNumber);
            expect(body.data.member.first_name).toBe('John');

            // Store id for later tests
            memberId = body.data.member.id;
        });

        it('should reject duplicate member_number', async () => {
            const res = await app.request('/members', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    first_name: 'Jane',
                    last_name: 'Smith',
                    member_number: memberNumber, // same as above
                }),
            });

            expect(res.status).toBe(409);
            const body = (await res.json()) as any;
            expect(body.success).toBe(false);
        });

        it('should fail with invalid first name (too short)', async () => {
            const res = await app.request('/members', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    first_name: 'J',
                    last_name: 'Doe',
                    phone: '+254700000000',
                    email: 'j@integration-test.local',
                    member_number: 'MS001',
                }),
            });

            expect(res.status).toBe(400);
            const body = (await res.json()) as any;
            expect(body.success).toBe(false);
        });

        it('should fail with invalid email format', async () => {
            const res = await app.request('/members', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    first_name: 'John',
                    last_name: 'Doe',
                    email: 'invalid-email',
                    member_number: 'MI001',
                }),
            });

            expect(res.status).toBe(400);
        });

        it('should fail when member_number is missing', async () => {
            const res = await app.request('/members', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    first_name: 'John',
                    last_name: 'Doe',
                }),
            });

            expect(res.status).toBe(400);
        });
    });

    // -----------------------------------------------------------------------
    // GET /members – list
    // -----------------------------------------------------------------------
    describe('GET /members - List Members', () => {
        it('should list all members', async () => {
            const res = await app.request('/members', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);

            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
            expect(body.meta.count).toBeGreaterThanOrEqual(1);
            expect(body.meta.tenant).toBe('testsacco');
        });

        it('should filter members by status', async () => {
            const res = await app.request('/members?status=active', {
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
    // GET /members/:id – single
    // -----------------------------------------------------------------------
    describe('GET /members/:id - Get Single Member', () => {
        it('should get the created member by id', async () => {
            const res = await app.request(`/members/${memberId}`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);

            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data.id).toBe(memberId);
        });

        it('should return 404 for non-existent member', async () => {
            const fakeId = '00000000-0000-4000-b000-000000000099';
            const res = await app.request(`/members/${fakeId}`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(404);
        });
    });

    // -----------------------------------------------------------------------
    // PUT /members/:id – update
    // -----------------------------------------------------------------------
    describe('PUT /members/:id - Update Member', () => {
        it('should update a member', async () => {
            const res = await app.request(`/members/${memberId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ first_name: 'Jane' }),
            });

            expect(res.status).toBe(200);

            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data.first_name).toBe('Jane');
        });

        it('should return 404 for non-existent member', async () => {
            const fakeId = '00000000-0000-4000-b000-000000000099';
            const res = await app.request(`/members/${fakeId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ first_name: 'Nobody' }),
            });

            expect(res.status).toBe(404);
        });
    });

    // -----------------------------------------------------------------------
    // DELETE /members/:id – soft delete
    // -----------------------------------------------------------------------
    describe('DELETE /members/:id - Delete Member', () => {
        it('should soft delete a member', async () => {
            const res = await app.request(`/members/${memberId}`, {
                method: 'DELETE',
                headers,
            });

            expect(res.status).toBe(200);

            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.meta.deleted).toBe(true);
        });

        it('should return 404 for non-existent member', async () => {
            const fakeId = '00000000-0000-4000-b000-000000000099';
            const res = await app.request(`/members/${fakeId}`, {
                method: 'DELETE',
                headers,
            });

            expect(res.status).toBe(404);
        });
    });

    // -----------------------------------------------------------------------
    // Auth enforcement
    // -----------------------------------------------------------------------
    describe('Auth enforcement', () => {
        it('should return 401 when no auth token is provided', async () => {
            const res = await app.request('/members', {
                method: 'GET',
                headers: tenantHeaders(),
            });

            expect(res.status).toBe(401);
            const body = (await res.json()) as any;
            expect(body.success).toBe(false);
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
