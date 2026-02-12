-- MEMBERS
CREATE TABLE IF NOT EXISTS template.members(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_number varchar(20) NOT NULL UNIQUE,
    status varchar(20) check(status in ('active', 'inactive', 'suspended', 'closed')) DEFAULT 'active' NOT NULL,

    -- Basic Details
    first_name varchar(100) NOT NULL,
    middle_name varchar(100),
    last_name varchar(100) NOT NULL,
    date_of_birth date,
    gender varchar(50) check(gender in ('male', 'female', 'other', 'unknown')) DEFAULT 'unknown' NOT NULL,
    marital_status varchar(50) check(marital_status in ('single', 'married', 'divorced', 'widowed')) DEFAULT 'single' NOT NULL,
    life_status varchar(50) check(life_status in ('alive', 'deceased')) DEFAULT 'alive' NOT NULL,
    nationality varchar(100) DEFAULT 'Ugandan',

    -- Contact Information
    phone varchar(50) NOT NULL UNIQUE,
    email varchar(200) NOT NULL UNIQUE,

    -- More KYC Information
    photo_url varchar(500),
    signature_url varchar(500),
    physical_address jsonb,
    employment_details jsonb,
    next_of_kin jsonb,

    -- Member Lifecycle
    joined_date date NOT NULL,
    exit_date date,
    exit_reason text,

    -- Referral Tracking
    referred_by uuid REFERENCES template.members(id) ON DELETE SET NULL,

    -- KYC Tracking
    kyc_status varchar(20) check(kyc_status in ('not_started', 'in_progress', 'completed', 'approved', 'rejected')) DEFAULT 'not_started',
    kyc_completed_at timestamptz,
    kyc_approved_by uuid,
    risk_rating varchar(20) check(risk_rating in ('low', 'medium', 'high')) DEFAULT 'low',

    -- Preferences
    preferences jsonb DEFAULT '{}'::jsonb,

    -- Audit
    created_by uuid,
    updated_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

-- INDEXES
CREATE UNIQUE INDEX IF NOT EXISTS members_phone_unique ON template.members(phone) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS members_email_unique ON template.members(email) WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS members_name_idx ON template.members(last_name, first_name);
CREATE UNIQUE INDEX IF NOT EXISTS members_number_unique ON template.members(member_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS members_status_idx ON template.members(status);
