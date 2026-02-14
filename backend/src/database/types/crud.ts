import { Insertable, Selectable, Updateable } from 'kysely';

// Public/Registry
import { TenantsTable, TenantMigrationsTable, TenantAuditLogTable, CurrenciesTable } from './public';

// Auth
import {
    PermissionsTable,
    RolesTable,
    RolePermissionsTable,
    StaffTable,
    StaffCredentialsTable,
} from './auth';

// Members
import {
    IdentityDocumentsTable,
    MembersTable,
    MembershipsTable,
    MemberAccountsTable,
} from './members';

// Savings
import {
    SavingsProductsTable,
    SavingsAccountsTable,
    DepositsTable,
    WithdrawalsTable,
    InternalTransfersTable,
    InterestSchedulesTable,
} from './savings';

// Shares
import {
    ShareClassesTable,
    ShareHoldingsTable,
    ShareTransactionsTable,
    DividendDeclarationsTable,
    ShareRegisterTable,
} from './shares';

// Fixed Deposits
import {
    FixedDepositProductsTable,
    FixedDepositsTable,
    FdInterestSchedulesTable,
    FdMaturityAlertsTable,
    FdRolloversTable,
} from './deposits';

// Loans
import {
    LoanProductsTable,
    LoanApplicationsTable,
    LoanAppraisalsTable,
    LoanGuarantorsTable,
    LoanAccountsTable,
    LoanSchedulesTable,
    LoanRepaymentsTable,
    LoanRecoveryActionsTable,
} from './loans';

// Accounting
import {
    FinancialPeriodsTable,
    AccountsTable,
    TransactionsTable,
    ManualJournalEntriesTable,
    ManualJournalLinesTable,
    BudgetsTable,
    BudgetLinesTable,
    TrialBalanceTable,
} from './accounting';

// Messaging
import {
    MessageTemplatesTable,
    MessagesTable,
    MessageDeliveryLogTable,
    BulkCampaignsTable,
    CampaignMessagesTable,
    CommunicationPreferencesTable,
    LoanRepaymentRemindersTable,
    MaturityAlertsTable,
} from './messaging';

// Audit & Security
import {
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

// Admin
import {
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

/*
 * HELPER TYPES (CRUD GENERICS)
 * Selectable, Insertable, and Updateable types generated for use in Repositories and Services
 */

// Registry
export type Tenant = Selectable<TenantsTable>;
export type NewTenant = Insertable<TenantsTable>;
export type TenantAuditLog = Selectable<TenantAuditLogTable>;
export type Currency = Selectable<CurrenciesTable>;
export type NewCurrency = Insertable<CurrenciesTable>;

// Authentication & Authorization
export type Permission = Selectable<PermissionsTable>;
export type NewPermission = Insertable<PermissionsTable>;
export type PermissionUpdate = Updateable<PermissionsTable>;
export type Role = Selectable<RolesTable>;
export type NewRole = Insertable<RolesTable>;
export type RoleUpdate = Updateable<RolesTable>;
export type RolePermission = Selectable<RolePermissionsTable>;
export type NewRolePermission = Insertable<RolePermissionsTable>;
export type Staff = Selectable<StaffTable>;
export type NewStaff = Insertable<StaffTable>;
export type StaffUpdate = Updateable<StaffTable>;
export type StaffCredentials = Selectable<StaffCredentialsTable>;
export type NewStaffCredentials = Insertable<StaffCredentialsTable>;
export type StaffCredentialsUpdate = Updateable<StaffCredentialsTable>;

// Member Management
export type IdentityDocument = Selectable<IdentityDocumentsTable>;
export type NewIdentityDocument = Insertable<IdentityDocumentsTable>;
export type IdentityDocumentUpdate = Updateable<IdentityDocumentsTable>;
export type Member = Selectable<MembersTable>;
export type NewMember = Insertable<MembersTable>;
export type MemberUpdate = Updateable<MembersTable>;
export type Membership = Selectable<MembershipsTable>;
export type NewMembership = Insertable<MembershipsTable>;
export type MembershipUpdate = Updateable<MembershipsTable>;
export type MemberAccount = Selectable<MemberAccountsTable>;
export type NewMemberAccount = Insertable<MemberAccountsTable>;

// Savings & Accounts
export type SavingsProduct = Selectable<SavingsProductsTable>;
export type NewSavingsProduct = Insertable<SavingsProductsTable>;
export type SavingsProductUpdate = Updateable<SavingsProductsTable>;
export type SavingsAccount = Selectable<SavingsAccountsTable>;
export type NewSavingsAccount = Insertable<SavingsAccountsTable>;
export type SavingsAccountUpdate = Updateable<SavingsAccountsTable>;
export type Deposit = Selectable<DepositsTable>;
export type NewDeposit = Insertable<DepositsTable>;
export type DepositUpdate = Updateable<DepositsTable>;
export type Withdrawal = Selectable<WithdrawalsTable>;
export type NewWithdrawal = Insertable<WithdrawalsTable>;
export type WithdrawalUpdate = Updateable<WithdrawalsTable>;
export type InternalTransfer = Selectable<InternalTransfersTable>;
export type NewInternalTransfer = Insertable<InternalTransfersTable>;
export type InterestSchedule = Selectable<InterestSchedulesTable>;
export type NewInterestSchedule = Insertable<InterestSchedulesTable>;

// Shares
export type ShareClass = Selectable<ShareClassesTable>;
export type NewShareClass = Insertable<ShareClassesTable>;
export type ShareClassUpdate = Updateable<ShareClassesTable>;
export type ShareHolding = Selectable<ShareHoldingsTable>;
export type NewShareHolding = Insertable<ShareHoldingsTable>;
export type ShareHoldingUpdate = Updateable<ShareHoldingsTable>;
export type ShareTransaction = Selectable<ShareTransactionsTable>;
export type NewShareTransaction = Insertable<ShareTransactionsTable>;
export type ShareTransactionUpdate = Updateable<ShareTransactionsTable>;
export type DividendDeclaration = Selectable<DividendDeclarationsTable>;
export type NewDividendDeclaration = Insertable<DividendDeclarationsTable>;
export type ShareRegisterEntry = Selectable<ShareRegisterTable>;

// Fixed Deposits
export type FixedDepositProduct = Selectable<FixedDepositProductsTable>;
export type NewFixedDepositProduct = Insertable<FixedDepositProductsTable>;
export type FixedDepositProductUpdate = Updateable<FixedDepositProductsTable>;
export type FixedDeposit = Selectable<FixedDepositsTable>;
export type NewFixedDeposit = Insertable<FixedDepositsTable>;
export type FixedDepositUpdate = Updateable<FixedDepositsTable>;
export type FdInterestSchedule = Selectable<FdInterestSchedulesTable>;
export type NewFdInterestSchedule = Insertable<FdInterestSchedulesTable>;
export type FdMaturityAlert = Selectable<FdMaturityAlertsTable>;
export type NewFdMaturityAlert = Insertable<FdMaturityAlertsTable>;
export type FdRollover = Selectable<FdRolloversTable>;
export type NewFdRollover = Insertable<FdRolloversTable>;
export type FdRolloverUpdate = Updateable<FdRolloversTable>;

// Loans
export type LoanProduct = Selectable<LoanProductsTable>;
export type NewLoanProduct = Insertable<LoanProductsTable>;
export type LoanProductUpdate = Updateable<LoanProductsTable>;
export type LoanApplication = Selectable<LoanApplicationsTable>;
export type NewLoanApplication = Insertable<LoanApplicationsTable>;
export type LoanApplicationUpdate = Updateable<LoanApplicationsTable>;
export type LoanAppraisal = Selectable<LoanAppraisalsTable>;
export type NewLoanAppraisal = Insertable<LoanAppraisalsTable>;
export type LoanAppraisalUpdate = Updateable<LoanAppraisalsTable>;
export type LoanGuarantor = Selectable<LoanGuarantorsTable>;
export type NewLoanGuarantor = Insertable<LoanGuarantorsTable>;
export type LoanAccount = Selectable<LoanAccountsTable>;
export type NewLoanAccount = Insertable<LoanAccountsTable>;
export type LoanAccountUpdate = Updateable<LoanAccountsTable>;
export type LoanSchedule = Selectable<LoanSchedulesTable>;
export type NewLoanSchedule = Insertable<LoanSchedulesTable>;
export type LoanScheduleUpdate = Updateable<LoanSchedulesTable>;
export type LoanRepayment = Selectable<LoanRepaymentsTable>;
export type NewLoanRepayment = Insertable<LoanRepaymentsTable>;
export type LoanRepaymentUpdate = Updateable<LoanRepaymentsTable>;
export type LoanRecoveryAction = Selectable<LoanRecoveryActionsTable>;
export type NewLoanRecoveryAction = Insertable<LoanRecoveryActionsTable>;
export type LoanRecoveryActionUpdate = Updateable<LoanRecoveryActionsTable>;

// Accounting
export type FinancialPeriod = Selectable<FinancialPeriodsTable>;
export type NewFinancialPeriod = Insertable<FinancialPeriodsTable>;
export type FinancialPeriodUpdate = Updateable<FinancialPeriodsTable>;
export type Account = Selectable<AccountsTable>;
export type NewAccount = Insertable<AccountsTable>;
export type AccountUpdate = Updateable<AccountsTable>;
export type Transaction = Selectable<TransactionsTable>;
export type NewTransaction = Insertable<TransactionsTable>;
export type TransactionUpdate = Updateable<TransactionsTable>;
export type ManualJournalEntry = Selectable<ManualJournalEntriesTable>;
export type NewManualJournalEntry = Insertable<ManualJournalEntriesTable>;
export type ManualJournalEntryUpdate = Updateable<ManualJournalEntriesTable>;
export type ManualJournalLine = Selectable<ManualJournalLinesTable>;
export type NewManualJournalLine = Insertable<ManualJournalLinesTable>;
export type Budget = Selectable<BudgetsTable>;
export type NewBudget = Insertable<BudgetsTable>;
export type BudgetUpdate = Updateable<BudgetsTable>;
export type BudgetLine = Selectable<BudgetLinesTable>;
export type NewBudgetLine = Insertable<BudgetLinesTable>;
export type BudgetLineUpdate = Updateable<BudgetLinesTable>;
export type TrialBalance = Selectable<TrialBalanceTable>;

// Messaging
export type MessageTemplate = Selectable<MessageTemplatesTable>;
export type NewMessageTemplate = Insertable<MessageTemplatesTable>;
export type MessageTemplateUpdate = Updateable<MessageTemplatesTable>;
export type Message = Selectable<MessagesTable>;
export type NewMessage = Insertable<MessagesTable>;
export type MessageUpdate = Updateable<MessagesTable>;
export type MessageDeliveryLog = Selectable<MessageDeliveryLogTable>;
export type NewMessageDeliveryLog = Insertable<MessageDeliveryLogTable>;
export type BulkCampaign = Selectable<BulkCampaignsTable>;
export type NewBulkCampaign = Insertable<BulkCampaignsTable>;
export type BulkCampaignUpdate = Updateable<BulkCampaignsTable>;
export type CommunicationPreference = Selectable<CommunicationPreferencesTable>;
export type NewCommunicationPreference = Insertable<CommunicationPreferencesTable>;
export type CommunicationPreferenceUpdate = Updateable<CommunicationPreferencesTable>;
export type LoanRepaymentReminder = Selectable<LoanRepaymentRemindersTable>;
export type NewLoanRepaymentReminder = Insertable<LoanRepaymentRemindersTable>;
export type LoanRepaymentReminderUpdate = Updateable<LoanRepaymentRemindersTable>;
export type MaturityAlert = Selectable<MaturityAlertsTable>;
export type NewMaturityAlert = Insertable<MaturityAlertsTable>;

// Audit & Security
export type AuditLogEntry = Selectable<AuditLogTable>;
export type NewAuditLogEntry = Insertable<AuditLogTable>;
export type ActivityLogEntry = Selectable<ActivityLogTable>;
export type NewActivityLogEntry = Insertable<ActivityLogTable>;
export type DataExportLog = Selectable<DataExportLogTable>;
export type NewDataExportLog = Insertable<DataExportLogTable>;
export type SecurityEvent = Selectable<SecurityEventsTable>;
export type NewSecurityEvent = Insertable<SecurityEventsTable>;
export type TwoFactorLog = Selectable<TwoFactorLogTable>;
export type NewTwoFactorLog = Insertable<TwoFactorLogTable>;
export type PermissionAudit = Selectable<PermissionAuditTable>;
export type NewPermissionAudit = Insertable<PermissionAuditTable>;
export type ReconciliationAudit = Selectable<ReconciliationAuditTable>;
export type NewReconciliationAudit = Insertable<ReconciliationAuditTable>;
export type NewUnmatchedReconciliationItem = Insertable<UnmatchedReconciliationItemsTable>;
export type ApiAccessLog = Selectable<ApiAccessLogTable>;
export type NewApiAccessLog = Insertable<ApiAccessLogTable>;

// System Administration
export type SaccoConfiguration = Selectable<SaccoConfigurationTable>;
export type NewSaccoConfiguration = Insertable<SaccoConfigurationTable>;
export type SaccoConfigurationUpdate = Updateable<SaccoConfigurationTable>;
export type Branch = Selectable<BranchesTable>;
export type NewBranch = Insertable<BranchesTable>;
export type BranchUpdate = Updateable<BranchesTable>;
export type SystemSetting = Selectable<SystemSettingsTable>;
export type NewSystemSetting = Insertable<SystemSettingsTable>;
export type SystemSettingUpdate = Updateable<SystemSettingsTable>;
export type EmailGateway = Selectable<EmailGatewaysTable>;
export type NewEmailGateway = Insertable<EmailGatewaysTable>;
export type EmailGatewayUpdate = Updateable<EmailGatewaysTable>;
export type SmsGateway = Selectable<SmsGatewaysTable>;
export type NewSmsGateway = Insertable<SmsGatewaysTable>;
export type SmsGatewayUpdate = Updateable<SmsGatewaysTable>;
export type MobileMoneyConfiguration = Selectable<MobileMoneyConfigurationTable>;
export type NewMobileMoneyConfiguration = Insertable<MobileMoneyConfigurationTable>;
export type MobileMoneyConfigurationUpdate = Updateable<MobileMoneyConfigurationTable>;
export type NotificationSetting = Selectable<NotificationSettingsTable>;
export type NewNotificationSetting = Insertable<NotificationSettingsTable>;
export type NotificationSettingUpdate = Updateable<NotificationSettingsTable>;
export type ConfigurationAuditLog = Selectable<ConfigurationAuditLogTable>;
export type NewConfigurationAuditLog = Insertable<ConfigurationAuditLogTable>;
export type InterestRateConfiguration = Selectable<InterestRateConfigurationTable>;
export type NewInterestRateConfiguration = Insertable<InterestRateConfigurationTable>;
export type InterestRateConfigurationUpdate = Updateable<InterestRateConfigurationTable>;
export type PenaltyConfiguration = Selectable<PenaltyConfigurationTable>;
export type NewPenaltyConfiguration = Insertable<PenaltyConfigurationTable>;
export type PenaltyConfigurationUpdate = Updateable<PenaltyConfigurationTable>;
export type ScheduledTask = Selectable<ScheduledTasksTable>;
export type NewScheduledTask = Insertable<ScheduledTasksTable>;
export type ScheduledTaskUpdate = Updateable<ScheduledTasksTable>;
export type ScheduledTaskLog = Selectable<ScheduledTaskLogsTable>;
export type NewScheduledTaskLog = Insertable<ScheduledTaskLogsTable>;
