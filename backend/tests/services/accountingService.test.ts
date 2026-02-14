// tests/services/accountingService.test.ts
import { describe, it, expect } from 'vitest';
import {
    AccountingService,
    initAccountingService,
    type AccountType,
    type ChartOfAccount,
    type JournalLineItem,
    type GLPosting,
} from '../../src/services/accountingService';

/**
 * AccountingService Unit Tests
 * Covers: Chart of Accounts, Journal Entries, Auto-Posting, Financial Statements
 */

const service = new AccountingService();

// ═══════════════════════════════════════════════════════════════
// validateChartOfAccount
// ═══════════════════════════════════════════════════════════════

describe('AccountingService.validateChartOfAccount', () => {
    const validAccount = {
        code: '1100',
        name: 'Cash on Hand',
        accountType: 'asset' as AccountType,
        normalBalance: 'debit' as const,
    };

    it('should pass with valid account data', () => {
        const result = service.validateChartOfAccount(validAccount);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should reject missing account code', () => {
        const result = service.validateChartOfAccount({ ...validAccount, code: '' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Account code is required');
    });

    it('should reject missing account name', () => {
        const result = service.validateChartOfAccount({ ...validAccount, name: '' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Account name is required');
    });

    it('should reject invalid account type', () => {
        const result = service.validateChartOfAccount({ ...validAccount, accountType: 'invalid' as any });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Valid account type is required');
    });

    it('should reject invalid normal balance', () => {
        const result = service.validateChartOfAccount({ ...validAccount, normalBalance: 'both' as any });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Normal balance must be debit or credit');
    });

    it('should accept all valid account types', () => {
        const types: AccountType[] = ['asset', 'liability', 'equity', 'income', 'expense'];
        for (const type of types) {
            const balance = ['asset', 'expense'].includes(type) ? 'debit' : 'credit';
            const result = service.validateChartOfAccount({
                ...validAccount,
                accountType: type,
                normalBalance: balance as any,
            });
            expect(result.valid).toBe(true);
        }
    });

    it('should allow unconventional normal balance (just warn)', () => {
        // Asset with credit balance — valid but unconventional
        const result = service.validateChartOfAccount({
            ...validAccount,
            accountType: 'asset',
            normalBalance: 'credit',
        });
        expect(result.valid).toBe(true); // should still be valid
    });

    it('should reject empty inputs', () => {
        const result = service.validateChartOfAccount({});
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
});

// ═══════════════════════════════════════════════════════════════
// createJournalEntry
// ═══════════════════════════════════════════════════════════════

describe('AccountingService.createJournalEntry', () => {
    const validEntries: JournalLineItem[] = [
        { accountCode: '1100', accountName: 'Cash', debit: 1000, credit: 0 },
        { accountCode: '4100', accountName: 'Revenue', debit: 0, credit: 1000 },
    ];

    it('should create valid journal entry', () => {
        const result = service.createJournalEntry(validEntries, 'Test entry', 'REF-001', 'user-1');
        expect(result.valid).toBe(true);
        expect(result.journalEntry).toBeDefined();
        expect(result.journalEntry!.description).toBe('Test entry');
        expect(result.journalEntry!.reference).toBe('REF-001');
        expect(result.journalEntry!.createdBy).toBe('user-1');
        expect(result.journalEntry!.status).toBe('draft');
        expect(result.journalEntry!.lineItems).toHaveLength(2);
    });

    it('should reject unbalanced entries', () => {
        const unbalanced: JournalLineItem[] = [
            { accountCode: '1100', accountName: 'Cash', debit: 1000, credit: 0 },
            { accountCode: '4100', accountName: 'Revenue', debit: 0, credit: 500 },
        ];
        const result = service.createJournalEntry(unbalanced, 'Test', 'REF', 'user');
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Debits') && e.includes('credits'))).toBe(true);
    });

    it('should reject single line item', () => {
        const single: JournalLineItem[] = [
            { accountCode: '1100', accountName: 'Cash', debit: 1000, credit: 0 },
        ];
        const result = service.createJournalEntry(single, 'Test', 'REF', 'user');
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('at least 2'))).toBe(true);
    });

    it('should reject empty line items', () => {
        const result = service.createJournalEntry([], 'Test', 'REF', 'user');
        expect(result.valid).toBe(false);
    });

    it('should reject entry with both debit and credit on same line', () => {
        const dualEntry: JournalLineItem[] = [
            { accountCode: '1100', accountName: 'Cash', debit: 500, credit: 500 },
            { accountCode: '4100', accountName: 'Revenue', debit: 0, credit: 0 },
        ];
        const result = service.createJournalEntry(dualEntry, 'Test', 'REF', 'user');
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Cannot have both debit and credit'))).toBe(true);
    });

    it('should reject missing description', () => {
        const result = service.createJournalEntry(validEntries, '', 'REF', 'user');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Description is required');
    });

    it('should reject missing reference', () => {
        const result = service.createJournalEntry(validEntries, 'Test', '', 'user');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Reference is required');
    });

    it('should allow rounding tolerance in balancing', () => {
        const entries: JournalLineItem[] = [
            { accountCode: '1100', accountName: 'Cash', debit: 33.33, credit: 0 },
            { accountCode: '1200', accountName: 'Bank', debit: 33.33, credit: 0 },
            { accountCode: '1300', accountName: 'Mobile', debit: 33.34, credit: 0 },
            { accountCode: '4100', accountName: 'Revenue', debit: 0, credit: 100.00 },
        ];
        const result = service.createJournalEntry(entries, 'Split', 'REF', 'user');
        expect(result.valid).toBe(true);
    });

    it('should generate an id for the journal entry', () => {
        const result = service.createJournalEntry(validEntries, 'Test', 'REF', 'user');
        expect(result.journalEntry!.id).toMatch(/^JE-/);
    });
});

// ═══════════════════════════════════════════════════════════════
// Auto-posting methods
// ═══════════════════════════════════════════════════════════════

describe('AccountingService.autoPostDepositTransaction', () => {
    it('should create double-entry for cash deposit', () => {
        const entry = service.autoPostDepositTransaction('mem-1', 5000, 'cash', '1110');
        expect(entry.lineItems).toHaveLength(2);
        expect(entry.lineItems[0].debit).toBe(5000);
        expect(entry.lineItems[0].credit).toBe(0);
        expect(entry.lineItems[1].debit).toBe(0);
        expect(entry.lineItems[1].credit).toBe(5000);
        expect(entry.status).toBe('posted');
        expect(entry.createdBy).toBe('SYSTEM');
    });

    it('should use correct cash account for bank_transfer', () => {
        const entry = service.autoPostDepositTransaction('mem-1', 1000, 'bank_transfer', '1110');
        expect(entry.lineItems[1].accountCode).toBe('1110');
    });

    it('should use correct cash account for mobile_money', () => {
        const entry = service.autoPostDepositTransaction('mem-1', 1000, 'mobile_money', '1110');
        expect(entry.lineItems[1].accountCode).toBe('1120');
    });

    it('should default to cash account code for unknown channel', () => {
        const entry = service.autoPostDepositTransaction('mem-1', 1000, 'unknown', '1110');
        expect(entry.lineItems[1].accountCode).toBe('1100');
    });

    it('should include member and channel in description', () => {
        const entry = service.autoPostDepositTransaction('mem-42', 1000, 'cash', '1110');
        expect(entry.description).toContain('mem-42');
        expect(entry.description).toContain('cash');
    });
});

describe('AccountingService.autoPostLoanDisbursement', () => {
    it('should create double-entry for loan disbursement', () => {
        const entry = service.autoPostLoanDisbursement('loan-1', 'mem-1', 50000);
        expect(entry.lineItems).toHaveLength(2);
        // Debit Loans Receivable
        expect(entry.lineItems[0].accountCode).toBe('1700');
        expect(entry.lineItems[0].debit).toBe(50000);
        // Credit Cash
        expect(entry.lineItems[1].accountCode).toBe('1110');
        expect(entry.lineItems[1].credit).toBe(50000);
        expect(entry.status).toBe('posted');
    });

    it('should include loan and member in reference/description', () => {
        const entry = service.autoPostLoanDisbursement('loan-99', 'mem-5', 10000);
        expect(entry.reference).toContain('loan-99');
        expect(entry.description).toContain('mem-5');
    });
});

describe('AccountingService.autoPostInterestIncome', () => {
    it('should create double-entry for interest income', () => {
        const entry = service.autoPostInterestIncome('loan-1', 2500);
        expect(entry.lineItems).toHaveLength(2);
        // Debit Loans Receivable
        expect(entry.lineItems[0].accountCode).toBe('1700');
        expect(entry.lineItems[0].debit).toBe(2500);
        // Credit Interest Income
        expect(entry.lineItems[1].accountCode).toBe('4100');
        expect(entry.lineItems[1].credit).toBe(2500);
    });
});

// ═══════════════════════════════════════════════════════════════
// Financial Reports
// ═══════════════════════════════════════════════════════════════

const makeAccount = (code: string, name: string, type: AccountType, normal: 'debit' | 'credit'): ChartOfAccount => ({
    id: code,
    tenantId: 't1',
    code,
    name,
    accountType: type,
    category: name,
    description: name,
    normalBalance: normal,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
});

const makePosting = (accountCode: string, debit: number, credit: number): GLPosting => ({
    id: `p-${Math.random()}`,
    tenantId: 't1',
    accountCode,
    accountName: '',
    postingDate: new Date(),
    reference: 'REF',
    debit,
    credit,
    runningBalance: 0,
    createdAt: new Date(),
});

describe('AccountingService.generateTrialBalance', () => {
    const accounts = [
        makeAccount('1100', 'Cash', 'asset', 'debit'),
        makeAccount('2100', 'Payables', 'liability', 'credit'),
        makeAccount('4100', 'Revenue', 'income', 'credit'),
    ];

    it('should generate balanced trial balance', () => {
        const postings = [
            makePosting('1100', 10000, 0),
            makePosting('2100', 0, 5000),
            makePosting('4100', 0, 5000),
        ];

        const tb = service.generateTrialBalance(postings, accounts);
        expect(tb.balanced).toBe(true);
        expect(tb.totalDebits).toBe(tb.totalCredits);
        expect(tb.accounts).toHaveLength(3);
    });

    it('should handle empty postings', () => {
        const tb = service.generateTrialBalance([], accounts);
        expect(tb.accounts).toHaveLength(0);
        expect(tb.totalDebits).toBe(0);
        expect(tb.totalCredits).toBe(0);
        expect(tb.balanced).toBe(true);
    });

    it('should detect unbalanced trial balance', () => {
        const postings = [
            makePosting('1100', 10000, 0),
            makePosting('2100', 0, 3000),
        ];
        const tb = service.generateTrialBalance(postings, accounts);
        expect(tb.balanced).toBe(false);
    });

    it('should calculate correct debit/credit balances per account', () => {
        const postings = [
            makePosting('1100', 5000, 0),
            makePosting('1100', 3000, 0),
        ];
        const tb = service.generateTrialBalance(postings, accounts);
        const cashLine = tb.accounts.find(a => a.code === '1100');
        expect(cashLine).toBeDefined();
        expect(cashLine!.debitBalance).toBe(8000);
    });
});

describe('AccountingService.generateIncomeStatement', () => {
    const accounts = [
        makeAccount('4100', 'Interest Income', 'income', 'credit'),
        makeAccount('5100', 'Salaries', 'expense', 'debit'),
        makeAccount('1100', 'Cash', 'asset', 'debit'),
    ];

    it('should calculate net income', () => {
        const postings = [
            makePosting('4100', 0, 15000),
            makePosting('5100', 8000, 0),
        ];
        const start = new Date('2024-01-01');
        const end = new Date('2024-12-31');

        const is = service.generateIncomeStatement(postings, accounts, start, end);
        expect(is.totalRevenue).toBe(15000);
        expect(is.totalExpenses).toBe(8000);
        expect(is.netIncome).toBe(7000);
    });

    it('should handle no revenue or expenses', () => {
        const is = service.generateIncomeStatement([], accounts, new Date(), new Date());
        expect(is.totalRevenue).toBe(0);
        expect(is.totalExpenses).toBe(0);
        expect(is.netIncome).toBe(0);
    });

    it('should only include income and expense accounts', () => {
        const postings = [
            makePosting('4100', 0, 5000),
            makePosting('5100', 2000, 0),
            makePosting('1100', 3000, 0), // asset — should not appear
        ];
        const is = service.generateIncomeStatement(postings, accounts, new Date(), new Date());
        expect(is.revenue).toHaveLength(1);
        expect(is.expenses).toHaveLength(1);
    });
});

describe('AccountingService.generateBalanceSheet', () => {
    const accounts = [
        makeAccount('1100', 'Cash', 'asset', 'debit'),
        makeAccount('2100', 'Payables', 'liability', 'credit'),
        makeAccount('3100', 'Capital', 'equity', 'credit'),
    ];

    it('should calculate total assets, liabilities, equity', () => {
        const postings = [
            makePosting('1100', 20000, 0),
            makePosting('2100', 0, 12000),
            makePosting('3100', 0, 8000),
        ];

        const bs = service.generateBalanceSheet(postings, accounts);
        expect(bs.totalAssets).toBe(20000);
        expect(bs.totalLiabilities).toBe(12000);
        expect(bs.totalEquity).toBe(8000);
        expect(bs.totalLiabilitiesAndEquity).toBe(20000);
    });

    it('should handle empty postings', () => {
        const bs = service.generateBalanceSheet([], accounts);
        expect(bs.totalAssets).toBe(0);
        expect(bs.totalLiabilities).toBe(0);
        expect(bs.totalEquity).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════════
// Income Categories
// ═══════════════════════════════════════════════════════════════

describe('AccountingService.getIncomeCategories', () => {
    it('should return standard SACCO income categories', () => {
        const categories = service.getIncomeCategories();
        expect(categories.length).toBeGreaterThanOrEqual(5);
        expect(categories.find(c => c.code === '4100')).toBeDefined();
        expect(categories.find(c => c.code === '4200')).toBeDefined();
    });

    it('should include code, name, and description for each', () => {
        const categories = service.getIncomeCategories();
        for (const cat of categories) {
            expect(cat.code).toBeTruthy();
            expect(cat.name).toBeTruthy();
            expect(cat.description).toBeTruthy();
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// initAccountingService
// ═══════════════════════════════════════════════════════════════

describe('initAccountingService', () => {
    it('should return an AccountingService instance', () => {
        const svc = initAccountingService();
        expect(svc).toBeInstanceOf(AccountingService);
    });
});
