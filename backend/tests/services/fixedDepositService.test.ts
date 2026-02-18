// tests/services/fixedDepositService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { FixedDepositService } from '../../src/services/fixedDepositService';

// ────────────────────────────────────────────────────────────
// Mock DB Builder
// ────────────────────────────────────────────────────────────

function createMockQueryBuilder(rows: any[] = []) {
    const builder: any = {
        selectAll: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(rows),
        executeTakeFirst: vi.fn().mockResolvedValue(rows[0] ?? undefined),
        returning: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
    };
    return builder;
}

function createMockDb(overrides: Record<string, any> = {}) {
    const insertBuilder = {
        values: vi.fn().mockReturnValue({
            returning: vi.fn().mockReturnValue({
                execute: vi.fn().mockResolvedValue(overrides.insertRows || [{ id: 'new-id' }]),
            }),
            execute: vi.fn().mockResolvedValue([]),
        }),
    };

    const updateBuilder = {
        set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
                execute: vi.fn().mockResolvedValue([]),
            }),
        }),
    };

    const mockDb: any = {
        selectFrom: vi.fn().mockReturnValue(createMockQueryBuilder(overrides.selectRows || [])),
        insertInto: vi.fn().mockReturnValue(insertBuilder),
        updateTable: vi.fn().mockReturnValue(updateBuilder),
        transaction: vi.fn().mockReturnValue({
            execute: vi.fn().mockImplementation(async (fn: any) => {
                // The transaction callback receives a trx that behaves like the db
                const trxQueryBuilder = createMockQueryBuilder(overrides.selectRows || []);
                // Add forUpdate support for SELECT ... FOR UPDATE inside transactions
                trxQueryBuilder.forUpdate = vi.fn().mockReturnThis();
                const trx: any = {
                    selectFrom: vi.fn().mockReturnValue(trxQueryBuilder),
                    insertInto: vi.fn().mockReturnValue(insertBuilder),
                    updateTable: vi.fn().mockReturnValue(updateBuilder),
                };
                return fn(trx);
            }),
        }),
    };

    return mockDb;
}

// ────────────────────────────────────────────────────────────
// Actual Service Tests
// ────────────────────────────────────────────────────────────

describe('FixedDepositService - runMaturityCheck', () => {
    it('should return empty result when no deposits to process', async () => {
        const mockDb = createMockDb({ selectRows: [] });
        const service = new FixedDepositService(mockDb);

        const result = await service.runMaturityCheck(new Date('2026-03-01'));

        expect(result.alertsSent).toBe(0);
        expect(result.depositsMatured).toBe(0);
        expect(result.depositsRolledOver).toBe(0);
        expect(result.errors).toHaveLength(0);
    });
});

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

// ────────────────────────────────────────────────────────────
// runDailyInterestAccrual — via mock DB
// ────────────────────────────────────────────────────────────

describe('FixedDepositService - runDailyInterestAccrual', () => {
    it('should return empty result when no active deposits', async () => {
        const mockDb = createMockDb({ selectRows: [] });
        const service = new FixedDepositService(mockDb);

        const result = await service.runDailyInterestAccrual(new Date('2026-03-01'));

        expect(result.depositsProcessed).toBe(0);
        expect(result.totalInterestAccrued.toNumber()).toBe(0);
        expect(result.errors).toHaveLength(0);
    });

    it('should accrue simple interest for active deposits', async () => {
        const deposits = [
            {
                deposit_id: 'fd-1',
                principal_amount: '1000000',
                interest_rate: '10',
                interest_accrued: '0',
                deposit_date: '2026-01-01',
                maturity_date: '2027-01-01',
                interest_calculation_method: 'simple',
                calculation_basis: '365_days',
            },
        ];

        const mockDb = createMockDb({ selectRows: deposits });
        const service = new FixedDepositService(mockDb);

        const result = await service.runDailyInterestAccrual(new Date('2026-03-01'));

        expect(result.depositsProcessed).toBe(1);
        // Daily simple: 1,000,000 * (10/100) / 365 ≈ 273.9726
        expect(result.totalInterestAccrued.toNumber()).toBeCloseTo(273.9726, 2);
    });

    it('should accrue compound interest (on principal + accrued)', async () => {
        const deposits = [
            {
                deposit_id: 'fd-1',
                principal_amount: '1000000',
                interest_rate: '10',
                interest_accrued: '5000',
                deposit_date: '2026-01-01',
                maturity_date: '2027-01-01',
                interest_calculation_method: 'compound',
                calculation_basis: '365_days',
            },
        ];

        const mockDb = createMockDb({ selectRows: deposits });
        const service = new FixedDepositService(mockDb);

        const result = await service.runDailyInterestAccrual(new Date('2026-03-01'));

        expect(result.depositsProcessed).toBe(1);
        // Compound: (1,000,000 + 5,000) * (10/100) / 365 ≈ 275.3425
        expect(result.totalInterestAccrued.toNumber()).toBeCloseTo(275.3425, 2);
    });

    it('should use 360-day basis when configured', async () => {
        const deposits = [
            {
                deposit_id: 'fd-1',
                principal_amount: '1000000',
                interest_rate: '10',
                interest_accrued: '0',
                deposit_date: '2026-01-01',
                maturity_date: '2027-01-01',
                interest_calculation_method: 'simple',
                calculation_basis: '360_days',
            },
        ];

        const mockDb = createMockDb({ selectRows: deposits });
        const service = new FixedDepositService(mockDb);

        const result = await service.runDailyInterestAccrual(new Date('2026-03-01'));

        expect(result.depositsProcessed).toBe(1);
        // 1,000,000 * (10/100) / 360 ≈ 277.7778
        expect(result.totalInterestAccrued.toNumber()).toBeCloseTo(277.7778, 2);
    });

    it('should aggregate interest for multiple deposits', async () => {
        const deposits = [
            {
                deposit_id: 'fd-1',
                principal_amount: '500000',
                interest_rate: '8',
                interest_accrued: '0',
                deposit_date: '2026-01-01',
                maturity_date: '2027-01-01',
                interest_calculation_method: 'simple',
                calculation_basis: '365_days',
            },
            {
                deposit_id: 'fd-2',
                principal_amount: '1000000',
                interest_rate: '12',
                interest_accrued: '0',
                deposit_date: '2026-01-01',
                maturity_date: '2027-01-01',
                interest_calculation_method: 'simple',
                calculation_basis: '365_days',
            },
        ];

        const mockDb = createMockDb({ selectRows: deposits });
        const service = new FixedDepositService(mockDb);

        const result = await service.runDailyInterestAccrual(new Date('2026-03-01'));

        expect(result.depositsProcessed).toBe(2);
        // fd-1: 500,000 * 8% / 365 ≈ 109.5890
        // fd-2: 1,000,000 * 12% / 365 ≈ 328.7671
        // total ≈ 438.3562
        expect(result.totalInterestAccrued.toNumber()).toBeCloseTo(438.3562, 2);
    });
});

// ────────────────────────────────────────────────────────────
// calculatePrematureWithdrawal — via mock DB
// ────────────────────────────────────────────────────────────

describe('FixedDepositService - calculatePrematureWithdrawal', () => {
    it('should throw when deposit not found', async () => {
        const mockDb = createMockDb({ selectRows: [] });
        const service = new FixedDepositService(mockDb);

        await expect(
            service.calculatePrematureWithdrawal('fd-999')
        ).rejects.toThrow('Active fixed deposit fd-999 not found');
    });

    it('should throw when premature withdrawal is not allowed', async () => {
        const fd = {
            deposit_id: 'fd-1',
            principal_amount: '1000000',
            interest_accrued: '50000',
            allows_premature_withdrawal: false,
            premature_withdrawal_penalty_type: null,
            premature_withdrawal_penalty: null,
            withholding_tax_rate: '15',
        };
        const mockDb = createMockDb({ selectRows: [fd] });
        const service = new FixedDepositService(mockDb);

        await expect(
            service.calculatePrematureWithdrawal('fd-1')
        ).rejects.toThrow('does not allow premature withdrawal');
    });

    it('should calculate with percentage penalty', async () => {
        const fd = {
            deposit_id: 'fd-1',
            principal_amount: '1000000',
            interest_accrued: '50000',
            allows_premature_withdrawal: true,
            premature_withdrawal_penalty_type: 'percentage',
            premature_withdrawal_penalty: '25',
            withholding_tax_rate: '15',
        };
        const mockDb = createMockDb({ selectRows: [fd] });
        const service = new FixedDepositService(mockDb);

        const result = await service.calculatePrematureWithdrawal('fd-1');

        expect(result.principalAmount.toNumber()).toBe(1000000);
        expect(result.interestEarned.toNumber()).toBe(50000);
        expect(result.penalty.toNumber()).toBe(12500);
        expect(result.withholdingTax.toNumber()).toBe(5625);
        expect(result.netPayout.toNumber()).toBe(1031875);
    });

    it('should calculate with fixed amount penalty', async () => {
        const fd = {
            deposit_id: 'fd-1',
            principal_amount: '500000',
            interest_accrued: '20000',
            allows_premature_withdrawal: true,
            premature_withdrawal_penalty_type: 'fixed_amount',
            premature_withdrawal_penalty: '5000',
            withholding_tax_rate: '10',
        };
        const mockDb = createMockDb({ selectRows: [fd] });
        const service = new FixedDepositService(mockDb);

        const result = await service.calculatePrematureWithdrawal('fd-1');

        expect(result.penalty.toNumber()).toBe(5000);
        expect(result.withholdingTax.toNumber()).toBe(1500);
        expect(result.netPayout.toNumber()).toBe(513500);
    });

    it('should calculate with interest_reduction penalty', async () => {
        const fd = {
            deposit_id: 'fd-1',
            principal_amount: '1000000',
            interest_accrued: '100000',
            allows_premature_withdrawal: true,
            premature_withdrawal_penalty_type: 'interest_reduction',
            premature_withdrawal_penalty: '50',
            withholding_tax_rate: '0',
        };
        const mockDb = createMockDb({ selectRows: [fd] });
        const service = new FixedDepositService(mockDb);

        const result = await service.calculatePrematureWithdrawal('fd-1');

        expect(result.penalty.toNumber()).toBe(50000);
        expect(result.withholdingTax.toNumber()).toBe(0);
        expect(result.netPayout.toNumber()).toBe(1050000);
    });

    it('should handle zero penalty and zero WHT', async () => {
        const fd = {
            deposit_id: 'fd-1',
            principal_amount: '200000',
            interest_accrued: '10000',
            allows_premature_withdrawal: true,
            premature_withdrawal_penalty_type: 'percentage',
            premature_withdrawal_penalty: '0',
            withholding_tax_rate: '0',
        };
        const mockDb = createMockDb({ selectRows: [fd] });
        const service = new FixedDepositService(mockDb);

        const result = await service.calculatePrematureWithdrawal('fd-1');

        expect(result.penalty.toNumber()).toBe(0);
        expect(result.withholdingTax.toNumber()).toBe(0);
        expect(result.netPayout.toNumber()).toBe(210000);
    });
});

// ────────────────────────────────────────────────────────────
// processPrematureWithdrawal — via mock DB
// ────────────────────────────────────────────────────────────

describe('FixedDepositService - processPrematureWithdrawal', () => {
    it('should close FD and return withdrawal result', async () => {
        const fd = {
            deposit_id: 'fd-1',
            id: 'fd-1',
            status: 'active',
            principal_amount: '500000',
            interest_accrued: '20000',
            allows_premature_withdrawal: true,
            premature_withdrawal_penalty_type: 'percentage',
            premature_withdrawal_penalty: '10',
            withholding_tax_rate: '15',
        };
        const mockDb = createMockDb({ selectRows: [fd] });
        const service = new FixedDepositService(mockDb);

        const result = await service.processPrematureWithdrawal('fd-1', 'staff-1');

        expect(result.principalAmount.toNumber()).toBe(500000);
        expect(result.penalty.toNumber()).toBe(2000);
        // The update now happens inside a transaction, so verify transaction was called
        expect(mockDb.transaction).toHaveBeenCalled();
    });
});

// ────────────────────────────────────────────────────────────
// Auto-rollover logic tests (pure calculations)
// ────────────────────────────────────────────────────────────

describe('FixedDepositService - Rollover Calculations', () => {
    it('should calculate principal_plus_interest rollover correctly', () => {
        const principal = new Decimal('1000000');
        const accruedInterest = new Decimal('50000');
        const whtRate = new Decimal('15');
        const wht = accruedInterest.mul(whtRate).div(100);
        const netInterest = accruedInterest.minus(wht);
        const rolloverPrincipal = principal.plus(netInterest);

        expect(wht.toNumber()).toBe(7500);
        expect(netInterest.toNumber()).toBe(42500);
        expect(rolloverPrincipal.toNumber()).toBe(1042500);
    });

    it('should calculate principal_only rollover correctly', () => {
        const principal = new Decimal('1000000');
        const rolloverPrincipal = principal; // principal_only keeps original amount

        expect(rolloverPrincipal.toNumber()).toBe(1000000);
    });

    it('should handle zero interest rollover', () => {
        const principal = new Decimal('500000');
        const accruedInterest = new Decimal('0');
        const whtRate = new Decimal('15');
        const wht = accruedInterest.mul(whtRate).div(100);
        const netInterest = accruedInterest.minus(wht);
        const rolloverPrincipal = principal.plus(netInterest);

        expect(wht.toNumber()).toBe(0);
        expect(rolloverPrincipal.toNumber()).toBe(500000);
    });
});
