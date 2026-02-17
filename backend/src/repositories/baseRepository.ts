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
            const rawMessage = error instanceof Error ? error.message : 'Unknown database error';
            // Sanitize: strip SQL fragments and internal details for the user-facing message
            const safeMessage = `${operationName} failed`;
            const details = {
                operation: operationName,
                schema: this.schemaName,
                // Only include raw error details in development
                ...(process.env.NODE_ENV !== 'production' && { originalError: rawMessage }),
                ...context,
            };
            appLogger.error(`Database operation failed: ${rawMessage}`, error as Error, {
                operation: operationName,
                schema: this.schemaName,
                ...context,
            });
            throw new DatabaseError(safeMessage, details);
        }
    }
}