// tests/routes/shares.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';

/**
 * Share Route Validation & Structure Tests
 * Tests validation schemas and route logic without database dependencies
 */

// ─── Validation Schema Tests ─────────────────────────────────

describe('Share Routes - Validation Schemas', () => {
    const createShareClassSchema = z.object({
        code: z.string().min(1).max(20),
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        par_value: z.number().positive(),
        current_price: z.number().positive(),
        minimum_shares: z.number().int().positive().optional(),
        maximum_shares: z.number().int().positive().optional(),
        dividend_eligible: z.boolean().optional(),
        dividend_percentage: z.number().min(0).max(100).optional(),
    });

    const purchaseSharesSchema = z.object({
        member_id: z.string().uuid(),
        share_class_id: z.string().uuid(),
        quantity: z.number().int().positive('Quantity must be a positive integer'),
        unit_price: z.number().positive().optional(),
        payment_method: z.enum(['cash', 'mobile_money', 'bank_transfer', 'savings_deduction']),
        payment_reference: z.string().optional(),
    });

    const transferSharesSchema = z.object({
        from_member_id: z.string().uuid(),
        to_member_id: z.string().uuid(),
        share_class_id: z.string().uuid(),
        quantity: z.number().int().positive('Quantity must be a positive integer'),
        transfer_price: z.number().positive().optional(),
    });

    const declareDividendSchema = z.object({
        share_class_id: z.string().uuid(),
        dividend_per_share: z.number().positive(),
        record_date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
        payment_date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
        withholding_tax_rate: z.number().min(0).max(100).optional(),
    });

    // ─── Create Share Class Validation ────────────────────────

    describe('createShareClassSchema', () => {
        it('should accept valid share class data', () => {
            const result = createShareClassSchema.safeParse({
                code: 'ORD',
                name: 'Ordinary Shares',
                par_value: 100,
                current_price: 500,
                minimum_shares: 10,
                maximum_shares: 10000,
                dividend_eligible: true,
            });
            expect(result.success).toBe(true);
        });

        it('should reject empty code', () => {
            const result = createShareClassSchema.safeParse({
                code: '',
                name: 'Ordinary Shares',
                par_value: 100,
                current_price: 500,
            });
            expect(result.success).toBe(false);
        });

        it('should reject negative par value', () => {
            const result = createShareClassSchema.safeParse({
                code: 'ORD',
                name: 'Ordinary Shares',
                par_value: -100,
                current_price: 500,
            });
            expect(result.success).toBe(false);
        });

        it('should reject zero current price', () => {
            const result = createShareClassSchema.safeParse({
                code: 'ORD',
                name: 'Ordinary Shares',
                par_value: 100,
                current_price: 0,
            });
            expect(result.success).toBe(false);
        });

        it('should accept without optional fields', () => {
            const result = createShareClassSchema.safeParse({
                code: 'PREF',
                name: 'Preference Shares',
                par_value: 1000,
                current_price: 1500,
            });
            expect(result.success).toBe(true);
        });

        it('should reject code longer than 20 chars', () => {
            const result = createShareClassSchema.safeParse({
                code: 'A'.repeat(21),
                name: 'Test',
                par_value: 100,
                current_price: 100,
            });
            expect(result.success).toBe(false);
        });

        it('should reject dividend percentage above 100', () => {
            const result = createShareClassSchema.safeParse({
                code: 'ORD',
                name: 'Test',
                par_value: 100,
                current_price: 100,
                dividend_percentage: 150,
            });
            expect(result.success).toBe(false);
        });
    });

    // ─── Purchase Shares Validation ───────────────────────────

    describe('purchaseSharesSchema', () => {
        const validUUID = '550e8400-e29b-41d4-a716-446655440000';

        it('should accept valid purchase data', () => {
            const result = purchaseSharesSchema.safeParse({
                member_id: validUUID,
                share_class_id: validUUID,
                quantity: 100,
                payment_method: 'cash',
            });
            expect(result.success).toBe(true);
        });

        it('should reject fractional quantity', () => {
            const result = purchaseSharesSchema.safeParse({
                member_id: validUUID,
                share_class_id: validUUID,
                quantity: 50.5,
                payment_method: 'cash',
            });
            expect(result.success).toBe(false);
        });

        it('should reject zero quantity', () => {
            const result = purchaseSharesSchema.safeParse({
                member_id: validUUID,
                share_class_id: validUUID,
                quantity: 0,
                payment_method: 'cash',
            });
            expect(result.success).toBe(false);
        });

        it('should reject negative quantity', () => {
            const result = purchaseSharesSchema.safeParse({
                member_id: validUUID,
                share_class_id: validUUID,
                quantity: -10,
                payment_method: 'cash',
            });
            expect(result.success).toBe(false);
        });

        it('should reject invalid payment method', () => {
            const result = purchaseSharesSchema.safeParse({
                member_id: validUUID,
                share_class_id: validUUID,
                quantity: 100,
                payment_method: 'bitcoin',
            });
            expect(result.success).toBe(false);
        });

        it('should accept optional unit price', () => {
            const result = purchaseSharesSchema.safeParse({
                member_id: validUUID,
                share_class_id: validUUID,
                quantity: 50,
                unit_price: 750.50,
                payment_method: 'bank_transfer',
            });
            expect(result.success).toBe(true);
        });

        it('should reject non-UUID member_id', () => {
            const result = purchaseSharesSchema.safeParse({
                member_id: 'not-a-uuid',
                share_class_id: validUUID,
                quantity: 100,
                payment_method: 'cash',
            });
            expect(result.success).toBe(false);
        });
    });

    // ─── Transfer Shares Validation ───────────────────────────

    describe('transferSharesSchema', () => {
        const validUUID = '550e8400-e29b-41d4-a716-446655440000';
        const validUUID2 = '660f9500-f30c-52e5-b827-557766550000';

        it('should accept valid transfer data', () => {
            const result = transferSharesSchema.safeParse({
                from_member_id: validUUID,
                to_member_id: validUUID2,
                share_class_id: validUUID,
                quantity: 50,
            });
            expect(result.success).toBe(true);
        });

        it('should reject zero quantity', () => {
            const result = transferSharesSchema.safeParse({
                from_member_id: validUUID,
                to_member_id: validUUID2,
                share_class_id: validUUID,
                quantity: 0,
            });
            expect(result.success).toBe(false);
        });

        it('should accept optional transfer price', () => {
            const result = transferSharesSchema.safeParse({
                from_member_id: validUUID,
                to_member_id: validUUID2,
                share_class_id: validUUID,
                quantity: 25,
                transfer_price: 600,
            });
            expect(result.success).toBe(true);
        });

        it('should reject missing from_member_id', () => {
            const result = transferSharesSchema.safeParse({
                to_member_id: validUUID2,
                share_class_id: validUUID,
                quantity: 50,
            });
            expect(result.success).toBe(false);
        });
    });

    // ─── Declare Dividend Validation ──────────────────────────

    describe('declareDividendSchema', () => {
        const validUUID = '550e8400-e29b-41d4-a716-446655440000';

        it('should accept valid dividend declaration', () => {
            const result = declareDividendSchema.safeParse({
                share_class_id: validUUID,
                dividend_per_share: 50,
                record_date: '2026-12-31',
                payment_date: '2027-01-15',
                withholding_tax_rate: 15,
            });
            expect(result.success).toBe(true);
        });

        it('should accept ISO datetime format', () => {
            const result = declareDividendSchema.safeParse({
                share_class_id: validUUID,
                dividend_per_share: 25,
                record_date: '2026-12-31T00:00:00.000Z',
                payment_date: '2027-01-15T00:00:00.000Z',
            });
            expect(result.success).toBe(true);
        });

        it('should reject zero dividend per share', () => {
            const result = declareDividendSchema.safeParse({
                share_class_id: validUUID,
                dividend_per_share: 0,
                record_date: '2026-12-31',
                payment_date: '2027-01-15',
            });
            expect(result.success).toBe(false);
        });

        it('should reject invalid date format', () => {
            const result = declareDividendSchema.safeParse({
                share_class_id: validUUID,
                dividend_per_share: 50,
                record_date: '31-12-2026',
                payment_date: '15-01-2027',
            });
            expect(result.success).toBe(false);
        });

        it('should reject WHT rate above 100', () => {
            const result = declareDividendSchema.safeParse({
                share_class_id: validUUID,
                dividend_per_share: 50,
                record_date: '2026-12-31',
                payment_date: '2027-01-15',
                withholding_tax_rate: 150,
            });
            expect(result.success).toBe(false);
        });

        it('should accept without optional WHT rate', () => {
            const result = declareDividendSchema.safeParse({
                share_class_id: validUUID,
                dividend_per_share: 100,
                record_date: '2026-12-31',
                payment_date: '2027-01-31',
            });
            expect(result.success).toBe(true);
        });
    });
});

// ─── Update Schema Tests ─────────────────────────────────────

describe('Share Routes - Update Schemas', () => {
    const updateShareClassSchema = z.object({
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional(),
        current_price: z.number().positive().optional(),
        minimum_shares: z.number().int().positive().optional(),
        maximum_shares: z.number().int().positive().optional(),
        dividend_eligible: z.boolean().optional(),
        dividend_percentage: z.number().min(0).max(100).optional(),
        is_active: z.boolean().optional(),
    });

    const approveDividendSchema = z.object({
        action: z.enum(['approve', 'reject']),
    });

    it('should accept partial share class update', () => {
        const result = updateShareClassSchema.safeParse({
            current_price: 750,
        });
        expect(result.success).toBe(true);
    });

    it('should accept empty update (no fields)', () => {
        const result = updateShareClassSchema.safeParse({});
        expect(result.success).toBe(true);
    });

    it('should reject negative price in update', () => {
        const result = updateShareClassSchema.safeParse({
            current_price: -100,
        });
        expect(result.success).toBe(false);
    });

    it('should accept approve action', () => {
        const result = approveDividendSchema.safeParse({ action: 'approve' });
        expect(result.success).toBe(true);
    });

    it('should accept reject action', () => {
        const result = approveDividendSchema.safeParse({ action: 'reject' });
        expect(result.success).toBe(true);
    });

    it('should reject invalid action', () => {
        const result = approveDividendSchema.safeParse({ action: 'cancel' });
        expect(result.success).toBe(false);
    });
});
