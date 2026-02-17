/*
 * DATABASE TYPES INDEX
 * Central re-export point for all database type definitions
 * Organized by module for better maintainability
 */

// Utility types
export type { DecimalColumn, DateColumn, NullableDateColumn } from './common';

// Public schema
export type {
    TenantsTable,
    TenantMigrationsTable,
    TenantAuditLogTable,
    CurrenciesTable,
    TenantBackupsTable,
    TenantRetentionPoliciesTable,
    RolesTable as PublicRolesTable,
    PermissionsTable as PublicPermissionsTable,
    RolePermissionsTable as PublicRolePermissionsTable,
} from './public';

// Authentication & Authorization (001)
export type {
    PermissionsTable,
    RolesTable,
    RolePermissionsTable,
    StaffTable,
    StaffCredentialsTable,
} from './auth';

// Member Management (002)
export type {
    IdentityDocumentsTable,
    MembersTable,
    MembershipsTable,
    MemberAccountsTable,
} from './members';

// Savings & Accounts (003)
export type {
    SavingsProductsTable,
    SavingsAccountsTable,
    DepositsTable,
    WithdrawalsTable,
    InternalTransfersTable,
    InterestSchedulesTable,
} from './savings';

// Shares (004)
export type {
    ShareClassesTable,
    ShareHoldingsTable,
    ShareTransactionsTable,
    DividendDeclarationsTable,
    ShareRegisterTable,
} from './shares';

// Fixed Deposits (005)
export type {
    FixedDepositProductsTable,
    FixedDepositsTable,
    FdInterestSchedulesTable,
    FdMaturityAlertsTable,
    FdRolloversTable,
} from './deposits';

// Loans (006)
export type {
    LoanProductsTable,
    LoanApplicationsTable,
    LoanAppraisalsTable,
    LoanGuarantorsTable,
    LoanAccountsTable,
    LoanSchedulesTable,
    LoanRepaymentsTable,
    LoanRecoveryActionsTable,
} from './loans';

// Accounting (007)
export type {
    FinancialPeriodsTable,
    AccountsTable,
    TransactionsTable,
    ManualJournalEntriesTable,
    ManualJournalLinesTable,
    BudgetsTable,
    BudgetLinesTable,
    TrialBalanceTable,
} from './accounting';

// Messaging (008)
export type {
    MessageTemplatesTable,
    MessagesTable,
    MessageDeliveryLogTable,
    BulkCampaignsTable,
    CampaignMessagesTable,
    CommunicationPreferencesTable,
    LoanRepaymentRemindersTable,
    MaturityAlertsTable,
} from './messaging';

// Audit & Security (009)
export type {
    AuditLogTable,
    ActivityLogTable,
    DataExportLogTable,
    SecurityEventsTable,
    TwoFactorLogTable,
    PermissionAuditTable,
    ReconciliationAuditTable,
    UnmatchedReconciliationItemsTable,
    ApiAccessLogTable,
} from './audit';

// System Administration (010)
export type {
    SaccoConfigurationTable,
    BranchesTable,
    SystemSettingsTable,
    EmailGatewaysTable,
    SmsGatewaysTable,
    MobileMoneyConfigurationTable,
    NotificationSettingsTable,
    ConfigurationAuditLogTable,
    InterestRateConfigurationTable,
    PenaltyConfigurationTable,
    ScheduledTasksTable,
    ScheduledTaskLogsTable,
} from './admin';

// Additional Features (012)
export type {
    BeneficiariesTable,
    AccountLiensTable,
    StandingInstructionsTable,
    MemberCredentialsTable,
    FeeSchedulesTable,
    TransactionLimitsTable,
} from './additional';

// Database interfaces
export type { PublicDatabase, TenantDatabase, Database } from './database';

// CRUD helper types
export type {
    // Registry
    Tenant,
    NewTenant,
    TenantAuditLog,
    Currency,
    NewCurrency,
    // Authentication & Authorization
    Permission,
    NewPermission,
    PermissionUpdate,
    Role,
    NewRole,
    RoleUpdate,
    RolePermission,
    NewRolePermission,
    Staff,
    NewStaff,
    StaffUpdate,
    StaffCredentials,
    NewStaffCredentials,
    StaffCredentialsUpdate,
    // Member Management
    IdentityDocument,
    NewIdentityDocument,
    IdentityDocumentUpdate,
    Member,
    NewMember,
    MemberUpdate,
    Membership,
    NewMembership,
    MembershipUpdate,
    MemberAccount,
    NewMemberAccount,
    // Savings & Accounts
    SavingsProduct,
    NewSavingsProduct,
    SavingsProductUpdate,
    SavingsAccount,
    NewSavingsAccount,
    SavingsAccountUpdate,
    Deposit,
    NewDeposit,
    DepositUpdate,
    Withdrawal,
    NewWithdrawal,
    WithdrawalUpdate,
    InternalTransfer,
    NewInternalTransfer,
    InterestSchedule,
    NewInterestSchedule,
    // Shares
    ShareClass,
    NewShareClass,
    ShareClassUpdate,
    ShareHolding,
    NewShareHolding,
    ShareHoldingUpdate,
    ShareTransaction,
    NewShareTransaction,
    ShareTransactionUpdate,
    DividendDeclaration,
    NewDividendDeclaration,
    ShareRegisterEntry,
    // Fixed Deposits
    FixedDepositProduct,
    NewFixedDepositProduct,
    FixedDepositProductUpdate,
    FixedDeposit,
    NewFixedDeposit,
    FixedDepositUpdate,
    FdInterestSchedule,
    NewFdInterestSchedule,
    FdMaturityAlert,
    NewFdMaturityAlert,
    FdRollover,
    NewFdRollover,
    FdRolloverUpdate,
    // Loans
    LoanProduct,
    NewLoanProduct,
    LoanProductUpdate,
    LoanApplication,
    NewLoanApplication,
    LoanApplicationUpdate,
    LoanAppraisal,
    NewLoanAppraisal,
    LoanAppraisalUpdate,
    LoanGuarantor,
    NewLoanGuarantor,
    LoanAccount,
    NewLoanAccount,
    LoanAccountUpdate,
    LoanSchedule,
    NewLoanSchedule,
    LoanScheduleUpdate,
    LoanRepayment,
    NewLoanRepayment,
    LoanRepaymentUpdate,
    LoanRecoveryAction,
    NewLoanRecoveryAction,
    LoanRecoveryActionUpdate,
    // Accounting
    FinancialPeriod,
    NewFinancialPeriod,
    FinancialPeriodUpdate,
    Account,
    NewAccount,
    AccountUpdate,
    Transaction,
    NewTransaction,
    TransactionUpdate,
    ManualJournalEntry,
    NewManualJournalEntry,
    ManualJournalEntryUpdate,
    ManualJournalLine,
    NewManualJournalLine,
    Budget,
    NewBudget,
    BudgetUpdate,
    BudgetLine,
    NewBudgetLine,
    BudgetLineUpdate,
    TrialBalance,
    // Messaging
    MessageTemplate,
    NewMessageTemplate,
    MessageTemplateUpdate,
    Message,
    NewMessage,
    MessageUpdate,
    MessageDeliveryLog,
    NewMessageDeliveryLog,
    BulkCampaign,
    NewBulkCampaign,
    BulkCampaignUpdate,
    CommunicationPreference,
    NewCommunicationPreference,
    CommunicationPreferenceUpdate,
    LoanRepaymentReminder,
    NewLoanRepaymentReminder,
    LoanRepaymentReminderUpdate,
    MaturityAlert,
    NewMaturityAlert,
    // Audit & Security
    AuditLogEntry,
    NewAuditLogEntry,
    ActivityLogEntry,
    NewActivityLogEntry,
    DataExportLog,
    NewDataExportLog,
    SecurityEvent,
    NewSecurityEvent,
    TwoFactorLog,
    NewTwoFactorLog,
    PermissionAudit,
    NewPermissionAudit,
    ReconciliationAudit,
    NewReconciliationAudit,
    NewUnmatchedReconciliationItem,
    ApiAccessLog,
    NewApiAccessLog,
    // System Administration
    SaccoConfiguration,
    NewSaccoConfiguration,
    SaccoConfigurationUpdate,
    Branch,
    NewBranch,
    BranchUpdate,
    SystemSetting,
    NewSystemSetting,
    SystemSettingUpdate,
    EmailGateway,
    NewEmailGateway,
    EmailGatewayUpdate,
    SmsGateway,
    NewSmsGateway,
    SmsGatewayUpdate,
    MobileMoneyConfiguration,
    NewMobileMoneyConfiguration,
    MobileMoneyConfigurationUpdate,
    NotificationSetting,
    NewNotificationSetting,
    NotificationSettingUpdate,
    ConfigurationAuditLog,
    NewConfigurationAuditLog,
    InterestRateConfiguration,
    NewInterestRateConfiguration,
    InterestRateConfigurationUpdate,
    PenaltyConfiguration,
    NewPenaltyConfiguration,
    PenaltyConfigurationUpdate,
    ScheduledTask,
    NewScheduledTask,
    ScheduledTaskUpdate,
    ScheduledTaskLog,
    NewScheduledTaskLog,
    // Additional Features (012)
    Beneficiary,
    NewBeneficiary,
    BeneficiaryUpdate,
    AccountLien,
    NewAccountLien,
    AccountLienUpdate,
    StandingInstruction,
    NewStandingInstruction,
    StandingInstructionUpdate,
    MemberCredential,
    NewMemberCredential,
    MemberCredentialUpdate,
    FeeSchedule,
    NewFeeSchedule,
    FeeScheduleUpdate,
    TransactionLimit,
    NewTransactionLimit,
    TransactionLimitUpdate,
} from './crud';
// Multitenancy & Administration
export type {
    TenantSetupChecklist,
    TenantSetupChecklistSelectable,
    TenantSetupChecklistInsertable,
    TenantSetupChecklistUpdateable,
    TenantBackup,
    TenantBackupSelectable,
    TenantBackupInsertable,
    TenantBackupUpdateable,
    TenantPurgeLog,
    TenantPurgeLogSelectable,
    TenantPurgeLogInsertable,
    TenantPurgeLogUpdateable,
    TenantResourceUsage,
    TenantResourceUsageSelectable,
    TenantResourceUsageInsertable,
    TenantResourceUsageUpdateable,
    TenantFeatureUsage,
    TenantFeatureUsageSelectable,
    TenantFeatureUsageInsertable,
    TenantFeatureUsageUpdateable,
    TenantRetentionPolicy,
    TenantRetentionPolicySelectable,
    TenantRetentionPolicyInsertable,
    TenantRetentionPolicyUpdateable,
    TenantMigrationDetail,
    TenantMigrationDetailSelectable,
    TenantMigrationDetailInsertable,
    TenantMigrationDetailUpdateable,
} from './multitenancy';