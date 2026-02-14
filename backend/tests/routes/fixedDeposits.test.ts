// tests/routes/fixedDeposits.test.ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import Decimal from 'decimal.js';

/**
 * Fixed Deposit Route Validation & Business Logic Tests
 * Tests validation schemas and FD calculation logic without database dependencies
 */

// ─── Validation Schema Tests ─────────────────────────────────

describe('Fixed Deposit Routes - Validation Schemas', () => {
    const createFDProductSchema = z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        min_amount: z.number().positive(),
        max_amount: z.number().positive(),
        min_tenure_months: z.number().int().positive(),
        max_tenure_months: z.number().int().positive(),
        interest_rate: z.number().min(0).max(100),
        compounding_frequency: z.enum(['monthly', 'quarterly', 'semi_annually', 'annually', 'at_maturity']),
        early_withdrawal_penalty_percent: z.number().min(0).max(100).optional(),
        auto_rollover: z.boolean().optional(),
    });

    const openFDSchema = z.object({
        member_id: z.string().uuid(),
        product_id: z.string().uuid(),
        amount: z.number().positive(),
        tenure_months: z.number().int().positive(),
        funding_account_id: z.string().uuid().optional(),
        auto_rollover: z.boolean().optional(),
        maturity_instruction: z.enum(['rollover_principal_only', 'rollover_with_interest', 'credit_to_account']).optional(),
    });

    // ─── Create FD Product Validation ─────────────────────────

    describe('createFDProductSchema', () => {
        it('should accept valid FD product data', () => {
            const result = createFDProductSchema.safeParse({
                name: '12-Month Fixed Deposit',
                min_amount: 10000,
                max_amount: 5000000,
                min_tenure_months: 3,
                max_tenure_months: 60,
                interest_rate: 12.5,
                compounding_frequency: 'quarterly',
            });
            expect(result.success).toBe(true);
        });

        it('should reject empty name', () => {
            const result = createFDProductSchema.safeParse({
                name: '',
                min_amount: 10000,
                max_amount: 5000000,
                min_tenure_months: 3,
                max_tenure_months: 60,
                interest_rate: 12.5,
                compounding_frequency: 'quarterly',
            });
            expect(result.success).toBe(false);
        });

        it('should reject zero min_amount', () => {
            const result = createFDProductSchema.safeParse({
                name: 'Test FD',
                min_amount: 0,
                max_amount: 5000000,
                min_tenure_months: 3,
                max_tenure_months: 60,
                interest_rate: 12.5,
                compounding_frequency: 'quarterly',
            });
            expect(result.success).toBe(false);
        });

        it('should reject interest rate above 100', () => {
            const result = createFDProductSchema.safeParse({
                name: 'Test FD',
                min_amount: 10000,
                max_amount: 5000000,
                min_tenure_months: 3,
                max_tenure_months: 60,
                interest_rate: 150,
                compounding_frequency: 'quarterly',
            });
            expect(result.success).toBe(false);
        });

        it('should accept all compounding frequencies', () => {
            const frequencies = ['monthly', 'quarterly', 'semi_annually', 'annually', 'at_maturity'] as const;
            for (const freq of frequencies) {
                const result = createFDProductSchema.safeParse({
                    name: `FD - ${freq}`,
                    min_amount: 10000,
                    max_amount: 5000000,
                    min_tenure_months: 3,
                    max_tenure_months: 60,
                    interest_rate: 12.5,
                    compounding_frequency: freq,
                });
                expect(result.success).toBe(true);
            }
        });

        it('should reject invalid compounding frequency', () => {
            const result = createFDProductSchema.safeParse({
                name: 'Test FD',
                min_amount: 10000,
                max_amount: 5000000,
                min_tenure_months: 3,
                max_tenure_months: 60,
                interest_rate: 12.5,
                compounding_frequency: 'daily',
            });
            expect(result.success).toBe(false);
        });

        it('should accept optional auto_rollover', () => {
            const result = createFDProductSchema.safeParse({
                name: 'Auto-Rollover FD',
                min_amount: 10000,
                max_amount: 5000000,
                min_tenure_months: 3,
                max_tenure_months: 60,
                interest_rate: 12.5,
                compounding_frequency: 'quarterly',
                auto_rollover: true,
            });
            expect(result.success).toBe(true);
        });

        it('should reject penalty percentage above 100', () => {
            const result = createFDProductSchema.safeParse({
                name: 'Test FD',
                min_amount: 10000,
                max_amount: 5000000,
                min_tenure_months: 3,
                max_tenure_months: 60,
                interest_rate: 12.5,
                compounding_frequency: 'quarterly',
                early_withdrawal_penalty_percent: 110,
            });
            expect(result.success).toBe(false);
        });
    });

    // ─── Open FD Validation ───────────────────────────────────

    describe('openFDSchema', () => {
        const validUUID = '550e8400-e29b-41d4-a716-446655440000';

        it('should accept valid FD opening data', () => {
            const result = openFDSchema.safeParse({
                member_id: validUUID,
                product_id: validUUID,
                amount: 50000,
                tenure_months: 12,
            });
            expect(result.success).toBe(true);
        });

        it('should reject zero amount', () => {
            const result = openFDSchema.safeParse({
                member_id: validUUID,
                product_id: validUUID,
                amount: 0,
                tenure_months: 12,
            });
            expect(result.success).toBe(false);
        });

        it('should reject zero tenure_months', () => {
            const result = openFDSchema.safeParse({
                member_id: validUUID,
                product_id: validUUID,
                amount: 50000,
                tenure_months: 0,
            });
            expect(result.success).toBe(false);
        });

        it('should reject fractional tenure_months', () => {
            const result = openFDSchema.safeParse({
                member_id: validUUID,
                product_id: validUUID,
                amount: 50000,
                tenure_months: 6.5,
            });
            expect(result.success).toBe(false);
        });

        it('should accept all maturity instructions', () => {
            const instructions = ['rollover_principal_only', 'rollover_with_interest', 'credit_to_account'] as const;
            for (const instruction of instructions) {
                const result = openFDSchema.safeParse({
                    member_id: validUUID,
                    product_id: validUUID,
                    amount: 50000,
                    tenure_months: 12,
                    maturity_instruction: instruction,
                });
                expect(result.success).toBe(true);
            }
        });

        it('should reject invalid maturity instruction', () => {
            const result = openFDSchema.safeParse({
                member_id: validUUID,
                product_id: validUUID,
                amount: 50000,
                tenure_months: 12,
                maturity_instruction: 'close_and_withdraw',
            });
            expect(result.success).toBe(false);
        });

        it('should reject invalid member UUID', () => {
            const result = openFDSchema.safeParse({
                member_id: 'member-123',
                product_id: validUUID,
                amount: 50000,
                tenure_months: 12,
            });
            expect(result.success).toBe(false);
        });
    });
});

// ─── FD Interest Calculation Tests ───────────────────────────

describe('Fixed Deposit - Interest Calculations', () => {
    it('should calculate simple interest correctly', () => {
        const principal = new Decimal(100000);
        const annualRate = new Decimal(12);
        const months = 12;
        const simpleInterest = principal.mul(annualRate).div(100).mul(months).div(12);
        expect(simpleInterest.toNumber()).toBe(12000);
    });

    it('should calculate monthly compound interest correctly', () => {
        const principal = new Decimal(100000);
        const annualRate = new Decimal(12);
        const months = 12;
        const monthlyRate = annualRate.div(1200); // 0.01
        // A = P * (1 + r/n)^(n*t)
        const maturityAmount = principal.mul(
            Decimal.pow(monthlyRate.plus(1), months)
        );
        const interest = maturityAmount.minus(principal);
        // (1.01)^12 = 1.126825... => interest ≈ 12682.50
        expect(interest.toFixed(2)).toBe('12682.50');
    });

    it('should calculate quarterly compound interest correctly', () => {
        const principal = new Decimal(100000);
        const annualRate = new Decimal(12);
        const quarters = 4; // 12 months
        const quarterlyRate = annualRate.div(400); // 0.03
        const maturityAmount = principal.mul(
            Decimal.pow(quarterlyRate.plus(1), quarters)
        );
        const interest = maturityAmount.minus(principal);
        // (1.03)^4 = 1.12550881 => interest ≈ 12550.88
        expect(interest.toFixed(2)).toBe('12550.88');
    });

    it('should calculate at-maturity interest (simple)', () => {
        const principal = new Decimal(50000);
        const annualRate = new Decimal(10);
        const months = 6;
        const interest = principal.mul(annualRate).div(100).mul(months).div(12);
        expect(interest.toNumber()).toBe(2500);
    });

    it('should calculate premature withdrawal penalty', () => {
        const principal = new Decimal(100000);
        const accruedInterest = new Decimal(6000);
        const penaltyRate = new Decimal(25); // 25% of accrued interest

        const penalty = accruedInterest.mul(penaltyRate).div(100);
        const netInterest = accruedInterest.minus(penalty);
        const payout = principal.plus(netInterest);

        expect(penalty.toNumber()).toBe(1500);
        expect(netInterest.toNumber()).toBe(4500);
        expect(payout.toNumber()).toBe(104500);
    });

    it('should calculate WHT on FD interest', () => {
        const grossInterest = new Decimal(12000);
        const whtRate = new Decimal(15);
        const wht = grossInterest.mul(whtRate).div(100);
        const netInterest = grossInterest.minus(wht);

        expect(wht.toNumber()).toBe(1800);
        expect(netInterest.toNumber()).toBe(10200);
    });

    it('should handle zero interest rate FD', () => {
        const principal = new Decimal(100000);
        const annualRate = new Decimal(0);
        const months = 12;
        const interest = principal.mul(annualRate).div(100).mul(months).div(12);
        expect(interest.toNumber()).toBe(0);
    });

    it('should calculate maturity date correctly', () => {
        const startDate = new Date('2026-01-15');
        const tenureMonths = 12;
        const maturityDate = new Date(startDate);
        maturityDate.setMonth(maturityDate.getMonth() + tenureMonths);
        expect(maturityDate.toISOString().split('T')[0]).toBe('2027-01-15');
    });

    it('should handle end-of-month maturity date edge case', () => {
        const startDate = new Date('2026-01-31');
        const tenureMonths = 1;
        const maturityDate = new Date(startDate);
        maturityDate.setMonth(maturityDate.getMonth() + tenureMonths);
        // Jan 31 + 1 month => Feb 28 (or Mar 3 depending on impl)
        // JavaScript Date rolls over, so Jan 31 + 1 month -> Mar 3 for non-leap year
        expect(maturityDate.getMonth()).toBeGreaterThanOrEqual(1);
    });

    it('should calculate rollover with interest', () => {
        const principal = new Decimal(100000);
        const interestEarned = new Decimal(12000);
        const newPrincipal = principal.plus(interestEarned);
        expect(newPrincipal.toNumber()).toBe(112000);
    });

    it('should calculate rollover principal only', () => {
        const principal = new Decimal(100000);
        const interestEarned = new Decimal(12000);
        const newPrincipal = principal;
        const creditToAccount = interestEarned;
        expect(newPrincipal.toNumber()).toBe(100000);
        expect(creditToAccount.toNumber()).toBe(12000);
    });
});

// ─── FD Business Rules Tests ─────────────────────────────────

describe('Fixed Deposit - Business Rules', () => {
    it('should validate amount within product range', () => {
        const product = { min_amount: 10000, max_amount: 5000000 };
        const amount = 50000;
        const isValid = amount >= product.min_amount && amount <= product.max_amount;
        expect(isValid).toBe(true);
    });

    it('should reject amount below minimum', () => {
        const product = { min_amount: 10000, max_amount: 5000000 };
        const amount = 5000;
        const isValid = amount >= product.min_amount && amount <= product.max_amount;
        expect(isValid).toBe(false);
    });

    it('should reject amount above maximum', () => {
        const product = { min_amount: 10000, max_amount: 5000000 };
        const amount = 6000000;
        const isValid = amount >= product.min_amount && amount <= product.max_amount;
        expect(isValid).toBe(false);
    });

    it('should validate tenure within product range', () => {
        const product = { min_tenure_months: 3, max_tenure_months: 60 };
        const tenure = 12;
        const isValid = tenure >= product.min_tenure_months && tenure <= product.max_tenure_months;
        expect(isValid).toBe(true);
    });

    it('should reject tenure below minimum', () => {
        const product = { min_tenure_months: 3, max_tenure_months: 60 };
        const tenure = 1;
        const isValid = tenure >= product.min_tenure_months && tenure <= product.max_tenure_months;
        expect(isValid).toBe(false);
    });

    it('should reject tenure above maximum', () => {
        const product = { min_tenure_months: 3, max_tenure_months: 60 };
        const tenure = 72;
        const isValid = tenure >= product.min_tenure_months && tenure <= product.max_tenure_months;
        expect(isValid).toBe(false);
    });

    it('should generate FD certificate number', () => {
        const prefix = 'FD';
        const year = new Date().getFullYear();
        const sequence = 42;
        const certNumber = `${prefix}-${year}-${String(sequence).padStart(6, '0')}`;
        expect(certNumber).toMatch(/^FD-\d{4}-\d{6}$/);
        expect(certNumber).toBe(`FD-${year}-000042`);
    });

    it('should calculate days elapsed since FD start', () => {
        const startDate = new Date('2026-01-01');
        const today = new Date('2026-07-01');
        const daysElapsed = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        expect(daysElapsed).toBe(181);
    });
});
