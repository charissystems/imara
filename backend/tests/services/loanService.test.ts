// tests/services/loanService.test.ts
import { describe, it, expect } from 'vitest';
import {
    LoanService,
    initLoanService,
    type LoanProduct,
} from '../../src/services/loanService';

/**
 * LoanService Unit Tests
 * Covers: loan product validation, eligibility, credit scoring,
 *         cost calculation, repayment schedule, repayment allocation,
 *         penalties, NPL flagging, early settlement
 */

const service = new LoanService();

// ─── Fixture: a valid loan product ───────────────────────────

const validProduct: LoanProduct = {
    id: 'prod-1',
    tenantId: 't-1',
    name: 'Emergency Loan',
    code: 'EMG',
    category: 'emergency',
    minAmount: 5000,
    maxAmount: 500000,
    minTenureMonths: 1,
    maxTenureMonths: 12,
    interestRate: 12,
    interestMethod: 'flat',
    applicationFee: 1,
    processingFee: 2,
    insuranceFee: 0.5,
    penaltyRate: 0.5,
    minSavingsMultiplier: 3,
    minMembershipMonths: 6,
    maxConcurrentLoans: 2,
    requiresGuarantor: false,
    requiresCollateral: false,
    createdAt: new Date(),
    updatedAt: new Date(),
};

// ═══════════════════════════════════════════════════════════════
// validateLoanProduct
// ═══════════════════════════════════════════════════════════════

describe('LoanService.validateLoanProduct', () => {
    it('should pass with valid product', () => {
        const result = service.validateLoanProduct(validProduct);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should reject missing name', () => {
        const result = service.validateLoanProduct({ ...validProduct, name: '' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Product name is required');
    });

    it('should reject missing code', () => {
        const result = service.validateLoanProduct({ ...validProduct, code: '' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Product code is required');
    });

    it('should reject missing category', () => {
        const result = service.validateLoanProduct({ ...validProduct, category: undefined as any });
        expect(result.valid).toBe(false);
    });

    it('should reject min > max amount', () => {
        const result = service.validateLoanProduct({ ...validProduct, minAmount: 100000, maxAmount: 5000 });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('cannot exceed'))).toBe(true);
    });

    it('should reject negative amounts', () => {
        const result = service.validateLoanProduct({ ...validProduct, minAmount: -100 });
        expect(result.valid).toBe(false);
    });

    it('should reject interest rate above 100', () => {
        const result = service.validateLoanProduct({ ...validProduct, interestRate: 150 });
        expect(result.valid).toBe(false);
    });

    it('should reject invalid interest method', () => {
        const result = service.validateLoanProduct({ ...validProduct, interestMethod: 'bogus' as any });
        expect(result.valid).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════
// computeMaxLoanableAmount
// ═══════════════════════════════════════════════════════════════

describe('LoanService.computeMaxLoanableAmount', () => {
    it('should compute savings * multiplier', () => {
        const max = service.computeMaxLoanableAmount(100000, validProduct);
        expect(max).toBe(300000); // 100k * 3, capped at maxAmount 500k
    });

    it('should cap at product max', () => {
        const max = service.computeMaxLoanableAmount(1000000, validProduct);
        expect(max).toBe(500000); // capped
    });

    it('should return 0 for 0 savings', () => {
        const max = service.computeMaxLoanableAmount(0, validProduct);
        expect(max).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════════
// validateLoanApplication
// ═══════════════════════════════════════════════════════════════

describe('LoanService.validateLoanApplication', () => {
    const validApp = {
        requestedAmount: 50000,
        requestedTenureMonths: 6,
        purpose: 'Emergency medical',
    };

    it('should pass with valid application', () => {
        const result = service.validateLoanApplication(validApp, validProduct);
        expect(result.valid).toBe(true);
    });

    it('should reject amount above max', () => {
        const result = service.validateLoanApplication(
            { ...validApp, requestedAmount: 999999 },
            validProduct,
        );
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('exceeds'))).toBe(true);
    });

    it('should reject amount below min', () => {
        const result = service.validateLoanApplication(
            { ...validApp, requestedAmount: 100 },
            validProduct,
        );
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('below'))).toBe(true);
    });

    it('should reject tenure above max', () => {
        const result = service.validateLoanApplication(
            { ...validApp, requestedTenureMonths: 24 },
            validProduct,
        );
        expect(result.valid).toBe(false);
    });

    it('should reject tenure below min', () => {
        const product = { ...validProduct, minTenureMonths: 3 };
        const result = service.validateLoanApplication(
            { ...validApp, requestedTenureMonths: 1 },
            product,
        );
        expect(result.valid).toBe(false);
    });

    it('should reject missing purpose', () => {
        const result = service.validateLoanApplication(
            { ...validApp, purpose: '' },
            validProduct,
        );
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Loan purpose is required');
    });

    it('should reject zero amount', () => {
        const result = service.validateLoanApplication(
            { ...validApp, requestedAmount: 0 },
            validProduct,
        );
        expect(result.valid).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════
// checkEligibility
// ═══════════════════════════════════════════════════════════════

describe('LoanService.checkEligibility', () => {
    it('should be eligible when all criteria met', () => {
        const result = service.checkEligibility(200000, 12, 0, validProduct);
        expect(result.eligible).toBe(true);
        expect(result.reasons).toHaveLength(0);
    });

    it('should fail on insufficient savings', () => {
        const result = service.checkEligibility(100, 12, 0, validProduct);
        expect(result.eligible).toBe(false);
        expect(result.reasons.some(r => r.includes('Insufficient savings'))).toBe(true);
    });

    it('should fail on short membership', () => {
        const result = service.checkEligibility(200000, 2, 0, validProduct); // 2 months < 6 required
        expect(result.eligible).toBe(false);
        expect(result.reasons.some(r => r.includes('Membership too new'))).toBe(true);
    });

    it('should fail on too many concurrent loans', () => {
        const result = service.checkEligibility(200000, 12, 3, validProduct); // max is 2
        expect(result.eligible).toBe(false);
        expect(result.reasons.some(r => r.includes('maximum concurrent'))).toBe(true);
    });

    it('should fail when requested amount exceeds eligibility', () => {
        const result = service.checkEligibility(10000, 12, 0, validProduct, 999999);
        expect(result.eligible).toBe(false);
        expect(result.reasons.some(r => r.includes('exceeds'))).toBe(true);
    });

    it('should accumulate multiple failure reasons', () => {
        const result = service.checkEligibility(100, 1, 5, validProduct);
        expect(result.eligible).toBe(false);
        expect(result.reasons.length).toBeGreaterThanOrEqual(3);
    });
});

// ═══════════════════════════════════════════════════════════════
// calculateCreditScore
// ═══════════════════════════════════════════════════════════════

describe('LoanService.calculateCreditScore', () => {
    it('should sum component scores', () => {
        expect(service.calculateCreditScore(25, 15, 15, 25)).toBe(80);
    });

    it('should clamp at 100', () => {
        expect(service.calculateCreditScore(30, 20, 20, 30)).toBe(100);
        expect(service.calculateCreditScore(50, 50, 50, 50)).toBe(100);
    });

    it('should clamp at 0', () => {
        expect(service.calculateCreditScore(-10, -5, 0, 0)).toBe(0);
    });

    it('should return 0 for all zeros', () => {
        expect(service.calculateCreditScore(0, 0, 0, 0)).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════════
// calculateTotalLoanCost
// ═══════════════════════════════════════════════════════════════

describe('LoanService.calculateTotalLoanCost', () => {
    it('should calculate flat interest correctly', () => {
        const cost = service.calculateTotalLoanCost(100000, validProduct, 12);
        // Flat: 100000 * 12/100 * 12/12 = 12000
        expect(cost.interestTotal).toBe(12000);
        expect(cost.principal).toBe(100000);
        expect(cost.applicationFee).toBe(1000); // 1%
        expect(cost.processingFee).toBe(2000); // 2%
        expect(cost.insuranceFee).toBe(500); // 0.5%
        expect(cost.total).toBe(100000 + 12000 + 1000 + 2000 + 500);
    });

    it('should calculate declining interest (less than flat)', () => {
        const decliningProduct = { ...validProduct, interestMethod: 'declining_emi' as const };
        const cost = service.calculateTotalLoanCost(100000, decliningProduct, 12);
        // Declining EMI interest is computed from the actual schedule, which is
        // more accurate than the old approximation (principal * rate * months/24).
        // With 12% annual rate over 12 monthly installments, actual EMI interest ≈ 6618.53
        expect(cost.interestTotal).toBeCloseTo(6618.53, 0);
        expect(cost.interestTotal).toBeLessThan(12000); // less than flat
    });

    it('should include all fees', () => {
        const cost = service.calculateTotalLoanCost(100000, validProduct, 12);
        expect(cost.total).toBeGreaterThan(cost.principal);
    });
});

// ═══════════════════════════════════════════════════════════════
// generateRepaymentSchedule
// ═══════════════════════════════════════════════════════════════

describe('LoanService.generateRepaymentSchedule', () => {
    const startDate = new Date('2024-01-01');

    it('should generate correct number of installments', () => {
        const schedule = service.generateRepaymentSchedule(120000, 12, 12, 'flat', startDate);
        expect(schedule).toHaveLength(12);
    });

    it('flat: equal principal across all installments', () => {
        const schedule = service.generateRepaymentSchedule(120000, 12, 12, 'flat', startDate);
        for (const inst of schedule) {
            expect(inst.principalAmount).toBe(10000); // 120k / 12
        }
    });

    it('flat: equal interest across all installments', () => {
        const schedule = service.generateRepaymentSchedule(120000, 12, 12, 'flat', startDate);
        const expectedMonthlyInterest = 120000 * (12 / 12 / 100);
        for (const inst of schedule) {
            expect(inst.interestAmount).toBeCloseTo(expectedMonthlyInterest, 2);
        }
    });

    it('declining_emi: constant total payment (EMI)', () => {
        const schedule = service.generateRepaymentSchedule(120000, 12, 12, 'declining_emi', startDate);
        // All EMI installments should have roughly equal total
        const totals = schedule.map(i => i.totalAmount);
        const first = totals[0];
        for (const t of totals) {
            expect(t).toBeCloseTo(first, 0);
        }
    });

    it('declining_principal: principal is constant, interest decreases', () => {
        const schedule = service.generateRepaymentSchedule(120000, 12, 12, 'declining_principal', startDate);
        for (const inst of schedule) {
            expect(inst.principalAmount).toBe(10000);
        }
        // Interest should decrease
        expect(schedule[0].interestAmount).toBeGreaterThan(schedule[11].interestAmount);
    });

    it('should set all installments to pending status', () => {
        const schedule = service.generateRepaymentSchedule(100000, 6, 12, 'flat', startDate);
        for (const inst of schedule) {
            expect(inst.status).toBe('pending');
            expect(inst.paidAmount).toBe(0);
        }
    });

    it('should have sequential installment numbers', () => {
        const schedule = service.generateRepaymentSchedule(100000, 6, 12, 'flat', startDate);
        for (let i = 0; i < schedule.length; i++) {
            expect(schedule[i].installmentNumber).toBe(i + 1);
        }
    });

    it('should have due dates spaced monthly', () => {
        const schedule = service.generateRepaymentSchedule(100000, 3, 12, 'flat', startDate);
        expect(schedule[0].dueDate.getMonth()).toBe(1); // Feb
        expect(schedule[1].dueDate.getMonth()).toBe(2); // Mar
        expect(schedule[2].dueDate.getMonth()).toBe(3); // Apr
    });
});

// ═══════════════════════════════════════════════════════════════
// allocateRepayment
// ═══════════════════════════════════════════════════════════════

describe('LoanService.allocateRepayment', () => {
    it('should allocate in order: penalty → interest → principal', () => {
        const result = service.allocateRepayment(10000, 2000, 3000, 5000);
        expect(result.allocatedPenalty).toBe(2000);
        expect(result.allocatedInterest).toBe(3000);
        expect(result.allocatedPrincipal).toBe(5000);
        expect(result.remaining).toBe(0);
    });

    it('should handle partial payment (only covers penalty)', () => {
        const result = service.allocateRepayment(1000, 2000, 3000, 5000);
        expect(result.allocatedPenalty).toBe(1000);
        expect(result.allocatedInterest).toBe(0);
        expect(result.allocatedPrincipal).toBe(0);
        expect(result.remaining).toBe(0);
    });

    it('should handle partial (covers penalty + partial interest)', () => {
        const result = service.allocateRepayment(3500, 2000, 3000, 5000);
        expect(result.allocatedPenalty).toBe(2000);
        expect(result.allocatedInterest).toBe(1500);
        expect(result.allocatedPrincipal).toBe(0);
        expect(result.remaining).toBe(0);
    });

    it('should return overpayment as remaining', () => {
        const result = service.allocateRepayment(15000, 2000, 3000, 5000);
        expect(result.allocatedPenalty).toBe(2000);
        expect(result.allocatedInterest).toBe(3000);
        expect(result.allocatedPrincipal).toBe(5000);
        expect(result.remaining).toBe(5000);
    });

    it('should handle zero penalty', () => {
        const result = service.allocateRepayment(5000, 0, 2000, 3000);
        expect(result.allocatedPenalty).toBe(0);
        expect(result.allocatedInterest).toBe(2000);
        expect(result.allocatedPrincipal).toBe(3000);
    });

    it('should accept custom allocation order', () => {
        const result = service.allocateRepayment(
            3000, 1000, 1000, 5000,
            ['principal', 'interest', 'penalty'],
        );
        expect(result.allocatedPrincipal).toBe(3000);
        expect(result.allocatedInterest).toBe(0);
        expect(result.allocatedPenalty).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════════
// calculatePenaltyFee
// ═══════════════════════════════════════════════════════════════

describe('LoanService.calculatePenaltyFee', () => {
    it('should compute daily penalty correctly', () => {
        // 10000 outstanding, 0.5% daily, 5 days overdue
        const fee = service.calculatePenaltyFee(10000, 0.5, 5);
        expect(fee).toBe(250);
    });

    it('should return 0 for 0 days overdue', () => {
        expect(service.calculatePenaltyFee(10000, 0.5, 0)).toBe(0);
    });

    it('should return 0 for 0 outstanding', () => {
        expect(service.calculatePenaltyFee(0, 0.5, 10)).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════════
// isNonPerformingLoan
// ═══════════════════════════════════════════════════════════════

describe('LoanService.isNonPerformingLoan', () => {
    it('should flag as NPL at 90 days', () => {
        expect(service.isNonPerformingLoan(90)).toBe(true);
    });

    it('should flag as NPL above 90 days', () => {
        expect(service.isNonPerformingLoan(120)).toBe(true);
    });

    it('should NOT flag below 90 days', () => {
        expect(service.isNonPerformingLoan(89)).toBe(false);
    });

    it('should NOT flag at 0 days', () => {
        expect(service.isNonPerformingLoan(0)).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════
// generateRepaymentReminder
// ═══════════════════════════════════════════════════════════════

describe('LoanService.generateRepaymentReminder', () => {
    it('should include loan number and amount in SMS', () => {
        const result = service.generateRepaymentReminder(
            'mem-1', 'LN-001', 5000, new Date('2024-06-15'), 3,
        );
        expect(result.sms).toContain('LN-001');
        expect(result.sms).toContain('5000');
    });

    it('should include details in email body', () => {
        const result = service.generateRepaymentReminder(
            'mem-1', 'LN-001', 5000, new Date('2024-06-15'), 3,
        );
        expect(result.email).toContain('LN-001');
        expect(result.email).toContain('5000');
        expect(result.email).toContain('3');
    });
});

// ═══════════════════════════════════════════════════════════════
// computeEarlySettlementRebate
// ═══════════════════════════════════════════════════════════════

describe('LoanService.computeEarlySettlementRebate', () => {
    it('should calculate pro-rata rebate', () => {
        // 12000 total interest, 6 months remaining out of 12
        const rebate = service.computeEarlySettlementRebate(12000, 6, 12);
        expect(rebate).toBe(6000);
    });

    it('should return 0 when no months remaining', () => {
        expect(service.computeEarlySettlementRebate(12000, 0, 12)).toBe(0);
    });

    it('should return full amount when all months remaining', () => {
        expect(service.computeEarlySettlementRebate(12000, 12, 12)).toBe(12000);
    });
});

// ═══════════════════════════════════════════════════════════════
// initLoanService
// ═══════════════════════════════════════════════════════════════

describe('initLoanService', () => {
    it('should return a LoanService instance', () => {
        expect(initLoanService()).toBeInstanceOf(LoanService);
    });
});
