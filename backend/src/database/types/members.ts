import { ColumnType, Generated, JSONColumnType } from 'kysely';
import { DateColumn, DecimalColumn, NullableDateColumn } from './common';

// MEMBER MANAGEMENT (002)

export interface IdentityDocumentsTable {
    id: Generated<string>;
    member_id: string;
    document_type: string;
    document_number: string;
    issue_date: NullableDateColumn;
    expiry_date: NullableDateColumn;
    document_url: string | null;
    document_data: Buffer | null;
    is_verified: ColumnType<boolean, boolean | undefined>;
    verified_by: string | null;
    verified_at: NullableDateColumn;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface MembersTable {
    id: Generated<string>;
    member_number: string;
    status: ColumnType<'active' | 'inactive' | 'suspended' | 'closed'>;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    date_of_birth: NullableDateColumn;
    gender: ColumnType<'male' | 'female' | 'other' | 'unknown'>;
    marital_status: ColumnType<'single' | 'married' | 'divorced' | 'widowed' | 'unknown'>;
    life_status: ColumnType<'alive' | 'deceased'>;
    nationality: string | null;
    phone: string;
    email: string | null;
    physical_address: JSONColumnType<Record<string, unknown>> | null;
    postal_address: JSONColumnType<Record<string, unknown>> | null;
    employment_details: JSONColumnType<Record<string, unknown>> | null;
    next_of_kin: JSONColumnType<Record<string, unknown>> | null;
    photo_url: string | null;
    signature_url: string | null;
    joined_date: DateColumn;
    exit_date: NullableDateColumn;
    exit_reason: string | null;
    referred_by: string | null;
    kyc_status: ColumnType<'not_started' | 'in_progress' | 'completed' | 'approved' | 'rejected', 'not_started' | 'in_progress' | 'completed' | 'approved' | 'rejected'>;
    kyc_completed_at: NullableDateColumn;
    kyc_approved_by: string | null;
    risk_rating: ColumnType<'low' | 'medium' | 'high', 'low' | 'medium' | 'high'>;
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
    membership_type: ColumnType<'regular' | 'associate' | 'honorary', 'regular' | 'associate' | 'honorary'>;
    start_date: DateColumn;
    end_date: NullableDateColumn;
    is_active: ColumnType<boolean, boolean | undefined>;
    created_by: string | null;
    created_at: DateColumn;
    updated_at: DateColumn;
    deleted_at: NullableDateColumn;
}

export interface MemberAccountsTable {
    id: Generated<string>;
    member_id: string;
    is_active: ColumnType<boolean, boolean | undefined>;
    savings_balance: DecimalColumn;
    shares_balance: DecimalColumn;
    fixed_deposits_balance: DecimalColumn;
    loans_balance: DecimalColumn;
    account_frozen: ColumnType<boolean, boolean | undefined>;
    freeze_reason: string | null;
    frozen_by: string | null;
    frozen_at: NullableDateColumn;
    created_at: DateColumn;
    updated_at: DateColumn;
}
