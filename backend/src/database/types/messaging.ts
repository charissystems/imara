import { ColumnType, Generated, JSONColumnType } from 'kysely';
import { DateColumn, NullableDateColumn } from './common';

// MESSAGING (008)

export interface MessageTemplatesTable {
    id: Generated<string>;
    code: string;
    name: string;
    description: string | null;
    channel: ColumnType<'sms' | 'email' | 'push' | 'in_app', 'sms' | 'email' | 'push' | 'in_app'>;
    subject: string | null;
    body: string;
    merge_fields: JSONColumnType<Record<string, unknown>>;
    is_active: ColumnType<boolean, boolean | undefined>;
    is_system_template: ColumnType<boolean, boolean | undefined>;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface MessagesTable {
    id: Generated<string>;
    member_id: string | null;
    staff_id: string | null;
    recipient_phone: string | null;
    recipient_email: string | null;
    template_id: string | null;
    channel: ColumnType<'sms' | 'email' | 'push' | 'in_app', 'sms' | 'email' | 'push' | 'in_app'>;
    subject: string | null;
    body: string;
    scheduled_for: NullableDateColumn;
    status: ColumnType<'draft' | 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced', 'draft' | 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced'>;
    sent_at: NullableDateColumn;
    failed_reason: string | null;
    retry_count: ColumnType<number, number | undefined>;
    source_type: string | null;
    source_id: string | null;
    variables: JSONColumnType<Record<string, unknown>> | null;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
}

export interface MessageDeliveryLogTable {
    id: Generated<string>;
    message_id: string;
    attempt_number: ColumnType<number, number | undefined>;
    delivery_timestamp: DateColumn;
    provider: string | null;
    provider_reference: string | null;
    provider_status: string | null;
    provider_response: JSONColumnType<Record<string, unknown>> | null;
    status: ColumnType<'sent' | 'delivered' | 'failed' | 'bounced', 'sent' | 'delivered' | 'failed' | 'bounced'>;
    error_code: string | null;
    error_message: string | null;
    created_at: DateColumn;
}

export interface BulkCampaignsTable {
    id: Generated<string>;
    campaign_number: string;
    name: string;
    description: string | null;
    channel: ColumnType<'sms' | 'email' | 'push' | 'multi_channel', 'sms' | 'email' | 'push' | 'multi_channel'>;
    template_id: string | null;
    subject: string | null;
    body: string;
    recipient_filter: JSONColumnType<Record<string, unknown>> | null;
    recipient_count: number | null;
    scheduled_send_date: NullableDateColumn;
    immediate_send: ColumnType<boolean, boolean | undefined>;
    status: ColumnType<'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled', 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled'>;
    messages_sent: ColumnType<number, number | undefined>;
    messages_delivered: ColumnType<number, number | undefined>;
    messages_failed: ColumnType<number, number | undefined>;
    created_by: string | null;
    approved_by: string | null;
    approved_at: NullableDateColumn;
    started_at: NullableDateColumn;
    completed_at: NullableDateColumn;
    created_at: DateColumn;
    updated_at: DateColumn;
}

export interface CampaignMessagesTable {
    id: Generated<string>;
    campaign_id: string;
    message_id: string;
    created_at: DateColumn;
}

export interface CommunicationPreferencesTable {
    id: Generated<string>;
    member_id: string;
    sms_enabled: ColumnType<boolean, boolean | undefined>;
    email_enabled: ColumnType<boolean, boolean | undefined>;
    push_enabled: ColumnType<boolean, boolean | undefined>;
    in_app_enabled: ColumnType<boolean, boolean | undefined>;
    transaction_alerts: ColumnType<boolean, boolean | undefined>;
    promotional_messages: ColumnType<boolean, boolean | undefined>;
    loan_related: ColumnType<boolean, boolean | undefined>;
    account_statements: ColumnType<boolean, boolean | undefined>;
    system_notifications: ColumnType<boolean, boolean | undefined>;
    quiet_hours_start: string | null; // time type
    quiet_hours_end: string | null;
    quiet_hours_enabled: ColumnType<boolean, boolean | undefined>;
    updated_at: DateColumn;
}

export interface LoanRepaymentRemindersTable {
    id: Generated<string>;
    loan_account_id: string;
    schedule_id: string | null;
    days_before: ColumnType<number, number>;
    days_after: ColumnType<number, number | undefined>;
    reminder_date: DateColumn;
    template_id: string | null;
    custom_message: string | null;
    sent_to_member: ColumnType<boolean, boolean | undefined>;
    sent_to_staff: ColumnType<boolean, boolean | undefined>;
    last_sent_at: NullableDateColumn;
    send_count: ColumnType<number, number | undefined>;
    is_active: ColumnType<boolean, boolean | undefined>;
    created_at: DateColumn;
    updated_at: DateColumn;
}

export interface MaturityAlertsTable {
    id: Generated<string>;
    alert_type: ColumnType<'fixed_deposit' | 'loan', 'fixed_deposit' | 'loan'>;
    fixed_deposit_id: string | null;
    loan_account_id: string | null;
    member_id: string;
    days_before: ColumnType<number, number>;
    alert_date: DateColumn;
    maturity_date: DateColumn;
    sent_to_member: ColumnType<boolean, boolean | undefined>;
    sent_to_staff: ColumnType<boolean, boolean | undefined>;
    sent_at: NullableDateColumn;
    template_id: string | null;
    is_active: ColumnType<boolean, boolean | undefined>;
    created_at: DateColumn;
}
