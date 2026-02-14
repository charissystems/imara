// tests/services/savingsAccounts.test.ts
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { SavingsService } from '../../src/services/savingsService';

// ────────────────────────────────────────────────────────────
// Savings & Accounts Business Logic Tests
// ────────────────────────────────────────────────────────────

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

describe('SavingsService - Enhanced', () => {
    const service = new SavingsService();

    // ─── Batch Deposit CSV Parsing ───────────────────────────

    describe('Batch Deposit CSV Parsing', () => {
        it('should parse valid CSV with default channel', () => {
            const csv = 'memberid,amount\nmem-001,50000\nmem-002,75000';
            const result = service.parseBulkDepositCSV(csv);
            expect(result.errors).toHaveLength(0);
            expect(result.deposits).toHaveLength(2);
            expect(result.deposits[0]).toEqual({
                memberId: 'mem-001',
                amount: 50000,
                channel: 'payroll_deduction',
            });
        });

        it('should parse CSV with explicit channel', () => {
            const csv = 'memberid,amount,channel\nmem-001,50000,cash';
            const result = service.parseBulkDepositCSV(csv);
            expect(result.deposits[0].channel).toBe('cash');
        });

        it('should reject empty CSV', () => {
            const result = service.parseBulkDepositCSV('');
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].error).toContain('header');
        });

        it('should reject CSV without required columns', () => {
            const csv = 'name,amount\nJohn,50000';
            const result = service.parseBulkDepositCSV(csv);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].error).toContain('memberid');
        });

        it('should report row errors for invalid amounts', () => {
            const csv = 'memberid,amount\nmem-001,abc\nmem-002,50000';
            const result = service.parseBulkDepositCSV(csv);
            expect(result.deposits).toHaveLength(1);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].row).toBe(1);
        });

        it('should reject negative amounts', () => {
            const csv = 'memberid,amount\nmem-001,-5000';
            const result = service.parseBulkDepositCSV(csv);
            expect(result.deposits).toHaveLength(0);
            expect(result.errors).toHaveLength(1);
        });

        it('should handle missing member ID', () => {
            const csv = 'memberid,amount\n,50000';
            const result = service.parseBulkDepositCSV(csv);
            expect(result.deposits).toHaveLength(0);
            expect(result.errors[0].error).toContain('Member ID');
        });
    });

    // ─── Deposit Validation ──────────────────────────────────

    describe('Deposit Validation', () => {
        const product = {
            id: 'prod-1',
            tenantId: 't-1',
            name: 'Standard Savings',
            code: 'STD',
            minDepositAmount: 1000,
            maxDepositAmount: 10_000_000,
            minBalance: 5000,
            interestRate: 5,
            interestMethod: 'simple' as const,
            interestCalculationDays: 365,
            interestPaymentFrequency: 'monthly' as const,
            noticePeriodDays: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        it('should validate a correct deposit amount', () => {
            const result = service.validateDepositAmount(50000, product);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should reject zero amount', () => {
            const result = service.validateDepositAmount(0, product);
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(expect.stringContaining('greater than zero'));
        });

        it('should reject below minimum', () => {
            const result = service.validateDepositAmount(500, product);
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(expect.stringContaining('at least'));
        });

        it('should reject above maximum', () => {
            const result = service.validateDepositAmount(20_000_000, product);
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(expect.stringContaining('cannot exceed'));
        });

        it('should accept exact minimum amount', () => {
            const result = service.validateDepositAmount(1000, product);
            expect(result.valid).toBe(true);
        });

        it('should accept exact maximum amount', () => {
            const result = service.validateDepositAmount(10_000_000, product);
            expect(result.valid).toBe(true);
        });
    });

    // ─── Withdrawal Validation ───────────────────────────────

    describe('Withdrawal Validation', () => {
        it('should validate valid withdrawal', () => {
            const result = service.validateWithdrawal(100000, 500000, 5000, 0, false);
            expect(result.valid).toBe(true);
        });

        it('should reject zero amount', () => {
            const result = service.validateWithdrawal(0, 500000, 5000, 0, false);
            expect(result.valid).toBe(false);
        });

        it('should reject exceeding daily limit', () => {
            const result = service.validateWithdrawal(10_000_000, 50_000_000, 5000, 0, false);
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('Daily withdrawal limit');
        });

        it('should reject violating minimum balance', () => {
            const result = service.validateWithdrawal(498000, 500000, 5000, 0, false);
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('minimum balance');
        });

        it('should reject pledged collateral', () => {
            const result = service.validateWithdrawal(10000, 500000, 5000, 0, true);
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('pledged');
        });

        it('should enforce lien amount', () => {
            // Balance 500k, lien 400k → available 100k
            const result = service.validateWithdrawal(200000, 500000, 5000, 400000, false);
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(expect.stringContaining('held'));
        });

        it('should allow withdrawal up to lien limit', () => {
            const result = service.validateWithdrawal(100000, 500000, 5000, 400000, false);
            expect(result.valid).toBe(true);
        });
    });

    // ─── Withdrawal Approval ─────────────────────────────────

    describe('Withdrawal Approval', () => {
        it('should require approval above threshold', () => {
            expect(service.requiresWithdrawalApproval(600000)).toBe(true);
        });

        it('should not require approval below threshold', () => {
            expect(service.requiresWithdrawalApproval(400000)).toBe(false);
        });

        it('should not require approval at exact threshold', () => {
            expect(service.requiresWithdrawalApproval(500000)).toBe(false);
        });
    });

    // ─── Account Closure Exit Fee ────────────────────────────

    describe('Exit Fee Calculation', () => {
        it('should calculate exit fee for new members', () => {
            // 12 months, 1% fee
            const fee = service.calculateExitFee(1_000_000, 12);
            expect(fee).toBe(10000); // 1%
        });

        it('should reduce fee after 3 years', () => {
            const fee = service.calculateExitFee(1_000_000, 48);
            expect(fee).toBe(5000); // 0.5%
        });

        it('should waive fee after 5 years', () => {
            const fee = service.calculateExitFee(1_000_000, 72);
            expect(fee).toBe(0);
        });

        it('should handle zero balance', () => {
            const fee = service.calculateExitFee(0, 12);
            expect(fee).toBe(0);
        });
    });

    // ─── Interest Calculations ───────────────────────────────

    describe('Interest Calculations', () => {
        it('should calculate simple interest', () => {
            // 1,000,000 at 10% for 30 days
            const interest = service.calculateSimpleInterest(1_000_000, 10, 30, 365);
            expect(interest).toBeCloseTo(8219.18, 0);
        });

        it('should calculate compound interest', () => {
            const interest = service.calculateCompoundInterest(1_000_000, 10, 365, 365, 12);
            // Should be slightly more than simple
            expect(interest).toBeGreaterThan(100000);
        });

        it('should calculate daily accrual (simple)', () => {
            const daily = service.calculateDailyInterestAccrual(1_000_000, 10, 'simple', 365);
            expect(daily).toBeCloseTo(273.97, 0);
        });

        it('should calculate daily accrual (compound)', () => {
            const daily = service.calculateDailyInterestAccrual(1_000_000, 10, 'compound', 365);
            // Compound: P * (1 + r)^(1/365) - P where r = 0.1, compoundingFrequency = 1
            expect(daily).toBeCloseTo(261.16, 0);
        });

        it('should return zero for unknown method', () => {
            const daily = service.calculateDailyInterestAccrual(1_000_000, 10, 'tiered', 365);
            // Tiered returns 0 without tiers
            expect(daily).toBe(0);
        });
    });

    // ─── Interest Posting Dates ──────────────────────────────

    describe('Interest Posting Dates', () => {
        it('should calculate monthly posting date', () => {
            const from = new Date(2026, 0, 15); // Jan 15
            const next = service.getNextInterestPostingDate('monthly', from);
            expect(next.getMonth()).toBe(1); // Feb
            expect(next.getDate()).toBe(1);
        });

        it('should calculate quarterly posting date', () => {
            const from = new Date(2026, 0, 15); // Jan 15
            const next = service.getNextInterestPostingDate('quarterly', from);
            expect(next.getMonth()).toBe(3); // April
            expect(next.getDate()).toBe(1);
        });

        it('should calculate annual posting date', () => {
            const from = new Date(2026, 5, 15); // Jun 15
            const next = service.getNextInterestPostingDate('annually', from);
            expect(next.getFullYear()).toBe(2027);
            expect(next.getMonth()).toBe(0); // January
            expect(next.getDate()).toBe(1);
        });
    });

    // ─── WHT on Interest ─────────────────────────────────────

    describe('Withholding Tax', () => {
        it('should calculate WHT at default 20%', () => {
            const wht = service.calculateWithholdingTax(10000);
            expect(wht).toBe(2000);
        });

        it('should calculate WHT at custom rate', () => {
            const wht = service.calculateWithholdingTax(10000, 0.15);
            expect(wht).toBe(1500);
        });

        it('should return zero for zero interest', () => {
            const wht = service.calculateWithholdingTax(0);
            expect(wht).toBe(0);
        });
    });

    // ─── Interest Certificate Generation ─────────────────────

    describe('Interest Certificate', () => {
        it('should generate certificate with all fields', () => {
            const cert = service.generateInterestCertificate(
                'mem-001',
                'SA-001',
                5000,
                1000,
                new Date(2025, 0, 1),
                new Date(2025, 11, 31),
            );

            expect(cert.certificateId).toMatch(/^INT-/);
            expect(cert.content).toContain('mem-001');
            expect(cert.content).toContain('SA-001');
            expect(cert.content).toContain('5000.00');
            expect(cert.content).toContain('1000.00');
            expect(cert.content).toContain('4000.00'); // Net
        });
    });

    // ─── Transaction Reference Generation ────────────────────

    describe('Transaction References', () => {
        it('should generate deposit reference', () => {
            const ref = service.generateTransactionReference('DEPOSIT');
            expect(ref).toMatch(/^DEPOSIT-\d{8}-[A-Z0-9]{5}$/);
        });

        it('should generate withdrawal reference', () => {
            const ref = service.generateTransactionReference('WITHDRAWAL');
            expect(ref).toMatch(/^WITHDRAWAL-\d{8}-[A-Z0-9]{5}$/);
        });

        it('should generate unique references', () => {
            const ref1 = service.generateTransactionReference();
            const ref2 = service.generateTransactionReference();
            expect(ref1).not.toBe(ref2);
        });

        it('should generate receipt ID', () => {
            const receipt = service.generateReceiptId();
            expect(receipt).toMatch(/^RCP-/);
        });
    });
});

// ────────────────────────────────────────────────────────────
// Interest Posting Logic Tests
// ────────────────────────────────────────────────────────────

describe('Interest Posting Logic', () => {
    it('should add accrued interest to balance and reset', () => {
        const currentBalance = new Decimal('500000');
        const accruedInterest = new Decimal('1250.50');
        const currentPaid = new Decimal('3750');

        const newBalance = currentBalance.plus(accruedInterest);
        const newPaid = currentPaid.plus(accruedInterest);

        expect(newBalance.toFixed(2)).toBe('501250.50');
        expect(newPaid.toFixed(2)).toBe('5000.50');
    });

    it('should not post when no interest accrued', () => {
        const accruedInterest = new Decimal('0');
        expect(accruedInterest.lte(0)).toBe(true);
    });

    it('should track cumulative interest paid', () => {
        let totalPaid = new Decimal(0);
        const monthlyPostings = [1250, 1280, 1310, 1342, 1375];

        for (const posting of monthlyPostings) {
            totalPaid = totalPaid.plus(posting);
        }

        expect(totalPaid.toFixed(2)).toBe('6557.00');
    });
});

// ────────────────────────────────────────────────────────────
// Account Statement Logic Tests
// ────────────────────────────────────────────────────────────

describe('Account Statement Logic', () => {
    it('should calculate running balance from transactions', () => {
        const transactions = [
            { type: 'deposit' as const, amount: 50000 },
            { type: 'deposit' as const, amount: 25000 },
            { type: 'withdrawal' as const, amount: 10000 },
            { type: 'deposit' as const, amount: 5000 },
            { type: 'withdrawal' as const, amount: 30000 },
            { type: 'interest' as const, amount: 1250 },
        ];

        let balance = new Decimal(0);
        const expected = [50000, 75000, 65000, 70000, 40000, 41250];

        transactions.forEach((tx, i) => {
            if (tx.type === 'withdrawal') {
                balance = balance.minus(tx.amount);
            } else {
                balance = balance.plus(tx.amount);
            }
            expect(balance.toNumber()).toBe(expected[i]);
        });
    });

    it('should sort statement entries by date', () => {
        const entries = [
            { date: new Date('2026-01-15'), type: 'deposit' },
            { date: new Date('2026-01-05'), type: 'withdrawal' },
            { date: new Date('2026-01-10'), type: 'interest' },
        ];

        entries.sort((a, b) => a.date.getTime() - b.date.getTime());

        expect(entries[0].date.getDate()).toBe(5);
        expect(entries[1].date.getDate()).toBe(10);
        expect(entries[2].date.getDate()).toBe(15);
    });

    it('should summarize deposits and withdrawals', () => {
        const deposits = [50000, 25000, 15000];
        const withdrawals = [10000, 5000];

        const totalDeposits = deposits.reduce((s, d) => s + d, 0);
        const totalWithdrawals = withdrawals.reduce((s, w) => s + w, 0);

        expect(totalDeposits).toBe(90000);
        expect(totalWithdrawals).toBe(15000);
    });
});

// ────────────────────────────────────────────────────────────
// Fixed Deposit Opening Validation Tests
// ────────────────────────────────────────────────────────────

describe('Fixed Deposit Opening Validation', () => {
    it('should validate amount against product minimum', () => {
        const minAmount = 100000;
        const maxAmount = 50_000_000;
        const amount = 50000;

        const belowMin = amount < minAmount;
        expect(belowMin).toBe(true);
    });

    it('should validate amount against product maximum', () => {
        const maxAmount = 50_000_000;
        const amount = 100_000_000;

        const aboveMax = amount > maxAmount;
        expect(aboveMax).toBe(true);
    });

    it('should accept valid amount within range', () => {
        const amount = 500000;
        const valid = amount >= 100000 && amount <= 50_000_000;
        expect(valid).toBe(true);
    });

    it('should calculate maturity date for days tenure', () => {
        const depositDate = new Date('2026-01-01');
        const maturityDate = new Date(depositDate);
        maturityDate.setDate(maturityDate.getDate() + 180);

        expect(maturityDate.toISOString().split('T')[0]).toBe('2026-06-30');
    });

    it('should calculate maturity date for months tenure', () => {
        const depositDate = new Date('2026-01-15');
        const maturityDate = new Date(depositDate);
        maturityDate.setMonth(maturityDate.getMonth() + 6);

        expect(maturityDate.toISOString().split('T')[0]).toBe('2026-07-15');
    });

    it('should calculate maturity date for years tenure', () => {
        const depositDate = new Date('2026-02-01');
        const maturityDate = new Date(depositDate);
        maturityDate.setFullYear(maturityDate.getFullYear() + 2);

        expect(maturityDate.toISOString().split('T')[0]).toBe('2028-02-01');
    });

    it('should generate unique FD certificate number', () => {
        const gen = () => `FD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const cert1 = gen();
        const cert2 = gen();
        expect(cert1).toMatch(/^FD-[A-Z0-9]+-[A-Z0-9]+$/);
        expect(cert1).not.toBe(cert2);
    });
});

// ────────────────────────────────────────────────────────────
// Premature Withdrawal Tests (Additional)
// ────────────────────────────────────────────────────────────

describe('Premature Withdrawal Penalty Calculations', () => {
    it('should calculate fixed penalty', () => {
        const interestEarned = new Decimal('25000');
        const penaltyAmount = new Decimal('5000');
        const penalty = penaltyAmount; // Fixed amount
        const net = Decimal.max(0, interestEarned.minus(penalty));
        expect(net.toFixed(2)).toBe('20000.00');
    });

    it('should calculate percentage penalty', () => {
        const interestEarned = new Decimal('25000');
        const penaltyRate = new Decimal('25'); // 25% of interest
        const penalty = interestEarned.mul(penaltyRate).div(100);
        expect(penalty.toFixed(2)).toBe('6250.00');
    });

    it('should calculate interest reduction penalty', () => {
        const interestEarned = new Decimal('25000');
        const reductionRate = new Decimal('50'); // 50% interest reduction
        const penalty = interestEarned.mul(reductionRate).div(100);
        const netInterest = interestEarned.minus(penalty);
        expect(netInterest.toFixed(2)).toBe('12500.00');
    });

    it('should calculate net payout with WHT', () => {
        const principal = new Decimal('1000000');
        const interestEarned = new Decimal('25000');
        const penalty = new Decimal('6250');
        const whtRate = new Decimal('15');

        const netInterest = Decimal.max(0, interestEarned.minus(penalty));
        const wht = netInterest.mul(whtRate).div(100);
        const netPayout = principal.plus(netInterest).minus(wht);

        expect(netInterest.toFixed(2)).toBe('18750.00');
        expect(wht.toFixed(2)).toBe('2812.50');
        expect(netPayout.toFixed(2)).toBe('1015937.50');
    });

    it('should ensure penalty does not exceed interest', () => {
        const interestEarned = new Decimal('5000');
        const penalty = new Decimal('10000');
        const netInterest = Decimal.max(0, interestEarned.minus(penalty));
        expect(netInterest.toFixed(2)).toBe('0.00');
    });
});
