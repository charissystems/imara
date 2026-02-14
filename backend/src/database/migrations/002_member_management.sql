-- ============================================================================
-- MEMBER MANAGEMENT
-- Member registration, onboarding, KYC, and lifecycle management
-- ============================================================================

-- MEMBERS
CREATE TABLE IF NOT EXISTS template.members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    member_number varchar(20) NOT NULL UNIQUE,
    status varchar(20) CHECK (status IN ('active', 'inactive', 'suspended', 'closed')) DEFAULT 'active' NOT NULL,

    -- Basic Details
    first_name varchar(100) NOT NULL,
    middle_name varchar(100),
    last_name varchar(100) NOT NULL,
    date_of_birth date,
    gender varchar(50) CHECK (gender IN ('male', 'female', 'other', 'unknown')) DEFAULT 'unknown' NOT NULL,
    marital_status varchar(50) CHECK (marital_status IN ('single', 'married', 'divorced', 'widowed', 'unknown')) DEFAULT 'unknown' NOT NULL,
    life_status varchar(50) CHECK (life_status IN ('alive', 'deceased')) DEFAULT 'alive' NOT NULL,
    nationality varchar(100) DEFAULT 'Ugandan',

    -- Contact Information
    phone varchar(50) NOT NULL,
    email varchar(200),
    
    -- Address
    physical_address jsonb, -- {street, city, district, postal_code}
    postal_address jsonb,
    
    -- Employment & Income
    employment_details jsonb, -- {employer, position, annual_income, employment_type}
    
    -- Next of Kin
    next_of_kin jsonb, -- {name, phone, relationship}
    
    -- Media
    photo_url varchar(500),
    signature_url varchar(500),
    
    -- Member Lifecycle
    joined_date date NOT NULL,
    exit_date date,
    exit_reason text,

    -- Referral Tracking
    referred_by uuid REFERENCES template.members(id) ON DELETE SET NULL,

    -- KYC Tracking (MVP Focus)
    kyc_status varchar(20) CHECK (kyc_status IN ('not_started', 'in_progress', 'completed', 'approved', 'rejected')) DEFAULT 'not_started',
    kyc_completed_at timestamptz,
    kyc_approved_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    risk_rating varchar(20) CHECK (risk_rating IN ('low', 'medium', 'high')) DEFAULT 'low',
    
    -- Communication Preferences
    preferences jsonb DEFAULT '{"sms_notifications": true, "email_notifications": true}'::jsonb,

    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS members_number_unique ON template.members(member_number) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS members_phone_unique ON template.members(phone) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS members_email_unique ON template.members(email) WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS members_name_idx ON template.members(last_name, first_name);
CREATE INDEX IF NOT EXISTS members_status_idx ON template.members(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS members_kyc_status_idx ON template.members(kyc_status) WHERE deleted_at IS NULL;

-- IDENTITY DOCUMENTS
CREATE TABLE IF NOT EXISTS template.identity_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    member_id uuid NOT NULL REFERENCES template.members(id) ON DELETE CASCADE,
    
    document_type varchar(50) CHECK (document_type IN ('national_id', 'passport', 'driver_license', 'voter_id', 'birth_certificate')) NOT NULL,
    
    document_number varchar(100) NOT NULL,
    issue_date date,
    expiry_date date,
    
    -- Storage
    document_url varchar(500),
    document_data bytea, -- For embedded storage if needed
    
    -- Verification
    is_verified boolean DEFAULT false,
    verified_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    verified_at timestamptz,
    
    -- Audit
    created_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS identity_docs_unique ON template.identity_documents(member_id, document_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS identity_docs_member_idx ON template.identity_documents(member_id) WHERE deleted_at IS NULL;

-- MEMBERSHIPS
-- Tracks member lifecycle events and membership types
CREATE TABLE IF NOT EXISTS template.memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    member_id uuid NOT NULL REFERENCES template.members(id) ON DELETE CASCADE,
    
    membership_type varchar(50) CHECK (membership_type IN ('regular', 'associate', 'honorary')) DEFAULT 'regular',
    
    start_date date NOT NULL,
    end_date date,
    
    is_active boolean DEFAULT true,
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS memberships_member_idx ON template.memberships(member_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS memberships_active_idx ON template.memberships(is_active) WHERE deleted_at IS NULL;

-- MEMBER ACCOUNTS OVERVIEW
-- Summary view of member's financial accounts (savings, shares, loans, FDs)
CREATE TABLE IF NOT EXISTS template.member_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    member_id uuid NOT NULL UNIQUE REFERENCES template.members(id) ON DELETE CASCADE,
    
    -- Account Status
    is_active boolean DEFAULT true,
    
    -- Balance Summary (Updated by triggers)
    savings_balance numeric(20, 4) DEFAULT 0,
    shares_balance numeric(20, 4) DEFAULT 0,
    fixed_deposits_balance numeric(20, 4) DEFAULT 0,
    loans_balance numeric(20, 4) DEFAULT 0,
    
    -- Account Restrictions
    account_frozen boolean DEFAULT false,
    freeze_reason text,
    frozen_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    frozen_at timestamptz,
    
    -- Audit
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS member_accounts_active_idx ON template.member_accounts(is_active);
CREATE INDEX IF NOT EXISTS member_accounts_frozen_idx ON template.member_accounts(account_frozen);
