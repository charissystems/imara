/**
 * Shared helpers for integration tests that hit the real Hono app + database.
 *
 * Provides:
 *   • JWT token generation for authenticated requests
 *   • Pre-built header objects for the real 'testsacco' tenant
 *   • Seed / teardown utilities for test staff, members, products
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

// Deterministic UUIDs for test fixtures
export const TEST_STAFF_ID = '00000000-0000-4000-a000-000000000001';
export const TEST_MEMBER_ID = '00000000-0000-4000-a000-000000000010';
export const TEST_MEMBER_2_ID = '00000000-0000-4000-a000-000000000011';
export const TEST_SAVINGS_PRODUCT_ID = '00000000-0000-4000-a000-000000000020';
export const TEST_LOAN_PRODUCT_ID = '00000000-0000-4000-a000-000000000030';

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
 * Seed a member for use in account / loan tests.
 */
export async function seedTestMember(
    id: string = TEST_MEMBER_ID,
    memberNumber?: string,
): Promise<{ id: string; member_number: string }> {
    const mNum = memberNumber || `INTM-${Date.now().toString(36).slice(-6).toUpperCase()}`;
    const phoneSuffix = id.slice(-4);
    await dbManager.executeRaw(
        TEST_SCHEMA,
        `INSERT INTO members
            (id, member_number, first_name, last_name, phone, email, status, gender, marital_status, life_status, joined_date, kyc_status, risk_rating, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
            id, mNum, 'IntTest', 'Member', `+25471${phoneSuffix}00`,
            `intmember-${id.slice(-4)}@integration-test.local`,
            'active', 'male', 'single', 'alive',
            new Date().toISOString().split('T')[0],
            'not_started', 'low',
        ]
    );
    return { id, member_number: mNum };
}

/**
 * Seed a savings product for account tests.
 */
export async function seedSavingsProduct(
    id: string = TEST_SAVINGS_PRODUCT_ID,
): Promise<{ id: string; code: string }> {
    const code = `SP-${Date.now().toString(36).slice(-6).toUpperCase()}`;
    await dbManager.executeRaw(
        TEST_SCHEMA,
        `INSERT INTO savings_products
            (id, code, name, description, interest_rate, interest_paid_frequency,
             interest_calculation_method, minimum_balance, allows_overdraft, overdraft_limit,
             is_active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
            id, code, 'Integration Test Savings', 'Test product for integration tests',
            5.0, 'monthly', 'simple', 0, false, 0, true,
        ]
    );
    return { id, code };
}

/**
 * Seed a loan product for loan tests.
 */
export async function seedLoanProduct(
    id: string = TEST_LOAN_PRODUCT_ID,
): Promise<{ id: string; code: string }> {
    const code = `LP-${Date.now().toString(36).slice(-6).toUpperCase()}`;
    await dbManager.executeRaw(
        TEST_SCHEMA,
        `INSERT INTO loan_products
            (id, code, name, description, minimum_amount, maximum_amount,
             minimum_tenure_months, maximum_tenure_months,
             interest_rate_type, fixed_interest_rate, default_interest_rate,
             interest_calculation_method, repayment_frequency,
             requires_collateral, requires_guarantors, minimum_guarantors,
             requires_appraisal, requires_insurance,
             late_payment_penalty_type, late_payment_penalty,
             is_active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW(),NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
            id, code, 'Integration Test Loan', 'Loan product for integration tests',
            1000, 500000, 1, 36,
            'fixed', 12.0, 12.0,
            'declining_balance', 'monthly',
            false, false, 0, false, false,
            'percentage_of_payment', 5.0,
            true,
        ]
    );
    return { id, code };
}

/**
 * Remove all test artefacts created during integration tests.
 * Deletes in reverse FK order to avoid constraint violations.
 */
export async function cleanupTestData(): Promise<void> {
    const testMemberFilter = `SELECT id FROM members WHERE email LIKE '%@integration-test.local'`;

    // Helper: silently skip if table doesn't exist
    const safeDelete = async (sql: string) => {
        try {
            await dbManager.executeRaw(TEST_SCHEMA, sql);
        } catch (err: any) {
            if (err?.message?.includes('does not exist')) return;
            throw err;
        }
    };

    // Messaging-related cleanup
    await safeDelete(`DELETE FROM communication_preferences WHERE member_id IN (${testMemberFilter})`);
    await safeDelete(`DELETE FROM messages WHERE member_id IN (${testMemberFilter})`);

    // Fixed deposit-related cleanup (fd_rollovers has RESTRICT on original_fd_id)
    await safeDelete(`DELETE FROM fd_rollovers WHERE original_fd_id IN (SELECT id FROM fixed_deposits WHERE member_id IN (${testMemberFilter}))`);
    await safeDelete(`DELETE FROM fd_interest_schedules WHERE fixed_deposit_id IN (SELECT id FROM fixed_deposits WHERE member_id IN (${testMemberFilter}))`);
    await safeDelete(`DELETE FROM fd_maturity_alerts WHERE fixed_deposit_id IN (SELECT id FROM fixed_deposits WHERE member_id IN (${testMemberFilter}))`);
    await safeDelete(`DELETE FROM maturity_alerts WHERE member_id IN (${testMemberFilter})`);
    await safeDelete(`DELETE FROM fixed_deposits WHERE member_id IN (${testMemberFilter})`);

    // Share-related cleanup
    await safeDelete(`DELETE FROM share_transactions WHERE member_id IN (${testMemberFilter})`);
    await safeDelete(`DELETE FROM share_register WHERE member_id IN (${testMemberFilter})`);
    await safeDelete(`DELETE FROM share_holdings WHERE member_id IN (${testMemberFilter})`);

    // Loan-related cleanup
    await safeDelete(`DELETE FROM loan_repayments WHERE loan_account_id IN (SELECT id FROM loan_accounts WHERE member_id IN (${testMemberFilter}))`);
    await safeDelete(`DELETE FROM loan_schedules  WHERE loan_account_id IN (SELECT id FROM loan_accounts WHERE member_id IN (${testMemberFilter}))`);
    await safeDelete(`DELETE FROM loan_guarantors WHERE application_id IN (SELECT id FROM loan_applications WHERE member_id IN (${testMemberFilter}))`);
    await safeDelete(`DELETE FROM loan_appraisals WHERE application_id IN (SELECT id FROM loan_applications WHERE member_id IN (${testMemberFilter}))`);
    await safeDelete(`DELETE FROM loan_accounts   WHERE member_id IN (${testMemberFilter})`);
    await safeDelete(`DELETE FROM loan_applications WHERE member_id IN (${testMemberFilter})`);

    // Savings-related cleanup
    await safeDelete(`DELETE FROM internal_transfers WHERE from_account_id IN (SELECT id FROM savings_accounts WHERE member_id IN (${testMemberFilter}))`);
    await safeDelete(`DELETE FROM deposits     WHERE member_id IN (${testMemberFilter})`);
    await safeDelete(`DELETE FROM withdrawals  WHERE member_id IN (${testMemberFilter})`);
    await safeDelete(`DELETE FROM savings_accounts WHERE member_id IN (${testMemberFilter})`);

    // Transaction cleanup (RESTRICT)
    await safeDelete(`DELETE FROM transactions WHERE member_id IN (${testMemberFilter})`);

    // Other member-related cleanup
    await safeDelete(`DELETE FROM standing_instructions WHERE member_id IN (${testMemberFilter})`);
    await safeDelete(`DELETE FROM beneficiaries WHERE member_id IN (${testMemberFilter})`);
    await safeDelete(`DELETE FROM member_accounts WHERE member_id IN (${testMemberFilter})`);
    await safeDelete(`DELETE FROM memberships WHERE member_id IN (${testMemberFilter})`);
    await safeDelete(`DELETE FROM identity_documents WHERE member_id IN (${testMemberFilter})`);
    await safeDelete(`DELETE FROM member_credentials WHERE member_id IN (${testMemberFilter})`);

    // Products cleanup (by known test IDs)
    await safeDelete(`DELETE FROM savings_products WHERE id = '${TEST_SAVINGS_PRODUCT_ID}'`);
    await safeDelete(`DELETE FROM loan_products    WHERE id = '${TEST_LOAN_PRODUCT_ID}'`);

    // Auth-related cleanup (registered test staff)
    await safeDelete(`DELETE FROM staff_credentials WHERE staff_id IN (SELECT id FROM staff WHERE email LIKE '%@integration-test.local')`);
    await safeDelete(`DELETE FROM staff WHERE email LIKE '%@integration-test.local'`);

    // Member cleanup
    await safeDelete(`DELETE FROM members WHERE email LIKE '%@integration-test.local'`);
}

/**
 * Cleanup only dynamically-created products (not the seeded ones).
 */
export async function cleanupDynamicProducts(): Promise<void> {
    await dbManager.executeRaw(TEST_SCHEMA, `DELETE FROM savings_products WHERE code LIKE 'TST-%'`);
    await dbManager.executeRaw(TEST_SCHEMA, `DELETE FROM loan_products WHERE code LIKE 'TST-%'`);
}
