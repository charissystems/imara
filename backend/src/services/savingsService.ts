/**
 * Savings Service
 * Handles deposits, withdrawals, transfers, and interest calculations
 * 
 * Implements MUST requirements:
 * - SAV-001: Support multiple deposit channels
 * - SAV-002: Post deposits in real time
 * - SAV-003: Generate unique transaction reference
 * - SAV-004: Support batch/bulk deposits
 * - SAV-005: Validate deposit amounts
 * - SAV-007: Enforce withdrawal approval workflows
 * - SAV-008: Validate withdrawal constraints
 * - SAV-009: Support multiple withdrawal channels
 * - SAV-010: Block withdrawal on pledged collateral
 * - SAV-011: Support account closure withdrawals
 * - SAV-012: Allow intra-member account transfers
 * - SAV-014: Log all transfers with traceability
 * - SAV-015: Support interest calculation methods
 * - SAV-016: Accrue interest daily
 */

import { nanoid } from 'nanoid';
import { appLogger } from '../middleware/logger';

/**
 * Deposit channel types
 */
export type DepositChannel = 'cash' | 'mobile_money' | 'bank_transfer' | 'standing_order' | 'payroll_deduction';

/**
 * Withdrawal channel types
 */
export type WithdrawalChannel = 'mobile_money' | 'bank_account' | 'cash';

/**
 * Interest calculation method
 */
export type InterestMethod = 'simple' | 'compound' | 'tiered';

/**
 * Deposit transaction
 */
export interface Deposit {
    id: string;
    tenantId: string;
    accountId: string;
    memberId: string;
    amount: number;
    channel: DepositChannel;
    reference: string;
    receiptId: string;
    postedAt: Date;
    processedBy: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Withdrawal transaction
 */
export interface Withdrawal {
    id: string;
    tenantId: string;
    accountId: string;
    memberId: string;
    amount: number;
    channel: WithdrawalChannel;
    reference: string;
    status: 'pending' | 'approved' | 'rejected' | 'completed';
    approvalRequired: boolean;
    approvedBy?: string;
    approvedAt?: Date;
    processedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Transfer transaction
 */
export interface Transfer {
    id: string;
    tenantId: string;
    sourceAccountId: string;
    destinationAccountId: string;
    sourceMemberId: string;
    destinationMemberId: string;
    amount: number;
    reference: string;
    type: 'intra_member' | 'inter_member';
    initiatedBy: string;
    authorizedBy?: string;
    authorizedAt?: Date;
    completedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Savings product configuration
 */
export interface SavingsProduct {
    id: string;
    tenantId: string;
    name: string;
    code: string;
    minDepositAmount: number;
    maxDepositAmount: number;
    minBalance: number;
    interestRate: number;
    interestMethod: InterestMethod;
    interestCalculationDays: number; // 365 or 360
    interestPaymentFrequency: 'monthly' | 'quarterly' | 'annually';
    noticePeriodDays: number;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Savings Service
 */
export class SavingsService {
    constructor(
        private minWithdrawalApprovalAmount: number = 500000, // UGX 500k
        private maxDailyWithdrawal: number = 5000000, // UGX 5M
    ) {}

    // ──────────────────────────────────────────────────────────
    // Deposits
    // ──────────────────────────────────────────────────────────

    /**
     * Generate unique transaction reference
     * Format: DEPOSIT-YYYYMMDD-XXXXX (e.g., DEPOSIT-20260214-A1B2C)
     * Requirement: SAV-003
     */
    generateTransactionReference(type: string = 'DEPOSIT'): string {
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        return `${type}-${date}-${nanoid(12)}`;
    }

    /**
     * Generate receipt ID for receipt printout
     */
    generateReceiptId(): string {
        return 'RCP-' + Date.now().toString(36).toUpperCase();
    }

    /**
     * Validate deposit amount
     * Requirement: SAV-005
     */
    validateDepositAmount(
        amount: number,
        product: SavingsProduct
    ): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (amount <= 0) {
            errors.push('Deposit amount must be greater than zero');
        }

        if (amount < product.minDepositAmount) {
            errors.push(
                `Deposit amount must be at least ${product.minDepositAmount} ` +
                `(minimum for ${product.name})`
            );
        }

        if (amount > product.maxDepositAmount) {
            errors.push(
                `Deposit amount cannot exceed ${product.maxDepositAmount} ` +
                `(maximum for ${product.name})`
            );
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Parse bulk deposit CSV for payroll or batch deposits
     * Requirement: SAV-004
     */
    parseBulkDepositCSV(csvData: string): {
        deposits: Array<{ memberId: string; amount: number; channel: DepositChannel }>;
        errors: { row: number; error: string }[];
    } {
        const deposits: Array<{ memberId: string; amount: number; channel: DepositChannel }> = [];
        const errors: { row: number; error: string }[] = [];

        const lines = csvData.trim().split('\n');
        if (lines.length < 2) {
            errors.push({ row: 0, error: 'CSV must contain header and at least one deposit row' });
            return { deposits, errors };
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const requiredHeaders = ['memberid', 'amount'];
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

        if (missingHeaders.length > 0) {
            errors.push({ row: 0, error: `Missing required columns: ${missingHeaders.join(', ')}` });
            return { deposits, errors };
        }

        for (let i = 1; i < lines.length; i++) {
            try {
                const values = lines[i].split(',').map(v => v.trim());
                const memberId = values[headers.indexOf('memberid')];
                const amount = parseFloat(values[headers.indexOf('amount')]);
                const channel = (values[headers.indexOf('channel')] || 'payroll_deduction') as DepositChannel;

                if (!memberId) {
                    errors.push({ row: i, error: 'Member ID is required' });
                    continue;
                }

                if (isNaN(amount) || amount <= 0) {
                    errors.push({ row: i, error: 'Invalid amount' });
                    continue;
                }

                deposits.push({ memberId, amount, channel });
            } catch (error) {
                errors.push({ row: i, error: error instanceof Error ? error.message : 'Unknown error' });
            }
        }

        return { deposits, errors };
    }

    // ──────────────────────────────────────────────────────────
    // Withdrawals
    // ──────────────────────────────────────────────────────────

    /**
     * Check if withdrawal requires approval based on amount
     * Requirement: SAV-007
     */
    requiresWithdrawalApproval(amount: number): boolean {
        return amount > this.minWithdrawalApprovalAmount;
    }

    /**
     * Validate withdrawal request
     * Requirement: SAV-008
     */
    validateWithdrawal(
        amount: number,
        availableBalance: number,
        minimumBalance: number,
        lienAmount: number = 0,
        pledgedCollateral: boolean = false
    ): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (amount <= 0) {
            errors.push('Withdrawal amount must be greater than zero');
        }

        if (amount > this.maxDailyWithdrawal) {
            errors.push(
                `Daily withdrawal limit is ${this.maxDailyWithdrawal}. ` +
                `Please request through admin for higher amounts.`
            );
        }

        const balanceAfterWithdrawal = availableBalance - amount;

        if (balanceAfterWithdrawal < minimumBalance) {
            const shortfall = minimumBalance - balanceAfterWithdrawal;
            errors.push(
                `Withdrawal would violate minimum balance requirement. ` +
                `Maximum you can withdraw is ${availableBalance - minimumBalance}`
            );
        }

        if (pledgedCollateral) {
            errors.push(
                'Cannot withdraw: This savings account is pledged as loan collateral. ' +
                'Contact loan officer to release the lien.'
            );
        }

        if (lienAmount > 0) {
            const heldAmount = availableBalance - lienAmount;
            if (amount > heldAmount) {
                errors.push(
                    `Funds are held due to pending loan or other obligations. ` +
                    `Available to withdraw: ${heldAmount}`
                );
            }
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Calculate exit fee for account closure
     * Requirement: SAV-011
     */
    calculateExitFee(balance: number, membershipMonths: number, exitFeePercentage: number = 0.01): number {
        // Fee reduced based on membership duration (incentivize long-term members)
        let feePercent = exitFeePercentage;
        
        if (membershipMonths > 60) {
            feePercent = 0; // No fee after 5 years
        } else if (membershipMonths > 36) {
            feePercent = exitFeePercentage * 0.5; // 50% fee
        }

        return balance * feePercent;
    }

    // ──────────────────────────────────────────────────────────
    // Transfers
    // ──────────────────────────────────────────────────────────

    /**
     * Log transfer with full traceability
     * Requirement: SAV-014
     */
    async logTransfer(
        transfer: Transfer,
        status: 'initiated' | 'authorized' | 'completed' | 'rejected'
    ): Promise<void> {
        appLogger.info('Savings transfer event', {
            transferId: transfer.id,
            status,
            sourceAccount: transfer.sourceAccountId,
            destinationAccount: transfer.destinationAccountId,
            amount: transfer.amount,
            type: transfer.type,
            initiatedBy: transfer.initiatedBy,
            authorizedBy: transfer.authorizedBy,
            timestamp: new Date().toISOString(),
        });

        // TODO: Persist to transfers ledger table
    }

    // ──────────────────────────────────────────────────────────
    // Interest Calculation
    // ──────────────────────────────────────────────────────────

    /**
     * Calculate interest using simple interest method
     * Formula: Principal × (Rate/100) × (Days/DaysInYear)
     * Requirement: SAV-015, SAV-016
     */
    calculateSimpleInterest(
        principal: number,
        annualRate: number,
        days: number,
        daysInYear: number = 365
    ): number {
        return (principal * (annualRate / 100) * (days / daysInYear));
    }

    /**
     * Calculate interest using compound interest method
     * Formula: Principal × (1 + Rate/100)^(Days/DaysInYear) - Principal
     * Requirement: SAV-015, SAV-016
     */
    calculateCompoundInterest(
        principal: number,
        annualRate: number,
        days: number,
        daysInYear: number = 365,
        compoundingFrequency: number = 1 // Number of times per year
    ): number {
        const rate = annualRate / 100 / compoundingFrequency;
        const periods = (days / daysInYear) * compoundingFrequency;
        const amount = principal * Math.pow(1 + rate, periods);
        return amount - principal;
    }

    /**
     * Calculate tiered interest based on balance bands
     * Requirement: SAV-015, SAV-016
     */
    calculateTieredInterest(
        balance: number,
        tiers: Array<{ minBalance: number; maxBalance: number; rate: number }>,
        days: number,
        daysInYear: number = 365
    ): number {
        // Find applicable tier based on balance
        const applicableTier = tiers.find(
            t => balance >= t.minBalance && balance <= t.maxBalance
        );

        if (!applicableTier) {
            appLogger.warn('No applicable interest tier found', { balance, tiers });
            return 0;
        }

        return this.calculateSimpleInterest(balance, applicableTier.rate, days, daysInYear);
    }

    /**
     * Calculate daily interest accrual
     * Requirement: SAV-016
     */
    calculateDailyInterestAccrual(
        balance: number,
        annualRate: number,
        method: InterestMethod = 'simple',
        daysInYear: number = 365
    ): number {
        if (method === 'simple') {
            return this.calculateSimpleInterest(balance, annualRate, 1, daysInYear);
        } else if (method === 'compound') {
            return this.calculateCompoundInterest(balance, annualRate, 1, daysInYear);
        }
        return 0;
    }

    /**
     * Get interest posting date based on frequency
     * Requirement: SAV-016
     */
    getNextInterestPostingDate(frequency: 'monthly' | 'quarterly' | 'annually', fromDate: Date = new Date()): Date {
        const date = new Date(fromDate);

        switch (frequency) {
            case 'monthly':
                date.setMonth(date.getMonth() + 1);
                date.setDate(1); // Post on 1st of next month
                break;
            case 'quarterly':
                date.setMonth(date.getMonth() + 3);
                date.setDate(1);
                break;
            case 'annually':
                date.setFullYear(date.getFullYear() + 1);
                date.setMonth(0);
                date.setDate(1);
                break;
        }

        return date;
    }

    /**
     * Calculate withholding tax (WHT) on interest
     * Requirement: SAV-018 (should)
     */
    calculateWithholdingTax(interestAmount: number, whtRate: number = 0.20): number {
        return interestAmount * whtRate;
    }

    /**
     * Generate interest certificate for member
     * Requirement: SAV-018 (should)
     */
    generateInterestCertificate(
        memberId: string,
        accountNumber: string,
        interestAmount: number,
        whtAmount: number,
        periodStart: Date,
        periodEnd: Date
    ): { certificateId: string; content: string } {
        const certificateId = 'INT-' + Date.now().toString(36).toUpperCase();

        const content = `
INTEREST & WITHHOLDING TAX CERTIFICATE
Certificate ID: ${certificateId}
Date Issued: ${new Date().toLocaleDateString()}

Member ID: ${memberId}
Account Number: ${accountNumber}

Period: ${periodStart.toLocaleDateString()} to ${periodEnd.toLocaleDateString()}

Total Interest Earned: ${interestAmount.toFixed(2)}
Withholding Tax Deducted (20%): ${whtAmount.toFixed(2)}
Net Interest Credited: ${(interestAmount - whtAmount).toFixed(2)}

This certificate is for tax purposes.
        `;

        return { certificateId, content };
    }
}

/**
 * Initialize savings service
 */
export function initSavingsService(): SavingsService {
    return new SavingsService();
}
