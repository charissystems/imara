/**
 * Shared helpers for integration tests that hit the real Hono app + database.
 *
 * Provides:
 *   • JWT token generation for authenticated requests
 *   • Pre-built header objects for the real 'testsacco' tenant
 *   • Seed / teardown utilities for test staff rows
 */
import { sign } from 'hono/jwt';
import { dbManager } from '../../src/config/database';

// ---------------------------------------------------------------------------
// Constants – must match the actual tenant registered in the test_db
// ---------------------------------------------------------------------------
export const TEST_TENANT_ID = '29abfbfa-19aa-4107-be95-d726f5c1af8b';
export const TEST_TENANT_SUBDOMAIN = 'testsacco';
export const TEST_SCHEMA = 'tenant_testsacco';

const JWT_SECRET = process.env.JWT_SECRET || 'imara-jwt-secret-change-in-production';

// Deterministic UUIDs for test staff
export const TEST_STAFF_ID = '00000000-0000-4000-a000-000000000001';

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/**
 * Generate a valid JWT access token for the test staff member.
 */
export async function generateTestToken(overrides?: Record<string, unknown>): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        staffId: TEST_STAFF_ID,
        staffEmail: 'teststaff@example.com',
        staffNumber: 'STF-001',
        role: 'sacco_administrator',
        tenantId: TEST_TENANT_ID,
        type: 'access',
        iat: now,
        exp: now + 3600,
        ...overrides,
    };
    return sign(payload, JWT_SECRET, 'HS256');
}

/**
 * Build request headers for an authenticated tenant request.
 */
export async function authHeaders(): Promise<Record<string, string>> {
    const token = await generateTestToken();
    return {
        'X-Tenant-Subdomain': TEST_TENANT_SUBDOMAIN,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    };
}

/**
 * Build unauthenticated headers (valid tenant, no JWT).
 */
export function tenantHeaders(): Record<string, string> {
    return {
        'X-Tenant-Subdomain': TEST_TENANT_SUBDOMAIN,
        'Content-Type': 'application/json',
    };
}

// ---------------------------------------------------------------------------
// Database seed / teardown
// ---------------------------------------------------------------------------

/**
 * Seed a minimal staff row so that the JWT's staffId resolves inside the
 * tenant schema.  Safe to call multiple times (uses INSERT … ON CONFLICT).
 */
export async function seedTestStaff(): Promise<void> {
    await dbManager.executeRaw(
        TEST_SCHEMA,
        `INSERT INTO staff (id, staff_number, first_name, last_name, email, phone, position, hire_date, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [TEST_STAFF_ID, 'STF-001', 'Test', 'Admin', 'teststaff@example.com', '+254700000000', 'Test Admin', new Date().toISOString().split('T')[0], 'active']
    );
}

/**
 * Remove all test artefacts created during integration tests.
 */
export async function cleanupTestData(): Promise<void> {
    // Delete test members created during tests (by email pattern)
    await dbManager.executeRaw(
        TEST_SCHEMA,
        `DELETE FROM members WHERE email LIKE '%@integration-test.local'`
    );
}
