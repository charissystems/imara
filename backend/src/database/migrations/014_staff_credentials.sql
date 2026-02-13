-- STAFF CREDENTIALS
CREATE TABLE IF NOT EXISTS template.staff_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id uuid NOT NULL UNIQUE REFERENCES template.staff(id) ON DELETE CASCADE,
    
    -- Password Management
    password_hash varchar(255) NOT NULL,
    password_changed_at timestamptz DEFAULT now() NOT NULL,
    
    -- Account Status
    is_active boolean DEFAULT true NOT NULL,
    is_locked boolean DEFAULT false NOT NULL,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamptz,
    
    -- Session Management
    last_login_at timestamptz,
    last_password_changed_at timestamptz DEFAULT now(),
    password_expires_at timestamptz,
    
    -- Security
    reset_token varchar(255),
    reset_token_expires_at timestamptz,
    
    -- Audit
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

-- INDEXES
CREATE UNIQUE INDEX IF NOT EXISTS staff_credentials_staff_id_unique ON template.staff_credentials(staff_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS staff_credentials_reset_token_idx ON template.staff_credentials(reset_token) WHERE deleted_at IS NULL AND reset_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS staff_credentials_is_active_idx ON template.staff_credentials(is_active) WHERE deleted_at IS NULL;
