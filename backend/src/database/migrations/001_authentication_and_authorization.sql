-- ============================================================================
-- AUTHENTICATION & AUTHORIZATION
-- Foundational tables for permission and access control
-- ============================================================================

-- PERMISSIONS
CREATE TABLE IF NOT EXISTS template.permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    resource varchar(100) NOT NULL,
    action varchar(50) NOT NULL,
    scope varchar(50) DEFAULT 'sacco',
    
    name varchar(100) NOT NULL,
    description text,
    
    is_system_permission boolean DEFAULT false NOT NULL,
    requires_approval boolean DEFAULT false NOT NULL,
    approval_threshold integer CHECK (approval_threshold IS NULL OR approval_threshold >= 0),
    
    created_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS permissions_unique ON template.permissions(resource, action, scope) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS permissions_resource_idx ON template.permissions(resource) WHERE deleted_at IS NULL;

-- ROLES
CREATE TABLE IF NOT EXISTS template.roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    name varchar(100) NOT NULL UNIQUE,
    description text,
    
    is_system_role boolean DEFAULT false,
    is_active boolean DEFAULT true,
    
    created_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS roles_name_unique ON template.roles(name) WHERE deleted_at IS NULL;

-- ROLE PERMISSIONS (Junction Table)
CREATE TABLE IF NOT EXISTS template.role_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    role_id uuid NOT NULL REFERENCES template.roles(id) ON DELETE CASCADE,
    permission_id uuid NOT NULL REFERENCES template.permissions(id) ON DELETE CASCADE,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_unique ON template.role_permissions(role_id, permission_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS role_permissions_role_idx ON template.role_permissions(role_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS role_permissions_permission_idx ON template.role_permissions(permission_id) WHERE deleted_at IS NULL;

-- STAFF
CREATE TABLE IF NOT EXISTS template.staff (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    staff_number varchar(20) NOT NULL UNIQUE,
    status varchar(20) CHECK (status IN ('active', 'inactive', 'suspended', 'resigned')) DEFAULT 'active' NOT NULL,
    
    -- Personal Details
    first_name varchar(100) NOT NULL,
    middle_name varchar(100),
    last_name varchar(100) NOT NULL,
    email varchar(200) NOT NULL UNIQUE,
    phone varchar(50) NOT NULL UNIQUE,
    
    -- Employment
    department varchar(100),
    position varchar(100) NOT NULL,
    hire_date date NOT NULL,
    exit_date date,
    
    -- Role Assignment
    role_id uuid REFERENCES template.roles(id) ON DELETE SET NULL,
    
    -- Branch/Location Assignment
    branch_id uuid, -- Will reference branches table when available
    
    -- Audit
    created_by uuid,
    updated_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_number_unique ON template.staff(staff_number) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS staff_email_unique ON template.staff(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS staff_status_idx ON template.staff(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS staff_role_idx ON template.staff(role_id) WHERE deleted_at IS NULL;

-- STAFF CREDENTIALS
CREATE TABLE IF NOT EXISTS template.staff_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    staff_id uuid NOT NULL UNIQUE REFERENCES template.staff(id) ON DELETE CASCADE,
    
    password_hash varchar(255) NOT NULL,
    password_salt varchar(255) NOT NULL,
    password_changed_at timestamptz DEFAULT now(),
    
    -- 2FA
    two_factor_enabled boolean DEFAULT false,
    two_factor_secret varchar(255),
    two_factor_backup_codes text[],
    
    -- Account Status
    account_locked boolean DEFAULT false,
    failed_login_attempts integer DEFAULT 0,
    locked_until timestamptz,
    
    -- Activity Tracking
    last_login_at timestamptz,
    last_login_ip varchar(45),
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_credentials_staff_idx ON template.staff_credentials(staff_id);

-- ─────────────────────────────────────────────────────────────────────
-- PERFORMANCE INDEXES
-- ─────────────────────────────────────────────────────────────────────

-- Active staff lookups (status-based filtering is very common)
CREATE INDEX IF NOT EXISTS idx_staff_active
    ON template.staff(status, staff_number)
    WHERE status = 'active';

-- Staff statistics targets for query planner
ALTER TABLE template.staff ALTER COLUMN status SET STATISTICS 500;
-- MEMBER CREDENTIALS (PINs for member self-service)
CREATE TABLE IF NOT EXISTS template.member_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id uuid NOT NULL UNIQUE REFERENCES template.members(id) ON DELETE CASCADE,
    pin_hash varchar(255) NOT NULL,
    pin_salt varchar(100) NOT NULL,
    pin_attempts integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 5,
    is_locked boolean NOT NULL DEFAULT false,
    locked_at timestamptz,
    last_pin_change timestamptz NOT NULL DEFAULT now(),
    force_change boolean NOT NULL DEFAULT false,
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS member_credentials_member_idx ON template.member_credentials(member_id);