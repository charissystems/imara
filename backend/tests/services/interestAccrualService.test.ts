// tests/services/interestAccrualService.test.ts
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { InterestCalculator } from '../../src/services/interestAccrualService';

describe('InterestCalculator', () => {
    // ──────────────────────────────────────────────
    // Daily Simple Interest
    // ──────────────────────────────────────────────

    describe('dailySimple', () => {
        it('should calculate daily interest on 365-day basis', () => {
            // 1,000,000 × (12/100) / 365 = 328.7671
            const result = InterestCalculator.dailySimple(1_000_000, 12, '365_days');
            expect(result.toNumber()).toBeCloseTo(328.7671, 2);
        });

        it('should calculate daily interest on 360-day basis', () => {
            // 1,000,000 × (12/100) / 360 = 333.3333
            const result = InterestCalculator.dailySimple(1_000_000, 12, '360_days');
            expect(result.toNumber()).toBeCloseTo(333.3333, 2);
        });

        it('should return zero for zero balance', () => {
            const result = InterestCalculator.dailySimple(0, 12);
            expect(result.toNumber()).toBe(0);
        });

        it('should return zero for zero rate', () => {
            const result = InterestCalculator.dailySimple(1_000_000, 0);
            expect(result.toNumber()).toBe(0);
        });

        it('should return zero for negative balance', () => {
            const result = InterestCalculator.dailySimple(-100_000, 12);
            expect(result.toNumber()).toBe(0);
        });
    });

    // ──────────────────────────────────────────────
    // Daily Compound Interest
    // ──────────────────────────────────────────────

    describe('dailyCompound', () => {
        it('should calculate daily compound interest', () => {
            const result = InterestCalculator.dailyCompound(1_000_000, 12, '365_days');
            // Should be very close to simple for one day
            expect(result.toNumber()).toBeCloseTo(310.8, 0);
        });

        it('should be slightly less than simple interest on single day', () => {
            const simple = InterestCalculator.dailySimple(1_000_000, 12, '365_days');
            const compound = InterestCalculator.dailyCompound(1_000_000, 12, '365_days');
            // Daily compound rate for small r is slightly less than r/365
            expect(compound.toNumber()).toBeLessThan(simple.toNumber());
        });

        it('should return zero for zero balance', () => {
            const result = InterestCalculator.dailyCompound(0, 12);
            expect(result.toNumber()).toBe(0);
        });
    });

    // ──────────────────────────────────────────────
    // Period Interest
    // ──────────────────────────────────────────────

    describe('forPeriod', () => {
        it('should compute simple interest for 30 days', () => {
            // 1,000,000 × (12/100) × (30/365) = 9,863.01
            const result = InterestCalculator.forPeriod(1_000_000, 12, 30, 'simple', '365_days');
            expect(result.toNumber()).toBeCloseTo(9_863.01, 0);
        });

        it('should compute compound interest for 365 days = annual rate', () => {
            // 1,000,000 × ((1+0.12)^1 - 1) = 120,000
            const result = InterestCalculator.forPeriod(1_000_000, 12, 365, 'compound', '365_days');
            expect(result.toNumber()).toBeCloseTo(120_000, 0);
        });

        it('should return zero for zero days', () => {
            const result = InterestCalculator.forPeriod(1_000_000, 12, 0);
            expect(result.toNumber()).toBe(0);
        });
    });

    // ──────────────────────────────────────────────
    // Tiered Interest
    // ──────────────────────────────────────────────

    describe('dailyTiered', () => {
        const tiers = [
            { minBalance: 0, maxBalance: 100_000, annualRate: 3 },
            { minBalance: 100_001, maxBalance: 500_000, annualRate: 5 },
            { minBalance: 500_001, maxBalance: 999_999_999, annualRate: 7 },
        ];

        it('should apply bottom tier rate for small balance', () => {
            const result = InterestCalculator.dailyTiered(50_000, tiers);
            const expected = InterestCalculator.dailySimple(50_000, 3);
            expect(result.toNumber()).toBeCloseTo(expected.toNumber(), 4);
        });

        it('should apply middle tier for mid-range balance', () => {
            const result = InterestCalculator.dailyTiered(200_000, tiers);
            const expected = InterestCalculator.dailySimple(200_000, 5);
            expect(result.toNumber()).toBeCloseTo(expected.toNumber(), 4);
        });

        it('should apply top tier for large balance', () => {
            const result = InterestCalculator.dailyTiered(1_000_000, tiers);
            const expected = InterestCalculator.dailySimple(1_000_000, 7);
            expect(result.toNumber()).toBeCloseTo(expected.toNumber(), 4);
        });

        it('should return zero for zero balance', () => {
            const result = InterestCalculator.dailyTiered(0, tiers);
            expect(result.toNumber()).toBe(0);
        });

        it('should return zero for empty tiers', () => {
            const result = InterestCalculator.dailyTiered(100_000, []);
            expect(result.toNumber()).toBe(0);
        });
    });

    // ──────────────────────────────────────────────
    // Next Posting Date
    // ──────────────────────────────────────────────

    describe('nextPostingDate', () => {
        it('monthly: should return 1st of next month', () => {
            const from = new Date('2025-03-15');
            const next = InterestCalculator.nextPostingDate('monthly', from);
            expect(next.getMonth()).toBe(3); // April
            expect(next.getDate()).toBe(1);
        });

        it('quarterly: should return 1st of next quarter', () => {
            const from = new Date('2025-02-10');
            const next = InterestCalculator.nextPostingDate('quarterly', from);
            expect(next.getMonth()).toBe(3); // April (Q2 start)
            expect(next.getDate()).toBe(1);
        });

        it('annually: should return Jan 1 next year', () => {
            const from = new Date('2025-06-15');
            const next = InterestCalculator.nextPostingDate('annually', from);
            expect(next.getFullYear()).toBe(2026);
            expect(next.getMonth()).toBe(0);
            expect(next.getDate()).toBe(1);
        });

        it('on_withdrawal: should return far future date', () => {
            const next = InterestCalculator.nextPostingDate('on_withdrawal');
            expect(next.getFullYear()).toBe(9999);
        });
    });

    // ──────────────────────────────────────────────
    // Withholding Tax
    // ──────────────────────────────────────────────

    describe('withholdingTax', () => {
        it('should compute 20% tax on interest', () => {
            const tax = InterestCalculator.withholdingTax(10_000, 0.20);
            expect(tax.toNumber()).toBe(2_000);
        });

        it('should compute custom tax rate', () => {
            const tax = InterestCalculator.withholdingTax(10_000, 0.15);
            expect(tax.toNumber()).toBe(1_500);
        });
    });

    // ──────────────────────────────────────────────
    // Financial precision
    // ──────────────────────────────────────────────

    describe('precision', () => {
        it('should avoid floating-point errors', () => {
            // JavaScript: 0.1 + 0.2 = 0.30000000000000004
            // Decimal.js should give exactly 0.3
            const a = new Decimal('0.1');
            const b = new Decimal('0.2');
            expect(a.plus(b).toString()).toBe('0.3');
        });

        it('interest calculation should be precise for edge amounts', () => {
            // 333.33 balance × 5.75% / 365 = 0.0525 per day
            const result = InterestCalculator.dailySimple('333.33', '5.75', '365_days');
            // 333.33 × 0.0575 / 365 = 0.05250...
            expect(result.toNumber()).toBeGreaterThan(0);
            expect(result.toNumber()).toBeLessThan(1);
        });
    });
});
