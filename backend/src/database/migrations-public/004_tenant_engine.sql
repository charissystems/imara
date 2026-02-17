-- TENANT SCHEMA DEPLOYMENT ENGINE
-- Conforms to PostgreSQL Standard (v16+)

-- SYSTEM SETUP
-- Create template schema for tenant cloning
CREATE SCHEMA IF NOT EXISTS template;

-- Lock down schemas for security
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO PUBLIC;
REVOKE ALL ON SCHEMA template FROM PUBLIC;

-- AUDIT TABLE
CREATE TABLE IF NOT EXISTS public.tenant_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schema_name varchar(63) NOT NULL,
    tenant_code varchar(50),
    operation varchar(20) NOT NULL,
    performed_by varchar(100) DEFAULT current_user,
    performed_at timestamptz DEFAULT now(),
    details jsonb,
    error_message text
);

CREATE INDEX IF NOT EXISTS tenant_audit_log_schema_idx 
ON public.tenant_audit_log(schema_name, performed_at DESC);

CREATE INDEX IF NOT EXISTS tenant_audit_log_operation_idx 
ON public.tenant_audit_log(operation, performed_at DESC);

-- CORE FUNCTION: create_tenant_schema

CREATE OR REPLACE FUNCTION public.create_tenant_schema(p_schema_name varchar)
RETURNS void AS $$ DECLARE
    v_table_name text;
    v_definition text; 
    v_view_rec record; 
    v_func_def text;
    v_trigger_rec record;
    v_role_name text := p_schema_name || '_role';
    v_constraint_rec record;
    v_constraint_def text;
    v_policy_rec record;
BEGIN
    -- 1. INPUT VALIDATION
    IF p_schema_name IN ('template', 'public', 'pg_catalog', 'information_schema', 'pg_toast', 'pg_temp') THEN
        RAISE EXCEPTION 'Illegal schema name: Cannot create schema named "%"', p_schema_name;
    END IF;
    IF p_schema_name !~ '^[a-z_][a-z0-9_]*$' THEN
        RAISE EXCEPTION 'Invalid schema name format. Use lowercase letters, numbers, and underscores only.';
    END IF;

    -- 2. CREATE ROLE
    BEGIN
        EXECUTE format('CREATE ROLE %I WITH NOLOGIN', v_role_name);
    EXCEPTION
        WHEN duplicate_object THEN
            RAISE NOTICE 'Role % already exists, skipping creation.', v_role_name;
    END;

    -- 3. CREATE SCHEMA
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I AUTHORIZATION %I', p_schema_name, v_role_name);

    -- 4. CLONE TABLES (INCLUDING ALL)
    FOR v_table_name IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'template' AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format(
            'CREATE TABLE %I.%I (LIKE template.%I INCLUDING ALL)',
            p_schema_name, v_table_name, v_table_name
        );
    END LOOP;

    -- 5. RECREATE AND FIX FOREIGN KEY CONSTRAINTS
    FOR v_constraint_rec IN
        SELECT
            tc.table_name,
            tc.constraint_name,
            tc.constraint_type,
            pg_get_constraintdef(c.oid) AS constraint_def
        FROM information_schema.table_constraints tc
        JOIN pg_constraint c ON c.conname = tc.constraint_name
        WHERE tc.table_schema = 'template' 
          AND tc.constraint_type = 'FOREIGN KEY'
    LOOP
        -- Drop the existing FK
        EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I', 
                       p_schema_name, v_constraint_rec.table_name, v_constraint_rec.constraint_name);
        
        -- Fix the definition: replace 'template.' references with the new schema name
        v_constraint_def := replace(v_constraint_rec.constraint_def, 'template.', p_schema_name || '.');
        
        -- Add the corrected FK constraint
        EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s', 
                       p_schema_name, 
                       v_constraint_rec.table_name, 
                       v_constraint_rec.constraint_name, 
                       v_constraint_def);
    END LOOP;

    -- 6. CLONE VIEWS
    FOR v_view_rec IN
        SELECT viewname, pg_get_viewdef(c.oid) as definition
        FROM pg_views v
        JOIN pg_class c ON c.relname = v.viewname 
            AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'template')
        WHERE v.schemaname = 'template'
    LOOP
        v_definition := replace(v_view_rec.definition, 'template.', p_schema_name || '.');
        EXECUTE format('SET LOCAL search_path TO %I, public', p_schema_name);
        EXECUTE format('CREATE OR REPLACE VIEW %I.%I AS %s', 
                       p_schema_name, v_view_rec.viewname, v_definition);
    END LOOP;

    -- 7. CLONE FUNCTIONS
    FOR v_func_def IN
        SELECT pg_get_functiondef(oid)
        FROM pg_proc
        WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'template')
    LOOP
        v_func_def := replace(v_func_def, 'template.', p_schema_name || '.');
        v_func_def := replace(v_func_def, 'CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION');
        EXECUTE v_func_def;
    END LOOP;

    -- 8. CLONE TRIGGERS
    FOR v_trigger_rec IN
        SELECT 
            t.tgname as trigger_name, 
            c.relname as table_name,
            pg_get_triggerdef(t.oid) as trigger_def
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'template' AND NOT t.tgisinternal 
    LOOP
        v_definition := replace(v_trigger_rec.trigger_def, 'template.', p_schema_name || '.');
        v_definition := replace(v_definition, 'EXECUTE FUNCTION update_updated_at_column()', 'EXECUTE FUNCTION public.update_updated_at_column()');
        EXECUTE v_definition;
    END LOOP;

    -- 9. CLONE ROW LEVEL SECURITY POLICIES
    --    CREATE TABLE ... LIKE ... INCLUDING ALL does NOT copy RLS enablement
    --    or policies, so we replicate them from the template schema.
    FOR v_policy_rec IN
        SELECT
            pol.tablename,
            pol.policyname,
            pol.permissive,
            pol.cmd,
            pol.qual,
            pol.with_check
        FROM pg_policies pol
        WHERE pol.schemaname = 'template'
    LOOP
        -- Enable RLS on the target table (idempotent)
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
                       p_schema_name, v_policy_rec.tablename);

        -- Reconstruct the CREATE POLICY statement
        EXECUTE format(
            'CREATE POLICY %I ON %I.%I FOR %s %s',
            v_policy_rec.policyname,
            p_schema_name,
            v_policy_rec.tablename,
            v_policy_rec.cmd,
            CASE WHEN v_policy_rec.qual IS NOT NULL
                 THEN 'USING (' || v_policy_rec.qual || ')'
                 ELSE ''
            END ||
            CASE WHEN v_policy_rec.with_check IS NOT NULL
                 THEN ' WITH CHECK (' || v_policy_rec.with_check || ')'
                 ELSE ''
            END
        );
    END LOOP;

    -- 10. GRANT PERMISSIONS
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', p_schema_name, v_role_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO %I', p_schema_name, v_role_name);
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO %I', p_schema_name, v_role_name);
    EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %I TO %I', p_schema_name, v_role_name);
    
    -- Grant read access to public reference data (e.g. currencies)
    EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA public TO %I', v_role_name);

    -- 11. DEFAULT PRIVILEGES
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', 
                   p_schema_name, v_role_name);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO %I', 
                   p_schema_name, v_role_name);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT EXECUTE ON FUNCTIONS TO %I', 
                   p_schema_name, v_role_name);
    
    RAISE NOTICE 'Successfully created tenant schema: %', p_schema_name;
END;
 $$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.create_tenant_schema(varchar) IS 
    'Creates a new tenant schema by cloning the template schema. Handles tables, views, functions, triggers, and permissions.';

-- FUNCTION: create_tenant_with_security
CREATE OR REPLACE FUNCTION public.create_tenant_with_security(
    p_schema_name varchar, 
    p_tenant_code varchar, 
    p_password varchar, 
    p_contact_email varchar, 
    p_contact_phone varchar
)
RETURNS uuid AS $$ 
DECLARE
    v_tenant_id uuid;
    v_role_name text := p_schema_name || '_role';
BEGIN
    BEGIN
        -- Create the tenant schema
        PERFORM public.create_tenant_schema(p_schema_name);
        
        -- Enable login for the role
        EXECUTE format('ALTER ROLE %I LOGIN', v_role_name);
        
        -- Set password with validation
        IF p_password IS NOT NULL THEN
            IF length(p_password) < 12 THEN 
                RAISE EXCEPTION 'Password must be at least 12 characters'; 
            END IF;
            EXECUTE format('ALTER ROLE %I PASSWORD %L', v_role_name, p_password);
        END IF;

        -- Register tenant in public registry
        INSERT INTO public.tenants (
            code, sacco_name, schema_name, subdomain, contact_email, contact_phone
        )
        VALUES (
            p_tenant_code, p_tenant_code, p_schema_name, p_tenant_code, p_contact_email, p_contact_phone
        )
        RETURNING id INTO v_tenant_id;

        -- Audit log
        INSERT INTO public.tenant_audit_log (schema_name, tenant_code, operation, details)
        VALUES (p_schema_name, p_tenant_code, 'CREATE', jsonb_build_object('role_name', v_role_name, 'tenant_id', v_tenant_id));
        
        RAISE NOTICE 'Successfully created tenant: % (ID: %)', p_tenant_code, v_tenant_id;
        
    EXCEPTION 
        WHEN OTHERS THEN
            -- Rollback: Drop schema if it exists
            IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = p_schema_name) THEN
                EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', p_schema_name);
            END IF;
            
            -- Rollback: Drop role if it exists
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role_name) THEN
                BEGIN
                    EXECUTE format('DROP ROLE IF EXISTS %I', v_role_name);
                EXCEPTION WHEN OTHERS THEN
                    -- Ignore if role cannot be dropped due to dependencies
                    RAISE NOTICE 'Could not drop role % due to dependencies, skipping', v_role_name;
                END;
            END IF;
            
            -- Log failure
            INSERT INTO public.tenant_audit_log (schema_name, operation, error_message)
            VALUES (p_schema_name, 'CREATE_FAILED', SQLERRM);
            
            RAISE;
    END;
    
    RETURN v_tenant_id;
END;
 $$ LANGUAGE plpgsql;

-- FUNCTION: drop_tenant_schema
CREATE OR REPLACE FUNCTION public.drop_tenant_schema(p_schema_name varchar)
RETURNS void AS $$ 
DECLARE
    v_role_name text := p_schema_name || '_role';
BEGIN
    -- Validation: Prevent dropping system schemas
    IF p_schema_name IN ('template', 'public', 'pg_catalog', 'information_schema', 'pg_toast', 'pg_temp') THEN
        RAISE EXCEPTION 'Forbidden: Cannot drop system schema "%"', p_schema_name;
    END IF;
    
    -- Audit log
    INSERT INTO public.tenant_audit_log (schema_name, operation, details)
    VALUES (p_schema_name, 'DROP', jsonb_build_object('triggered_by', current_user));
    
    -- Drop schema and all objects
    EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', p_schema_name);
    
    -- Drop associated role
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role_name) THEN
        EXECUTE format('DROP ROLE IF EXISTS %I', v_role_name);
    END IF;
    
    RAISE NOTICE 'Successfully dropped tenant schema: %', p_schema_name;
END;
 $$ LANGUAGE plpgsql;

-- FUNCTION: soft_delete_tenant
CREATE OR REPLACE FUNCTION public.soft_delete_tenant(p_tenant_id uuid)
RETURNS void AS $$ 
DECLARE
    v_schema_name varchar;
    v_tenant_code varchar;
    v_role_name text;
BEGIN
    -- Fetch tenant details
    SELECT schema_name, code INTO v_schema_name, v_tenant_code 
    FROM public.tenants WHERE id = p_tenant_id;

    -- Validation
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tenant with ID % not found', p_tenant_id;
    END IF;

    v_role_name := v_schema_name || '_role';

    -- Mark tenant as deleted
    UPDATE public.tenants 
    SET deleted_at = now(), status = 'inactive', updated_at = now()
    WHERE id = p_tenant_id;

    -- Revoke login capability
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role_name) THEN
        EXECUTE format('ALTER ROLE %I NOLOGIN', v_role_name);
    END IF;

    -- Audit log
    INSERT INTO public.tenant_audit_log (schema_name, tenant_code, operation, details)
    VALUES (v_schema_name, v_tenant_code, 'SOFT_DELETE', jsonb_build_object('tenant_id', p_tenant_id, 'role_revoked', true));
    
    RAISE NOTICE 'Successfully soft-deleted tenant: % (ID: %)', v_tenant_code, p_tenant_id;
END;
 $$ LANGUAGE plpgsql;

-- FUNCTION: check_tenant_health
CREATE OR REPLACE FUNCTION public.check_tenant_health(p_tenant_id uuid)
RETURNS jsonb AS $$ 
DECLARE
    v_result jsonb;
    v_schema_name varchar;
    v_expires_at timestamptz;
    v_sub_is_valid boolean;
    v_role_name text;
BEGIN
    -- Fetch tenant details
    SELECT schema_name, subscription_expires_at INTO v_schema_name, v_expires_at 
    FROM public.tenants WHERE id = p_tenant_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Tenant not found');
    END IF;

    v_role_name := v_schema_name || '_role';
    v_sub_is_valid := (v_expires_at IS NULL OR v_expires_at > now());

    -- Build health report
    SELECT jsonb_build_object(
        'tenant_id', p_tenant_id,
        'schema_name', v_schema_name,
        'schema_exists', EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = v_schema_name),
        'role_exists', EXISTS(SELECT 1 FROM pg_roles WHERE rolname = v_role_name),
        'role_can_login', (SELECT rolcanlogin FROM pg_roles WHERE rolname = v_role_name),
        'table_count', (SELECT count(*) FROM information_schema.tables WHERE table_schema = v_schema_name),
        'subscription_valid', v_sub_is_valid,
        'subscription_expires_at', v_expires_at,
        'checked_at', now()
    ) INTO v_result;
    
    RETURN v_result;
END;
 $$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.check_tenant_health IS 
    'Returns a health check report for a tenant including schema, role, and subscription status.';
