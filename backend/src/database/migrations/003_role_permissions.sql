-- ROLE PERMISSIONS
CREATE TABLE IF NOT EXISTS template.role_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id uuid NOT NULL REFERENCES template.roles(id) ON DELETE CASCADE,
    permission_id uuid NOT NULL REFERENCES template.permissions(id) ON DELETE CASCADE,
    
    is_granted boolean DEFAULT true NOT NULL,
    conditions jsonb,
    restrictions jsonb,
    
    granted_by uuid,
    granted_at timestamptz DEFAULT now(),
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

-- INDEXES
CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_unique ON template.role_permissions(role_id, permission_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS role_permissions_role_idx ON template.role_permissions(role_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS role_permissions_permission_idx ON template.role_permissions(permission_id) WHERE deleted_at IS NULL;
