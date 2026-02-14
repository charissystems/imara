// tests/services/scheduleCalculator.test.ts
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
    ScheduleCalculator,
    type ScheduleInput,
    type RepaymentAllocationInput,
} from '../../src/services/scheduleCalculator';

describe('ScheduleCalculator', () => {
    // ──────────────────────────────────────────────
    // Schedule Generation
    // ──────────────────────────────────────────────

    describe('generateSchedule', () => {
        describe('flat interest', () => {
            const input: ScheduleInput = {
                principal: 1_000_000,
                annualInterestRate: 18,
                tenureInstallments: 12,
                interestMethod: 'flat',
                frequency: 'monthly',
                startDate: new Date('2025-01-01'),
            };

            it('should generate correct number of installments', () => {
                const schedule = ScheduleCalculator.generateSchedule(input);
                expect(schedule.installments).toHaveLength(12);
            });

            it('should have total interest = P × r × T', () => {
                const schedule = ScheduleCalculator.generateSchedule(input);
                // 1,000,000 × 0.18 × 1 = 180,000
                const expectedInterest = new Decimal(180_000);
                expect(schedule.totalInterest.toNumber()).toBeCloseTo(expectedInterest.toNumber(), 2);
            });

            it('should have closing balance of zero at last installment', () => {
                const schedule = ScheduleCalculator.generateSchedule(input);
                const last = schedule.installments[schedule.installments.length - 1];
                expect(last.closingBalance.toNumber()).toBe(0);
            });

            it('should have uniform total payments', () => {
                const schedule = ScheduleCalculator.generateSchedule(input);
                const payments = schedule.installments.map(i => i.totalPayment.toNumber());
                // All except possibly last should be equal
                const first = payments[0];
                for (let i = 0; i < payments.length - 1; i++) {
                    expect(payments[i]).toBeCloseTo(first, 2);
                }
            });

            it('should set correct due dates monthly', () => {
                const schedule = ScheduleCalculator.generateSchedule(input);
                expect(schedule.installments[0].dueDate.getMonth()).toBe(1); // Feb (0-indexed)
                expect(schedule.installments[11].dueDate.getMonth()).toBe(0); // Jan next year
            });
        });

        describe('declining balance EMI', () => {
            const input: ScheduleInput = {
                principal: 1_000_000,
                annualInterestRate: 24,
                tenureInstallments: 12,
                interestMethod: 'declining_emi',
                frequency: 'monthly',
                startDate: new Date('2025-01-01'),
            };

            it('should generate correct number of installments', () => {
                const schedule = ScheduleCalculator.generateSchedule(input);
                expect(schedule.installments).toHaveLength(12);
            });

            it('should have closing balance of zero at last installment', () => {
                const schedule = ScheduleCalculator.generateSchedule(input);
                const last = schedule.installments[schedule.installments.length - 1];
                expect(last.closingBalance.toNumber()).toBe(0);
            });

            it('should have decreasing interest over time', () => {
                const schedule = ScheduleCalculator.generateSchedule(input);
                const interests = schedule.installments.map(i => i.interestPayment.toNumber());
                for (let i = 1; i < interests.length; i++) {
                    expect(interests[i]).toBeLessThanOrEqual(interests[i - 1]);
                }
            });

            it('total interest should be less than flat method', () => {
                const flatSchedule = ScheduleCalculator.generateSchedule({
                    ...input,
                    interestMethod: 'flat',
                });
                const emiSchedule = ScheduleCalculator.generateSchedule(input);
                expect(emiSchedule.totalInterest.toNumber()).toBeLessThan(flatSchedule.totalInterest.toNumber());
            });

            it('should produce total payment = sum of all installments', () => {
                const schedule = ScheduleCalculator.generateSchedule(input);
                const summed = schedule.installments.reduce(
                    (s, i) => s.plus(i.totalPayment),
                    new Decimal(0),
                );
                expect(schedule.totalPayment.toNumber()).toBeCloseTo(summed.toNumber(), 2);
            });
        });

        describe('declining principal', () => {
            const input: ScheduleInput = {
                principal: 1_000_000,
                annualInterestRate: 18,
                tenureInstallments: 6,
                interestMethod: 'declining_principal',
                frequency: 'monthly',
                startDate: new Date('2025-01-01'),
            };

            it('should have equal principal payments (except last)', () => {
                const schedule = ScheduleCalculator.generateSchedule(input);
                const principals = schedule.installments.map(i => i.principalPayment.toNumber());
                const expected = 1_000_000 / 6;
                for (let i = 0; i < principals.length - 1; i++) {
                    expect(principals[i]).toBeCloseTo(expected, 0);
                }
            });

            it('should have decreasing total payments', () => {
                const schedule = ScheduleCalculator.generateSchedule(input);
                const totals = schedule.installments.map(i => i.totalPayment.toNumber());
                for (let i = 1; i < totals.length; i++) {
                    expect(totals[i]).toBeLessThanOrEqual(totals[i - 1]);
                }
            });

            it('closing balance should be zero at end', () => {
                const schedule = ScheduleCalculator.generateSchedule(input);
                const last = schedule.installments[schedule.installments.length - 1];
                expect(last.closingBalance.toNumber()).toBe(0);
            });
        });

        describe('different frequencies', () => {
            const baseInput: Omit<ScheduleInput, 'frequency'> = {
                principal: 500_000,
                annualInterestRate: 12,
                tenureInstallments: 4,
                interestMethod: 'declining_emi',
                startDate: new Date('2025-01-01'),
            };

            it('weekly: should have 7-day intervals', () => {
                const schedule = ScheduleCalculator.generateSchedule({
                    ...baseInput,
                    frequency: 'weekly',
                });
                const d1 = schedule.installments[0].dueDate;
                const d2 = schedule.installments[1].dueDate;
                const diff = (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24);
                expect(diff).toBe(7);
            });

            it('bi_weekly: should have 14-day intervals', () => {
                const schedule = ScheduleCalculator.generateSchedule({
                    ...baseInput,
                    frequency: 'bi_weekly',
                });
                const d1 = schedule.installments[0].dueDate;
                const d2 = schedule.installments[1].dueDate;
                const diff = (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24);
                expect(diff).toBe(14);
            });

            it('quarterly: should advance 3 months per period', () => {
                const schedule = ScheduleCalculator.generateSchedule({
                    ...baseInput,
                    frequency: 'quarterly',
                });
                const m1 = schedule.installments[0].dueDate.getMonth();
                const m2 = schedule.installments[1].dueDate.getMonth();
                expect((m2 - m1 + 12) % 12).toBe(3);
            });
        });

        describe('edge cases', () => {
            it('should throw on zero principal', () => {
                expect(() =>
                    ScheduleCalculator.generateSchedule({
                        principal: 0,
                        annualInterestRate: 12,
                        tenureInstallments: 6,
                        interestMethod: 'flat',
                        frequency: 'monthly',
                        startDate: new Date(),
                    }),
                ).toThrow('Principal must be positive');
            });

            it('should throw on negative rate', () => {
                expect(() =>
                    ScheduleCalculator.generateSchedule({
                        principal: 100_000,
                        annualInterestRate: -5,
                        tenureInstallments: 6,
                        interestMethod: 'flat',
                        frequency: 'monthly',
                        startDate: new Date(),
                    }),
                ).toThrow('Interest rate cannot be negative');
            });

            it('should handle zero interest rate', () => {
                const schedule = ScheduleCalculator.generateSchedule({
                    principal: 120_000,
                    annualInterestRate: 0,
                    tenureInstallments: 12,
                    interestMethod: 'declining_emi',
                    frequency: 'monthly',
                    startDate: new Date(),
                });
                expect(schedule.totalInterest.toNumber()).toBe(0);
                expect(schedule.totalPayment.toNumber()).toBeCloseTo(120_000, 2);
            });

            it('should handle single installment', () => {
                const schedule = ScheduleCalculator.generateSchedule({
                    principal: 50_000,
                    annualInterestRate: 12,
                    tenureInstallments: 1,
                    interestMethod: 'flat',
                    frequency: 'monthly',
                    startDate: new Date(),
                });
                expect(schedule.installments).toHaveLength(1);
                expect(schedule.installments[0].closingBalance.toNumber()).toBe(0);
            });
        });
    });

    // ──────────────────────────────────────────────
    // Repayment Allocation
    // ──────────────────────────────────────────────

    describe('allocateRepayment', () => {
        it('should allocate penalties first, then interest, then principal', () => {
            const result = ScheduleCalculator.allocateRepayment({
                paymentAmount: 10_000,
                pendingPenalty: 500,
                pendingInterest: 3_000,
                pendingPrincipal: 8_000,
            });

            expect(result.allocatedPenalty.toNumber()).toBe(500);
            expect(result.allocatedInterest.toNumber()).toBe(3_000);
            expect(result.allocatedPrincipal.toNumber()).toBe(6_500);
            expect(result.overpayment.toNumber()).toBe(0);
        });

        it('should handle partial payment (covers only penalty + partial interest)', () => {
            const result = ScheduleCalculator.allocateRepayment({
                paymentAmount: 2_000,
                pendingPenalty: 500,
                pendingInterest: 3_000,
                pendingPrincipal: 8_000,
            });

            expect(result.allocatedPenalty.toNumber()).toBe(500);
            expect(result.allocatedInterest.toNumber()).toBe(1_500);
            expect(result.allocatedPrincipal.toNumber()).toBe(0);
            expect(result.overpayment.toNumber()).toBe(0);

            expect(result.fullyCovered.penalty).toBe(true);
            expect(result.fullyCovered.interest).toBe(false);
            expect(result.fullyCovered.principal).toBe(false);
        });

        it('should report overpayment when amount exceeds all obligations', () => {
            const result = ScheduleCalculator.allocateRepayment({
                paymentAmount: 15_000,
                pendingPenalty: 500,
                pendingInterest: 2_000,
                pendingPrincipal: 5_000,
            });

            expect(result.allocatedPenalty.toNumber()).toBe(500);
            expect(result.allocatedInterest.toNumber()).toBe(2_000);
            expect(result.allocatedPrincipal.toNumber()).toBe(5_000);
            expect(result.overpayment.toNumber()).toBe(7_500);

            expect(result.fullyCovered.penalty).toBe(true);
            expect(result.fullyCovered.interest).toBe(true);
            expect(result.fullyCovered.principal).toBe(true);
        });

        it('should handle zero penalties', () => {
            const result = ScheduleCalculator.allocateRepayment({
                paymentAmount: 5_000,
                pendingPenalty: 0,
                pendingInterest: 2_000,
                pendingPrincipal: 10_000,
            });

            expect(result.allocatedPenalty.toNumber()).toBe(0);
            expect(result.allocatedInterest.toNumber()).toBe(2_000);
            expect(result.allocatedPrincipal.toNumber()).toBe(3_000);
        });

        it('should throw on negative payment', () => {
            expect(() =>
                ScheduleCalculator.allocateRepayment({
                    paymentAmount: -1_000,
                    pendingPenalty: 0,
                    pendingInterest: 0,
                    pendingPrincipal: 0,
                }),
            ).toThrow('Payment amount cannot be negative');
        });
    });

    // ──────────────────────────────────────────────
    // Penalty Calculation
    // ──────────────────────────────────────────────

    describe('calculatePenalty', () => {
        it('should compute penalty = amount × rate × days', () => {
            const penalty = ScheduleCalculator.calculatePenalty({
                overdueAmount: 100_000,
                dailyPenaltyRate: 0.05, // 0.05% per day
                daysOverdue: 30,
            });

            // 100,000 × 0.05/100 × 30 = 1,500
            expect(penalty.toNumber()).toBeCloseTo(1_500, 2);
        });

        it('should return zero for non-overdue', () => {
            const penalty = ScheduleCalculator.calculatePenalty({
                overdueAmount: 100_000,
                dailyPenaltyRate: 0.05,
                daysOverdue: 0,
            });

            expect(penalty.toNumber()).toBe(0);
        });

        it('should apply penalty cap', () => {
            const penalty = ScheduleCalculator.calculatePenalty({
                overdueAmount: 10_000,
                dailyPenaltyRate: 1, // 1% per day — very high
                daysOverdue: 200,
                penaltyCapPercent: 50, // cap at 50%
            });

            // Without cap: 10,000 × 0.01 × 200 = 20,000
            // Cap: 10,000 × 0.50 = 5,000
            expect(penalty.toNumber()).toBeCloseTo(5_000, 2);
        });
    });

    // ──────────────────────────────────────────────
    // NPL Check
    // ──────────────────────────────────────────────

    describe('isNonPerforming', () => {
        it('should flag as NPL at 90 days', () => {
            expect(ScheduleCalculator.isNonPerforming(90)).toBe(true);
        });

        it('should not flag at 89 days', () => {
            expect(ScheduleCalculator.isNonPerforming(89)).toBe(false);
        });

        it('should support custom threshold', () => {
            expect(ScheduleCalculator.isNonPerforming(60, 60)).toBe(true);
            expect(ScheduleCalculator.isNonPerforming(59, 60)).toBe(false);
        });
    });

    // ──────────────────────────────────────────────
    // Rescheduling
    // ──────────────────────────────────────────────

    describe('reschedule', () => {
        it('should generate new schedule from outstanding balance', () => {
            const newSchedule = ScheduleCalculator.reschedule({
                outstandingPrincipal: 500_000,
                outstandingInterest: 20_000,
                newAnnualInterestRate: 15,
                newTenureInstallments: 6,
                interestMethod: 'declining_emi',
                frequency: 'monthly',
                startDate: new Date('2025-07-01'),
                capitalizeInterest: false,
            });

            expect(newSchedule.principal.toNumber()).toBe(500_000);
            expect(newSchedule.installments).toHaveLength(6);
        });

        it('should capitalize interest into new principal when requested', () => {
            const newSchedule = ScheduleCalculator.reschedule({
                outstandingPrincipal: 500_000,
                outstandingInterest: 20_000,
                newAnnualInterestRate: 15,
                newTenureInstallments: 6,
                interestMethod: 'declining_emi',
                frequency: 'monthly',
                startDate: new Date('2025-07-01'),
                capitalizeInterest: true,
            });

            expect(newSchedule.principal.toNumber()).toBe(520_000);
        });
    });

    // ──────────────────────────────────────────────
    // Early Settlement
    // ──────────────────────────────────────────────

    describe('computeEarlySettlement', () => {
        it('should compute settlement with pro-rata interest rebate', () => {
            const result = ScheduleCalculator.computeEarlySettlement(
                300_000,  // outstanding principal
                180_000,  // total scheduled interest
                60_000,   // interest paid so far
                8,        // installments remaining
                12,       // total installments
            );

            // remaining ratio = 8/12 = 0.6667
            // rebate = (180,000 - 60,000) × 0.6667 = 80,000
            // outstanding interest = 120,000 - 80,000 = 40,000
            // settlement = 300,000 + 40,000 = 340,000
            expect(result.settlementAmount.toNumber()).toBeCloseTo(340_000, 0);
            expect(result.interestRebate.toNumber()).toBeCloseTo(80_000, 0);
        });
    });
});
