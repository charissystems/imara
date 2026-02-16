// src/middleware/audit.ts
import { Context, Next } from 'hono';
import { Kysely } from 'kysely';
import { Env } from './types';
import { appLogger } from './logger';

/**
 * Audit log entry structure
 * Implements requirement: SEC-008, MEM-010 - Maintain immutable audit log
 */
export interface AuditLog {
    id?: string;
    tenantId?: string;
    schemaName?: string;
    tableName: string;
    recordId: string;
    operation: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';
    userId?: string;
    userEmail?: string;
    changes?: Record<string, { old: any; new: any }>;
    metadata?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    timestamp?: Date;
}

/**
 * Audit logger service - logs operations with database persistence
 * Supports both application logging and persistent storage to audit tables
 * 
 * Requirement: MEM-010 - Maintain immutable member audit log of all profile changes
 */
export class AuditLogger {
    constructor(
        private schemaName: string,
        private tenantId: string,
        private currentUserId?: string,
        private currentUserEmail?: string,
        private db?: Kysely<any>,
        private requestContext?: { ip?: string; userAgent?: string }
    ) {}

    /**
     * Log audit event with optional database persistence
     */
    async log(auditLog: AuditLog): Promise<void> {
        try {
            const logEntry: AuditLog = {
                ...auditLog,
                schemaName: this.schemaName,
                tenantId: this.tenantId,
                userId: auditLog.userId || this.currentUserId,
                userEmail: auditLog.userEmail || this.currentUserEmail,
                ipAddress: this.requestContext?.ip,
                userAgent: this.requestContext?.userAgent,
                timestamp: new Date(),
            };

            // Always log to application logger
            appLogger.info('Audit event', {
                schema: logEntry.schemaName,
                tenant: logEntry.tenantId,
                table: logEntry.tableName,
                operation: logEntry.operation,
                recordId: logEntry.recordId,
                userId: logEntry.userId,
                userEmail: logEntry.userEmail,
                changes: logEntry.changes,
                timestamp: logEntry.timestamp?.toISOString(),
            });

            // Persist to database if available
            if (this.db) {
                await this.persistAuditLog(logEntry);
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            appLogger.error('Failed to log audit event', err);
            // Don't throw - auditing failure shouldn't break the main operation
        }
    }

    /**
     * Persist audit log to database
     * Stores in tenant-specific audit_logs table
     */
    private async persistAuditLog(logEntry: AuditLog): Promise<void> {
        if (!this.db) return;

        try {
            // Insert into tenant's audit_logs table
            await (this.db as any)
                .insertInto('audit_logs')
                .values({
                    id: this.generateAuditId(),
                    tenant_id: logEntry.tenantId,
                    schema_name: logEntry.schemaName,
                    table_name: logEntry.tableName,
                    record_id: logEntry.recordId,
                    operation: logEntry.operation,
                    user_id: logEntry.userId,
                    user_email: logEntry.userEmail,
                    changes: logEntry.changes ? JSON.stringify(logEntry.changes) : null,
                    metadata: logEntry.metadata ? JSON.stringify(logEntry.metadata) : null,
                    ip_address: logEntry.ipAddress,
                    user_agent: logEntry.userAgent,
                    created_at: logEntry.timestamp || new Date(),
                })
                .execute()
                .catch((error: unknown) => {
                    appLogger.warn('Failed to persist audit log to database', {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        table: logEntry.tableName,
                    });
                });
        } catch (error) {
            appLogger.warn('Audit persistence error', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    /**
     * Generate unique audit log ID
     */
    private generateAuditId(): string {
        return `AUD-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    }

    /**
     * Log record creation
     * Requirement: MEM-010
     */
    async logCreateRecord(tableName: string, recordId: string, data: Record<string, any>): Promise<void> {
        await this.log({
            tableName,
            operation: 'CREATE',
            recordId,
            userId: this.currentUserId,
            metadata: data
        });
    }

    /**
     * Log record update with change tracking
     * Requirement: MEM-010
     */
    async logUpdateRecord(
        tableName: string,
        recordId: string,
        oldData: Record<string, any>,
        newData: Record<string, any>
    ): Promise<void> {
        const changes: Record<string, { old: any; new: any }> = {};
        
        // Track only changed fields
        for (const key in newData) {
            if (oldData[key] !== newData[key]) {
                changes[key] = {
                    old: oldData[key],
                    new: newData[key]
                };
            }
        }

        if (Object.keys(changes).length > 0) {
            await this.log({
                tableName,
                operation: 'UPDATE',
                recordId,
                userId: this.currentUserId,
                changes
            });
        }
    }

    /**
     * Log record deletion
     */
    async logDeleteRecord(tableName: string, recordId: string, data?: Record<string, any>): Promise<void> {
        await this.log({
            tableName,
            operation: 'DELETE',
            recordId,
            userId: this.currentUserId,
            metadata: data
        });
    }

    /**
     * Log read operation (for sensitive reads)
     * Use selectively for security/compliance auditing
     */
    async logReadRecord(tableName: string, recordId: string, metadata?: Record<string, any>): Promise<void> {
        await this.log({
            tableName,
            operation: 'READ',
            recordId,
            userId: this.currentUserId,
            metadata
        });
    }

    /**
     * Query audit logs for a specific record
     */
    async getRecordAuditHistory(tableName: string, recordId: string, limit: number = 100): Promise<AuditLog[]> {
        if (!this.db) return [];

        try {
            const logs = await (this.db as any)
                .selectFrom('audit_logs')
                .selectAll()
                .where('table_name', '=', tableName)
                .where('record_id', '=', recordId)
                .orderBy('created_at', 'desc')
                .limit(limit)
                .execute();

            return logs.map((log: any) => ({
                schemaName: log.schema_name,
                tableName: log.table_name,
                recordId: log.record_id,
                operation: log.operation,
                userId: log.user_id,
                userEmail: log.user_email,
                changes: log.changes ? JSON.parse(log.changes) : undefined,
                metadata: log.metadata ? JSON.parse(log.metadata) : undefined,
                timestamp: new Date(log.created_at),
            }));
        } catch (error) {
            appLogger.warn('Failed to query audit history', {
                error: error instanceof Error ? error.message : 'Unknown error',
                table: tableName,
                recordId,
            });
            return [];
        }
    }

    /**
     * Get audit logs by user
     */
    async getUserAuditLog(userId: string, limit: number = 100): Promise<AuditLog[]> {
        if (!this.db) return [];

        try {
            const logs = await (this.db as any)
                .selectFrom('audit_logs')
                .selectAll()
                .where('user_id', '=', userId)
                .orderBy('created_at', 'desc')
                .limit(limit)
                .execute();

            return logs.map((log: any) => ({
                schemaName: log.schema_name,
                tableName: log.table_name,
                recordId: log.record_id,
                operation: log.operation,
                userId: log.user_id,
                changes: log.changes ? JSON.parse(log.changes) : undefined,
                timestamp: new Date(log.created_at),
            }));
        } catch (error) {
            appLogger.warn('Failed to query user audit log', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId,
            });
            return [];
        }
    }

    /**
     * Get recent audit logs for compliance/monitoring
     */
    async getRecentAuditLogs(startDate: Date, endDate: Date, limit: number = 500): Promise<AuditLog[]> {
        if (!this.db) return [];

        try {
            const logs = await (this.db as any)
                .selectFrom('audit_logs')
                .selectAll()
                .where('created_at', '>=', startDate)
                .where('created_at', '<=', endDate)
                .orderBy('created_at', 'desc')
                .limit(limit)
                .execute();

            return logs.map((log: any) => ({
                schemaName: log.schema_name,
                tableName: log.table_name,
                recordId: log.record_id,
                operation: log.operation,
                userId: log.user_id,
                changes: log.changes ? JSON.parse(log.changes) : undefined,
                timestamp: new Date(log.created_at),
            }));
        } catch (error) {
            appLogger.warn('Failed to query recent audit logs', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return [];
        }
    }
}

/**
 * Middleware: Inject audit logger into context
 * Usage: c.get('auditLogger').logCreateRecord('members', memberId, memberData)
 * 
 * Requirement: MEM-010, SEC-008, SEC-009 - Audit trail
 */
export async function auditMiddleware(c: Context<Env>, next: Next) {
    const tenant = c.get('tenant');
    const user = c.get('user');
    const db = c.get('db');
    
    // Extract request context for audit trail
    const requestContext = {
        ip: c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
        userAgent: c.req.header('user-agent'),
    };

    // Create audit logger instance for this tenant
    const auditLogger = new AuditLogger(
        tenant?.schema_name || 'public',
        tenant?.id || 'unknown',
        user?.id,
        user?.email,
        db,
        requestContext
    );

    // Inject into context
    c.set('auditLogger', auditLogger);

    await next();
}

export default auditMiddleware;

