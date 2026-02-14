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

// Schedule Calculator
export { ScheduleCalculator } from './scheduleCalculator';
export type {
    ScheduleInput,
    ScheduleInstallment,
    RepaymentSchedule,
    RepaymentAllocationInput,
    RepaymentAllocationResult,
} from './scheduleCalculator';

// Interest Accrual Service
export { InterestCalculator, InterestAccrualEngine } from './interestAccrualService';
export type {
    DailyAccrualResult,
    AccrualBatchResult,
    PostingBatchResult,
    InterestCalcMethod,
    CalculationBasis,
    PostingFrequency,
} from './interestAccrualService';

// Repayment Service
export { RepaymentService } from './repaymentService';
export type {
    ProcessRepaymentInput,
    ProcessRepaymentResult,
    PenaltyBatchResult,
    NplBatchResult,
    ReminderRecord,
} from './repaymentService';

// Job Scheduler
export { getJobScheduler, startJobScheduler, stopJobScheduler } from '../jobs/scheduler';
export type { JobType, JobData } from '../jobs/scheduler';

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

// Email Service
export { EmailService } from './emailService';
export type {
    SendEmailOptions,
    SendEmailResult,
    EmailAttachment,
    EmailGatewayConfig,
} from './emailService';

// Notification Service
export { NotificationService } from './notificationService';
export type {
    NotificationChannel,
    NotificationRecipient,
    SendNotificationOptions,
    NotificationResult,
    BulkNotificationOptions,
    BulkNotificationResult,
} from './notificationService';

// Password Reset Service
export { PasswordResetService } from './passwordResetService';
export type {
    ResetTokenData,
    RequestResetResult,
    ResetPasswordResult,
} from './passwordResetService';

// Fixed Deposit Service
export { FixedDepositService } from './fixedDepositService';
export type {
    MaturityCheckResult,
    FdInterestAccrualResult,
    PrematureWithdrawalResult,
} from './fixedDepositService';

// Two-Factor Authentication Service
export { TwoFactorService } from './twoFactorService';
export type {
    TwoFactorSetupResult,
    TwoFactorVerifyResult,
} from './twoFactorService';
