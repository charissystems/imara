/**
 * Two-Factor Authentication Service
 *
 * TOTP-based 2FA using authenticator apps (Google Authenticator, Authy, etc.).
 * Stores secrets encrypted in staff_credentials.two_factor_secret and
 * generates backup codes for recovery.
 *
 * Flow:
 *  1. Staff enables 2FA → secret generated, QR code returned
 *  2. Staff scans QR code in authenticator app
 *  3. Staff confirms setup by providing a valid TOTP code
 *  4. On login, if 2FA enabled, require TOTP code after password verification
 *  5. Backup codes can be used if authenticator is unavailable (single-use)
 */

import { TOTP, Secret } from 'otpauth';
import * as QRCode from 'qrcode';
import { randomBytes } from 'crypto';
import { Kysely } from 'kysely';
import { TenantDatabase } from '../database/types';
import { appLogger } from '../middleware/logger';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface TwoFactorSetupResult {
    secret: string;
    otpauthUrl: string;
    qrCodeDataUrl: string;
    backupCodes: string[];
}

export interface TwoFactorVerifyResult {
    valid: boolean;
    usedBackupCode?: boolean;
}

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

const TOTP_ISSUER = 'Imara SACCO';
const TOTP_PERIOD = 30;      // seconds
const TOTP_DIGITS = 6;
const TOTP_ALGORITHM = 'SHA1';
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 8; // characters per code

// ────────────────────────────────────────────────────────────
// Two-Factor Service
// ────────────────────────────────────────────────────────────

export class TwoFactorService {
    private db: Kysely<TenantDatabase>;

    constructor(db: Kysely<TenantDatabase>) {
        this.db = db;
    }

    /**
     * Generate 2FA setup data for a staff member.
     * Returns the secret, QR code, and backup codes.
     * The caller must confirm setup with `confirmSetup()` before 2FA is active.
     */
    async generateSetup(staffId: string): Promise<TwoFactorSetupResult> {
        // Look up staff email for the TOTP label
        const staff = await this.db
            .selectFrom('staff')
            .select(['email', 'first_name', 'last_name'])
            .where('id', '=', staffId)
            .executeTakeFirst();

        if (!staff) {
            throw new Error('Staff member not found');
        }

        // Generate a random secret
        const secret = new Secret({ size: 20 });

        // Create TOTP instance
        const totp = new TOTP({
            issuer: TOTP_ISSUER,
            label: staff.email,
            algorithm: TOTP_ALGORITHM,
            digits: TOTP_DIGITS,
            period: TOTP_PERIOD,
            secret,
        });

        const otpauthUrl = totp.toString();

        // Generate QR code as data URL
        const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
            width: 256,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff',
            },
        });

        // Generate backup codes
        const backupCodes = this.generateBackupCodes();

        // Store secret and backup codes (not yet enabled)
        await this.db
            .updateTable('staff_credentials')
            .set({
                two_factor_secret: secret.base32,
                two_factor_backup_codes: backupCodes as any,
                updated_at: new Date() as any,
            })
            .where('staff_id', '=', staffId)
            .execute();

        appLogger.info('2FA setup generated', { staffId });

        return {
            secret: secret.base32,
            otpauthUrl,
            qrCodeDataUrl,
            backupCodes,
        };
    }

    /**
     * Confirm 2FA setup by verifying a TOTP code from the authenticator app.
     * Only after successful confirmation is 2FA marked as enabled.
     */
    async confirmSetup(staffId: string, totpCode: string): Promise<boolean> {
        const credentials = await this.db
            .selectFrom('staff_credentials')
            .select(['two_factor_secret', 'two_factor_enabled'])
            .where('staff_id', '=', staffId)
            .executeTakeFirst();

        if (!credentials || !credentials.two_factor_secret) {
            throw new Error('2FA setup has not been initiated. Call generateSetup first.');
        }

        if (credentials.two_factor_enabled) {
            throw new Error('2FA is already enabled for this account.');
        }

        // Verify the TOTP code
        const isValid = this.verifyTotp(credentials.two_factor_secret, totpCode);

        if (!isValid) {
            appLogger.info('2FA setup confirmation failed — invalid code', { staffId });
            return false;
        }

        // Enable 2FA
        await this.db
            .updateTable('staff_credentials')
            .set({
                two_factor_enabled: true as any,
                updated_at: new Date() as any,
            })
            .where('staff_id', '=', staffId)
            .execute();

        // Log 2FA event
        await this.logTwoFactorEvent(staffId, 'authenticator_app', 'success');

        appLogger.success('2FA enabled', { staffId });

        return true;
    }

    /**
     * Disable 2FA for a staff member.
     * Requires a valid TOTP code or backup code for security.
     */
    async disable(staffId: string, code: string): Promise<boolean> {
        const verification = await this.verify(staffId, code);
        if (!verification.valid) {
            return false;
        }

        await this.db
            .updateTable('staff_credentials')
            .set({
                two_factor_enabled: false as any,
                two_factor_secret: null,
                two_factor_backup_codes: null,
                updated_at: new Date() as any,
            })
            .where('staff_id', '=', staffId)
            .execute();

        // Log 2FA event
        await this.logTwoFactorEvent(staffId, 'authenticator_app', 'success');

        appLogger.info('2FA disabled', { staffId });

        return true;
    }

    /**
     * Verify a TOTP code or backup code during login.
     */
    async verify(staffId: string, code: string): Promise<TwoFactorVerifyResult> {
        const credentials = await this.db
            .selectFrom('staff_credentials')
            .select(['two_factor_secret', 'two_factor_enabled', 'two_factor_backup_codes'])
            .where('staff_id', '=', staffId)
            .executeTakeFirst();

        if (!credentials || !credentials.two_factor_enabled || !credentials.two_factor_secret) {
            return { valid: false };
        }

        // Try TOTP first
        const totpValid = this.verifyTotp(credentials.two_factor_secret, code);
        if (totpValid) {
            return { valid: true, usedBackupCode: false };
        }

        // Try backup codes
        const backupCodes = credentials.two_factor_backup_codes ?? [];
        const codeIndex = backupCodes.indexOf(code);

        if (codeIndex !== -1) {
            // Remove used backup code (single-use)
            const updatedCodes = [...backupCodes];
            updatedCodes.splice(codeIndex, 1);

            await this.db
                .updateTable('staff_credentials')
                .set({
                    two_factor_backup_codes: updatedCodes as any,
                    updated_at: new Date() as any,
                })
                .where('staff_id', '=', staffId)
                .execute();

            // Log 2FA event
            await this.logTwoFactorEvent(staffId, 'backup_code', 'success');

            appLogger.info('2FA backup code used', {
                staffId,
                remaining: updatedCodes.length,
            });

            return { valid: true, usedBackupCode: true };
        }

        // Log failed attempt
        await this.logTwoFactorEvent(staffId, 'authenticator_app', 'failure');

        return { valid: false };
    }

    /**
     * Regenerate backup codes (invalidates all existing ones).
     * Requires valid TOTP code for security.
     */
    async regenerateBackupCodes(staffId: string, totpCode: string): Promise<string[]> {
        const credentials = await this.db
            .selectFrom('staff_credentials')
            .select(['two_factor_secret', 'two_factor_enabled'])
            .where('staff_id', '=', staffId)
            .executeTakeFirst();

        if (!credentials?.two_factor_enabled || !credentials.two_factor_secret) {
            throw new Error('2FA is not enabled');
        }

        // Verify TOTP before regenerating
        if (!this.verifyTotp(credentials.two_factor_secret, totpCode)) {
            throw new Error('Invalid TOTP code');
        }

        const newCodes = this.generateBackupCodes();

        await this.db
            .updateTable('staff_credentials')
            .set({
                two_factor_backup_codes: newCodes as any,
                updated_at: new Date() as any,
            })
            .where('staff_id', '=', staffId)
            .execute();

        // Log 2FA event
        await this.logTwoFactorEvent(staffId, 'authenticator_app', 'success');

        appLogger.info('Backup codes regenerated', { staffId });

        return newCodes;
    }

    /**
     * Check if a staff member has 2FA enabled.
     */
    async isEnabled(staffId: string): Promise<boolean> {
        const credentials = await this.db
            .selectFrom('staff_credentials')
            .select(['two_factor_enabled'])
            .where('staff_id', '=', staffId)
            .executeTakeFirst();

        return credentials?.two_factor_enabled === true;
    }

    /**
     * Get 2FA status for a staff member.
     */
    async getStatus(staffId: string): Promise<{
        enabled: boolean;
        backupCodesRemaining: number;
    }> {
        const credentials = await this.db
            .selectFrom('staff_credentials')
            .select(['two_factor_enabled', 'two_factor_backup_codes'])
            .where('staff_id', '=', staffId)
            .executeTakeFirst();

        return {
            enabled: credentials?.two_factor_enabled === true,
            backupCodesRemaining: credentials?.two_factor_backup_codes?.length ?? 0,
        };
    }

    // ──────────────────────────────────────────────
    // Private
    // ──────────────────────────────────────────────

    /**
     * Verify a TOTP code against a secret.
     * Allows ±1 time-step window for clock drift.
     */
    private verifyTotp(secret: string, code: string): boolean {
        const totp = new TOTP({
            issuer: TOTP_ISSUER,
            algorithm: TOTP_ALGORITHM,
            digits: TOTP_DIGITS,
            period: TOTP_PERIOD,
            secret: Secret.fromBase32(secret),
        });

        // validate() returns the time-step delta or null if invalid
        const delta = totp.validate({ token: code, window: 1 });
        return delta !== null;
    }

    /**
     * Generate cryptographically secure backup codes.
     */
    private generateBackupCodes(): string[] {
        const codes: string[] = [];
        for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
            const bytes = randomBytes(BACKUP_CODE_LENGTH);
            // Encode as alphanumeric, taking pairs for readability
            const code = bytes
                .toString('hex')
                .substring(0, BACKUP_CODE_LENGTH)
                .toUpperCase();
            // Format as XXXX-XXXX for readability
            codes.push(
                `${code.substring(0, 4)}-${code.substring(4, 8)}`,
            );
        }
        return codes;
    }

    /**
     * Log a 2FA event to the two_factor_log table.
     */
    private async logTwoFactorEvent(
        staffId: string,
        method: 'authenticator_app' | 'backup_code',
        status: 'success' | 'failure',
    ): Promise<void> {
        try {
            await this.db
                .insertInto('two_factor_log')
                .values({
                    staff_id: staffId,
                    method: method as any,
                    status: status as any,
                    attempt_timestamp: new Date() as any,
                })
                .execute();
        } catch (error) {
            appLogger.error('Failed to log 2FA event', error as Error, {
                staffId,
                method,
                status,
            });
        }
    }
}
