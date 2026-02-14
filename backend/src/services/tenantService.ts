import { publicDb, getPool } from '../config/database';
import { MigrationRunner } from '../utils/migrationRunner';
import { TenantRepository } from '../repositories/tenantRepository';

export class TenantService {
    private migrationRunner = new MigrationRunner();
    private tenantRepo = new TenantRepository(publicDb);

    /**
     * Log audit event to tenant_audit_log table
     * @param schemaName - Tenant schema being affected
     * @param operation - Operation type (CREATE, DELETE, etc.)
     * @param tenantCode - Optional tenant code for linking
     * @param details - Additional context as JSONB
     * @param errorMessage - Error details if operation failed
     */
    private async logAuditEvent(
        schemaName: string,
        operation: string,
        tenantCode?: string,
        details?: Record<string, any>,
        errorMessage?: string
    ) {
        try {
            await publicDb
                .insertInto('tenant_audit_log')
                .values({
                    schema_name: schemaName,
                    tenant_code: tenantCode || null,
                    operation,
                    details: details ? JSON.stringify(details) : null,
                    error_message: errorMessage || null,
                    // performed_by defaults to current_user in DB
                    // performed_at defaults to now() in DB
                })
                .execute();
        } catch (error) {
            // Log but don't fail the main operation
            console.error('Failed to log audit event:', error);
        }
    }

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
            
            const result = await getPool().query(`
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

            // 3. Log successful creation
            await this.logAuditEvent(
                schemaName,
                'CREATE_SUCCESS',
                subdomain,
                {
                    tenantId,
                    tenantName,
                    email: contactEmail,
                    hasPassword: !!adminPassword
                }
            );

            // 4. Fetch and return the full tenant object
            return await this.tenantRepo.findById(tenantId);

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            
            // Log the failure for audit trail
            await this.logAuditEvent(
                schemaName,
                'CREATE_FAILED',
                subdomain,
                {
                    tenantName,
                    email: contactEmail,
                    attemptedAt: new Date().toISOString()
                },
                errorMsg
            );

            console.error(`[TenantService] Failed to create tenant ${subdomain}.`, error);
            // Note: The SQL function has internal rollback logic at the database level,
            // so we don't need to manually cleanup the tenants row here.
            throw error;
        }
    }

    async softDeleteTenant(tenantId: string) {
        try {
            // Get tenant details before deletion for audit logging
            const tenant = await this.tenantRepo.findById(tenantId);
            if (!tenant) {
                throw new Error(`Tenant with ID ${tenantId} not found`);
            }

            // The SQL function handles:
            // - UPDATE public.tenants: mark as deleted_at, status = 'inactive'
            // - REVOKE login capability from role
            // - Audit logging (via SQL function)
            await getPool().query('SELECT soft_delete_tenant($1)', [tenantId]);

            // Log in application layer as well
            await this.logAuditEvent(
                tenant.schema_name,
                'SOFT_DELETE',
                tenant.code,
                {
                    tenantId,
                    tenantName: tenant.sacco_name
                }
            );

            return await this.tenantRepo.findById(tenantId);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[TenantService] Failed to soft-delete tenant ${tenantId}.`, error);
            throw error;
        }
    }

    async hardDeleteTenant(schemaName: string) {
        try {
            // WARNING: Destructive - Physically drops schema and role
            // Use soft_delete_tenant() for normal operations
            await getPool().query('SELECT drop_tenant_schema($1)', [schemaName]);

            // Log the hard delete
            await this.logAuditEvent(
                schemaName,
                'HARD_DELETE',
                undefined,
                {
                    schema: schemaName,
                    timestamp: new Date().toISOString()
                }
            );
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            
            await this.logAuditEvent(
                schemaName,
                'HARD_DELETE_FAILED',
                undefined,
                { schema: schemaName },
                errorMsg
            );

            console.error(`[TenantService] Failed to hard-delete tenant schema ${schemaName}.`, error);
            throw error;
        }
    }

    async checkHealth(tenantId: string) {
        // Fetch tenant details first
        const tenant = await this.tenantRepo.findById(tenantId);
        if (!tenant) {
            throw new Error(`Tenant with ID ${tenantId} not found`);
        }

        // The SQL function returns a JSONB object
        const result = await getPool().query('SELECT check_tenant_health($1) as health', [tenantId]);
        
        if (!result.rows[0]) {
            throw new Error('Health check returned no results');
        }
        
        // Log health check as an audit event
        await this.logAuditEvent(
            tenant.schema_name,
            'HEALTH_CHECK',
            tenant.code,
            result.rows[0].health
        );

        return result.rows[0].health;
    }
}
