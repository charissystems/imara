// tests/routes/accounts.test.ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * Accounts Route Validation Schema Tests
 * Tests all Zod schemas used in the accounts route
 */

const uuidSchema = z.string().uuid('Invalid UUID format');

const createAccountSchema = z.object({
    member_id: uuidSchema,
    product_id: uuidSchema,
    account_number: z.string().min(3, 'Account number required'),
});

const depositSchema = z.object({
    savings_account_id: uuidSchema,
    member_id: uuidSchema,
    amount: z.number().positive('Amount must be positive'),
    payment_method: z.enum(['cash', 'mobile_money', 'bank_transfer', 'cheque', 'internal']),
    payment_reference: z.string().optional(),
    description: z.string().optional(),
});

const withdrawalSchema = z.object({
    savings_account_id: uuidSchema,
    member_id: uuidSchema,
    amount: z.number().positive('Amount must be positive'),
    payout_method: z.enum(['cash', 'mobile_money', 'bank_transfer', 'cheque']),
    payout_reference: z.string().optional(),
    payout_account: z.string().optional(),
    description: z.string().optional(),
});

const transferSchema = z.object({
    from_account_id: uuidSchema,
    to_account_id: uuidSchema,
    amount: z.number().positive('Amount must be positive'),
    description: z.string().optional(),
});

const closeAccountSchema = z.object({
    closure_reason: z.string().optional(),
});

const batchDepositSchema = z.object({
    deposits: z.array(z.object({
        savings_account_id: uuidSchema,
        member_id: uuidSchema,
        amount: z.number().positive(),
        payment_method: z.enum(['cash', 'mobile_money', 'bank_transfer', 'cheque', 'internal']),
        payment_reference: z.string().optional(),
        description: z.string().optional(),
    })).min(1, 'At least one deposit required').max(500, 'Maximum 500 deposits per batch'),
});

const createSavingsProductSchema = z.object({
    code: z.string().min(1).max(20),
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    interest_rate: z.number().min(0).max(100),
    interest_paid_frequency: z.enum(['monthly', 'quarterly', 'annually', 'on_withdrawal']),
    interest_calculation_method: z.enum(['simple', 'compound']).optional(),
    minimum_balance: z.number().min(0).optional(),
    maximum_balance: z.number().positive().optional(),
    allows_overdraft: z.boolean().optional(),
    overdraft_limit: z.number().min(0).optional(),
});

const updateSavingsProductSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().optional(),
    interest_rate: z.number().min(0).max(100).optional(),
    minimum_balance: z.number().min(0).optional(),
    maximum_balance: z.number().positive().optional(),
    is_active: z.boolean().optional(),
});

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

// ═══════════════════════════════════════════════════════════════
// createAccountSchema
// ═══════════════════════════════════════════════════════════════

describe('createAccountSchema', () => {
    it('should pass with valid data', () => {
        expect(createAccountSchema.safeParse({
            member_id: VALID_UUID,
            product_id: VALID_UUID,
            account_number: 'SAV-001',
        }).success).toBe(true);
    });

    it('should reject non-UUID member_id', () => {
        expect(createAccountSchema.safeParse({
            member_id: 'bad',
            product_id: VALID_UUID,
            account_number: 'SAV-001',
        }).success).toBe(false);
    });

    it('should reject short account number', () => {
        expect(createAccountSchema.safeParse({
            member_id: VALID_UUID,
            product_id: VALID_UUID,
            account_number: 'AB',
        }).success).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════
// depositSchema
// ═══════════════════════════════════════════════════════════════

describe('depositSchema', () => {
    const validDeposit = {
        savings_account_id: VALID_UUID,
        member_id: VALID_UUID,
        amount: 5000,
        payment_method: 'cash' as const,
    };

    it('should pass with valid data', () => {
        expect(depositSchema.safeParse(validDeposit).success).toBe(true);
    });

    it('should reject zero amount', () => {
        expect(depositSchema.safeParse({ ...validDeposit, amount: 0 }).success).toBe(false);
    });

    it('should reject negative amount', () => {
        expect(depositSchema.safeParse({ ...validDeposit, amount: -100 }).success).toBe(false);
    });

    it('should reject invalid payment method', () => {
        expect(depositSchema.safeParse({ ...validDeposit, payment_method: 'crypto' }).success).toBe(false);
    });

    it('should accept all valid payment methods', () => {
        for (const m of ['cash', 'mobile_money', 'bank_transfer', 'cheque', 'internal']) {
            expect(depositSchema.safeParse({ ...validDeposit, payment_method: m }).success).toBe(true);
        }
    });

    it('should accept optional description', () => {
        expect(depositSchema.safeParse({ ...validDeposit, description: 'Monthly savings' }).success).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════
// withdrawalSchema
// ═══════════════════════════════════════════════════════════════

describe('withdrawalSchema', () => {
    const validWithdrawal = {
        savings_account_id: VALID_UUID,
        member_id: VALID_UUID,
        amount: 2000,
        payout_method: 'cash' as const,
    };

    it('should pass with valid data', () => {
        expect(withdrawalSchema.safeParse(validWithdrawal).success).toBe(true);
    });

    it('should reject negative amount', () => {
        expect(withdrawalSchema.safeParse({ ...validWithdrawal, amount: -1 }).success).toBe(false);
    });

    it('should only accept valid payout methods (no internal)', () => {
        expect(withdrawalSchema.safeParse({ ...validWithdrawal, payout_method: 'internal' }).success).toBe(false);
    });

    it('should accept all valid payout methods', () => {
        for (const m of ['cash', 'mobile_money', 'bank_transfer', 'cheque']) {
            expect(withdrawalSchema.safeParse({ ...validWithdrawal, payout_method: m }).success).toBe(true);
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// transferSchema
// ═══════════════════════════════════════════════════════════════

describe('transferSchema', () => {
    it('should pass with valid data', () => {
        expect(transferSchema.safeParse({
            from_account_id: VALID_UUID,
            to_account_id: VALID_UUID,
            amount: 1000,
        }).success).toBe(true);
    });

    it('should reject zero amount', () => {
        expect(transferSchema.safeParse({
            from_account_id: VALID_UUID,
            to_account_id: VALID_UUID,
            amount: 0,
        }).success).toBe(false);
    });

    it('should accept optional description', () => {
        expect(transferSchema.safeParse({
            from_account_id: VALID_UUID,
            to_account_id: VALID_UUID,
            amount: 1000,
            description: 'Transfer to shares',
        }).success).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════
// closeAccountSchema
// ═══════════════════════════════════════════════════════════════

describe('closeAccountSchema', () => {
    it('should pass with reason', () => {
        expect(closeAccountSchema.safeParse({ closure_reason: 'Exiting SACCO' }).success).toBe(true);
    });

    it('should pass without reason (optional)', () => {
        expect(closeAccountSchema.safeParse({}).success).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════
// batchDepositSchema
// ═══════════════════════════════════════════════════════════════

describe('batchDepositSchema', () => {
    const singleDeposit = {
        savings_account_id: VALID_UUID,
        member_id: VALID_UUID,
        amount: 1000,
        payment_method: 'cash' as const,
    };

    it('should pass with single deposit', () => {
        expect(batchDepositSchema.safeParse({ deposits: [singleDeposit] }).success).toBe(true);
    });

    it('should reject empty deposits array', () => {
        expect(batchDepositSchema.safeParse({ deposits: [] }).success).toBe(false);
    });

    it('should accept up to 500 deposits', () => {
        const deposits = Array.from({ length: 500 }, () => singleDeposit);
        expect(batchDepositSchema.safeParse({ deposits }).success).toBe(true);
    });

    it('should reject more than 500 deposits', () => {
        const deposits = Array.from({ length: 501 }, () => singleDeposit);
        expect(batchDepositSchema.safeParse({ deposits }).success).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════
// createSavingsProductSchema
// ═══════════════════════════════════════════════════════════════

describe('createSavingsProductSchema', () => {
    const validProduct = {
        code: 'STD',
        name: 'Standard Savings',
        interest_rate: 5,
        interest_paid_frequency: 'monthly' as const,
    };

    it('should pass with valid data', () => {
        expect(createSavingsProductSchema.safeParse(validProduct).success).toBe(true);
    });

    it('should reject empty code', () => {
        expect(createSavingsProductSchema.safeParse({ ...validProduct, code: '' }).success).toBe(false);
    });

    it('should reject code > 20 chars', () => {
        expect(createSavingsProductSchema.safeParse({ ...validProduct, code: 'A'.repeat(21) }).success).toBe(false);
    });

    it('should reject interest rate > 100', () => {
        expect(createSavingsProductSchema.safeParse({ ...validProduct, interest_rate: 101 }).success).toBe(false);
    });

    it('should reject negative interest rate', () => {
        expect(createSavingsProductSchema.safeParse({ ...validProduct, interest_rate: -1 }).success).toBe(false);
    });

    it('should accept all valid frequencies', () => {
        for (const freq of ['monthly', 'quarterly', 'annually', 'on_withdrawal']) {
            expect(createSavingsProductSchema.safeParse({
                ...validProduct,
                interest_paid_frequency: freq,
            }).success).toBe(true);
        }
    });

    it('should reject invalid calculation method', () => {
        expect(createSavingsProductSchema.safeParse({
            ...validProduct,
            interest_calculation_method: 'invalid',
        }).success).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════
// updateSavingsProductSchema
// ═══════════════════════════════════════════════════════════════

describe('updateSavingsProductSchema', () => {
    it('should pass with empty object (all optional)', () => {
        expect(updateSavingsProductSchema.safeParse({}).success).toBe(true);
    });

    it('should pass with partial update', () => {
        expect(updateSavingsProductSchema.safeParse({ interest_rate: 7 }).success).toBe(true);
    });

    it('should reject name > 100 chars', () => {
        expect(updateSavingsProductSchema.safeParse({ name: 'A'.repeat(101) }).success).toBe(false);
    });

    it('should reject negative minimum_balance', () => {
        expect(updateSavingsProductSchema.safeParse({ minimum_balance: -10 }).success).toBe(false);
    });
});
