import { ColumnType, Generated } from 'kysely';
import { DateColumn, NullableDateColumn } from './common';

// AUTHENTICATION & AUTHORIZATION (001)

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

export interface RolesTable {
    id: Generated<string>;
    name: string;
    description: string | null;
    is_system_role: ColumnType<boolean, boolean | undefined>;
    is_active: ColumnType<boolean, boolean | undefined>;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface RolePermissionsTable {
    id: Generated<string>;
    role_id: string;
    permission_id: string;
    created_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface StaffTable {
    id: Generated<string>;
    staff_number: string;
    status: ColumnType<'active' | 'inactive' | 'suspended' | 'resigned', 'active' | 'inactive' | 'suspended' | 'resigned'>;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    email: string;
    phone: string;
    department: string | null;
    position: string;
    hire_date: DateColumn;
    exit_date: NullableDateColumn;
    role_id: string | null;
    branch_id: string | null;
    created_by: string | null;
    updated_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface StaffCredentialsTable {
    id: Generated<string>;
    staff_id: string;
    password_hash: string;
    password_salt: string;
    password_changed_at: DateColumn;
    two_factor_enabled: ColumnType<boolean, boolean | undefined>;
    two_factor_secret: string | null;
    two_factor_backup_codes: string[] | null;
    account_locked: ColumnType<boolean, boolean | undefined>;
    failed_login_attempts: ColumnType<number, number | undefined>;
    locked_until: NullableDateColumn;
    last_login_at: NullableDateColumn;
    last_login_ip: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
}
