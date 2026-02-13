import { Kysely } from 'kysely';
import { TenantDatabase } from '../database/types';
import { DatabaseError } from '../middleware/errorHandler';
import { getTenantDb } from '../config/database';

export abstract class BaseRepository {
    protected db: Kysely<TenantDatabase>;

    constructor(schemaName: string) {
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
                originalError: errorMessage,
                ...context,
            };
            throw new DatabaseError(`${operationName} failed: ${errorMessage}`, details);
        }
    }
}