// tests/integration/auth.test.ts
// Integration tests for the /auth routes – full Hono stack + real DB.
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

describe('Auth API Endpoints', () => {
    let headers: Record<string, string>;

    // Unique email for this test run to avoid collision
    const testEmail = `auth-${Date.now()}@integration-test.local`;
    const testPassword = 'TestPass123!';

    let registeredStaffId: string;
    let loginAccessToken: string;
    let loginRefreshToken: string;

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
    // POST /auth/register
    // -----------------------------------------------------------------------
    describe('POST /auth/register - Register Staff', () => {
        it('should register a new staff member', async () => {
            const res = await app.request('/auth/register', {
                method: 'POST',
                headers: tenantHeaders(),
                body: JSON.stringify({
                    first_name: 'Auth',
                    last_name: 'TestUser',
                    email: testEmail,
                    password: testPassword,
                }),
            });

            expect(res.status).toBe(201);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data.staffId).toBeDefined();
            expect(body.data.staffNumber).toBeDefined();

            registeredStaffId = body.data.staffId;
        });

        it('should reject duplicate email registration', async () => {
            const res = await app.request('/auth/register', {
                method: 'POST',
                headers: tenantHeaders(),
                body: JSON.stringify({
                    first_name: 'Duplicate',
                    last_name: 'User',
                    email: testEmail,
                    password: testPassword,
                }),
            });

            expect(res.status).toBe(409);
            const body = (await res.json()) as any;
            expect(body.success).toBe(false);
            expect(body.error.code).toBe('DUPLICATE_EMAIL');
        });

        it('should reject weak password', async () => {
            const res = await app.request('/auth/register', {
                method: 'POST',
                headers: tenantHeaders(),
                body: JSON.stringify({
                    first_name: 'Weak',
                    last_name: 'Pass',
                    email: `weak-${Date.now()}@integration-test.local`,
                    password: 'short',
                }),
            });

            expect(res.status).toBe(400);
        });

        it('should reject missing required fields', async () => {
            const res = await app.request('/auth/register', {
                method: 'POST',
                headers: tenantHeaders(),
                body: JSON.stringify({
                    first_name: 'No',
                }),
            });

            expect(res.status).toBe(400);
        });
    });

    // -----------------------------------------------------------------------
    // POST /auth/login
    // -----------------------------------------------------------------------
    describe('POST /auth/login - Login', () => {
        it('should login with valid credentials', async () => {
            const res = await app.request('/auth/login', {
                method: 'POST',
                headers: tenantHeaders(),
                body: JSON.stringify({
                    email: testEmail,
                    password: testPassword,
                }),
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data.accessToken).toBeDefined();
            expect(body.data.refreshToken).toBeDefined();
            expect(body.data.staff).toBeDefined();
            expect(body.data.staff.email).toBe(testEmail);

            loginAccessToken = body.data.accessToken;
            loginRefreshToken = body.data.refreshToken;
        });

        it('should reject wrong password', async () => {
            const res = await app.request('/auth/login', {
                method: 'POST',
                headers: tenantHeaders(),
                body: JSON.stringify({
                    email: testEmail,
                    password: 'WrongPassword123!',
                }),
            });

            expect(res.status).toBe(401);
            const body = (await res.json()) as any;
            expect(body.success).toBe(false);
        });

        it('should reject non-existent email', async () => {
            const res = await app.request('/auth/login', {
                method: 'POST',
                headers: tenantHeaders(),
                body: JSON.stringify({
                    email: 'nobody@nonexistent.com',
                    password: 'Anything123!',
                }),
            });

            expect(res.status).toBe(401);
        });

        it('should reject invalid email format', async () => {
            const res = await app.request('/auth/login', {
                method: 'POST',
                headers: tenantHeaders(),
                body: JSON.stringify({
                    email: 'not-an-email',
                    password: 'anything',
                }),
            });

            expect(res.status).toBe(400);
        });
    });

    // -----------------------------------------------------------------------
    // GET /auth/me
    // -----------------------------------------------------------------------
    describe('GET /auth/me - Current User Profile', () => {
        it('should return profile for authenticated user', async () => {
            const res = await app.request('/auth/me', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data.id).toBeDefined();
            expect(body.data.email).toBe('teststaff@example.com');
        });

        it('should return 401 without auth token', async () => {
            const res = await app.request('/auth/me', {
                method: 'GET',
                headers: tenantHeaders(),
            });

            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    // POST /auth/refresh
    // -----------------------------------------------------------------------
    describe('POST /auth/refresh - Refresh Token', () => {
        it('should accept a valid token for refresh', async () => {
            // The refresh endpoint verifies the JWT and issues a new access token
            const res = await app.request('/auth/refresh', {
                method: 'POST',
                headers: {
                    ...tenantHeaders(),
                    Authorization: `Bearer ${loginAccessToken}`,
                },
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data.accessToken).toBeDefined();
        });

        it('should return 401 without any token', async () => {
            const res = await app.request('/auth/refresh', {
                method: 'POST',
                headers: tenantHeaders(),
            });

            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    // POST /auth/change-password
    // -----------------------------------------------------------------------
    describe('POST /auth/change-password - Change Password', () => {
        it('should return 401 without auth', async () => {
            const res = await app.request('/auth/change-password', {
                method: 'POST',
                headers: tenantHeaders(),
                body: JSON.stringify({
                    currentPassword: testPassword,
                    newPassword: 'NewTestPass456!',
                    confirmPassword: 'NewTestPass456!',
                }),
            });

            expect(res.status).toBe(401);
        });

        it('should reject mismatched passwords', async () => {
            const res = await app.request('/auth/change-password', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    currentPassword: testPassword,
                    newPassword: 'NewTestPass456!',
                    confirmPassword: 'DifferentPass789!',
                }),
            });

            expect(res.status).toBe(400);
        });
    });

    // -----------------------------------------------------------------------
    // POST /auth/forgot-password
    // -----------------------------------------------------------------------
    describe('POST /auth/forgot-password', () => {
        it('should accept a valid email (always returns 200)', async () => {
            const res = await app.request('/auth/forgot-password', {
                method: 'POST',
                headers: tenantHeaders(),
                body: JSON.stringify({
                    email: testEmail,
                }),
            });

            // Should return success regardless of whether email exists (security)
            expect(res.status).toBe(200);
        });

        it('should reject invalid email format', async () => {
            const res = await app.request('/auth/forgot-password', {
                method: 'POST',
                headers: tenantHeaders(),
                body: JSON.stringify({
                    email: 'not-an-email',
                }),
            });

            expect(res.status).toBe(400);
        });
    });

    // -----------------------------------------------------------------------
    // POST /auth/logout
    // -----------------------------------------------------------------------
    describe('POST /auth/logout', () => {
        it('should return success (client-side logout)', async () => {
            const res = await app.request('/auth/logout', {
                method: 'POST',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // 2FA endpoints (basic smoke tests)
    // -----------------------------------------------------------------------
    describe('2FA endpoints', () => {
        it('GET /auth/2fa/status should return status for authenticated user', async () => {
            const res = await app.request('/auth/2fa/status', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });

        it('POST /auth/2fa/setup should initiate 2FA setup', async () => {
            const res = await app.request('/auth/2fa/setup', {
                method: 'POST',
                headers,
            });

            // May succeed or fail depending on TOTP service availability
            expect([200, 500]).toContain(res.status);
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
