// tests/routes/loans.test.ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * Loan Route Validation Schema Tests
 * Tests all Zod schemas used in the loans route
 */

// ─── Re-declare schemas (same as src/routes/loans.ts) ────────
// This mirrors the route schemas to test validation independently

const uuidSchema = z.string().uuid('Invalid UUID format');
const dateSchema = z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date format');

const createLoanProductSchema = z.object({
    code: z.string().max(20, 'Product code must be at most 20 characters'),
    name: z.string().min(2, 'Product name required'),
    description: z.string().nullable().optional(),
    interest_rate_type: z.enum(['fixed', 'variable']),
    interest_calculation_method: z.enum(['simple', 'compound', 'declining_balance']),
    default_interest_rate: z.number().min(0).max(100).optional(),
    fixed_interest_rate: z.number().min(0).max(100).nullable().optional(),
    minimum_amount: z.number().positive('Minimum amount must be positive'),
    maximum_amount: z.number().positive('Maximum amount must be positive'),
    minimum_tenure_months: z.number().int().positive().default(1),
    maximum_tenure_months: z.number().int().positive(),
    repayment_frequency: z.enum(['weekly', 'bi_weekly', 'monthly', 'quarterly']),
    late_payment_penalty_type: z.enum(['fixed_amount', 'percentage_of_payment']).default('percentage_of_payment'),
    late_payment_penalty: z.number().min(0).default(0),
    requires_collateral: z.boolean().default(false),
    requires_guarantors: z.boolean().default(false),
    minimum_guarantors: z.number().int().min(0).default(0),
    requires_appraisal: z.boolean().default(false),
    requires_insurance: z.boolean().default(false),
    is_active: z.boolean().default(true),
});

const createLoanApplicationSchema = z.object({
    member_id: uuidSchema,
    product_id: uuidSchema,
    requested_amount: z.number().positive('Requested amount must be positive'),
    requested_tenure_months: z.number().int().positive('Tenure must be positive'),
    loan_purpose: z.string().min(1, 'Loan purpose required'),
    purpose_description: z.string().nullable().optional(),
});

const approveLoanApplicationSchema = z.object({
    approved_amount: z.number().positive('Approved amount must be positive'),
    approved_interest_rate: z.number().min(0).max(100),
    approved_tenure_months: z.number().int().positive(),
});

const rejectLoanApplicationSchema = z.object({
    rejection_reason: z.string().min(5, 'Rejection reason must be at least 5 characters'),
});

const processRepaymentSchema = z.object({
    loan_account_id: uuidSchema,
    amount: z.number().positive('Amount must be positive'),
    payment_method: z.enum(['cash', 'mobile_money', 'bank_transfer', 'cheque', 'internal']),
    payment_reference: z.string().optional(),
});

const generateScheduleSchema = z.object({
    principal: z.number().positive('Principal must be positive'),
    annual_interest_rate: z.number().min(0).max(100),
    tenure_installments: z.number().int().positive('Tenure must be a positive integer'),
    interest_method: z.enum(['flat', 'declining_emi', 'declining_principal']),
    frequency: z.enum(['weekly', 'bi_weekly', 'monthly', 'quarterly']),
    start_date: dateSchema,
    currency_code: z.string().length(3).optional(),
});

const disburseLoanSchema = z.object({
    disbursement_channel: z.enum(['cash', 'bank_transfer', 'mobile_money', 'member_savings']),
    disbursement_reference: z.string().optional(),
    disbursement_notes: z.string().optional(),
});

const rescheduleLoanSchema = z.object({
    new_tenure_months: z.number().int().positive('New tenure must be positive'),
    new_interest_rate: z.number().min(0).max(100).optional(),
    reason: z.string().min(5, 'Reason must be at least 5 characters'),
});

const writeOffLoanSchema = z.object({
    reason: z.string().min(5, 'Write-off reason must be at least 5 characters'),
});

const earlySettlementSchema = z.object({
    payment_method: z.enum(['cash', 'mobile_money', 'bank_transfer', 'cheque', 'internal']),
    payment_reference: z.string().optional(),
});

const eligibilityCheckSchema = z.object({
    member_id: uuidSchema,
    product_id: uuidSchema,
    requested_amount: z.number().positive().optional(),
});

const guarantorSchema = z.object({
    guarantor_id: uuidSchema,
    relationship: z.string().optional(),
    contact_phone: z.string().optional(),
    contact_email: z.string().email().optional(),
    guaranteed_amount: z.number().positive('Guaranteed amount must be positive'),
});

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

// ═══════════════════════════════════════════════════════════════
// createLoanProductSchema
// ═══════════════════════════════════════════════════════════════

describe('createLoanProductSchema', () => {
    const validProduct = {
        code: 'EMG',
        name: 'Emergency Loan',
        interest_rate_type: 'fixed',
        interest_calculation_method: 'simple',
        minimum_amount: 5000,
        maximum_amount: 500000,
        maximum_tenure_months: 12,
        repayment_frequency: 'monthly',
    };

    it('should pass with valid data', () => {
        const result = createLoanProductSchema.safeParse(validProduct);
        expect(result.success).toBe(true);
    });

    it('should apply default values', () => {
        const result = createLoanProductSchema.safeParse(validProduct);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.minimum_tenure_months).toBe(1);
            expect(result.data.requires_collateral).toBe(false);
            expect(result.data.is_active).toBe(true);
        }
    });

    it('should reject code > 20 chars', () => {
        const result = createLoanProductSchema.safeParse({ ...validProduct, code: 'A'.repeat(21) });
        expect(result.success).toBe(false);
    });

    it('should reject name < 2 chars', () => {
        const result = createLoanProductSchema.safeParse({ ...validProduct, name: 'X' });
        expect(result.success).toBe(false);
    });

    it('should reject negative amount', () => {
        const result = createLoanProductSchema.safeParse({ ...validProduct, minimum_amount: -100 });
        expect(result.success).toBe(false);
    });

    it('should reject invalid interest_rate_type', () => {
        const result = createLoanProductSchema.safeParse({ ...validProduct, interest_rate_type: 'simple' });
        expect(result.success).toBe(false);
    });

    it('should reject invalid repayment_frequency', () => {
        const result = createLoanProductSchema.safeParse({ ...validProduct, repayment_frequency: 'daily' });
        expect(result.success).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════
// createLoanApplicationSchema
// ═══════════════════════════════════════════════════════════════

describe('createLoanApplicationSchema', () => {
    const validApp = {
        member_id: VALID_UUID,
        product_id: VALID_UUID,
        requested_amount: 50000,
        requested_tenure_months: 6,
        loan_purpose: 'Medical emergency',
    };

    it('should pass with valid data', () => {
        expect(createLoanApplicationSchema.safeParse(validApp).success).toBe(true);
    });

    it('should reject non-UUID member_id', () => {
        expect(createLoanApplicationSchema.safeParse({ ...validApp, member_id: 'not-uuid' }).success).toBe(false);
    });

    it('should reject zero amount', () => {
        expect(createLoanApplicationSchema.safeParse({ ...validApp, requested_amount: 0 }).success).toBe(false);
    });

    it('should reject empty loan_purpose', () => {
        expect(createLoanApplicationSchema.safeParse({ ...validApp, loan_purpose: '' }).success).toBe(false);
    });

    it('should reject float tenure', () => {
        expect(createLoanApplicationSchema.safeParse({ ...validApp, requested_tenure_months: 6.5 }).success).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════
// approveLoanApplicationSchema
// ═══════════════════════════════════════════════════════════════

describe('approveLoanApplicationSchema', () => {
    it('should pass with valid data', () => {
        expect(approveLoanApplicationSchema.safeParse({
            approved_amount: 50000,
            approved_interest_rate: 12,
            approved_tenure_months: 6,
        }).success).toBe(true);
    });

    it('should reject negative approved amount', () => {
        expect(approveLoanApplicationSchema.safeParse({
            approved_amount: -1,
            approved_interest_rate: 12,
            approved_tenure_months: 6,
        }).success).toBe(false);
    });

    it('should reject interest rate > 100', () => {
        expect(approveLoanApplicationSchema.safeParse({
            approved_amount: 50000,
            approved_interest_rate: 150,
            approved_tenure_months: 6,
        }).success).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════
// rejectLoanApplicationSchema
// ═══════════════════════════════════════════════════════════════

describe('rejectLoanApplicationSchema', () => {
    it('should pass with valid reason', () => {
        expect(rejectLoanApplicationSchema.safeParse({ rejection_reason: 'Insufficient collateral' }).success).toBe(true);
    });

    it('should reject short reason', () => {
        expect(rejectLoanApplicationSchema.safeParse({ rejection_reason: 'Bad' }).success).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════
// processRepaymentSchema
// ═══════════════════════════════════════════════════════════════

describe('processRepaymentSchema', () => {
    it('should pass with valid data', () => {
        expect(processRepaymentSchema.safeParse({
            loan_account_id: VALID_UUID,
            amount: 5000,
            payment_method: 'cash',
        }).success).toBe(true);
    });

    it('should reject invalid payment method', () => {
        expect(processRepaymentSchema.safeParse({
            loan_account_id: VALID_UUID,
            amount: 5000,
            payment_method: 'bitcoin',
        }).success).toBe(false);
    });

    it('should reject zero amount', () => {
        expect(processRepaymentSchema.safeParse({
            loan_account_id: VALID_UUID,
            amount: 0,
            payment_method: 'cash',
        }).success).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════
// generateScheduleSchema
// ═══════════════════════════════════════════════════════════════

describe('generateScheduleSchema', () => {
    it('should pass with valid data', () => {
        expect(generateScheduleSchema.safeParse({
            principal: 100000,
            annual_interest_rate: 12,
            tenure_installments: 12,
            interest_method: 'flat',
            frequency: 'monthly',
            start_date: '2024-01-01',
        }).success).toBe(true);
    });

    it('should reject invalid interest method', () => {
        expect(generateScheduleSchema.safeParse({
            principal: 100000,
            annual_interest_rate: 12,
            tenure_installments: 12,
            interest_method: 'invalid',
            frequency: 'monthly',
            start_date: '2024-01-01',
        }).success).toBe(false);
    });

    it('should reject invalid date', () => {
        expect(generateScheduleSchema.safeParse({
            principal: 100000,
            annual_interest_rate: 12,
            tenure_installments: 12,
            interest_method: 'flat',
            frequency: 'monthly',
            start_date: 'not-a-date',
        }).success).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════
// disburseLoanSchema
// ═══════════════════════════════════════════════════════════════

describe('disburseLoanSchema', () => {
    it('should accept all valid channels', () => {
        for (const channel of ['cash', 'bank_transfer', 'mobile_money', 'member_savings']) {
            expect(disburseLoanSchema.safeParse({ disbursement_channel: channel }).success).toBe(true);
        }
    });

    it('should reject invalid channel', () => {
        expect(disburseLoanSchema.safeParse({ disbursement_channel: 'crypto' }).success).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════
// Remaining schemas
// ═══════════════════════════════════════════════════════════════

describe('rescheduleLoanSchema', () => {
    it('should pass with valid data', () => {
        expect(rescheduleLoanSchema.safeParse({ new_tenure_months: 18, reason: 'Financial hardship' }).success).toBe(true);
    });

    it('should reject short reason', () => {
        expect(rescheduleLoanSchema.safeParse({ new_tenure_months: 18, reason: 'OK' }).success).toBe(false);
    });
});

describe('writeOffLoanSchema', () => {
    it('should pass with valid reason', () => {
        expect(writeOffLoanSchema.safeParse({ reason: 'Irrecoverable debt' }).success).toBe(true);
    });

    it('should reject short reason', () => {
        expect(writeOffLoanSchema.safeParse({ reason: 'Bad' }).success).toBe(false);
    });
});

describe('earlySettlementSchema', () => {
    it('should accept all valid methods', () => {
        for (const m of ['cash', 'mobile_money', 'bank_transfer', 'cheque', 'internal']) {
            expect(earlySettlementSchema.safeParse({ payment_method: m }).success).toBe(true);
        }
    });
});

describe('eligibilityCheckSchema', () => {
    it('should pass with UUIDs', () => {
        expect(eligibilityCheckSchema.safeParse({
            member_id: VALID_UUID,
            product_id: VALID_UUID,
        }).success).toBe(true);
    });

    it('should reject non-UUID', () => {
        expect(eligibilityCheckSchema.safeParse({
            member_id: 'bad',
            product_id: VALID_UUID,
        }).success).toBe(false);
    });
});

describe('guarantorSchema', () => {
    it('should pass with valid data', () => {
        expect(guarantorSchema.safeParse({
            guarantor_id: VALID_UUID,
            guaranteed_amount: 50000,
        }).success).toBe(true);
    });

    it('should reject invalid email', () => {
        expect(guarantorSchema.safeParse({
            guarantor_id: VALID_UUID,
            guaranteed_amount: 50000,
            contact_email: 'not-email',
        }).success).toBe(false);
    });

    it('should reject negative guaranteed amount', () => {
        expect(guarantorSchema.safeParse({
            guarantor_id: VALID_UUID,
            guaranteed_amount: -100,
        }).success).toBe(false);
    });
});
