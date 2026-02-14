import {
    // Public/Registry
    TenantsTable,
    TenantMigrationsTable,
    TenantAuditLogTable,
    CurrenciesTable,
    PermissionsTable as PublicPermissionsTable,
    RolesTable as PublicRolesTable,
    RolePermissionsTable as PublicRolePermissionsTable,
} from './public';

import {
    // Auth
    PermissionsTable,
    RolesTable,
    RolePermissionsTable,
    StaffTable,
    StaffCredentialsTable,
} from './auth';

import {
    // Members
    IdentityDocumentsTable,
    MembersTable,
    MembershipsTable,
    MemberAccountsTable,
} from './members';

import {
    // Savings
    SavingsProductsTable,
    SavingsAccountsTable,
    DepositsTable,
    WithdrawalsTable,
    InternalTransfersTable,
    InterestSchedulesTable,
} from './savings';

import {
    // Shares
    ShareClassesTable,
    ShareHoldingsTable,
    ShareTransactionsTable,
    DividendDeclarationsTable,
    ShareRegisterTable,
} from './shares';

import {
    // Fixed Deposits
    FixedDepositProductsTable,
    FixedDepositsTable,
    FdInterestSchedulesTable,
    FdMaturityAlertsTable,
    FdRolloversTable,
} from './deposits';

import {
    // Loans
    LoanProductsTable,
    LoanApplicationsTable,
    LoanAppraisalsTable,
    LoanGuarantorsTable,
    LoanAccountsTable,
    LoanSchedulesTable,
    LoanRepaymentsTable,
    LoanRecoveryActionsTable,
} from './loans';

import {
    // Accounting
    FinancialPeriodsTable,
    AccountsTable,
    TransactionsTable,
    ManualJournalEntriesTable,
    ManualJournalLinesTable,
    BudgetsTable,
    BudgetLinesTable,
    TrialBalanceTable,
} from './accounting';

import {
    // Messaging
    MessageTemplatesTable,
    MessagesTable,
    MessageDeliveryLogTable,
    BulkCampaignsTable,
    CampaignMessagesTable,
    CommunicationPreferencesTable,
    LoanRepaymentRemindersTable,
    MaturityAlertsTable,
} from './messaging';

import {
    // Audit & Security
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

import {
    // Admin
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
 * DATABASE INTERFACES
 * Kysely interface definitions mapping TypeScript to PostgreSQL schemas
 */

export interface PublicDatabase {
    tenants: TenantsTable;
    tenant_migrations: TenantMigrationsTable;
    tenant_audit_log: TenantAuditLogTable;
    currencies: CurrenciesTable;
}

export interface TenantDatabase {
    // Authentication & Authorization (001)
    permissions: PermissionsTable;
    roles: RolesTable;
    role_permissions: RolePermissionsTable;
    staff: StaffTable;
    staff_credentials: StaffCredentialsTable;

    // Member Management (002)
    identity_documents: IdentityDocumentsTable;
    members: MembersTable;
    memberships: MembershipsTable;
    member_accounts: MemberAccountsTable;

    // Savings & Accounts (003)
    savings_products: SavingsProductsTable;
    savings_accounts: SavingsAccountsTable;
    deposits: DepositsTable;
    withdrawals: WithdrawalsTable;
    internal_transfers: InternalTransfersTable;
    interest_schedules: InterestSchedulesTable;

    // Shares (004)
    share_classes: ShareClassesTable;
    share_holdings: ShareHoldingsTable;
    share_transactions: ShareTransactionsTable;
    dividend_declarations: DividendDeclarationsTable;
    share_register: ShareRegisterTable;

    // Fixed Deposits (005)
    fixed_deposit_products: FixedDepositProductsTable;
    fixed_deposits: FixedDepositsTable;
    fd_interest_schedules: FdInterestSchedulesTable;
    fd_maturity_alerts: FdMaturityAlertsTable;
    fd_rollovers: FdRolloversTable;

    // Loans (006)
    loan_products: LoanProductsTable;
    loan_applications: LoanApplicationsTable;
    loan_appraisals: LoanAppraisalsTable;
    loan_guarantors: LoanGuarantorsTable;
    loan_accounts: LoanAccountsTable;
    loan_schedules: LoanSchedulesTable;
    loan_repayments: LoanRepaymentsTable;
    loan_recovery_actions: LoanRecoveryActionsTable;

    // Accounting (007)
    financial_periods: FinancialPeriodsTable;
    accounts: AccountsTable;
    transactions: TransactionsTable;
    manual_journal_entries: ManualJournalEntriesTable;
    manual_journal_lines: ManualJournalLinesTable;
    budgets: BudgetsTable;
    budget_lines: BudgetLinesTable;
    trial_balance: TrialBalanceTable;

    // Messaging (008)
    message_templates: MessageTemplatesTable;
    messages: MessagesTable;
    message_delivery_log: MessageDeliveryLogTable;
    bulk_campaigns: BulkCampaignsTable;
    campaign_messages: CampaignMessagesTable;
    communication_preferences: CommunicationPreferencesTable;
    loan_repayment_reminders: LoanRepaymentRemindersTable;
    maturity_alerts: MaturityAlertsTable;

    // Audit & Security (009)
    audit_log: AuditLogTable;
    activity_log: ActivityLogTable;
    data_export_log: DataExportLogTable;
    security_events: SecurityEventsTable;
    two_factor_log: TwoFactorLogTable;
    permission_audit: PermissionAuditTable;
    reconciliation_audit: ReconciliationAuditTable;
    unmatched_reconciliation_items: UnmatchedReconciliationItemsTable;
    api_access_log: ApiAccessLogTable;

    // System Administration (010)
    sacco_configuration: SaccoConfigurationTable;
    branches: BranchesTable;
    system_settings: SystemSettingsTable;
    email_gateways: EmailGatewaysTable;
    sms_gateways: SmsGatewaysTable;
    mobile_money_configuration: MobileMoneyConfigurationTable;
    notification_settings: NotificationSettingsTable;
    configuration_audit_log: ConfigurationAuditLogTable;
    interest_rate_configuration: InterestRateConfigurationTable;
    penalty_configuration: PenaltyConfigurationTable;
    scheduled_tasks: ScheduledTasksTable;
    scheduled_task_logs: ScheduledTaskLogsTable;
}

export interface Database extends PublicDatabase {
    // Note: Tenant tables are accessed via the `getTenantDb` factory,
    // but this interface allows defining global relations if necessary.
}
