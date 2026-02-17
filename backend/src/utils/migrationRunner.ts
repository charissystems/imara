import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../config/database';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class MigrationRunner {
    private publicMigrationsPath = path.join(__dirname, '../database/migrations-public');
    private tenantMigrationsPath = path.join(__dirname, '../database/migrations');

    /**
     * Runs migrations for the Public Schema (Global Registry)
     * After the tenant_engine migration creates the template schema,
     * tenant migrations are applied to populate it before subsequent
     * public migrations that ALTER template tables.
     */
    async runPublicMigrations() {
        console.log('🔵 [INFO] Running Public Schema Migrations...');
        const files = await this.getSortedSqlFiles(this.publicMigrationsPath);

        if (files.length === 0) {
            console.log('✨ No public migrations to run.');
            return;
        }

        const client = await getPool().connect();
        let templatePopulated = false;
        try {
            for (const file of files) {
                // After the tenant engine migration creates the template schema,
                // populate it with tenant tables before any migration that ALTERs them
                if (!templatePopulated && file.name > '004_' && file.name >= '005_') {
                    await this.populateTemplateSchema();
                    templatePopulated = true;
                }

                console.log(`  [PUBLIC] Executing ${file.name}`);
                const sql = await fs.readFile(file.path, 'utf-8');
                try {
                    await client.query(sql);
                } catch (error: any) {
                    // Skip "already exists" errors (code 42P07) and constraint exists (42710)
                    // - 42P07: relation already exists
                    // - 42710: constraint already exists
                    if (error.code === '42P07' || error.code === '42710') {
                        console.log(`  [PUBLIC] Skipping ${file.name} (already exists)`);
                    } else {
                        throw error;
                    }
                }
            }
            console.log('🟢 [SUCCESS] Public Schema Migrations Completed.');
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
        console.log(`🔵 [INFO] Running Tenant Migrations for schema: ${schemaName}`);
        const files = await this.getSortedSqlFiles(this.tenantMigrationsPath);

        if (files.length === 0) {
            console.log('✨ No tenant migrations to run.');
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
                    console.log(`  [TENANT] Skipping ${file.name} (already applied)`);
                    continue;
                }

                // 2. Start Transaction
                await client.query('BEGIN');

                try {
                    console.log(`  [TENANT] Applying ${file.name}...`);

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
                    console.log(`  [TENANT] ✅ Success ${file.name}`);

                } catch (error) {
                    // Rollback on failure
                    await client.query('ROLLBACK');
                    console.error(`🔴 [TENANT] Failed ${file.name}`, error);
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

    /**
     * Populate the template schema with tenant table definitions.
     * Runs tenant migration SQL files against the 'template' schema so that
     * subsequent public migrations (e.g. multitenancy enhancements) that
     * ALTER template tables can succeed on a fresh database.
     *
     * FK REFERENCES clauses are stripped because tenant migrations have
     * forward cross-file references (e.g. 001 → 002). The template schema
     * is only used as a structural source for cloning into tenant schemas
     * via provision_tenant_schema(), so FK constraints are not needed here.
     */
    private async populateTemplateSchema() {
        console.log('🔵 [INFO] Populating template schema with tenant tables...');
        const files = await this.getSortedSqlFiles(this.tenantMigrationsPath);

        if (files.length === 0) {
            console.log('✨ No tenant migrations to apply to template.');
            return;
        }

        const client = await getPool().connect();
        try {
            await client.query('SET search_path TO template, public');

            for (const file of files) {
                console.log(`  [TEMPLATE] Executing ${file.name}`);
                let sql = await fs.readFile(file.path, 'utf-8');

                // Strip FK REFERENCES so migrations with forward dependencies
                // can execute regardless of file order. Template is a structural
                // blueprint — referential integrity is enforced on real tenant schemas.
                sql = sql.replace(/REFERENCES\s+[\w."]+\s*\([^)]+\)(\s+ON\s+(DELETE|UPDATE)\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION))*/gi, '');

                try {
                    await client.query(sql);
                } catch (error: any) {
                    // Skip "already exists" errors on re-runs
                    if (error.code === '42P07' || error.code === '42710') {
                        console.log(`  [TEMPLATE] Skipping ${file.name} (already exists)`);
                    } else {
                        throw error;
                    }
                }
            }
            console.log('🟢 [SUCCESS] Template schema populated.');
        } catch (error) {
            console.error('🔴 [ERROR] Template population failed:', error);
            throw error;
        } finally {
            await client.query('RESET search_path').catch(() => {});
            client.release();
        }
    }
}