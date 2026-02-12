-- ROLES
CREATE TABLE IF NOT EXISTS template.roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    name varchar(100) NOT NULL UNIQUE,
    display_name varchar(100),
    description text,
    
    is_system_role boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    hierarchy_level integer check(hierarchy_level > 0) DEFAULT 1,
    
    created_by uuid,
    updated_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

-- INDEXES
CREATE INDEX IF NOT EXISTS roles_active_idx ON template.roles(is_active) WHERE deleted_at IS NULL;
