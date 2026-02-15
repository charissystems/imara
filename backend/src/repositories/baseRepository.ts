import { Kysely } from 'kysely';
import { TenantDatabase } from '../database/types';
import { DatabaseError } from '../middleware/errorHandler';
import { getTenantDb } from '../config/database';
import { appLogger } from '../middleware/logger';

/**
 * Allowed schema name pattern — lowercase letters, digits, underscores.
 * Must start with `tenant_` to prevent accidentally pointing at
 * `public`, `template`, or system schemas.
 */
const VALID_TENANT_SCHEMA = /^tenant_[a-z0-9_]+$/;

export abstract class BaseRepository {
    protected db: Kysely<TenantDatabase>;
    protected readonly schemaName: string;

    constructor(schemaName: string) {
        // Defense-in-depth: reject schemas that don't look like tenant schemas
        if (!VALID_TENANT_SCHEMA.test(schemaName)) {
            const error = new Error(
                `Invalid tenant schema name "${schemaName}". ` +
                'Must match pattern tenant_<code> (lowercase alphanumeric + underscores).'
            );
            appLogger.error('BaseRepository: schema name validation failed', error, {
                schemaName,
            });
            throw error;
        }

        this.schemaName = schemaName;
        this.db = getTenantDb(schemaName);
    }

    /**
     * Wraps database operations with error handling
     * Converts database errors to DatabaseError instances
     */
    protected async executeSafely<T>(
        operation: () => Promise<T>,
        operationName: string,
        context?: Record<string, any>
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
            const details = {
                operation: operationName,
                schema: this.schemaName,
                originalError: errorMessage,
                ...context,
            };
            throw new DatabaseError(`${operationName} failed: ${errorMessage}`, details);
        }
    }
}