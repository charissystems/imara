// src/middleware/audit.ts
import { Context, Next } from 'hono';
import { Env } from './types';
import { appLogger } from './logger';

/**
 * Audit middleware for tracking changes to tenant records
 * Logs CREATE, READ, UPDATE operations to audit tables
 * 
 * This middleware injects an audit logger into the context
 * that can be used to log significant data changes
 */

export interface AuditLog {
    tableName: string;
    operation: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';
    recordId: string;
    userId?: string;
    changes?: Record<string, { old: any; new: any }>;
    metadata?: Record<string, any>;
}

/**
 * Audit logger service - logs operations to a dedicated audit table
 * (Can be extended to support full audit table vs. the basic created_by/updated_by columns)
 */
export class AuditLogger {
    constructor(private schemaName: string, private currentUserId?: string) {}

    async log(auditLog: AuditLog): Promise<void> {
        try {
            // Log to application logger
            // TODO: In production, persist to dedicated audit table per schema
            appLogger.info('Audit event', {
                schema: this.schemaName,
                table: auditLog.tableName,
                operation: auditLog.operation,
                recordId: auditLog.recordId,
                userId: auditLog.userId || this.currentUserId,
                changes: auditLog.changes,
                timestamp: new Date().toISOString()
            });

            // Future: Persist to public.audit_events or tenant_audit_tables
            // await db.insertInto('audit_log').values({...}).execute();
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            appLogger.error('Failed to log audit event', err);
            // Don't throw - auditing failure shouldn't break the main operation
        }
    }

    async logCreateRecord(tableName: string, recordId: string, data: Record<string, any>): Promise<void> {
        await this.log({
            tableName,
            operation: 'CREATE',
            recordId,
            userId: this.currentUserId,
            metadata: data
        });
    }

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

    async logDeleteRecord(tableName: string, recordId: string, data?: Record<string, any>): Promise<void> {
        await this.log({
            tableName,
            operation: 'DELETE',
            recordId,
            userId: this.currentUserId,
            metadata: data
        });
    }
}

/**
 * Middleware: Inject audit logger into context
 * Usage: c.get('auditLogger').logCreateRecord('members', memberId, memberData)
 */
export async function auditMiddleware(c: Context<Env>, next: Next) {
    const tenant = c.get('tenant');
    const currentUser = c.get('currentUser');

    // Create audit logger instance for this tenant
    const auditLogger = new AuditLogger(
        tenant?.schema_name || 'public',
        currentUser?.id
    );

    // Inject into context
    c.set('auditLogger', auditLogger);

    await next();
}

export default auditMiddleware;
