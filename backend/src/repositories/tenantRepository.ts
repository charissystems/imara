import { Tenant, NewTenant, TenantAuditLog } from '../database/types';
import { Kysely } from 'kysely';
import { PublicDatabase } from '../database/types';
import { DatabaseError } from '../middleware/errorHandler';

export class TenantRepository {
    constructor(private db: Kysely<PublicDatabase>) {}

    /**
     * Wraps database operations with error handling
     * Converts database errors to DatabaseError instances
     */
    private async executeSafely<T>(
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
                ...(process.env.NODE_ENV !== 'production' && { originalError: errorMessage }),
                ...context,
            };
            throw new DatabaseError(`${operationName} failed: ${errorMessage}`, details);
        }
    }

    async findById(id: string): Promise<Tenant | undefined> {
        return this.executeSafely(
            () => this.db
                .selectFrom('tenants')
                .selectAll()
                .where('id', '=', id)
                .executeTakeFirst(),
            'findById',
            { tenantId: id }
        );
    }

    async findBySubdomain(subdomain: string): Promise<Tenant | undefined> {
        return this.executeSafely(
            () => this.db
                .selectFrom('tenants')
                .selectAll()
                .where('subdomain', '=', subdomain)
                .where('deleted_at', 'is', null) // Ensure active tenant
                .executeTakeFirst(),
            'findBySubdomain',
            { subdomain }
        );
    }

    async getAuditLogs(schemaName: string, limit = 50): Promise<TenantAuditLog[]> {
        return this.executeSafely(
            () => this.db
                .selectFrom('tenant_audit_log')
                .selectAll()
                .where('schema_name', '=', schemaName)
                .orderBy('performed_at', 'desc')
                .limit(limit)
                .execute(),
            'getAuditLogs',
            { schemaName, limit }
        );
    }
}
