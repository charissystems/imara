import { StaffCredentials, NewStaffCredentials, StaffCredentialsUpdate } from '../database/types';
import { BaseRepository } from './baseRepository';

/**
 * Repository for staff authentication credentials
 * Handles password hashes, tokens, and account lockouts
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
                .where('deleted_at', 'is', null)
                .executeTakeFirst(),
            'findByStaffId',
            { staffId }
        );
    }

    /**
     * Find credentials by reset token
     */
    async findByResetToken(resetToken: string): Promise<StaffCredentials | undefined> {
        return this.executeSafely(
            () => this.db
                .selectFrom('staff_credentials')
                .selectAll()
                .where('reset_token', '=', resetToken)
                .where('deleted_at', 'is', null)
                .executeTakeFirst(),
            'findByResetToken',
            { resetToken }
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
                .where('deleted_at', 'is', null)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'update',
            { staffId }
        );
    }

    /**
     * Update password hash and reset related fields
     */
    async updatePassword(
        staffId: string,
        passwordHash: string,
        expiresAt?: Date
    ): Promise<StaffCredentials> {
        return this.executeSafely(
            () => this.db
                .updateTable('staff_credentials')
                .set({
                    password_hash: passwordHash,
                    password_changed_at: new Date(),
                    last_password_changed_at: new Date(),
                    password_expires_at: expiresAt || null,
                    reset_token: null,
                    reset_token_expires_at: null,
                    failed_login_attempts: 0,
                    is_locked: false,
                    locked_until: null,
                    updated_at: new Date(),
                })
                .where('staff_id', '=', staffId)
                .where('deleted_at', 'is', null)
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
        // First, get current credentials
        const current = await this.findByStaffId(staffId);
        if (!current) {
            throw new Error('No credentials found');
        }

        // Update with incremented value
        return this.executeSafely(
            () => this.db
                .updateTable('staff_credentials')
                .set({
                    failed_login_attempts: (current.failed_login_attempts || 0) + 1,
                    updated_at: new Date(),
                })
                .where('staff_id', '=', staffId)
                .where('deleted_at', 'is', null)
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
                    is_locked: true,
                    locked_until: lockedUntil,
                    updated_at: new Date(),
                })
                .where('staff_id', '=', staffId)
                .where('deleted_at', 'is', null)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'lockAccount',
            { staffId }
        );
    }

    /**
     * Unlock staff account
     */
    async unlockAccount(staffId: string): Promise<StaffCredentials> {
        return this.executeSafely(
            () => this.db
                .updateTable('staff_credentials')
                .set({
                    is_locked: false,
                    locked_until: null,
                    failed_login_attempts: 0,
                    updated_at: new Date(),
                })
                .where('staff_id', '=', staffId)
                .where('deleted_at', 'is', null)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'unlockAccount',
            { staffId }
        );
    }

    /**
     * Update last login timestamp
     */
    async updateLastLogin(staffId: string): Promise<StaffCredentials> {
        return this.executeSafely(
            () => this.db
                .updateTable('staff_credentials')
                .set({
                    last_login_at: new Date(),
                    updated_at: new Date(),
                })
                .where('staff_id', '=', staffId)
                .where('deleted_at', 'is', null)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'updateLastLogin',
            { staffId }
        );
    }

    /**
     * Reset password for staff member
     */
    async setPasswordReset(
        staffId: string,
        resetToken: string,
        expiresAt: Date
    ): Promise<StaffCredentials> {
        return this.executeSafely(
            () => this.db
                .updateTable('staff_credentials')
                .set({
                    reset_token: resetToken,
                    reset_token_expires_at: expiresAt,
                    updated_at: new Date(),
                })
                .where('staff_id', '=', staffId)
                .where('deleted_at', 'is', null)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'setPasswordReset',
            { staffId }
        );
    }

    /**
     * Deactivate account
     */
    async deactivate(staffId: string): Promise<StaffCredentials> {
        return this.executeSafely(
            () => this.db
                .updateTable('staff_credentials')
                .set({
                    is_active: false,
                    updated_at: new Date(),
                })
                .where('staff_id', '=', staffId)
                .where('deleted_at', 'is', null)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'deactivate',
            { staffId }
        );
    }

    /**
     * Activate account
     */
    async activate(staffId: string): Promise<StaffCredentials> {
        return this.executeSafely(
            () => this.db
                .updateTable('staff_credentials')
                .set({
                    is_active: true,
                    is_locked: false,
                    locked_until: null,
                    failed_login_attempts: 0,
                    updated_at: new Date(),
                })
                .where('staff_id', '=', staffId)
                .where('deleted_at', 'is', null)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'activate',
            { staffId }
        );
    }

    /**
     * Soft delete credentials
     */
    async softDelete(staffId: string): Promise<void> {
        await this.executeSafely(
            () => this.db
                .updateTable('staff_credentials')
                .set({ deleted_at: new Date() })
                .where('staff_id', '=', staffId)
                .execute(),
            'softDelete',
            { staffId }
        );
    }
}
