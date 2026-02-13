import { publicDb, pool } from '../config/database';
import { MigrationRunner } from '../utils/migrationRunner';
import { Tenant } from '../database/types';
import { TenantRepository } from '../repositories/tenantRepository';

export class TenantService {
    private migrationRunner = new MigrationRunner();
    private tenantRepo = new TenantRepository(publicDb);

    /**
     * Creates a new tenant.
     * Note: The SQL function 'create_tenant_with_security' now handles the 
     * registry insertion and schema creation atomically.
     */
    async createTenant(
        tenantName: string, 
        subdomain: string, 
        adminPassword?: string,
        contactEmail?: string,
        contactPhone?: string
    ) {
        const schemaName = `tenant_${subdomain.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

        try {
            // 1. Call the SQL function. It handles:
            //    - Schema Creation via public.create_tenant_schema()
            //    - Role Creation & Password
            //    - INSERT into public.tenants (atomic with schema creation)
            //    - Audit Logging
            
            const result = await pool.query(`
                SELECT create_tenant_with_security(
                    $1::varchar, -- schema_name
                    $2::varchar, -- tenant_code (using subdomain as code)
                    $3::varchar, -- admin_password
                    $4::varchar, -- contact_email
                    $5::varchar  -- contact_phone
                ) as id;
            `, [
                schemaName, 
                subdomain, 
                adminPassword || null, 
                contactEmail || `${subdomain}@temp.com`, 
                contactPhone || '+0000000000'
            ]);

            const tenantId = result.rows[0].id;

            // 2. Run Tenant Migrations (Table structure updates)
            // This ensures the specific tenant schema tables have any latest columns
            await this.migrationRunner.runTenantMigrations(schemaName, tenantId);

            // 3. Fetch and return the full tenant object
            return await this.tenantRepo.findById(tenantId);

        } catch (error) {
            console.error(`[TenantService] Failed to create tenant ${subdomain}.`, error);
            // Note: The SQL function has internal rollback logic at the database level,
            // so we don't need to manually cleanup the tenants row here.
            throw error;
        }
    }

    async softDeleteTenant(tenantId: string) {
        // The SQL function handles:
        // - UPDATE public.tenants: mark as deleted_at, status = 'inactive'
        // - REVOKE login capability from role
        // - Audit logging
        await pool.query('SELECT soft_delete_tenant($1)', [tenantId]);
        return this.tenantRepo.findById(tenantId);
    }

    async hardDeleteTenant(schemaName: string) {
        // WARNING: Destructive - Physically drops schema and role
        // Use soft_delete_tenant() for normal operations
        await pool.query('SELECT drop_tenant_schema($1)', [schemaName]);
    }

    async checkHealth(tenantId: string) {
        // The SQL function returns a JSONB object
        const result = await pool.query('SELECT check_tenant_health($1) as health', [tenantId]);
        return result.rows[0].health;
    }
}
}