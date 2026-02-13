import {
    ColumnType,
    Generated,
    Insertable,
    JSONColumnType,
    Selectable,
    Updateable
} from 'kysely';
import { Decimal } from 'decimal.js';

/*
 * UTILITY & MAPPING TYPES
 * Core type definitions for database column mappings and utility types used across all tables
 */

export type DecimalColumn = ColumnType<Decimal, Decimal.Value, Decimal.Value>;
export type DateColumn = ColumnType<Date, string | undefined>;
export type NullableDateColumn = ColumnType<Date, string | undefined> | null;

/*
 * PUBLIC / REGISTRY SCHEMA (GLOBAL DATA)
 * Tables existing in the 'public' schema, accessible across all tenants (Tenants, Currencies, Migrations)
 */

export interface TenantsTable {
    id: Generated<string>;

    // Identification
    code: string;
    sacco_name: string;
    short_name: string | null;
    subdomain: string;
    schema_name: string;

    // Contact
    contact_email: string;
    contact_phone: string;
    website: string | null;
    address: JSONColumnType<Record<string, unknown>>;

    // Branding & Subscription
    branding: JSONColumnType<{
        logo_url?: string | null;
        primary_color?: string;
        secondary_color?: string;
    }>;
    subscription_tier: string;
    subscription_expires_at: NullableDateColumn;
    max_users: number;
    max_members: number;

    // Status
    status: 'active' | 'suspended' | 'inactive';
    is_active: ColumnType<boolean, boolean | undefined>;
    settings: JSONColumnType<Record<string, unknown>>;

    // Audit
    created_by: string | null;
    updated_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface TenantMigrationsTable {
    id: Generated<string>;
    tenant_id: string;
    migration_name: string;
    migration_version: number;
    applied_at: DateColumn;
    executed_by: string | null;
}

export interface TenantAuditLogTable {
    id: Generated<string>;
    schema_name: string;
    tenant_code: string | null;
    operation: string; // 'CREATE', 'DROP', 'SOFT_DELETE', etc.
    performed_by: string;
    performed_at: DateColumn;
    details: JSONColumnType<Record<string, unknown>>;
    error_message: string | null;
}

export interface CurrenciesTable {
    code: string;
    name: string;
    symbol: string;
    decimal_places: number;
    is_active: ColumnType<boolean | undefined, boolean>;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

/*
 * IDENTITY & ACCESS MANAGEMENT (IAM)
 * Definitions for Roles, Permissions, and their relationships to control system access
 */

export interface RolesTable {
    id: Generated<string>;
    name: string;
    display_name: string | null;
    description: string | null;
    is_system_role: ColumnType<boolean, boolean | undefined>;
    is_active: ColumnType<boolean, boolean | undefined>;
    hierarchy_level: ColumnType<number, number | undefined, number>;
    created_by: string | null;
    updated_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface PermissionsTable {
    id: Generated<string>;
    resource: string;
    action: string;
    scope: ColumnType<string, string | undefined, string>;
    name: string;
    description: string | null;
    is_system_permission: ColumnType<boolean, boolean | undefined>;
    requires_approval: ColumnType<boolean, boolean | undefined>;
    approval_threshold: number | null;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface RolePermissionsTable {
    id: Generated<string>;
    role_id: string;
    permission_id: string;
    is_granted: ColumnType<boolean, boolean | undefined>;
    conditions: JSONColumnType<Record<string, unknown>> | null;
    restrictions: JSONColumnType<Record<string, unknown>> | null;
    granted_by: string | null;
    granted_at: DateColumn;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

/*
 * CORE ENTITIES (PERSONS)
 * Centralized personal information table linked to both Members and Staff to avoid data duplication
 */

export interface PersonsTable {
    id: Generated<string>;

    // Basic Details
    first_name: string;
    middle_name: string | null;
    last_name: string;
    date_of_birth: NullableDateColumn;
    gender: 'male' | 'female' | 'other' | 'unknown';
    marital_status: 'single' | 'married' | 'divorced' | 'widowed';
    nationality: string | null;

    // Contact
    primary_phone: string;
    secondary_phone: string | null;
    personal_email: string | null;

    // Media
    photo_url: string | null;
    signature_url: string | null;

    // Extended Data
    physical_address: JSONColumnType<{
        address_line_1?: string;
        address_line_2?: string;
        city?: string;
        state?: string;
        country?: string;
        postal_code?: string;
    }>;
    employment_details: JSONColumnType<Record<string, unknown>>;
    next_of_kin: JSONColumnType<Record<string, unknown>>;

    // Audit
    created_by: string | null;
    updated_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface IdentityDocumentsTable {
    id: Generated<string>;
    person_id: string;
    document_type: string;
    document_number: string;
    issue_date: NullableDateColumn;
    expiry_date: NullableDateColumn;
    issuing_authority: string | null;
    issuing_country: string | null;

    // Media
    front_image_url: string | null;
    back_image_url: string | null;
    selfie_image_url: string | null;

    // Verification
    verification_status: 'pending' | 'approved' | 'rejected';
    verified_by: string | null;
    verified_at: NullableDateColumn;
    verification_notes: string | null;
    rejection_reason: string | null;
    metadata: JSONColumnType<Record<string, unknown>>;

    created_by: string | null;
    updated_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

/*
 * ORGANIZATION: MEMBERS & STAFF
 * Tables defining the organizational structure, including specific details for Members (SACCO clients) and Staff (Employees)
 */

export interface MembersTable {
    id: Generated<string>;
    member_number: string;
    status: 'active' | 'inactive' | 'suspended' | 'closed';

    // Basic Details
    first_name: string;
    middle_name: string | null;
    last_name: string;
    date_of_birth: NullableDateColumn;
    gender: 'male' | 'female' | 'other' | 'unknown';
    marital_status: 'single' | 'married' | 'divorced' | 'widowed';
    life_status: 'alive' | 'deceased';
    nationality: string | null;

    // Contact Information
    phone: string;
    email: string;

    // More KYC Information
    photo_url: string | null;
    signature_url: string | null;
    physical_address: JSONColumnType<Record<string, unknown>> | null;
    employment_details: JSONColumnType<Record<string, unknown>> | null;
    next_of_kin: JSONColumnType<Record<string, unknown>> | null;

    // Lifecycle
    joined_date: DateColumn;
    exit_date: NullableDateColumn;
    exit_reason: string | null;
    referred_by: string | null;

    // KYC
    kyc_status: 'not_started' | 'in_progress' | 'completed' | 'approved' | 'rejected';
    kyc_completed_at: NullableDateColumn;
    kyc_approved_by: string | null;
    risk_rating: 'low' | 'medium' | 'high';

    preferences: JSONColumnType<Record<string, unknown>>;

    created_by: string | null;
    updated_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface MembershipsTable {
    id: Generated<string>;
    member_id: string;
    start_date: DateColumn;
    end_date: NullableDateColumn;
    status: 'active' | 'pending' | 'expired' | 'cancelled';

    // Pricing (captured at subscription)
    registration_fee_paid: DecimalColumn;
    membership_fee: DecimalColumn;
    billing_cycle: 'monthly' | 'quarterly' | 'annual';
    next_billing_date: NullableDateColumn;
    last_billing_date: NullableDateColumn;

    is_paid: ColumnType<boolean, boolean | undefined>;
    payment_status: 'pending' | 'paid' | 'failed';
    auto_renew: ColumnType<boolean, boolean | undefined>;

    cancelled_date: NullableDateColumn;
    cancelled_by: string | null;
    cancellation_reason: string | null;

    assigned_by: string | null;
    notes: string | null;
    created_by: string | null;
    updated_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface StaffTable {
    id: Generated<string>;
    member_id: string;
    staff_number: string;
    role_id: string | null;

    // Contact
    work_email: string;
    work_phone: string | null;

    // Employment
    department: string | null;
    job_title: string | null;
    employment_status: 'active' | 'inactive' | 'terminated';
    employment_type: 'permanent' | 'contract' | 'temporary';

    // Lifecycle
    hire_date: DateColumn;
    confirmation_date: NullableDateColumn;
    termination_date: NullableDateColumn;
    termination_reason: string | null;
    reports_to: string | null;

    preferences: JSONColumnType<Record<string, unknown>>;

    created_by: string | null;
    updated_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface StaffCredentialsTable {
    id: Generated<string>;
    staff_id: string;

    // Password Management
    password_hash: string;
    password_changed_at: DateColumn;

    // Account Status
    is_active: ColumnType<boolean, boolean | undefined>;
    is_locked: ColumnType<boolean, boolean | undefined>;
    failed_login_attempts: ColumnType<number, number | undefined>;
    locked_until: NullableDateColumn;

    // Session Management
    last_login_at: NullableDateColumn;
    last_password_changed_at: NullableDateColumn;
    password_expires_at: NullableDateColumn;

    // Security
    reset_token: string | null;
    reset_token_expires_at: NullableDateColumn;

    // Audit
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

/*
 * FINANCIAL CORE (CHART OF ACCOUNTS)
 * The foundation of the accounting system: General Ledger accounts, periods, and balance tracking
 */

export interface AccountsTable {
    id: Generated<string>;
    code: string;
    name: string;
    description: string | null;
    parent_id: string | null;
    account_type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
    normal_balance: 'debit' | 'credit';

    is_active: ColumnType<boolean, boolean | undefined>;
    allows_posting: ColumnType<boolean, boolean | undefined>;

    opening_balance: DecimalColumn;
    current_balance: DecimalColumn;

    created_by: string | null;
    updated_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface FinancialPeriodsTable {
    id: Generated<string>;
    name: string;
    start_date: DateColumn;
    end_date: DateColumn;
    status: 'open' | 'pending_review' | 'closed';
    created_by: string | null;
    updated_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

/*
 * TRANSACTIONS, INVOICES & CONTRIBUTIONS
 * Operational financial tables covering daily transactions, billing, and member contribution types
 */

export interface TransactionsTable {
    id: Generated<string>;
    code: string;
    member_id: string;
    category: 'deposit' | 'withdrawal' | 'transfer' | 'reversal' | 'fee' | 'interest' | 'contribution';
    amount: DecimalColumn;
    currency_code: string;
    transaction_date: DateColumn;
    payment_method: 'cash' | 'mobile_money' | 'bank_transfer' | 'internal' | 'cheque';
    reference_code: string | null;

    // Double Entry
    debit_account_id: string;
    credit_account_id: string;
    financial_period_id: string | null;
    is_locked: ColumnType<boolean, boolean | undefined>;

    // Reconciliation
    is_reconciled: ColumnType<boolean, boolean | undefined>;
    reconciled_by: string | null;
    reconciled_at: NullableDateColumn;

    description: string | null;
    notes: string | null;
    recorded_by: string | null;
    approved_by: string | null;
    approved_at: NullableDateColumn;

    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface InvoicesTable {
    id: Generated<string>;
    member_id: string;
    invoice_number: string;
    issue_date: DateColumn;
    due_date: DateColumn;

    total_amount: DecimalColumn;
    tax_amount: DecimalColumn;
    discount_amount: DecimalColumn;
    paid_amount: DecimalColumn;

    status: 'draft' | 'sent' | 'viewed' | 'partial' | 'paid' | 'overdue' | 'cancelled' | 'void';
    notes: string | null;

    created_by: string | null;
    updated_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface InvoiceItemsTable {
    id: Generated<string>;
    invoice_id: string;
    description: string;
    quantity: DecimalColumn;
    unit_price: DecimalColumn;
    tax_rate: DecimalColumn;
    discount_amount: DecimalColumn;
    subtotal: DecimalColumn;
    account_id: string | null;

    created_by: string | null;
    updated_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface ContributionsTable {
    id: Generated<string>;
    code: string;
    name: string;
    description: string | null;
    frequency: 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly' | 'annually' | 'one-time';

    fixed_amount: DecimalColumn | null;
    minimum_amount: DecimalColumn | null;
    maximum_amount: DecimalColumn | null;

    is_mandatory: ColumnType<boolean, boolean | undefined>;
    is_withdrawable: ColumnType<boolean, boolean | undefined>;
    max_withdrawal_percentage: DecimalColumn | null;

    account_id: string | null;

    created_by: string | null;
    updated_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

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
    // IAM
    roles: RolesTable;
    permissions: PermissionsTable;
    role_permissions: RolePermissionsTable;

    // Persons
    persons: PersonsTable;
    identity_documents: IdentityDocumentsTable;

    // Organization
    members: MembersTable;
    memberships: MembershipsTable;
    staff: StaffTable;
    staff_credentials: StaffCredentialsTable;

    // Financials
    accounts: AccountsTable;
    financial_periods: FinancialPeriodsTable;

    // Transactions
    transactions: TransactionsTable;
    invoices: InvoicesTable;
    invoice_items: InvoiceItemsTable;

    // Savings
    contributions: ContributionsTable;
}

export interface Database extends PublicDatabase {
    // Note: Tenant tables are accessed via the `getTenantDb` factory,
    // but this interface allows defining global relations if necessary.
}

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

// IAM
export type Role = Selectable<RolesTable>;
export type NewRole = Insertable<RolesTable>;
export type RoleUpdate = Updateable<RolesTable>;
export type Permission = Selectable<PermissionsTable>;
export type NewPermission = Insertable<PermissionsTable>;
export type PermissionUpdate = Updateable<PermissionsTable>;
export type RolePermission = Selectable<RolePermissionsTable>;
export type NewRolePermission = Insertable<RolePermissionsTable>;
export type RolePermissionUpdate = Updateable<RolePermissionsTable>;

// Persons
export type Person = Selectable<PersonsTable>;
export type NewPerson = Insertable<PersonsTable>;
export type PersonUpdate = Updateable<PersonsTable>;
export type IdentityDocument = Selectable<IdentityDocumentsTable>;
export type NewIdentityDocument = Insertable<IdentityDocumentsTable>;
export type IdentityDocumentUpdate = Updateable<IdentityDocumentsTable>;

// Organization
export type Member = Selectable<MembersTable>;
export type NewMember = Insertable<MembersTable>;
export type MemberUpdate = Updateable<MembersTable>;
export type Membership = Selectable<MembershipsTable>;
export type NewMembership = Insertable<MembershipsTable>;
export type MembershipUpdate = Updateable<MembershipsTable>;
export type Staff = Selectable<StaffTable>;
export type NewStaff = Insertable<StaffTable>;
export type StaffUpdate = Updateable<StaffTable>;
export type StaffCredentials = Selectable<StaffCredentialsTable>;
export type NewStaffCredentials = Insertable<StaffCredentialsTable>;
export type StaffCredentialsUpdate = Updateable<StaffCredentialsTable>;

// Financials
export type Account = Selectable<AccountsTable>;
export type FinancialPeriod = Selectable<FinancialPeriodsTable>;

// Transactions
export type Transaction = Selectable<TransactionsTable>;
export type Invoice = Selectable<InvoicesTable>;
export type InvoiceItem = Selectable<InvoiceItemsTable>;
export type Contribution = Selectable<ContributionsTable>;