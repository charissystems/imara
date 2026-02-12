-- STAFF
CREATE TABLE IF NOT EXISTS template.staff(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id uuid NOT NULL REFERENCES template.members(id) ON DELETE CASCADE,
    role_id uuid REFERENCES template.roles(id),
    staff_number varchar(6) NOT NULL UNIQUE,

    -- Contact Information
    work_email varchar(200) NOT NULL UNIQUE,
    work_phone varchar(50),

    -- Employment Information
    department varchar(100),
    job_title varchar(100),
    employment_status varchar(20) check(employment_status in ('active', 'inactive', 'terminated')) DEFAULT 'active' NOT NULL,
    employment_type varchar(20) check(employment_type in ('permanent', 'contract', 'temporary')) DEFAULT 'permanent',

    -- Staff Lifecycle
    hire_date date NOT NULL,
    confirmation_date date,
    termination_date date,
    termination_reason text,

    -- Reporting
    reports_to uuid REFERENCES template.staff(id) ON DELETE SET NULL,

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
CREATE UNIQUE INDEX IF NOT EXISTS staff_number_unique ON template.staff(staff_number) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS staff_member_unique ON template.staff(member_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS staff_email_unique ON template.staff(work_email) WHERE deleted_at IS NULL;