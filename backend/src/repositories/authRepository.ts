import { StaffCredentials, NewStaffCredentials, StaffCredentialsUpdate } from '../database/types';
import { BaseRepository } from './baseRepository';

/**
 * Repository for staff authentication credentials.
 * Handles password hashes, lockouts, and 2FA state.
 *
 * Column reference (staff_credentials table):
 *   id, staff_id, password_hash, password_salt, password_changed_at,
 *   two_factor_enabled, two_factor_secret, two_factor_backup_codes,
 *   account_locked, failed_login_attempts, locked_until,
 *   last_login_at, last_login_ip, created_at, updated_at
 */
export class AuthRepository extends BaseRepository {
    /**
     * Create new staff credentials
     */
    async create(credentials: NewStaffCredentials): Promise<StaffCredentials> {
        return this.executeSafely(
            () => this.db
                .insertInto('staff_credentials')
                .values(credentials)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'create',
            { staffId: credentials.staff_id }
        );
    }

    /**
     * Find credentials by staff ID
     */
    async findByStaffId(staffId: string): Promise<StaffCredentials | undefined> {
        return this.executeSafely(
            () => this.db
                .selectFrom('staff_credentials')
                .selectAll()
                .where('staff_id', '=', staffId)
                .executeTakeFirst(),
            'findByStaffId',
            { staffId }
        );
    }

    /**
     * Update staff credentials
     */
    async update(staffId: string, updates: StaffCredentialsUpdate): Promise<StaffCredentials> {
        return this.executeSafely(
            () => this.db
                .updateTable('staff_credentials')
                .set({
                    ...updates,
                    updated_at: new Date(),
                })
                .where('staff_id', '=', staffId)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'update',
            { staffId }
        );
    }

    /**
     * Update password hash
     */
    async updatePassword(staffId: string, passwordHash: string): Promise<StaffCredentials> {
        return this.executeSafely(
            () => this.db
                .updateTable('staff_credentials')
                .set({
                    password_hash: passwordHash,
                    password_changed_at: new Date(),
                    failed_login_attempts: 0,
                    account_locked: false,
                    locked_until: null,
                    updated_at: new Date(),
                })
                .where('staff_id', '=', staffId)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'updatePassword',
            { staffId }
        );
    }

    /**
     * Increment failed login attempts
     */
    async incrementFailedAttempts(staffId: string): Promise<StaffCredentials> {
        const current = await this.findByStaffId(staffId);
        if (!current) {
            throw new Error('No credentials found');
        }

        return this.executeSafely(
            () => this.db
                .updateTable('staff_credentials')
                .set({
                    failed_login_attempts: (current.failed_login_attempts || 0) + 1,
                    updated_at: new Date(),
                })
                .where('staff_id', '=', staffId)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'incrementFailedAttempts',
            { staffId }
        );
    }

    /**
     * Lock staff account with expiration
     */
    async lockAccount(staffId: string, lockedUntil: Date): Promise<StaffCredentials> {
        return this.executeSafely(
            () => this.db
                .updateTable('staff_credentials')
                .set({
                    account_locked: true,
                    locked_until: lockedUntil,
                    updated_at: new Date(),
                })
                .where('staff_id', '=', staffId)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'lockAccount',
            { staffId }
        );
    }

    /**
     * Unlock staff account and reset failed attempts
     */
    async unlockAccount(staffId: string): Promise<StaffCredentials> {
        return this.executeSafely(
            () => this.db
                .updateTable('staff_credentials')
                .set({
                    account_locked: false,
                    locked_until: null,
                    failed_login_attempts: 0,
                    updated_at: new Date(),
                })
                .where('staff_id', '=', staffId)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'unlockAccount',
            { staffId }
        );
    }

    /**
     * Update last login timestamp and IP
     */
    async updateLastLogin(staffId: string, ip?: string): Promise<StaffCredentials> {
        return this.executeSafely(
            () => this.db
                .updateTable('staff_credentials')
                .set({
                    last_login_at: new Date(),
                    ...(ip ? { last_login_ip: ip } : {}),
                    failed_login_attempts: 0,
                    account_locked: false,
                    locked_until: null,
                    updated_at: new Date(),
                })
                .where('staff_id', '=', staffId)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'updateLastLogin',
            { staffId }
        );
    }
}
