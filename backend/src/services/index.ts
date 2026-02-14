/**
 * Services Index
 * Central export point for all business logic services
 */

// Authentication Service
export { AuthService, initAuthService } from './authService';
export type { AuthJWTPayload, TwoFactorConfig } from './authService';

// Member Service
export { MemberService, initMemberService } from './memberService';
export type {
    MemberProfile,
    NextOfKin,
    Beneficiary,
    MemberAccount,
} from './memberService';

// Savings Service
export { SavingsService, initSavingsService } from './savingsService';
export type {
    Deposit,
    Withdrawal,
    Transfer,
    SavingsProduct,
    DepositChannel,
    WithdrawalChannel,
    InterestMethod,
} from './savingsService';

// Loan Service
export { LoanService, initLoanService } from './loanService';
export type {
    LoanProduct,
    LoanApplication,
    LoanCollateral,
    LoanAgreement,
    LoanInstallment,
    LoanRepayment,
} from './loanService';

// Accounting Service
export { AccountingService, initAccountingService } from './accountingService';
export type {
    ChartOfAccount,
    JournalEntry,
    JournalLineItem,
    GLPosting,
    TrialBalance,
    IncomeStatement,
    BalanceSheet,
    AccountType,
} from './accountingService';
