/**
 * Loan Schedule Calculator
 * 
 * Production-grade repayment schedule generation supporting:
 * - Flat interest (LON-001)
 * - Declining balance EMI (equated monthly installments)
 * - Declining balance equal principal
 * - Multiple repayment frequencies: weekly, bi-weekly, monthly, quarterly
 * 
 * Uses Decimal.js for financial-grade precision to avoid floating-point errors.
 * 
 * Requirements implemented:
 *  - LON-001: Support unlimited loan products with configurable interest methods
 *  - LON-020: Generate full repayment schedule upon disbursement
 *  - LON-022: Auto-allocate repayments (penalties → interest → principal)
 *  - LON-025: Support loan rescheduling
 */

import Decimal from 'decimal.js';

// Configure Decimal.js for financial precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type InterestMethod = 'flat' | 'declining_emi' | 'declining_principal';

export type RepaymentFrequency = 'weekly' | 'bi_weekly' | 'monthly' | 'quarterly';

export interface ScheduleInput {
    /** Loan principal amount */
    principal: Decimal.Value;
    /** Annual interest rate as a percentage (e.g. 18 means 18%) */
    annualInterestRate: Decimal.Value;
    /** Number of installments (not months — see frequency) */
    tenureInstallments: number;
    /** Interest calculation method */
    interestMethod: InterestMethod;
    /** Repayment frequency */
    frequency: RepaymentFrequency;
    /** First repayment date */
    startDate: Date;
    /** Currency code for display purposes */
    currencyCode?: string;
}

export interface ScheduleInstallment {
    installmentNumber: number;
    dueDate: Date;
    openingBalance: Decimal;
    principalPayment: Decimal;
    interestPayment: Decimal;
    totalPayment: Decimal;
    closingBalance: Decimal;
}

export interface RepaymentSchedule {
    principal: Decimal;
    annualInterestRate: Decimal;
    interestMethod: InterestMethod;
    frequency: RepaymentFrequency;
    tenureInstallments: number;
    totalInterest: Decimal;
    totalPayment: Decimal;
    currencyCode: string;
    installments: ScheduleInstallment[];
    generatedAt: Date;
}

export interface RepaymentAllocationInput {
    /** Amount being paid */
    paymentAmount: Decimal.Value;
    /** Outstanding penalties (oldest first summed) */
    pendingPenalty: Decimal.Value;
    /** Outstanding interest */
    pendingInterest: Decimal.Value;
    /** Outstanding principal */
    pendingPrincipal: Decimal.Value;
}

export interface RepaymentAllocationResult {
    allocatedPenalty: Decimal;
    allocatedInterest: Decimal;
    allocatedPrincipal: Decimal;
    /** Positive remainder goes to future principal or savings */
    overpayment: Decimal;
    /** Summary of what was covered */
    fullyCovered: {
        penalty: boolean;
        interest: boolean;
        principal: boolean;
    };
}

export interface PenaltyCalculationInput {
    /** Outstanding amount at the installment level */
    overdueAmount: Decimal.Value;
    /** Late payment penalty rate (daily percentage, e.g. 0.05 means 0.05%/day) */
    dailyPenaltyRate: Decimal.Value;
    /** Number of calendar days overdue */
    daysOverdue: number;
    /** Penalty cap as percentage of overdue amount (optional) */
    penaltyCapPercent?: Decimal.Value;
}

export interface RescheduleInput {
    /** Current outstanding principal balance */
    outstandingPrincipal: Decimal.Value;
    /** Current outstanding interest balance */
    outstandingInterest: Decimal.Value;
    /** New annual interest rate (may be same or different) */
    newAnnualInterestRate: Decimal.Value;
    /** New number of remaining installments */
    newTenureInstallments: number;
    /** Interest calculation method for new schedule */
    interestMethod: InterestMethod;
    /** Repayment frequency */
    frequency: RepaymentFrequency;
    /** New start date for remaining schedule */
    startDate: Date;
    /** Whether to capitalize outstanding interest into principal */
    capitalizeInterest?: boolean;
}

// ────────────────────────────────────────────────────────────
// Schedule Calculator
// ────────────────────────────────────────────────────────────

export class ScheduleCalculator {
    /**
     * Number of periods per year for each frequency.
     * Used to convert annual rate into periodic rate.
     */
    private static readonly PERIODS_PER_YEAR: Record<RepaymentFrequency, number> = {
        weekly: 52,
        bi_weekly: 26,
        monthly: 12,
        quarterly: 4,
    };

    // ──────────────────────────────────────────────
    // Public API
    // ──────────────────────────────────────────────

    /**
     * Generate a full repayment schedule from loan parameters.
     * 
     * @param input - Loan schedule parameters
     * @returns Complete repayment schedule with all installments
     */
    static generateSchedule(input: ScheduleInput): RepaymentSchedule {
        const principal = new Decimal(input.principal);
        const annualRate = new Decimal(input.annualInterestRate);
        const n = input.tenureInstallments;

        if (principal.lte(0)) throw new Error('Principal must be positive');
        if (annualRate.lt(0)) throw new Error('Interest rate cannot be negative');
        if (n <= 0 || !Number.isInteger(n)) throw new Error('Tenure must be a positive integer');

        let installments: ScheduleInstallment[];

        switch (input.interestMethod) {
            case 'flat':
                installments = this.generateFlatSchedule(principal, annualRate, n, input.frequency, input.startDate);
                break;
            case 'declining_emi':
                installments = this.generateDecliningEMISchedule(principal, annualRate, n, input.frequency, input.startDate);
                break;
            case 'declining_principal':
                installments = this.generateDecliningPrincipalSchedule(principal, annualRate, n, input.frequency, input.startDate);
                break;
            default:
                throw new Error(`Unsupported interest method: ${input.interestMethod}`);
        }

        const totalInterest = installments.reduce(
            (sum, inst) => sum.plus(inst.interestPayment), new Decimal(0)
        );
        const totalPayment = installments.reduce(
            (sum, inst) => sum.plus(inst.totalPayment), new Decimal(0)
        );

        return {
            principal,
            annualInterestRate: annualRate,
            interestMethod: input.interestMethod,
            frequency: input.frequency,
            tenureInstallments: n,
            totalInterest,
            totalPayment,
            currencyCode: input.currencyCode ?? 'UGX',
            installments,
            generatedAt: new Date(),
        };
    }

    /**
     * Allocate a repayment across penalties, interest, and principal.
     * Default allocation order: penalties → interest → principal (LON-022)
     */
    static allocateRepayment(input: RepaymentAllocationInput): RepaymentAllocationResult {
        let remaining = new Decimal(input.paymentAmount);
        const penalty = new Decimal(input.pendingPenalty);
        const interest = new Decimal(input.pendingInterest);
        const principal = new Decimal(input.pendingPrincipal);

        if (remaining.lt(0)) throw new Error('Payment amount cannot be negative');

        // 1. Penalties first
        const allocPenalty = Decimal.min(remaining, penalty);
        remaining = remaining.minus(allocPenalty);

        // 2. Interest second
        const allocInterest = Decimal.min(remaining, interest);
        remaining = remaining.minus(allocInterest);

        // 3. Principal third
        const allocPrincipal = Decimal.min(remaining, principal);
        remaining = remaining.minus(allocPrincipal);

        return {
            allocatedPenalty: allocPenalty,
            allocatedInterest: allocInterest,
            allocatedPrincipal: allocPrincipal,
            overpayment: remaining,
            fullyCovered: {
                penalty: allocPenalty.gte(penalty),
                interest: allocInterest.gte(interest),
                principal: allocPrincipal.gte(principal),
            },
        };
    }

    /**
     * Calculate late payment penalty for an overdue installment (LON-023).
     */
    static calculatePenalty(input: PenaltyCalculationInput): Decimal {
        const overdueAmount = new Decimal(input.overdueAmount);
        const dailyRate = new Decimal(input.dailyPenaltyRate);
        const days = input.daysOverdue;

        if (days <= 0) return new Decimal(0);

        // penalty = overdueAmount × (dailyRate / 100) × daysOverdue
        let penalty = overdueAmount
            .times(dailyRate.dividedBy(100))
            .times(days);

        // Apply cap if specified
        if (input.penaltyCapPercent !== undefined) {
            const cap = overdueAmount.times(new Decimal(input.penaltyCapPercent).dividedBy(100));
            penalty = Decimal.min(penalty, cap);
        }

        return penalty.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    }

    /**
     * Check whether a loan should be classified as Non-Performing (LON-028).
     * Default threshold: 90 days overdue.
     */
    static isNonPerforming(daysOverdue: number, thresholdDays: number = 90): boolean {
        return daysOverdue >= thresholdDays;
    }

    /**
     * Reschedule a loan by generating a new schedule from the outstanding balance (LON-025).
     */
    static reschedule(input: RescheduleInput): RepaymentSchedule {
        let newPrincipal = new Decimal(input.outstandingPrincipal);

        if (input.capitalizeInterest) {
            newPrincipal = newPrincipal.plus(new Decimal(input.outstandingInterest));
        }

        return this.generateSchedule({
            principal: newPrincipal,
            annualInterestRate: input.newAnnualInterestRate,
            tenureInstallments: input.newTenureInstallments,
            interestMethod: input.interestMethod,
            frequency: input.frequency,
            startDate: input.startDate,
        });
    }

    /**
     * Compute early settlement amount with pro-rata interest rebate (LON-030).
     */
    static computeEarlySettlement(
        outstandingPrincipal: Decimal.Value,
        totalScheduledInterest: Decimal.Value,
        interestPaidSoFar: Decimal.Value,
        installmentsRemaining: number,
        totalInstallments: number,
    ): { settlementAmount: Decimal; interestRebate: Decimal } {
        const principal = new Decimal(outstandingPrincipal);
        const totalInterest = new Decimal(totalScheduledInterest);
        const paidInterest = new Decimal(interestPaidSoFar);
        const remainingRatio = new Decimal(installmentsRemaining).dividedBy(totalInstallments);

        // Rebate is the unused portion of total scheduled interest
        const interestRebate = totalInterest.minus(paidInterest).times(remainingRatio);
        const outstandingInterest = totalInterest.minus(paidInterest).minus(interestRebate);

        const settlementAmount = principal.plus(outstandingInterest);

        return {
            settlementAmount: settlementAmount.toDecimalPlaces(4, Decimal.ROUND_HALF_UP),
            interestRebate: interestRebate.toDecimalPlaces(4, Decimal.ROUND_HALF_UP),
        };
    }

    // ──────────────────────────────────────────────
    // Private: Schedule Generation Methods
    // ──────────────────────────────────────────────

    /**
     * Flat interest: total interest = P × r × T
     * Each installment pays equal principal + flat interest portion.
     */
    private static generateFlatSchedule(
        principal: Decimal,
        annualRate: Decimal,
        n: number,
        frequency: RepaymentFrequency,
        startDate: Date,
    ): ScheduleInstallment[] {
        const periodsPerYear = this.PERIODS_PER_YEAR[frequency];
        const totalYears = new Decimal(n).dividedBy(periodsPerYear);
        const totalInterest = principal.times(annualRate.dividedBy(100)).times(totalYears);
        const principalPerPeriod = principal.dividedBy(n).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
        const interestPerPeriod = totalInterest.dividedBy(n).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

        const installments: ScheduleInstallment[] = [];
        let balance = principal;

        for (let i = 1; i <= n; i++) {
            const isLast = i === n;
            // On the last installment, clear the remaining balance exactly
            const principalPayment = isLast ? balance : principalPerPeriod;
            const interestPayment = isLast
                ? totalInterest.minus(interestPerPeriod.times(n - 1))
                : interestPerPeriod;
            const closingBalance = isLast ? new Decimal(0) : balance.minus(principalPayment);

            installments.push({
                installmentNumber: i,
                dueDate: this.addPeriods(startDate, i, frequency),
                openingBalance: balance,
                principalPayment,
                interestPayment,
                totalPayment: principalPayment.plus(interestPayment),
                closingBalance,
            });

            balance = closingBalance;
        }

        return installments;
    }

    /**
     * Declining balance EMI: fixed total payment each period.
     * EMI = P × r × (1+r)^n / [(1+r)^n − 1]
     */
    private static generateDecliningEMISchedule(
        principal: Decimal,
        annualRate: Decimal,
        n: number,
        frequency: RepaymentFrequency,
        startDate: Date,
    ): ScheduleInstallment[] {
        const periodsPerYear = this.PERIODS_PER_YEAR[frequency];
        const periodicRate = annualRate.dividedBy(100).dividedBy(periodsPerYear);

        let emi: Decimal;
        if (periodicRate.isZero()) {
            // Zero interest: simple division
            emi = principal.dividedBy(n);
        } else {
            // EMI formula with Decimal precision
            const onePlusR = periodicRate.plus(1);
            const onePlusRtoN = onePlusR.pow(n);
            emi = principal
                .times(periodicRate)
                .times(onePlusRtoN)
                .dividedBy(onePlusRtoN.minus(1));
        }

        emi = emi.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

        const installments: ScheduleInstallment[] = [];
        let balance = principal;

        for (let i = 1; i <= n; i++) {
            const interestPayment = balance.times(periodicRate).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
            const isLast = i === n;

            let principalPayment: Decimal;
            let totalPayment: Decimal;
            let closingBalance: Decimal;

            if (isLast) {
                // Last installment: clear remaining balance exactly
                principalPayment = balance;
                totalPayment = balance.plus(interestPayment);
                closingBalance = new Decimal(0);
            } else {
                principalPayment = emi.minus(interestPayment);
                totalPayment = emi;
                closingBalance = balance.minus(principalPayment);
            }

            installments.push({
                installmentNumber: i,
                dueDate: this.addPeriods(startDate, i, frequency),
                openingBalance: balance,
                principalPayment,
                interestPayment,
                totalPayment,
                closingBalance,
            });

            balance = closingBalance;
        }

        return installments;
    }

    /**
     * Declining balance equal principal: fixed principal each period, interest decreases.
     * Principal per period = P / n
     * Interest = outstanding balance × periodic rate
     */
    private static generateDecliningPrincipalSchedule(
        principal: Decimal,
        annualRate: Decimal,
        n: number,
        frequency: RepaymentFrequency,
        startDate: Date,
    ): ScheduleInstallment[] {
        const periodsPerYear = this.PERIODS_PER_YEAR[frequency];
        const periodicRate = annualRate.dividedBy(100).dividedBy(periodsPerYear);
        const principalPerPeriod = principal.dividedBy(n).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

        const installments: ScheduleInstallment[] = [];
        let balance = principal;

        for (let i = 1; i <= n; i++) {
            const interestPayment = balance.times(periodicRate).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
            const isLast = i === n;
            const principalPayment = isLast ? balance : principalPerPeriod;
            const closingBalance = isLast ? new Decimal(0) : balance.minus(principalPayment);

            installments.push({
                installmentNumber: i,
                dueDate: this.addPeriods(startDate, i, frequency),
                openingBalance: balance,
                principalPayment,
                interestPayment,
                totalPayment: principalPayment.plus(interestPayment),
                closingBalance,
            });

            balance = closingBalance;
        }

        return installments;
    }

    // ──────────────────────────────────────────────
    // Date helpers
    // ──────────────────────────────────────────────

    /**
     * Add N periods to a date based on repayment frequency.
     */
    private static addPeriods(baseDate: Date, periods: number, frequency: RepaymentFrequency): Date {
        const d = new Date(baseDate);

        switch (frequency) {
            case 'weekly':
                d.setDate(d.getDate() + periods * 7);
                break;
            case 'bi_weekly':
                d.setDate(d.getDate() + periods * 14);
                break;
            case 'monthly':
                d.setMonth(d.getMonth() + periods);
                break;
            case 'quarterly':
                d.setMonth(d.getMonth() + periods * 3);
                break;
        }

        return d;
    }
}
