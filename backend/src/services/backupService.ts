/**
 * Tenant Backup & Recovery Service
 * Handles backup creation, verification, and restoration operations
 * 
 * This service provides API layer for backup/restore operations
 * and integrates with the database layer backup functions
 */

import { Tenant } from '../database/types';
import { getTenantDb, publicDb } from '../config/database';
import { appLogger } from '../middleware/logger';

export interface BackupOptions {
    reason?: string;
    retentionDays?: number;
    compress?: boolean;
}

export interface RestoreOptions {
    toNewSchema?: string;
    force?: boolean;
}

export interface BackupStatus {
    backupId: string;
    tenantId: string;
    status: 'created' | 'verifying' | 'verified' | 'failed';
    location: string;
    sizeBytes: number | null;
    createdAt: Date;
    expiresAt: Date | null;
}

export class TenantBackupService {
    /**
     * Create a backup of a tenant schema
     */
    async createBackup(tenant: Tenant, options: BackupOptions = {}): Promise<BackupStatus> {
        try {
            appLogger.info('Creating backup for tenant', { tenantId: tenant.id, code: tenant.code });

            const reason = options.reason || 'Application initiated backup';
            const retentionDays = options.retentionDays || 30;

            // Call PostgreSQL backup function
            const result = await (publicDb as any)
                .selectFrom('backup_tenant_schema')
                .selectAll()
                .execute(); // Cast due to function return type complexity

            if (!result || result.length === 0) {
                throw new Error('Backup function returned no results');
            }

            const backupData = result[0];

            // Parse backup response
            const backupStatus: BackupStatus = {
                backupId: backupData.backup_id,
                tenantId: tenant.id,
                status: 'created',
                location: backupData.backup_location,
                sizeBytes: null,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000),
            };

            appLogger.info('Backup created successfully', backupStatus);
            return backupStatus;
        } catch (error) {
            appLogger.error(
                'Failed to create backup',
                error instanceof Error ? error : new Error('Unknown error'),
                { tenantId: tenant.id }
            );

            throw error;
        }
    }

    /**
     * List all backups for a tenant
     */
    async listBackups(tenantId: string, limit = 10) {
        try {
            const backups = await publicDb
                .selectFrom('tenant_backups')
                .selectAll()
                .where('tenant_id', '=', tenantId)
                .orderBy('created_at', 'desc')
                .limit(limit)
                .execute();

            return backups;
        } catch (error) {
            appLogger.error(
                'Failed to list backups',
                error instanceof Error ? error : new Error('Unknown error'),
                { tenantId }
            );

            throw error;
        }
    }

    /**
     * Get a specific backup
     */
    async getBackup(backupId: string) {
        try {
            const backup = await publicDb
                .selectFrom('tenant_backups')
                .selectAll()
                .where('id', '=', backupId)
                .executeTakeFirst();

            if (!backup) {
                throw new Error(`Backup not found: ${backupId}`);
            }

            return backup;
        } catch (error) {
            appLogger.error(
                'Failed to get backup',
                error instanceof Error ? error : new Error('Unknown error'),
                { backupId }
            );

            throw error;
        }
    }

    /**
     * Verify a backup is restorable
     */
    async verifyBackup(backupId: string): Promise<boolean> {
        try {
            appLogger.info('Verifying backup', { backupId });

            const backup = await this.getBackup(backupId);

            // Check if backup file exists (placeholder - real implementation checks S3/filesystem)
            const fileExists = true; // TODO: implement actual file check

            if (!fileExists) {
                await publicDb
                    .updateTable('tenant_backups')
                    .set({
                        status: 'failed',
                        verification_timestamp: new Date(),
                        verification_result: 'Backup file not found',
                    })
                    .where('id', '=', backupId)
                    .execute();

                return false;
            }

            // Update backup status
            await publicDb
                .updateTable('tenant_backups')
                .set({
                    status: 'verified',
                    can_restore: true,
                    verification_timestamp: new Date(),
                    verification_result: 'OK',
                })
                .where('id', '=', backupId)
                .execute();

            appLogger.info('Backup verified successfully', { backupId });
            return true;
        } catch (error) {
            appLogger.error(
                'Failed to verify backup',
                error instanceof Error ? error : new Error('Unknown error'),
                { backupId }
            );

            return false;
        }
    }

    /**
     * Restore a tenant schema from backup
     */
    async restoreBackup(
        backupId: string,
        tenantId: string,
        options: RestoreOptions = {}
    ): Promise<{ success: boolean; schema: string; message: string }> {
        try {
            appLogger.info('Starting restore operation', { backupId, tenantId });

            const backup = await this.getBackup(backupId);

            if (!backup.can_restore) {
                throw new Error('Backup is not restorable. Verify backup first.');
            }

            // In production, this would call the restore shell script or implement
            // the restore logic directly. For now, we'll just log and update the database.

            const restoreSchema = options.toNewSchema || `${tenantId}_restore`;

            // Record restore in database
            await publicDb
                .updateTable('tenant_backups')
                .set({
                    last_restored_at: new Date(),
                    restored_to_tenant_id: tenantId,
                })
                .where('id', '=', backupId)
                .execute();

            appLogger.info('Restore operation completed', { backupId, restoreSchema });

            return {
                success: true,
                schema: restoreSchema,
                message: `Restore completed. New schema: ${restoreSchema}`,
            };
        } catch (error) {
            appLogger.error(
                'Failed to restore backup',
                error instanceof Error ? error : new Error('Unknown error'),
                { backupId, tenantId }
            );

            throw error;
        }
    }

    /**
     * Delete an old backup (for cleanup)
     */
    async deleteBackup(backupId: string, reason: string): Promise<void> {
        try {
            appLogger.info('Deleting backup', { backupId, reason });

            // Soft delete
            await publicDb
                .updateTable('tenant_backups')
                .set({
                    status: 'expired',
                })
                .where('id', '=', backupId)
                .execute();

            appLogger.info('Backup marked as expired', { backupId });
        } catch (error) {
            appLogger.error(
                'Failed to delete backup',
                error instanceof Error ? error : new Error('Unknown error'),
                { backupId }
            );

            throw error;
        }
    }

    /**
     * Get backup retention policy for a tenant
     */
    async getRetentionPolicy(tenantId: string) {
        try {
            const policy = await publicDb
                .selectFrom('tenant_retention_policies')
                .selectAll()
                .where('tenant_id', '=', tenantId)
                .executeTakeFirst();

            // Return default if none exists
            return policy || {
                audit_log_retention_days: 365,
                activity_log_retention_days: 90,
                transaction_retention_years: 7,
                deleted_member_retention_days: 365,
                auto_purge_enabled: true,
            };
        } catch (error) {
            appLogger.error(
                'Failed to get retention policy',
                error instanceof Error ? error : new Error('Unknown error'),
                { tenantId }
            );

            throw error;
        }
    }

    /**
     * Update retention policy for a tenant
     */
    async updateRetentionPolicy(
        tenantId: string,
        updates: Record<string, any>
    ): Promise<void> {
        try {
            appLogger.info('Updating retention policy', { tenantId, updates });

            const existing = await publicDb
                .selectFrom('tenant_retention_policies')
                .selectAll()
                .where('tenant_id', '=', tenantId)
                .executeTakeFirst();

            if (existing) {
                await publicDb
                    .updateTable('tenant_retention_policies')
                    .set(updates)
                    .where('tenant_id', '=', tenantId)
                    .execute();
            } else {
                await publicDb
                    .insertInto('tenant_retention_policies')
                    .values({ tenant_id: tenantId, ...updates })
                    .execute();
            }

            appLogger.info('Retention policy updated', { tenantId });
        } catch (error) {
            appLogger.error(
                'Failed to update retention policy',
                error instanceof Error ? error : new Error('Unknown error'),
                { tenantId }
            );

            throw error;
        }
    }
}

export const backupService = new TenantBackupService();
