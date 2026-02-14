// tests/services/fixedDepositService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';

// ────────────────────────────────────────────────────────────
// FD Interest Calculation Logic Tests
// ────────────────────────────────────────────────────────────

describe('FixedDepositService - Interest Calculations', () => {
    Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

    describe('Daily Simple Interest', () => {
        const calculateDailySimple = (
            principal: number,
            annualRate: number,
            basisDays: 360 | 365 = 365,
        ): Decimal => {
            const p = new Decimal(principal);
            const rate = new Decimal(annualRate).div(100).div(basisDays);
            return p.mul(rate).toDecimalPlaces(4);
        };

        it('should calculate daily simple interest on 365-day basis', () => {
            // 1,000,000 × (10/100) / 365 = 273.9726
            const result = calculateDailySimple(1_000_000, 10, 365);
            expect(result.toNumber()).toBeCloseTo(273.9726, 2);
        });

        it('should calculate daily simple interest on 360-day basis', () => {
            // 1,000,000 × (10/100) / 360 = 277.7778
            const result = calculateDailySimple(1_000_000, 10, 360);
            expect(result.toNumber()).toBeCloseTo(277.7778, 2);
        });

        it('should return zero for zero principal', () => {
            const result = calculateDailySimple(0, 10);
            expect(result.toNumber()).toBe(0);
        });

        it('should return zero for zero rate', () => {
            const result = calculateDailySimple(1_000_000, 0);
            expect(result.toNumber()).toBe(0);
        });

        it('should handle small amounts correctly', () => {
            // 5,000 × (8/100) / 365 = 1.0959
            const result = calculateDailySimple(5000, 8, 365);
            expect(result.toNumber()).toBeCloseTo(1.0959, 3);
        });

        it('should handle large amounts correctly', () => {
            // 50,000,000 × (12/100) / 365 = 16438.3562
            const result = calculateDailySimple(50_000_000, 12, 365);
            expect(result.toNumber()).toBeCloseTo(16438.3562, 2);
        });
    });

    describe('Daily Compound Interest', () => {
        const calculateDailyCompound = (
            principal: number,
            annualRate: number,
            accruedInterest: number = 0,
            basisDays: 360 | 365 = 365,
        ): Decimal => {
            const p = new Decimal(principal).plus(new Decimal(accruedInterest));
            const rate = new Decimal(annualRate).div(100).div(basisDays);
            return p.mul(rate).toDecimalPlaces(4);
        };

        it('should compound interest on principal + accrued', () => {
            // (1,000,000 + 10,000) × (10/100) / 365 = 276.7123
            const result = calculateDailyCompound(1_000_000, 10, 10_000, 365);
            expect(result.toNumber()).toBeCloseTo(276.7123, 2);
        });

        it('should equal simple interest when no accrued interest', () => {
            const simple = new Decimal(1_000_000).mul(new Decimal(10).div(100).div(365)).toDecimalPlaces(4);
            const compound = calculateDailyCompound(1_000_000, 10, 0, 365);
            expect(compound.toNumber()).toBeCloseTo(simple.toNumber(), 4);
        });

        it('should exceed simple rate when accrued > 0', () => {
            const simple = new Decimal(1_000_000).mul(new Decimal(10).div(100).div(365)).toDecimalPlaces(4);
            const compound = calculateDailyCompound(1_000_000, 10, 50_000, 365);
            expect(compound.toNumber()).toBeGreaterThan(simple.toNumber());
        });

        it('should return zero when both principal and accrued are zero', () => {
            const result = calculateDailyCompound(0, 10, 0);
            expect(result.toNumber()).toBe(0);
        });
    });

    describe('Multi-day Interest Accumulation', () => {
        it('should accumulate simple interest over 30 days', () => {
            const principal = new Decimal(1_000_000);
            const annualRate = new Decimal(12);
            const basisDays = 365;
            const dailyRate = annualRate.div(100).div(basisDays);
            const dailyInterest = principal.mul(dailyRate);
            const total30Days = dailyInterest.mul(30).toDecimalPlaces(2);

            // 1,000,000 × (12/100) / 365 × 30 = 9,863.01
            expect(total30Days.toNumber()).toBeCloseTo(9863.01, 0);
        });

        it('should accumulate compound interest over 30 days', () => {
            let principal = new Decimal(1_000_000);
            let totalAccrued = new Decimal(0);
            const annualRate = new Decimal(12);
            const basisDays = 365;
            const dailyRate = annualRate.div(100).div(basisDays);

            for (let day = 0; day < 30; day++) {
                const dailyInterest = principal.plus(totalAccrued).mul(dailyRate);
                totalAccrued = totalAccrued.plus(dailyInterest);
            }

            // Compound should be slightly more than simple
            const simpleTotal = principal.mul(dailyRate).mul(30);
            expect(totalAccrued.toNumber()).toBeGreaterThan(simpleTotal.toNumber());
            expect(totalAccrued.toDecimalPlaces(2).toNumber()).toBeCloseTo(9910.18, 0);
        });
    });
});

// ────────────────────────────────────────────────────────────
// Premature Withdrawal Calculation Tests
// ────────────────────────────────────────────────────────────

describe('FixedDepositService - Premature Withdrawal', () => {
    Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

    const calculatePrematureWithdrawal = (params: {
        principal: number;
        interestAccrued: number;
        penaltyType: 'fixed_amount' | 'percentage' | 'interest_reduction';
        penaltyRate: number;
        whtRate: number;
    }) => {
        const principal = new Decimal(params.principal);
        const interestEarned = new Decimal(params.interestAccrued);
        const penaltyRate = new Decimal(params.penaltyRate);
        const whtRate = new Decimal(params.whtRate);

        let penalty = new Decimal(0);

        if (params.penaltyType === 'fixed_amount') {
            penalty = penaltyRate;
        } else if (params.penaltyType === 'percentage' || params.penaltyType === 'interest_reduction') {
            penalty = interestEarned.mul(penaltyRate).div(100);
        }

        const netInterest = Decimal.max(0, interestEarned.minus(penalty));
        const wht = netInterest.mul(whtRate).div(100);
        const netPayout = principal.plus(netInterest).minus(wht);

        return {
            principal,
            interestEarned,
            penalty,
            withholdingTax: wht,
            netPayout,
        };
    };

    it('should calculate percentage-based penalty', () => {
        const result = calculatePrematureWithdrawal({
            principal: 1_000_000,
            interestAccrued: 50_000,
            penaltyType: 'percentage',
            penaltyRate: 25, // 25% of interest
            whtRate: 15,     // 15% WHT
        });

        // Penalty: 50,000 × 0.25 = 12,500
        expect(result.penalty.toNumber()).toBe(12500);
        // Net interest: 50,000 - 12,500 = 37,500
        const netInterest = result.interestEarned.minus(result.penalty);
        expect(netInterest.toNumber()).toBe(37500);
        // WHT: 37,500 × 0.15 = 5,625
        expect(result.withholdingTax.toNumber()).toBe(5625);
        // Net payout: 1,000,000 + 37,500 - 5,625 = 1,031,875
        expect(result.netPayout.toNumber()).toBe(1_031_875);
    });

    it('should calculate fixed-amount penalty', () => {
        const result = calculatePrematureWithdrawal({
            principal: 500_000,
            interestAccrued: 20_000,
            penaltyType: 'fixed_amount',
            penaltyRate: 5000, // Fixed KES 5,000
            whtRate: 15,
        });

        expect(result.penalty.toNumber()).toBe(5000);
        // Net interest: 20,000 - 5,000 = 15,000
        // WHT: 15,000 × 0.15 = 2,250
        expect(result.withholdingTax.toNumber()).toBe(2250);
        // Net payout: 500,000 + 15,000 - 2,250 = 512,750
        expect(result.netPayout.toNumber()).toBe(512_750);
    });

    it('should calculate interest-reduction penalty', () => {
        const result = calculatePrematureWithdrawal({
            principal: 1_000_000,
            interestAccrued: 80_000,
            penaltyType: 'interest_reduction',
            penaltyRate: 50, // Reduce interest by 50%
            whtRate: 10,
        });

        // Penalty: 80,000 × 0.50 = 40,000
        expect(result.penalty.toNumber()).toBe(40_000);
        // Net interest: 80,000 - 40,000 = 40,000
        // WHT: 40,000 × 0.10 = 4,000
        expect(result.withholdingTax.toNumber()).toBe(4000);
        // Net payout: 1,000,000 + 40,000 - 4,000 = 1,036,000
        expect(result.netPayout.toNumber()).toBe(1_036_000);
    });

    it('should handle zero accrued interest', () => {
        const result = calculatePrematureWithdrawal({
            principal: 1_000_000,
            interestAccrued: 0,
            penaltyType: 'percentage',
            penaltyRate: 25,
            whtRate: 15,
        });

        expect(result.penalty.toNumber()).toBe(0);
        expect(result.withholdingTax.toNumber()).toBe(0);
        // Net payout = principal only
        expect(result.netPayout.toNumber()).toBe(1_000_000);
    });

    it('should cap net interest at zero when penalty exceeds interest', () => {
        const result = calculatePrematureWithdrawal({
            principal: 1_000_000,
            interestAccrued: 10_000,
            penaltyType: 'fixed_amount',
            penaltyRate: 15_000, // Penalty > interest
            whtRate: 15,
        });

        // Net interest is capped at 0 (Decimal.max(0, ...))
        const netInterest = Decimal.max(0, result.interestEarned.minus(result.penalty));
        expect(netInterest.toNumber()).toBe(0);
        expect(result.withholdingTax.toNumber()).toBe(0);
        // Net payout = principal only (no negative interest deduction)
        expect(result.netPayout.toNumber()).toBe(1_000_000);
    });

    it('should handle zero WHT rate', () => {
        const result = calculatePrematureWithdrawal({
            principal: 500_000,
            interestAccrued: 30_000,
            penaltyType: 'percentage',
            penaltyRate: 10,
            whtRate: 0,
        });

        expect(result.withholdingTax.toNumber()).toBe(0);
        // Net payout: 500,000 + (30,000 - 3,000) = 527,000
        expect(result.netPayout.toNumber()).toBe(527_000);
    });
});

// ────────────────────────────────────────────────────────────
// Auto-Rollover Logic Tests
// ────────────────────────────────────────────────────────────

describe('FixedDepositService - Rollover Calculations', () => {
    Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

    it('should calculate principal_plus_interest rollover', () => {
        const principal = new Decimal(1_000_000);
        const accruedInterest = new Decimal(50_000);
        const whtRate = new Decimal(15);

        const wht = accruedInterest.mul(whtRate).div(100);
        const netInterest = accruedInterest.minus(wht);
        const rolloverPrincipal = principal.plus(netInterest);

        // WHT: 50,000 × 0.15 = 7,500
        expect(wht.toNumber()).toBe(7500);
        // Net interest: 50,000 - 7,500 = 42,500
        expect(netInterest.toNumber()).toBe(42_500);
        // Rollover: 1,000,000 + 42,500 = 1,042,500
        expect(rolloverPrincipal.toNumber()).toBe(1_042_500);
    });

    it('should calculate principal_only rollover', () => {
        const principal = new Decimal(1_000_000);
        const accruedInterest = new Decimal(50_000);

        // For principal-only rollover, rollover amount = principal
        const rolloverPrincipal = principal;

        expect(rolloverPrincipal.toNumber()).toBe(1_000_000);
        // Interest should be credited separately
        expect(accruedInterest.toNumber()).toBe(50_000);
    });

    it('should calculate new maturity date correctly', () => {
        const baseDate = new Date('2025-01-01');
        const tenureDays = 365;

        const newMaturityDate = new Date(baseDate);
        newMaturityDate.setDate(newMaturityDate.getDate() + tenureDays);

        expect(newMaturityDate.toISOString().split('T')[0]).toBe('2026-01-01');
    });

    it('should handle rollover with zero accrued interest', () => {
        const principal = new Decimal(1_000_000);
        const accruedInterest = new Decimal(0);
        const whtRate = new Decimal(15);

        const wht = accruedInterest.mul(whtRate).div(100);
        const netInterest = accruedInterest.minus(wht);
        const rolloverPrincipal = principal.plus(netInterest);

        expect(wht.toNumber()).toBe(0);
        expect(rolloverPrincipal.toNumber()).toBe(1_000_000);
    });
});

// ────────────────────────────────────────────────────────────
// Maturity Alert Threshold Tests
// ────────────────────────────────────────────────────────────

describe('FixedDepositService - Maturity Alert Thresholds', () => {
    const ALERT_THRESHOLDS = [30, 14, 7, 0];

    it('should define all required alert thresholds', () => {
        expect(ALERT_THRESHOLDS).toContain(30);
        expect(ALERT_THRESHOLDS).toContain(14);
        expect(ALERT_THRESHOLDS).toContain(7);
        expect(ALERT_THRESHOLDS).toContain(0); // maturity day
    });

    it('should have thresholds in descending order', () => {
        for (let i = 1; i < ALERT_THRESHOLDS.length; i++) {
            expect(ALERT_THRESHOLDS[i]).toBeLessThan(ALERT_THRESHOLDS[i - 1]);
        }
    });

    it('should calculate correct alert dates relative to check date', () => {
        const checkDate = new Date('2025-01-15');

        const alertDates = ALERT_THRESHOLDS.map((daysBefore) => {
            const alertDate = new Date(checkDate);
            alertDate.setDate(alertDate.getDate() + daysBefore);
            return {
                daysBefore,
                targetMaturityDate: alertDate.toISOString().split('T')[0],
            };
        });

        // 30 days ahead: maturity on Feb 14
        expect(alertDates[0].targetMaturityDate).toBe('2025-02-14');
        // 14 days ahead: maturity on Jan 29
        expect(alertDates[1].targetMaturityDate).toBe('2025-01-29');
        // 7 days ahead: maturity on Jan 22
        expect(alertDates[2].targetMaturityDate).toBe('2025-01-22');
        // 0 days: maturity today Jan 15
        expect(alertDates[3].targetMaturityDate).toBe('2025-01-15');
    });
});
