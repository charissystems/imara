-- Schema migration tracking (per tenant)
CREATE TABLE IF NOT EXISTS public.tenant_migrations(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    migration_name varchar(255) NOT NULL,
    migration_version integer NOT NULL,
    applied_at timestamptz DEFAULT now() NOT NULL,
    executed_by uuid,
    UNIQUE (tenant_id, migration_name)
);

-- Performance index for migration queries
CREATE INDEX tenant_migrations_tenant_idx ON public.tenant_migrations(tenant_id, applied_at DESC);

-- Index for version-based queries
CREATE INDEX tenant_migrations_version_idx ON public.tenant_migrations(migration_version);

COMMENT ON TABLE public.tenant_migrations IS 'Tracks schema migrations applied to each tenant schema';

COMMENT ON COLUMN public.tenant_migrations.migration_version IS 'Sequential version number for ordering migrations';
