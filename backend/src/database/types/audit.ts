import { ColumnType, Generated, JSONColumnType } from 'kysely';
import { DateColumn, DecimalColumn, NullableDateColumn } from './common';

// AUDIT & SECURITY (009)

export interface AuditLogTable {
    id: Generated<string>;
    user_id: string | null;
    user_ip_address: string | null;
    user_agent: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    entity_name: string | null;
    change_type: ColumnType<'create' | 'update' | 'delete' | 'view' | 'export' | 'authenticate' | 'permission_change', 'create' | 'update' | 'delete' | 'view' | 'export' | 'authenticate' | 'permission_change'>;
    old_values: JSONColumnType<Record<string, unknown>> | null;
    new_values: JSONColumnType<Record<string, unknown>> | null;
    status: ColumnType<'success' | 'failure', 'success' | 'failure'>;
    error_message: string | null;
    timestamp: DateColumn;
    duration_ms: number | null;
    created_at: DateColumn;
}

export interface ActivityLogTable {
    id: Generated<string>;
    user_id: string | null;
    activity_type: string;
    description: string | null;
    entity_type: string | null;
    entity_id: string | null;
    metadata: JSONColumnType<Record<string, unknown>> | null;
    timestamp: DateColumn;
}

export interface DataExportLogTable {
    id: Generated<string>;
    export_number: string;
    exported_by: string;
    entity_type: string;
    export_format: ColumnType<'csv' | 'excel' | 'pdf' | 'json', 'csv' | 'excel' | 'pdf' | 'json'>;
    filters: JSONColumnType<Record<string, unknown>> | null;
    record_count: number | null;
    file_size_bytes: number | null;
    file_path: string | null;
    encryption_used: ColumnType<boolean, boolean | undefined>;
    password_protected: ColumnType<boolean, boolean | undefined>;
    export_timestamp: DateColumn;
    download_timestamp: NullableDateColumn;
    created_at: DateColumn;
}

export interface SecurityEventsTable {
    id: Generated<string>;
    user_id: string | null;
    staff_ip_address: string | null;
    event_type: string;
    severity: ColumnType<'low' | 'medium' | 'high' | 'critical', 'low' | 'medium' | 'high' | 'critical'>;
    description: string;
    action_taken: string | null;
    requires_investigation: ColumnType<boolean, boolean | undefined>;
    timestamp: DateColumn;
    created_at: DateColumn;
}

export interface TwoFactorLogTable {
    id: Generated<string>;
    staff_id: string;
    method: ColumnType<'sms' | 'authenticator_app' | 'backup_code', 'sms' | 'authenticator_app' | 'backup_code'>;
    status: ColumnType<'success' | 'failure' | 'expired', 'success' | 'failure' | 'expired'>;
    ip_address: string | null;
    device_info: string | null;
    attempt_timestamp: DateColumn;
    created_at: DateColumn;
}

export interface PermissionAuditTable {
    id: Generated<string>;
    staff_id: string | null;
    permission_id: string;
    change_type: ColumnType<'granted' | 'revoked' | 'modified', 'granted' | 'revoked' | 'modified'>;
    previous_value: JSONColumnType<Record<string, unknown>> | null;
    new_value: JSONColumnType<Record<string, unknown>> | null;
    reason: string | null;
    changed_by: string | null;
    change_timestamp: DateColumn;
}

export interface ReconciliationAuditTable {
    id: Generated<string>;
    reconciliation_number: string;
    reconciliation_type: ColumnType<'bank' | 'account' | 'loan' | 'savings', 'bank' | 'account' | 'loan' | 'savings'>;
    reconciliation_date: DateColumn;
    period_start: NullableDateColumn;
    period_end: NullableDateColumn;
    expected_balance: DecimalColumn | null;
    actual_balance: DecimalColumn | null;
    variance: DecimalColumn | null;
    total_items: number | null;
    matched_items: number | null;
    unmatched_items: number | null;
    status: ColumnType<'in_progress' | 'completed' | 'resolved' | 'escalated', 'in_progress' | 'completed' | 'resolved' | 'escalated'>;
    performed_by: string | null;
    approved_by: string | null;
    approved_at: NullableDateColumn;
    notes: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
}

export interface UnmatchedReconciliationItemsTable {
    id: Generated<string>;
    reconciliation_id: string;
    reference_code: string | null;
    item_date: NullableDateColumn;
    amount: DecimalColumn | null;
    description: string | null;
    origin: ColumnType<'system' | 'external' | 'both', 'system' | 'external' | 'both'>;
    resolution_status: ColumnType<'pending' | 'resolved' | 'requires_investigation', 'pending' | 'resolved' | 'requires_investigation'>;
    resolution_notes: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
}

export interface ApiAccessLogTable {
    id: Generated<string>;
    api_key_id: string | null;
    user_id: string | null;
    endpoint: string;
    method: string;
    request_timestamp: DateColumn;
    response_status: number | null;
    response_time_ms: number | null;
    ip_address: string | null;
    user_agent: string | null;
    request_size_bytes: number | null;
    response_size_bytes: number | null;
    created_at: DateColumn;
}
