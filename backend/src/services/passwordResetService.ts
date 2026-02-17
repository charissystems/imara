/**
 * Password Reset Service
 *
 * Manages password reset flow using Redis for token storage:
 *  1. Staff requests reset via email → token generated + stored in Redis
 *  2. Token emailed via NotificationService
 *  3. Staff submits token + new password → validated + password updated
 *
 * Token format: HMAC-SHA256 of random bytes, stored with 30-minute TTL.
 * Tokens are single-use and bound to a specific staff_id.
 */

import { randomBytes, createHmac } from 'crypto';
import { Kysely } from 'kysely';
import { TenantDatabase } from '../database/types';
import { AuthRepository } from '../repositories/authRepository';
import { AuthService } from './authService';
import { NotificationService } from './notificationService';
import { getCacheRedis } from '../config/redis';
import { appLogger } from '../middleware/logger';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface ResetTokenData {
    staffId: string;
    email: string;
    createdAt: string;
}

export interface RequestResetResult {
    success: boolean;
    /** Always true to prevent email enumeration */
    message: string;
}

export interface ResetPasswordResult {
    success: boolean;
    message: string;
    error?: string;
}

// ────────────────────────────────────────────────────────────
// Password Reset Service
// ────────────────────────────────────────────────────────────

const RESET_TOKEN_PREFIX = 'pwd_reset:';
const RESET_TOKEN_TTL_SECONDS = 30 * 60; // 30 minutes

export class PasswordResetService {
    private redis: ReturnType<typeof getCacheRedis>;
    private db: Kysely<TenantDatabase>;
    private schemaName: string;
    private notificationService: NotificationService;
    private authService: AuthService;

    constructor(
        db: Kysely<TenantDatabase>,
        schemaName: string,
    ) {
        this.db = db;
        this.schemaName = schemaName;
        this.notificationService = new NotificationService(db);
        this.authService = new AuthService();
        this.redis = getCacheRedis();
    }

    /**
     * Request a password reset for the given email.
     * Always returns success to prevent email enumeration.
     */
    async requestReset(
        email: string,
        saccoName: string,
    ): Promise<RequestResetResult> {
        const staff = await this.db
            .selectFrom('staff')
            .select(['id', 'email', 'first_name', 'last_name'])
            .where('email', '=', email)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

        if (!staff) {
            // Don't reveal whether the email exists
            appLogger.info('Password reset requested for unknown email', {
                email,
                schema: this.schemaName,
            });
            return {
                success: true,
                message: 'If the email is registered, a reset link has been sent.',
            };
        }

        // Generate token
        const token = this.generateToken();
        const redisKey = this.getRedisKey(token);

        // Store in Redis with TTL
        const tokenData: ResetTokenData = {
            staffId: staff.id,
            email: staff.email,
            createdAt: new Date().toISOString(),
        };

        await this.redis.set(
            redisKey,
            JSON.stringify(tokenData),
            'EX',
            RESET_TOKEN_TTL_SECONDS,
        );

        // Send email via notification service
        try {
            await this.notificationService.sendPasswordReset({
                staffId: staff.id,
                staffEmail: staff.email,
                staffName: `${staff.first_name} ${staff.last_name}`,
                resetToken: token,
                expiresInMinutes: RESET_TOKEN_TTL_SECONDS / 60,
                saccoName,
            });
        } catch (error) {
            appLogger.error('Failed to send password reset email', error as Error, {
                staffId: staff.id,
            });
            // Don't expose failure to user
        }

        appLogger.info('Password reset token generated', {
            staffId: staff.id,
            schema: this.schemaName,
        });

        return {
            success: true,
            message: 'If the email is registered, a reset link has been sent.',
        };
    }

    /**
     * Reset password using a valid token.
     */
    async resetPassword(
        token: string,
        newPassword: string,
    ): Promise<ResetPasswordResult> {
        const redisKey = this.getRedisKey(token);

        // Retrieve token data from Redis
        const raw = await this.redis.get(redisKey);
        if (!raw) {
            return {
                success: false,
                message: 'Invalid or expired reset token.',
                error: 'TOKEN_INVALID',
            };
        }

        const tokenData: ResetTokenData = JSON.parse(raw);

        // Validate password strength
        const strength = this.authService.validatePasswordStrength(newPassword);
        if (!strength.valid) {
            return {
                success: false,
                message: strength.errors.join('. '),
                error: 'WEAK_PASSWORD',
            };
        }

        // Hash and update password
        const passwordHash = await this.authService.hashPassword(newPassword);
        const authRepo = new AuthRepository(this.schemaName);
        await authRepo.updatePassword(tokenData.staffId, passwordHash);

        // Delete token (single-use)
        await this.redis.del(redisKey);

        appLogger.success('Password reset completed', {
            staffId: tokenData.staffId,
            schema: this.schemaName,
        });

        return {
            success: true,
            message: 'Password has been reset successfully.',
        };
    }

    /**
     * Validate a reset token by atomically consuming it.
     * Returns true if the token was valid (and is now deleted), false otherwise.
     * @deprecated Prefer calling resetPassword() directly which validates and consumes.
     */
    async validateToken(token: string): Promise<boolean> {
        const redisKey = this.getRedisKey(token);
        // Atomically get and delete to prevent reuse / information leakage
        const result = await this.redis.get(redisKey);
        if (result) {
            await this.redis.del(redisKey);
            return true;
        }
        return false;
    }

    // ──────────────────────────────────────────────
    // Private
    // ──────────────────────────────────────────────

    /**
     * Generate a cryptographically secure reset token.
     */
    private generateToken(): string {
        const bytes = randomBytes(32);
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new Error('JWT_SECRET environment variable is required for token generation');
        }
        return createHmac('sha256', secret)
            .update(bytes)
            .digest('hex');
    }

    /**
     * Build Redis key for a reset token (namespaced by schema).
     */
    private getRedisKey(token: string): string {
        return `${RESET_TOKEN_PREFIX}${this.schemaName}:${token}`;
    }
}
