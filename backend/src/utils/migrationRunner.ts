import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../config/database';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Validates tenant schema name to prevent SQL injection.
 * Must match pattern: tenant_<lowercase_alphanumeric_underscores>
 */
function validateSchemaName(schemaName: string): void {
    const VALID_SCHEMA_PATTERN = /^tenant_[a-z0-9_]+$/;
    if (!VALID_SCHEMA_PATTERN.test(schemaName)) {
        throw new Error(
            `Invalid schema name "${schemaName}". ` +
            'Must match pattern tenant_<code> (lowercase alphanumeric + underscores).'
        );
    }
}

export class MigrationRunner {
    private publicMigrationsPath = path.join(__dirname, '../database/migrations-public');
    private tenantMigrationsPath = path.join(__dirname, '../database/migrations');

    /**
     * Runs migrations for the Public Schema (Global Registry)
     */
    async runPublicMigrations() {
        console.log('� [INFO] Running Public Schema Migrations...');
        const files = await this.getSortedSqlFiles(this.publicMigrationsPath);

        if (files.length === 0) {
            console.log('🟠 [INFO] No public migrations to run.');
            return;
        }

        const client = await getPool().connect();
        try {
            for (const file of files) {
                console.log(`🔵 [INFO] [PUBLIC] Executing ${file.name}`);
                const sql = await fs.readFile(file.path, 'utf-8');
                try {
                    await client.query(sql);
                } catch (error: any) {
                    // Skip "already exists" errors (code 42P07) and constraint exists (42710)
                    // - 42P07: relation already exists
                    // - 42710: constraint already exists
                    if (error.code === '42P07' || error.code === '42710') {
                        console.log(`🟠 [INFO] [PUBLIC] Skipping ${file.name} (already exists)`);
                    } else {
                        throw error;
                    }
                }
            }
            console.log('🟢 [INFO] Public Schema Migrations Completed.');
        } catch (error) {
            console.error('🔴 [ERROR] Public Migration Failed:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Runs migrations for a specific Tenant Schema
     * @param schemaName - The schema name (e.g., 'tenant_001')
     * @param tenantId - The UUID of the tenant from the registry
     */
    async runTenantMigrations(schemaName: string, tenantId: string) {
        // SECURITY: Validate schema name to prevent SQL injection
        validateSchemaName(schemaName);
        
        console.log(`🔵 [INFO] Running Tenant Migrations for schema: ${schemaName}`);
        const files = await this.getSortedSqlFiles(this.tenantMigrationsPath);

        if (files.length === 0) {
            console.log('🟠 [INFO] No tenant migrations to run.');
            return;
        }

        const client = await getPool().connect();

        try {
            for (const file of files) {
                const version = parseInt(file.name.split('_')[0]);

                // 1. Check if migration already applied
                // Note: We use 'public.tenant_migrations' explicitly because search_path might be dynamic
                const checkQuery = `SELECT id FROM public.tenant_migrations WHERE tenant_id = $1 AND migration_version = $2`;

                const result = await client.query(checkQuery, [tenantId, version]);

                if (result.rows.length > 0) {
                    console.log(`🟠 [INFO] [TENANT] Skipping ${file.name} (already applied)`);
                    continue;
                }

                // 2. Start Transaction
                await client.query('BEGIN');

                try {
                    console.log(`🔵 [INFO] [TENANT] Applying ${file.name}...`);

                    // 3. Set Search Path for this Transaction
                    // This directs subsequent queries to the tenant schema
                    await client.query(`SET search_path TO ${schemaName}, public`);

                    // 4. Read and Execute Migration SQL
                    const sql = await fs.readFile(file.path, 'utf-8');
                    await client.query(sql);

                    // 5. Record Migration
                    // We explicitly use 'public.tenant_migrations' so we write to the registry, not the tenant schema
                    const logQuery = `INSERT INTO public.tenant_migrations (tenant_id, migration_name, migration_version, executed_by) VALUES ($1, $2, $3, $4)`;
                    await client.query(logQuery, [tenantId, file.name, version, 'system']);

                    // 6. Commit Transaction
                    await client.query('COMMIT');
                    console.log(`🟢 [INFO] [TENANT] Success ${file.name}`);

                } catch (error) {
                    // Rollback on failure
                    await client.query('ROLLBACK');
                    console.error(`🔴 [ERROR] [TENANT] Failed ${file.name}`, error);
                    throw error; // Stop execution
                }
            }
        } finally {
            client.release();
        }
    }

    /**
     * Helper: Reads directory, filters SQL files, and sorts by version
     */
    private async getSortedSqlFiles(dirPath: string): Promise<{ name: string; path: string }[]> {
        try {
            const files = await fs.readdir(dirPath);
            return files
                .filter(f => f.endsWith('.sql'))
                .map(name => ({ name, path: path.join(dirPath, name) }))
                .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
        } catch (e) {
            // If directory doesn't exist, return empty
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw e;
        }
    }
}