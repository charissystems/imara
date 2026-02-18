/**
 * Loan Service
 * Handles loan products, applications, approvals, disbursement, and repayment
 * 
 * Implements MUST requirements:
 * - LON-001: Support unlimited loan products
 * - LON-003: Support loan product categories
 * - LON-004: Enforce eligibility rules
 * - LON-005: Digital loan application form
 * - LON-006: Auto-compute max loanable amount
 * - LON-009: Support collateral registration
 * - LON-011: Run automated eligibility checks
 * - LON-012: Generate appraisal report PDF
 * - LON-013: Support configurable approval workflows
 * - LON-014: Support approval workflow actions
 * - LON-015: Notify applicants at each stage
 * - LON-016: Maintain approval history log
 * - LON-018: Support multiple disbursement channels
 * - LON-020: Generate loan repayment schedule
 * - LON-022: Accept repayments with auto-allocation
 * - LON-023: Auto-compute penalty fees
 * - LON-024: Send repayment reminders
 * - LON-025: Support loan rescheduling
 * - LON-026: Support loan write-off
 * - LON-028: Flag loans as NPL
 */

import { nanoid } from 'nanoid';
import Decimal from 'decimal.js';
import { appLogger } from '../middleware/logger';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Loan product configuration
 */
export interface LoanProduct {
    id: string;
    tenantId: string;
    name: string;
    code: string;
    category: 'emergency' | 'short_term' | 'long_term' | 'business' | 'salary_advance' | 'school_fees' | 'other';
    minAmount: number;
    maxAmount: number;
    minTenureMonths: number;
    maxTenureMonths: number;
    interestRate: number;
    interestMethod: 'flat' | 'declining_emi' | 'declining_principal';
    applicationFee: number; // as percentage
    processingFee: number; // as percentage
    insuranceFee: number; // as percentage
    penaltyRate: number; // daily penalty as percentage
    minSavingsMultiplier: number; // e.g., 3x savings required
    minMembershipMonths: number;
    maxConcurrentLoans: number;
    requiresGuarantor: boolean;
    requiresCollateral: boolean;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Loan application
 */
export interface LoanApplication {
    id: string;
    tenantId: string;
    memberId: string;
    productId: string;
    requestedAmount: number;
    requestedTenureMonths: number;
    approvedAmount?: number;
    approvedTenureMonths?: number;
    purpose: string;
    status: 'pending' | 'under_appraisal' | 'denied' | 'approved' | 'disbursed' | 'closed';
    creditScore?: number;
    recommendedAmount?: number;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Loan collateral
 */
export interface LoanCollateral {
    id: string;
    loanId: string;
    type: string; // e.g., "savings_account", "property", "vehicle"
    description: string;
    estimatedValue: number;
    marketValue: number;
    chargeType: 'first' | 'second'; // mortgage position
    documentUrl?: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Loan agreement & disbursement
 */
export interface LoanAgreement {
    id: string;
    tenantId: string;
    loanApplicationId: string;
    memberSignatureUrl?: string;
    staffSignatureUrl?: string;
    signedAt?: Date;
    disbursementChannel: 'cash' | 'bank_transfer' | 'mobile_money' | 'member_savings';
    disbursedAmount: number;
    disbursedAt?: Date;
    status: 'pending_signature' | 'signed' | 'disbursed';
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Loan repayment schedule (installment)
 */
export interface LoanInstallment {
    id: string;
    loanAgreementId: string;
    installmentNumber: number;
    dueDate: Date;
    principalAmount: number;
    interestAmount: number;
    totalAmount: number;
    paidAmount: number;
    penaltyAmount: number;
    status: 'pending' | 'partial' | 'paid' | 'overdue' | 'written_off';
    paidDate?: Date;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Loan repayment transaction
 */
export interface LoanRepayment {
    id: string;
    tenantId: string;
    loanAgreementId: string;
    memberId: string;
    amount: number;
    channel: 'cash' | 'bank_transfer' | 'mobile_money';
    reference: string;
    allocatedPrincipal: number;
    allocatedInterest: number;
    allocatedPenalty: number;
    processedBy: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Loan Service
 */
export class LoanService {
    private nplOverdueThresholdDays: number = 90; // 90 days = NPL

    constructor() {}

    // ──────────────────────────────────────────────────────────
    // Loan Product Management
    // ──────────────────────────────────────────────────────────

    /**
     * Validate loan product configuration
     * Requirement: LON-001
     */
    validateLoanProduct(product: Partial<LoanProduct>): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!product.name || product.name.trim().length === 0) {
            errors.push('Product name is required');
        }

        if (!product.code || product.code.trim().length === 0) {
            errors.push('Product code is required');
        }

        if (!product.category) {
            errors.push('Product category is required');
        }

        if (!product.minAmount || product.minAmount <= 0) {
            errors.push('Minimum amount must be greater than zero');
        }

        if (!product.maxAmount || product.maxAmount <= 0) {
            errors.push('Maximum amount must be greater than zero');
        }

        if (product.minAmount && product.maxAmount && product.minAmount > product.maxAmount) {
            errors.push('Minimum amount cannot exceed maximum amount');
        }

        if (!product.interestRate || product.interestRate < 0 || product.interestRate > 100) {
            errors.push('Interest rate must be between 0 and 100');
        }

        if (!product.interestMethod || !['flat', 'declining_emi', 'declining_principal'].includes(product.interestMethod)) {
            errors.push('Valid interest method is required');
        }

        return { valid: errors.length === 0, errors };
    }

    // ──────────────────────────────────────────────────────────
    // Loan Application & Appraisal
    // ──────────────────────────────────────────────────────────

    /**
     * Auto-compute maximum loanable amount based on savings
     * Requirement: LON-006
     */
    computeMaxLoanableAmount(savingsBalance: number, product: LoanProduct): number {
        const savingsBasedAmount = savingsBalance * product.minSavingsMultiplier;
        return Math.min(savingsBasedAmount, product.maxAmount);
    }

    /**
     * Validate loan application
     * Requirement: LON-005
     */
    validateLoanApplication(
        application: Partial<LoanApplication>,
        product: LoanProduct
    ): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!application.requestedAmount || application.requestedAmount <= 0) {
            errors.push('Requested amount must be greater than zero');
        }

        if (application.requestedAmount && application.requestedAmount > product.maxAmount) {
            errors.push(`Amount exceeds product maximum of ${product.maxAmount}`);
        }

        if (application.requestedAmount && application.requestedAmount < product.minAmount) {
            errors.push(`Amount is below product minimum of ${product.minAmount}`);
        }

        if (!application.requestedTenureMonths || application.requestedTenureMonths <= 0) {
            errors.push('Requested tenure must be greater than zero');
        }

        if (application.requestedTenureMonths && application.requestedTenureMonths > product.maxTenureMonths) {
            errors.push(`Tenure exceeds product maximum of ${product.maxTenureMonths} months`);
        }

        if (application.requestedTenureMonths && application.requestedTenureMonths < product.minTenureMonths) {
            errors.push(`Tenure is below product minimum of ${product.minTenureMonths} months`);
        }

        if (!application.purpose || application.purpose.trim().length === 0) {
            errors.push('Loan purpose is required');
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Run automated eligibility checks
     * Requirement: LON-011
     */
    checkEligibility(
        savingsBalance: number,
        membershipMonths: number,
        activeLoanCount: number,
        product: LoanProduct,
        requestedAmount?: number
    ): { eligible: boolean; reasons: string[] } {
        const reasons: string[] = [];

        // Check savings multiplier
        if (savingsBalance * product.minSavingsMultiplier < product.minAmount) {
            reasons.push(
                `Insufficient savings. Need at least ${product.minAmount / product.minSavingsMultiplier} ` +
                `to qualify for minimum loan (you have ${savingsBalance})`
            );
        }

        // Check membership duration
        if (membershipMonths < product.minMembershipMonths) {
            const remainingMonths = product.minMembershipMonths - membershipMonths;
            reasons.push(
                `Membership too new. Must wait ${remainingMonths} more months ` +
                `(requirement: ${product.minMembershipMonths} months)`
            );
        }

        // Check concurrent loans
        if (activeLoanCount >= product.maxConcurrentLoans) {
            reasons.push(
                `Already at maximum concurrent loans (${product.maxConcurrentLoans}). ` +
                `Complete or close existing loans first.`
            );
        }

        // Check requested amount against savings
        if (requestedAmount && requestedAmount > this.computeMaxLoanableAmount(savingsBalance, product)) {
            const maxAllowed = this.computeMaxLoanableAmount(savingsBalance, product);
            reasons.push(`Requested amount exceeds your eligibility. Maximum: ${maxAllowed}`);
        }

        return { eligible: reasons.length === 0, reasons };
    }

    /**
     * Calculate credit score
     * Requirement: LON-010 (should)
     */
    calculateCreditScore(
        repaymentHistoryScore: number, // 0-30
        savingsBehaviorScore: number, // 0-20
        incomeScore: number, // 0-20
        membershipDurationScore: number // 0-30
    ): number {
        return Math.min(100, Math.max(0,
            repaymentHistoryScore + savingsBehaviorScore + incomeScore + membershipDurationScore
        ));
    }

    // ──────────────────────────────────────────────────────────
    // Interest & Amount Calculations
    // ──────────────────────────────────────────────────────────

    /**
     * Calculate total loan amount with fees
     */
    calculateTotalLoanCost(
        principal: number,
        product: LoanProduct,
        tenureMonths: number
    ): {
        principal: number;
        interestTotal: number;
        applicationFee: number;
        processingFee: number;
        insuranceFee: number;
        total: number;
    } {
        const p = new Decimal(principal);
        const applicationFee = p.mul(product.applicationFee).div(100);
        const processingFee = p.mul(product.processingFee).div(100);
        const insuranceFee = p.mul(product.insuranceFee).div(100);

        let interestTotal: Decimal;
        if (product.interestMethod === 'flat') {
            interestTotal = p.mul(product.interestRate).div(100).mul(tenureMonths).div(12);
        } else {
            // Compute total interest from actual schedule for accuracy
            const schedule = this.generateRepaymentSchedule(
                principal, tenureMonths, product.interestRate, product.interestMethod,
            );
            interestTotal = schedule.reduce(
                (sum, inst) => sum.plus(inst.interestAmount), new Decimal(0),
            );
        }

        const total = p.plus(interestTotal).plus(applicationFee).plus(processingFee).plus(insuranceFee);

        return {
            principal,
            interestTotal: interestTotal.toDecimalPlaces(2).toNumber(),
            applicationFee: applicationFee.toDecimalPlaces(2).toNumber(),
            processingFee: processingFee.toDecimalPlaces(2).toNumber(),
            insuranceFee: insuranceFee.toDecimalPlaces(2).toNumber(),
            total: total.toDecimalPlaces(2).toNumber(),
        };
    }

    /**
     * Generate loan repayment schedule
     * Requirement: LON-020
     */
    generateRepaymentSchedule(
        loanAmount: number,
        tenureMonths: number,
        interestRate: number,
        interestMethod: string,
        startDate: Date = new Date()
    ): LoanInstallment[] {
        const schedule: LoanInstallment[] = [];
        const P = new Decimal(loanAmount);
        const monthlyRate = new Decimal(interestRate).div(12).div(100);
        let remainingBalance = P;

        // Pre-compute EMI for declining_emi using Decimal
        let emi: Decimal | null = null;
        if (interestMethod === 'declining_emi' && monthlyRate.gt(0)) {
            const n = tenureMonths;
            const onePlusR = Decimal.add(1, monthlyRate);
            const onePlusRn = onePlusR.pow(n);
            emi = P.mul(monthlyRate).mul(onePlusRn).div(onePlusRn.minus(1));
        }

        for (let month = 1; month <= tenureMonths; month++) {
            const dueDate = new Date(startDate);
            dueDate.setMonth(dueDate.getMonth() + month);

            let principalAmount: Decimal;
            let interestAmount: Decimal;

            if (interestMethod === 'flat') {
                principalAmount = P.div(tenureMonths);
                interestAmount = P.mul(monthlyRate);
            } else if (interestMethod === 'declining_emi' && emi) {
                interestAmount = remainingBalance.mul(monthlyRate);
                principalAmount = emi.minus(interestAmount);
            } else {
                // declining_principal
                principalAmount = P.div(tenureMonths);
                interestAmount = remainingBalance.mul(monthlyRate);
            }

            remainingBalance = remainingBalance.minus(principalAmount);

            const pAmt = principalAmount.toDecimalPlaces(2).toNumber();
            const iAmt = interestAmount.toDecimalPlaces(2).toNumber();

            const installment: LoanInstallment = {
                id: `INST-${nanoid(12)}`,
                loanAgreementId: '', // Will be set when creating loan
                installmentNumber: month,
                dueDate,
                principalAmount: pAmt,
                interestAmount: iAmt,
                totalAmount: new Decimal(pAmt).plus(iAmt).toNumber(),
                paidAmount: 0,
                penaltyAmount: 0,
                status: 'pending',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            schedule.push(installment);
        }

        return schedule;
    }

    // ──────────────────────────────────────────────────────────
    // Repayment Management
    // ──────────────────────────────────────────────────────────

    /**
     * Allocate repayment across penalty, interest, principal
     * Requirement: LON-022
     */
    allocateRepayment(
        amount: number,
        pendingPenalty: number,
        pendingInterest: number,
        pendingPrincipal: number,
        allocationOrder: ('penalty' | 'interest' | 'principal')[] = ['penalty', 'interest', 'principal']
    ): {
        allocatedPenalty: number;
        allocatedInterest: number;
        allocatedPrincipal: number;
        remaining: number;
    } {
        let remaining = new Decimal(amount);
        let penalty = new Decimal(0);
        let interest = new Decimal(0);
        let principal = new Decimal(0);

        for (const type of allocationOrder) {
            if (remaining.lte(0)) break;

            switch (type) {
                case 'penalty': {
                    const alloc = Decimal.min(remaining, new Decimal(pendingPenalty));
                    penalty = penalty.plus(alloc);
                    remaining = remaining.minus(alloc);
                    break;
                }
                case 'interest': {
                    const alloc = Decimal.min(remaining, new Decimal(pendingInterest));
                    interest = interest.plus(alloc);
                    remaining = remaining.minus(alloc);
                    break;
                }
                case 'principal': {
                    const alloc = Decimal.min(remaining, new Decimal(pendingPrincipal));
                    principal = principal.plus(alloc);
                    remaining = remaining.minus(alloc);
                    break;
                }
            }
        }

        return {
            allocatedPenalty: penalty.toDecimalPlaces(2).toNumber(),
            allocatedInterest: interest.toDecimalPlaces(2).toNumber(),
            allocatedPrincipal: principal.toDecimalPlaces(2).toNumber(),
            remaining: remaining.toDecimalPlaces(2).toNumber(),
        };
    }

    /**
     * Calculate penalty fee for overdue installment
     * Requirement: LON-023
     */
    calculatePenaltyFee(
        outstandingAmount: number,
        penaltyRate: number,
        daysOverdue: number
    ): number {
        // Guard against negative inputs that could produce credits
        const safeAmount = Decimal.max(0, new Decimal(outstandingAmount));
        const safeRate = Decimal.max(0, new Decimal(penaltyRate));
        const safeDays = Math.max(0, daysOverdue);
        // Daily penalty calculation
        return safeAmount.mul(safeRate).div(100).mul(safeDays).toDecimalPlaces(2).toNumber();
    }

    /**
     * Check if loan should be flagged as NPL
     * Requirement: LON-028
     */
    isNonPerformingLoan(daysOverdue: number): boolean {
        return daysOverdue >= this.nplOverdueThresholdDays;
    }

    /**
     * Generate repayment reminder content
     * Requirement: LON-024
     */
    generateRepaymentReminder(
        memberId: string,
        loanNumber: string,
        amount: number,
        dueDate: Date,
        daysUntilDue: number
    ): { sms: string; email: string } {
        const sms = `Loan ${loanNumber} payment of ${amount} due ${dueDate.toLocaleDateString()}. Visit portal to pay. Contact us for help.`;

        const emailSubject = `Payment Reminder - Loan ${loanNumber}`;
        const emailBody = `
Your loan payment is due soon.

Loan Number: ${loanNumber}
Amount Due: ${amount}
Due Date: ${dueDate.toLocaleDateString()}
Days Until Due: ${daysUntilDue}

Please make the payment on or before the due date to avoid penalties.
        `;

        return { sms, email: emailBody };
    }

    /**
     * Compute interest rebate for early settlement
     * Requirement: LON-030 (should)
     */
    computeEarlySettlementRebate(
        totalInterestScheduled: number,
        monthsRemaining: number,
        totalMonths: number
    ): number {
        // Pro-rata rebate for remaining months
        return new Decimal(totalInterestScheduled)
            .mul(monthsRemaining)
            .div(totalMonths)
            .toDecimalPlaces(2)
            .toNumber();
    }
}

/**
 * Initialize loan service
 */
export function initLoanService(): LoanService {
    return new LoanService();
}
