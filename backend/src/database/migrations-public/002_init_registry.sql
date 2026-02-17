-- TENANT REGISTRY (Public Schema)
CREATE TABLE IF NOT EXISTS public.tenants(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Identification
    code varchar(50) NOT NULL,
    sacco_name varchar(255) NOT NULL,
    short_name varchar(100),
    subdomain varchar(63) NOT NULL,
    -- Schema Information
    schema_name varchar(63) NOT NULL,
    -- Contact Information
    contact_email varchar(200),
    contact_phone varchar(50),
    address jsonb,
    -- Branding
    branding jsonb DEFAULT '{"logo_url": null, "primary_color": "#4167e1"}'::jsonb,
    -- Subscription
    subscription_tier varchar(20) DEFAULT 'trial' CHECK (subscription_tier IN ('trial', 'basic', 'pro')),
    subscription_expires_at timestamptz,
    max_users integer DEFAULT 10 CHECK (max_users > 0),
    max_members integer DEFAULT 100 CHECK (max_members > 0),
    -- Status
    status varchar(20) DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'suspended', 'inactive')),
    -- Settings
    settings jsonb DEFAULT '{}'::jsonb,
    -- Audit
    created_by uuid,
    updated_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

-- UNIQUE CONSTRAINTS (Supporting Soft Deletes)
CREATE UNIQUE INDEX IF NOT EXISTS tenants_code_active_idx ON public.tenants(code)
WHERE
    deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_subdomain_active_idx ON public.tenants(subdomain)
WHERE
    deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_schema_name_active_idx ON public.tenants(schema_name)
WHERE
    deleted_at IS NULL;

-- Validation Constraints
ALTER TABLE public.tenants
    ADD CONSTRAINT ten_contact_email_check CHECK (contact_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    ADD CONSTRAINT ten_contact_phone_check CHECK (contact_phone ~ '^\+[0-9]{6,15}$');

-- Performance Indexes
CREATE INDEX IF NOT EXISTS tenants_status_idx ON public.tenants(status)
WHERE
    deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS tenants_deleted_at_idx ON public.tenants(deleted_at);

CREATE INDEX IF NOT EXISTS tenants_subscription_expires_idx ON public.tenants(subscription_expires_at)
WHERE
    subscription_expires_at IS NOT NULL;

-- Shared trigger function for updated_at (used by multiple tables)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
    RETURNS TRIGGER
    AS $$
BEGIN
    NEW.updated_at = clock_timestamp();
    RETURN NEW;
END;
$$
LANGUAGE plpgsql;

-- Trigger: Auto-update updated_at
CREATE TRIGGER tenants_set_updated_at
    BEFORE UPDATE ON public.tenants
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Function: Prevent schema_name modification after creation
CREATE OR REPLACE FUNCTION public.prevent_schema_rename()
    RETURNS TRIGGER
    AS $$
BEGIN
    IF NEW.schema_name <> OLD.schema_name THEN
        RAISE EXCEPTION 'schema_name is immutable after tenant creation';
    END IF;
    RETURN NEW;
END;
$$
LANGUAGE plpgsql;

-- Trigger: Enforce schema_name immutability
CREATE TRIGGER tenants_schema_immutable
    BEFORE UPDATE ON public.tenants
    FOR EACH ROW
    WHEN(OLD.schema_name IS DISTINCT FROM NEW.schema_name)
    EXECUTE FUNCTION public.prevent_schema_rename();

