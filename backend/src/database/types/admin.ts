import { ColumnType, Generated, JSONColumnType } from 'kysely';
import { DateColumn, DecimalColumn, NullableDateColumn } from './common';

// SYSTEM ADMINISTRATION (010)

export interface SaccoConfigurationTable {
    id: Generated<string>;
    organization_name: string;
    registration_number: string | null;
    tax_identification_number: string | null;
    head_office_address: JSONColumnType<Record<string, unknown>> | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    logo_url: string | null;
    color_scheme: string | null;
    currency_code: ColumnType<string, string | undefined>;
    financial_year_start_month: ColumnType<number, number | undefined>;
    regulator_name: string | null;
    regulatory_reference: string | null;
    compliance_framework: string | null;
    system_timezone: ColumnType<string, string | undefined>;
    language: ColumnType<string, string | undefined>;
    features: JSONColumnType<Record<string, unknown>>;
    interest_calculation_basis: ColumnType<string, string | undefined>;
    created_by: string | null;
    updated_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
}

export interface BranchesTable {
    id: Generated<string>;
    code: string;
    name: string;
    description: string | null;
    address: JSONColumnType<Record<string, unknown>> | null;
    phone: string | null;
    email: string | null;
    branch_manager_id: string | null;
    is_active: ColumnType<boolean, boolean | undefined>;
    opening_time: string | null; // time type
    closing_time: string | null;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface SystemSettingsTable {
    id: Generated<string>;
    setting_key: string;
    setting_value: string;
    value_type: ColumnType<'string' | 'integer' | 'boolean' | 'json' | 'decimal', 'string' | 'integer' | 'boolean' | 'json' | 'decimal'>;
    description: string | null;
    is_configurable: ColumnType<boolean, boolean | undefined>;
    created_at: DateColumn;
    updated_at: DateColumn;
}

export interface EmailGatewaysTable {
    id: Generated<string>;
    provider: ColumnType<'sendgrid' | 'aws_ses' | 'mailgun' | 'smtp', 'sendgrid' | 'aws_ses' | 'mailgun' | 'smtp'>;
    api_key: string | null;
    api_secret: string | null;
    from_email: string;
    from_name: string | null;
    smtp_host: string | null;
    smtp_port: number | null;
    smtp_username: string | null;
    smtp_password: string | null;
    smtp_use_tls: ColumnType<boolean, boolean | undefined>;
    is_active: ColumnType<boolean, boolean | undefined>;
    is_primary: ColumnType<boolean, boolean | undefined>;
    test_email: string | null;
    last_test_at: NullableDateColumn;
    test_status: ColumnType<'pending' | 'success' | 'failed', 'pending' | 'success' | 'failed'> | null;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
}

export interface SmsGatewaysTable {
    id: Generated<string>;
    provider: ColumnType<'africas_talking' | 'twilio' | 'nexmo' | 'custom', 'africas_talking' | 'twilio' | 'nexmo' | 'custom'>;
    api_key: string;
    api_secret: string | null;
    account_sid: string | null;
    auth_token: string | null;
    sender_id: string;
    is_active: ColumnType<boolean, boolean | undefined>;
    is_primary: ColumnType<boolean, boolean | undefined>;
    failover_order: number | null;
    test_phone: string | null;
    last_test_at: NullableDateColumn;
    test_status: ColumnType<'pending' | 'success' | 'failed', 'pending' | 'success' | 'failed'> | null;
    rate_limit_per_second: number | null;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
}

export interface MobileMoneyConfigurationTable {
    id: Generated<string>;
    provider: ColumnType<'mtn_mobile_money' | 'airtel_money' | 'custom', 'mtn_mobile_money' | 'airtel_money' | 'custom'>;
    merchant_id: string;
    api_key: string;
    api_secret: string | null;
    api_endpoint: string | null;
    account_number: string | null;
    account_name: string | null;
    sender_name: string | null;
    is_active: ColumnType<boolean, boolean | undefined>;
    supports_collection: ColumnType<boolean, boolean | undefined>;
    supports_disbursement: ColumnType<boolean, boolean | undefined>;
    supports_reconciliation: ColumnType<boolean, boolean | undefined>;
    test_mode: ColumnType<boolean, boolean | undefined>;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
}

export interface NotificationSettingsTable {
    id: Generated<string>;
    notification_type: string;
    sms_enabled: ColumnType<boolean, boolean | undefined>;
    email_enabled: ColumnType<boolean, boolean | undefined>;
    push_enabled: ColumnType<boolean, boolean | undefined>;
    in_app_enabled: ColumnType<boolean, boolean | undefined>;
    template_id: string | null;
    trigger_condition: JSONColumnType<Record<string, unknown>> | null;
    created_at: DateColumn;
    updated_at: DateColumn;
}

export interface ConfigurationAuditLogTable {
    id: Generated<string>;
    configuration_type: string;
    configuration_id: string | null;
    change_type: ColumnType<'create' | 'update' | 'delete', 'create' | 'update' | 'delete'>;
    old_values: JSONColumnType<Record<string, unknown>> | null;
    new_values: JSONColumnType<Record<string, unknown>> | null;
    changed_by: string | null;
    change_timestamp: DateColumn;
}

export interface InterestRateConfigurationTable {
    id: Generated<string>;
    rate_type: ColumnType<'savings' | 'fixed_deposit' | 'loan_default' | 'default_penalty' | 'overdraft', 'savings' | 'fixed_deposit' | 'loan_default' | 'default_penalty' | 'overdraft'>;
    rate_name: string;
    annual_percentage_rate: DecimalColumn;
    effective_from: DateColumn;
    effective_to: NullableDateColumn;
    is_current: ColumnType<boolean, boolean | undefined>;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
}

export interface PenaltyConfigurationTable {
    id: Generated<string>;
    penalty_type: string;
    penalty_amount_type: ColumnType<'fixed' | 'percentage', 'fixed' | 'percentage'>;
    penalty_amount: DecimalColumn;
    applies_to: string | null;
    effective_from: DateColumn;
    effective_to: NullableDateColumn;
    is_active: ColumnType<boolean, boolean | undefined>;
    description: string | null;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
}

export interface ScheduledTasksTable {
    id: Generated<string>;
    task_name: string;
    description: string | null;
    cron_expression: string;
    task_type: ColumnType<'interest_accrual' | 'statement_generation' | 'backup' | 'report_generation' | 'penalty_calculation' | 'reminder_sending', 'interest_accrual' | 'statement_generation' | 'backup' | 'report_generation' | 'penalty_calculation' | 'reminder_sending'>;
    task_params: JSONColumnType<Record<string, unknown>> | null;
    is_active: ColumnType<boolean, boolean | undefined>;
    last_execution_at: NullableDateColumn;
    last_execution_status: ColumnType<'success' | 'failed' | 'partial', 'success' | 'failed' | 'partial'> | null;
    next_execution_at: NullableDateColumn;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
}

export interface ScheduledTaskLogsTable {
    id: Generated<string>;
    task_id: string;
    execution_start: DateColumn;
    execution_end: NullableDateColumn;
    execution_status: ColumnType<'success' | 'failed' | 'partial' | 'skipped', 'success' | 'failed' | 'partial' | 'skipped'>;
    records_processed: number | null;
    records_failed: number | null;
    error_message: string | null;
    logs: string | null;
    created_at: DateColumn;
}
