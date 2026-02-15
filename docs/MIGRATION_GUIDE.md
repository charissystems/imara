# Database Migration Architecture

## Overview

This document describes the comprehensive database migration structure for the Imara SACCO Management System, organized by functional modules and aligned with the MVP (must-have) requirements from the SRS.

## Migration Files Structure

### 001_authentication_and_authorization.sql
**Purpose:** Foundational authentication, authorization, access control, and member credentials

**Tables:**
- `permissions` - System permissions for resources and actions
- `roles` - User roles with permission groupings
- `role_permissions` - Junction table mapping roles to permissions
- `staff` - Staff member records with role assignments
- `staff_credentials` - Secure password storage, 2FA, account status
- `member_credentials` - Member PIN storage for self-service access

**MVP Focus:** User authentication, basic RBAC, staff management, member self-service

---

### 002_member_management.sql
**Purpose:** Complete member lifecycle from registration through exit

**Tables:**
- `members` - Core member data, KYC status, personal information
- `identity_documents` - Document verification and storage
- `memberships` - Membership type tracking and lifecycle events
- `member_accounts` - Account overview with balance summary

**MVP Focus:**
- MEM-001 to MEM-010: Member registration and onboarding
- KYC workflow and document verification
- Member status management (active, inactive, suspended, closed)

**Key Features:**
- Comprehensive KYC tracking with approval workflows
- Support for multiple identity document types
- Communication preferences management
- Risk rating assignment

---

### 003_accounting.sql
**Purpose:** Double-entry accounting system with comprehensive financial management

**Tables:**
- `financial_periods` - Fiscal period definition and status
- `accounts` - Chart of accounts with hierarchy support
- `transactions` - Double-entry journal entries
- `manual_journal_entries` - Staff-created journal entries with approval workflow
- `manual_journal_lines` - Line items for manual entries
- `budgets` - Budget creation and tracking
- `budget_lines` - Budget line items with actual vs. variance
- `trial_balance` - Period-end trial balance calculation

**MVP Focus:**
- ACC-001 to ACC-009: Full double-entry accounting system
- Chart of accounts configuration
- Automatic transaction posting from member transactions
- Manual journal entry workflow
- Financial period management and year-end closing

**Key Features:**
- Hierarchical chart of accounts
- Automatic posting of all member transactions (deposits, withdrawals, loans, etc.)
- Manual entry workflow with approval levels
- Budget management with variance tracking
- Period locking to prevent post-close modifications
- Trial balance preparation for financial statements

---

### 004_savings_and_accounts.sql
**Purpose:** Savings management, deposits, withdrawals, transfers, interest accrual, and account features

**Tables:**
- `savings_products` - Configurable savings account products
- `savings_accounts` - Individual member savings accounts
- `deposits` - Deposit transaction tracking
- `withdrawals` - Withdrawal transaction tracking
- `internal_transfers` - Transfers between member accounts
- `interest_schedules` - Monthly interest accrual tracking
- `beneficiaries` - Designated beneficiaries for account inheritance
- `account_liens` - Account holds and liens (loan collateral, legal holds)
- `standing_instructions` - Recurring automated transfers and payments

**MVP Focus:**
- SAV-001 to SAV-008: Core deposit/withdrawal functionality
- Real-time balance updates
- Interest calculation and posting
- Multiple payment methods (cash, mobile money, bank transfer)
- Account-level features and restrictions

**Key Features:**
- Configurable interest rates and frequencies
- Support for minimum/maximum balance constraints
- Overdraft configuration and management
- Full audit trail for all transactions
- Beneficiary designation and tracking
- Lien placing and release workflow
- Automated recurring transactions via standing instructions

---

### 005_shares.sql
**Purpose:** Share capital management and dividend distribution

**Tables:**
- `share_classes` - Multiple share class configuration
- `share_holdings` - Individual member share holdings with certificates
- `share_transactions` - Comprehensive share transaction history
- `dividend_declarations` - Dividend calculations and distribution
- `share_register` - Running historical record of all share activity

**MVP Focus:**
- SHA-001 to SHA-009: Share purchase, holding, and transfer management
- Digital share certificate generation
- Dividend declaration and posting
- Share register maintenance

**Key Features:**
- Support for multiple share classes (ordinary, preference, etc.)
- Holding limits enforcement (min/max shares per member)
- Weighted average dividend calculations
- Lock-in period management for restricted holdings
- Withholding tax on dividends

---

### 006_fixed_deposits.sql
**Purpose:** Term deposit management with maturity tracking, interest computation, and alerts

**Tables:**
- `fixed_deposit_products` - Configurable FD product templates
- `fixed_deposits` - Individual member FD accounts
- `fd_interest_schedules` - Periodic interest accrual and payment
- `fd_maturity_alerts` - Automated maturity notification tracking
- `fd_rollovers` - Auto-rollover configuration and history
- `maturity_alerts` - Centralized maturity alerts for FDs and loans

**MVP Focus:**
- FD-001 to FD-008: Core FD product and account management
- Maturity tracking and alerts (30, 14, 7 days)
- Interest calculation (simple/compound)
- Auto-rollover on maturity

**Key Features:**
- Configurable tenure (days/months/years)
- Flexible interest payment frequency
- Premature withdrawal penalty calculation
- Auto-rollover with multiple rollover type options
- Withholding tax on interest
- Digital FD certificate generation
- Centralized maturity alerting system

---

### 007_loans.sql
**Purpose:** Complete loan lifecycle from application through repayment, recovery, and reminders

**Tables:**
- `loan_products` - Loan product configuration
- `loan_applications` - Loan application submission and tracking
- `loan_appraisals` - Credit analysis and risk assessment
- `loan_guarantors` - Guarantor management and consent tracking
- `loan_accounts` - Approved loans with disbursement tracking
- `loan_schedules` - Repayment schedule generation
- `loan_repayments` - Repayment transaction recording
- `loan_recovery_actions` - Recovery workflow tracking
- `loan_repayment_reminders` - Automated repayment reminders and notifications

**MVP Focus:**
- LON-001 to LON-030: Comprehensive loan management from credit to recovery
- Application to approval workflow
- Disbursement management
- Automatic repayment schedule generation
- Default and recovery tracking
- Automated reminders for upcoming and overdue payments

**Key Features:**
- Multiple approval levels and credit committee workflows
- Comprehensive appraisal with income/debt analysis
- Flexible interest calculation methods (fixed, declining balance)
- Guarantor requirements and consent management
- Automatic late payment penalties
- Recovery action workflow (reminder → warning → legal)
- Default and write-off tracking
- Configurable reminder notifications (pre-due and post-due)

---

### 008_messaging.sql
**Purpose:** Omnichannel communication system for member notifications

**Tables:**
- `message_templates` - Reusable message templates with merge fields
- `messages` - Message queue with delivery tracking
- `message_delivery_log` - Detailed delivery attempt history
- `bulk_campaigns` - Bulk messaging campaign management
- `campaign_messages` - Campaign message tracking
- `communication_preferences` - Member opt-out preferences

**MVP Focus:**
- MSG-001 to MSG-009: Automated notifications across channels
- SMS, email, and in-app notifications
- Bulk messaging campaigns
- Message template management
- Delivery status tracking

**Key Features:**
- Multi-channel delivery (SMS, email, push, in-app)
- Template-based messaging with merge fields
- Configurable delivery scheduling
- Provider failover support (Twilio, Africa's Talking, SendGrid)
- Bulk campaign management with recipient filtering
- Member communication preference management
- Quiet hours respect

---

### 009_audit_and_security.sql
**Purpose:** Comprehensive audit trails, security event tracking, and configuration management

**Tables:**
- `audit_log` - Detailed change audit trail
- `activity_log` - High-frequency activity logging
- `data_export_log` - Export tracking for compliance
- `security_events` - Security event recording (failed logins, etc.)
- `two_factor_log` - 2FA attempt tracking
- `permission_audit` - Permission change audit trail
- `reconciliation_audit` - Bank/account reconciliation tracking
- `unmatched_reconciliation_items` - Unresolved reconciliation items
- `api_access_log` - API request logging
- `configuration_audit_log` - Configuration change tracking

**MVP Focus:**
- AUD-001 onwards: Comprehensive audit trail
- Activity logging for all operations
- Security event tracking
- Reconciliation documentation
- Data export audit
- Configuration change tracking

**Key Features:**
- Complete change audit trail (who, what, when, before/after values)
- High-frequency activity logging
- Data export tracking and control
- Security event classification by severity
- 2FA attempt tracking
- Permission change audit trail
- Bank reconciliation tracking with unmatched item resolution
- API access logging for integration monitoring
- Configuration change audit for compliance

---

### 010_system_administration.sql
**Purpose:** SACCO configuration, settings, operational management, and fee/limit controls

**Tables:**
- `sacco_configuration` - Organization-wide settings
- `branches` - Multi-branch support
- `system_settings` - Global system configuration
- `email_gateways` - Email provider configuration (SendGrid, AWS SES, SMTP)
- `sms_gateways` - SMS provider configuration (Africa's Talking, Twilio)
- `mobile_money_configuration` - Mobile money provider setup
- `notification_settings` - Notification type configuration
- `interest_rate_configuration` - Interest rate setup
- `penalty_configuration` - Penalty structure setup
- `scheduled_tasks` - Background job management (cron tasks)
- `scheduled_task_logs` - Job execution history
- `fee_schedules` - Transaction fee configuration and management
- `transaction_limits` - Role and channel-based transaction limits

**MVP Focus:**
- ADM-001 to ADM-010: SACCO configuration and administration
- Multi-tenant support
- Feature flag management
- Integration configuration
- System settings
- Fee and transaction limit management

**Key Features:**
- Comprehensive SACCO organization settings
- Multi-branch support
- Provider configuration (email, SMS, mobile money)
- Feature flags for MVP modules
- Interest rate and penalty configuration
- Scheduled task management (interest accrual, statement generation, backups)
- Rate limiting and failover configuration for integrations
- Flexible fee schedule management by transaction type and member category
- Role-based and channel-based transaction limits with approval thresholds

---

### 011_row_level_security.sql
**Purpose:** Defence-in-depth tenant isolation using PostgreSQL Row Level Security policies

**Tables Modified:**
- All major tables have RLS policies applied
- Enforces app.current_tenant context variable
- Prevents cross-tenant data access at database level

**MVP Focus:**
- SEC-002: Prevent cross-tenant data access
- Multi-tenancy enforcement
- Additional isolation layer beyond schema separation

**Key Features:**
- RLS policies on high-risk tables (members, accounts, transactions, audit_log, etc.)
- Context-based access control via session variables
- Session-level tenant enforcement
- Graceful bypass for admin operations

---

## Module-to-Migration Mapping

| SRS Module | Primary Migration | Supporting Migrations |
|---|---|---|
| Member Management | 002 | 001, 009 |
| Savings & Withdrawals | 004 | 003, 008, 009 |
| Shares | 005 | 003, 008, 009 |
| Fixed Deposits | 006 | 003, 008, 009 |
| Loan Management | 007 | 003, 008, 009 |
| Accounting & Financial | 003 | 009, 010 |
| Messaging Centre | 008 | 010 |
| Security & Audit | 009 | 001 |
| System Administration | 010 | All |

---

## Key Design Principles

### 1. **Double-Entry Accounting**
All member transactions (deposits, withdrawals, loans, etc.) automatically create double-entry journal entries, ensuring financial integrity and audit trail.

### 2. **Comprehensive Audit Trail**
Every modification is tracked with:
- User who made the change
- Timestamp
- Previous and new values
- Business context

### 3. **Referential Integrity**
Foreign keys enforce data relationships and prevent orphaned records. Appropriate CASCADE/RESTRICT policies protect critical data.

### 4. **Logical Domain Separation**
Migrations are organized by functional domain:
- **Authentication** (001) - User and access control
- **Member data** (002) - Member lifecycle
- **Financial core** (003-007) - Accounting, savings, investments, credit
- **Communication** (008) - Notifications and messaging
- **Security & Compliance** (009) - Audit and monitoring
- **Administration** (010) - Configuration and operations
- **Multi-tenancy** (011) - Isolation enforcement

### 5. **Flexible Configuration**
Products, rates, fees, penalties, and limits are configurable at the system level, supporting different SACCO policies without code changes.

### 6. **Multi-Tenancy Ready**
All tables use the `template` schema prefix, ready for multi-tenant deployment with separate schemas per tenant and RLS enforcement.

---

## MVP Feature Coverage

### Must-Have Requirements Addressed:

✅ **Member Management** - Complete registration, KYC, document verification  
✅ **Savings Accounts** - Multiple products, deposits, withdrawals, interest accrual, beneficiaries  
✅ **Shares** - Share classes, holdings, dividends, certificates  
✅ **Fixed Deposits** - Term deposits, maturity alerts, auto-rollover  
✅ **Loans** - Full credit lifecycle, appraisal, approval, repayment, reminders  
✅ **Accounting** - Double-entry system, GL, financial periods  
✅ **Messaging** - Automated SMS/email notifications, campaigns  
✅ **Security** - Authentication, RBAC, audit trails, multi-tenancy  
✅ **Administration** - Configuration, settings, provider management, fees, limits  

---

## Migration Execution Order

Migrations should be executed in numerical order:

```bash
001_authentication_and_authorization.sql
002_member_management.sql
003_accounting.sql
004_savings_and_accounts.sql
005_shares.sql
006_fixed_deposits.sql
007_loans.sql
008_messaging.sql
009_audit_and_security.sql
010_system_administration.sql
011_row_level_security.sql
```

Each migration is independent for the most part, but they follow a logical dependency order:
1. Foundation (001)
2. Entities (002-007)
3. Cross-cutting concerns (008-011)

---

## Performance Considerations

- **Indexes**: Strategic indexes on frequently queried columns (status, dates, member_id, account_id)
- **Partitioning**: Audit logs and activity logs should be partitioned by date for large deployments
- **Archive Strategy**: Old transaction records can be archived while maintaining audit trail
- **Materialized Views**: Trial balance can be materialized daily for reporting efficiency

---

## Organization Changes (Latest)

**Recent reorganization (Feb 2026):**
- Moved `member_credentials` from 012 → 001 (authentication domain)
- Moved account features (`beneficiaries`, `account_liens`, `standing_instructions`) from 012 → 004 (savings domain)
- Moved `maturity_alerts` from 008 → 006 (fixed deposit domain)
- Moved `loan_repayment_reminders` from 008 → 007 (loans domain)
- Moved `configuration_audit_log` from 010 → 009 (audit domain)
- Moved `fee_schedules` and `transaction_limits` from 012 → 010 (system administration)
- Deleted 012_additional_features.sql (now empty)

This reorganization improves logical grouping and reduces file clutter while maintaining all functionality.

---

## Future Extensions (Phase 2+)

These migrations provide the foundation for:
- Multi-currency support
- White-labeling
- Advanced analytics and dashboards
- Mobile app backend
- USSD integration
- ERP integration (Odoo)
- Advanced reporting and business intelligence
