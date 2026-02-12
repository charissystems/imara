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

-- INDEXES
CREATE UNIQUE INDEX IF NOT EXISTS permissions_unique ON template.permissions(resource, action, scope) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS permissions_resource_idx ON template.permissions(resource) WHERE deleted_at IS NULL;