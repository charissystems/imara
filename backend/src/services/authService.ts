import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { sign, verify } from 'hono/jwt';
import { Staff, StaffCredentials } from '../database/types';
import { appLogger } from '../middleware/logger';

/**
 * JWT payload structure - extends JWTPayload to allow our custom fields
 */
export interface AuthJWTPayload extends Record<string, unknown> {
    staffId: string;
    /** @deprecated PII removed from tokens — look up from staffId server-side */
    staffEmail?: string;
    /** @deprecated PII removed from tokens — look up from staffId server-side */
    staffNumber?: string;
    role?: string;
    tenantId?: string;
    requiresTwoFactor?: boolean;
    iat: number;
    exp: number;
    type?: 'access' | 'refresh' | '2fa_pending';
}

/**
 * Two-Factor Authentication options
 */
export interface TwoFactorConfig {
    method: 'email' | 'sms' | 'totp';
    enabled: boolean;
}

/**
 * Authentication service for password hashing, JWT management, 2FA, and verification
 * Implements requirements: MEM-008, SEC-001 (Authentication and Access Control)
 */
export class AuthService {
    private jwtSecret: string;
    private refreshTokenSecret: string;
    private tokenExpirationMinutes: number = 30;
    private refreshTokenExpirationDays: number = 7;
    private otpExpirationMinutes: number = 10;
    private maxFailedAttempts: number = 5;
    private accountLockoutDurationMinutes: number = 15;

    constructor(jwtSecret?: string, refreshTokenSecret?: string) {
        const secret = jwtSecret ?? process.env.JWT_SECRET;
        if (!secret) {
            throw new Error(
                'JWT_SECRET environment variable is required. ' +
                'Set a strong secret (>=32 characters) before starting the server.'
            );
        }
        this.jwtSecret = secret;

        const refreshSecret = refreshTokenSecret ?? process.env.REFRESH_TOKEN_SECRET;
        if (!refreshSecret) {
            throw new Error(
                'REFRESH_TOKEN_SECRET environment variable is required. ' +
                'Set a strong secret (>=32 characters) before starting the server.'
            );
        }
        this.refreshTokenSecret = refreshSecret;
    }

    // ──────────────────────────────────────────────────────────
    // Password Management
    // ──────────────────────────────────────────────────────────

    /**
     * Hash a password using bcrypt with configurable cost
     * OWASP recommends minimum cost of 12 for bcrypt
     */
    async hashPassword(password: string, cost: number = 12): Promise<string> {
        const salt = await bcrypt.genSalt(cost);
        return bcrypt.hash(password, salt);
    }

    /**
     * Verify a password against its hash
     */
    async verifyPassword(password: string, hash: string): Promise<boolean> {
        return bcrypt.compare(password, hash);
    }

    /**
     * Validate password strength
     * Requirements: minimum length, uppercase, lowercase, number, special char
     */
    validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (password.length < 12) {
            errors.push('Password must be at least 12 characters');
        }

        if (!/[A-Z]/.test(password)) {
            errors.push('Password must contain uppercase letter');
        }

        if (!/[a-z]/.test(password)) {
            errors.push('Password must contain lowercase letter');
        }

        if (!/[0-9]/.test(password)) {
            errors.push('Password must contain number');
        }

        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            errors.push('Password must contain special character');
        }

        return { valid: errors.length === 0, errors };
    }

    // ──────────────────────────────────────────────────────────
    // JWT Token Management
    // ──────────────────────────────────────────────────────────

    /**
     * Generate a JWT access token
     */
    async generateAccessToken(
        staff: Staff,
        role?: string,
        tenantId?: string,
        requiresTwoFactor?: boolean
    ): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        const expirationSeconds = this.tokenExpirationMinutes * 60;

        const payload: AuthJWTPayload = {
            staffId: staff.id,
            role: role || 'staff',
            tenantId,
            requiresTwoFactor: requiresTwoFactor || false,
            type: 'access',
            iat: now,
            exp: now + expirationSeconds,
        };

        return await sign(payload, this.jwtSecret, 'HS256');
    }

    /**
     * Generate a JWT refresh token
     * Uses a separate secret from access tokens for defense-in-depth
     */
    async generateRefreshToken(
        staff: Staff,
        tenantId?: string
    ): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        const expirationSeconds = this.refreshTokenExpirationDays * 24 * 60 * 60;

        const payload: AuthJWTPayload = {
            staffId: staff.id,
            tenantId,
            type: 'refresh',
            iat: now,
            exp: now + expirationSeconds,
        };

        return await sign(payload, this.refreshTokenSecret, 'HS256');
    }

    /**
     * Verify and decode a JWT token
     */
    async verifyToken(token: string, expectedType: 'access' | 'refresh' | '2fa_pending' = 'access'): Promise<AuthJWTPayload | null> {
        try {
            const secret = expectedType === 'refresh'
                ? this.refreshTokenSecret
                : this.jwtSecret;
            const payload = await verify(token, secret, 'HS256') as AuthJWTPayload;

            // Ensure the token type matches expectations
            if (payload.type && payload.type !== expectedType) {
                appLogger.warn('Token type mismatch', {
                    expected: expectedType,
                    actual: payload.type,
                });
                return null;
            }

            return payload;
        } catch (error) {
            appLogger.debug('Token verification failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return null;
        }
    }

    /**
     * Generate a short-lived 2FA pending token.
     * This token has type '2fa_pending' and 5-minute expiry.
     * It CANNOT be used for normal API access.
     */
    async generate2faPendingToken(
        staff: Staff,
        tenantId?: string
    ): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        const expirationSeconds = 5 * 60; // 5 minutes

        const payload: AuthJWTPayload = {
            staffId: staff.id,
            tenantId,
            requiresTwoFactor: true,
            type: '2fa_pending',
            iat: now,
            exp: now + expirationSeconds,
        };

        return await sign(payload, this.jwtSecret, 'HS256');
    }

    /**
     * Verify a refresh token specifically (uses separate secret)
     */
    async verifyRefreshToken(token: string): Promise<AuthJWTPayload | null> {
        return this.verifyToken(token, 'refresh');
    }

    /**
     * Refresh an access token using a refresh token
     */
    async refreshAccessToken(staff: Staff, role?: string, tenantId?: string): Promise<string> {
        return this.generateAccessToken(staff, role, tenantId);
    }

    // ──────────────────────────────────────────────────────────
    // Two-Factor Authentication
    // ──────────────────────────────────────────────────────────

    /**
     * Generate a time-based OTP (One-Time Password) for 2FA
     * Simple implementation; can be enhanced with TOTP library
     */
    generateOTP(length: number = 6): string {
        const digits = '0123456789';
        let otp = '';
        for (let i = 0; i < length; i++) {
            otp += digits.charAt(randomInt(10));
        }
        return otp;
    }

    /**
     * Hash OTP for storage
     */
    async hashOTP(otp: string): Promise<string> {
        return this.hashPassword(otp, 8);
    }

    /**
     * Verify OTP against hash
     */
    async verifyOTP(otp: string, hash: string): Promise<boolean> {
        return this.verifyPassword(otp, hash);
    }

    /**
     * Get OTP expiration timestamp
     */
    getOTPExpirationTime(): Date {
        const date = new Date();
        date.setMinutes(date.getMinutes() + this.otpExpirationMinutes);
        return date;
    }

    /**
     * Check if OTP has expired
     */
    isOTPExpired(expiresAt: Date | null | undefined): boolean {
        if (!expiresAt) return true;
        return new Date() > new Date(expiresAt);
    }

    // ──────────────────────────────────────────────────────────
    // Account Security & Lockout
    // ──────────────────────────────────────────────────────────

    /**
     * Check if account is locked
     */
    isAccountLocked(credentials: StaffCredentials): boolean {
        if (!credentials.account_locked) return false;

        if (credentials.locked_until) {
            const isStillLocked = new Date() < new Date(credentials.locked_until);
            return isStillLocked;
        }

        return true;
    }

    /**
     * Calculate account lock duration (configurable minutes from now)
     */
    getLockDuration(): Date {
        const date = new Date();
        date.setMinutes(date.getMinutes() + this.accountLockoutDurationMinutes);
        return date;
    }

    /**
     * Get maximum failed login attempts before lockout
     */
    getMaxFailedAttempts(): number {
        return this.maxFailedAttempts;
    }

    /**
     * Check if password has expired (30 days from creation)
     */
    isPasswordExpired(passwordSetAt: Date | null | undefined): boolean {
        if (!passwordSetAt) return true;

        const expirationDate = new Date(passwordSetAt);
        expirationDate.setDate(expirationDate.getDate() + 30);

        return new Date() > expirationDate;
    }

    /**
     * Get password expiration date
     */
    getPasswordExpirationDate(fromDate: Date = new Date()): Date {
        const date = new Date(fromDate);
        date.setDate(date.getDate() + 30);
        return date;
    }

    // ──────────────────────────────────────────────────────────
    // Password Reset
    // ──────────────────────────────────────────────────────────

    /**
     * Generate a cryptographically secure reset token
     */
    generateResetToken(length: number = 32): string {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let token = '';

        // Use the randomInt already imported at the top of this file.
        // require('crypto') was previously used here which throws in ESM
        // ("type":"module") context — randomInt is the proper ESM equivalent.
        for (let i = 0; i < length; i++) {
            token += chars.charAt(randomInt(chars.length));
        }
        return token;
    }

    /**
     * Check if reset token has expired (24 hours)
     */
    isResetTokenExpired(expiresAt: Date | null | undefined): boolean {
        if (!expiresAt) return true;
        return new Date() > new Date(expiresAt);
    }

    /**
     * Get reset token expiration date (24 hours from now)
     */
    getResetTokenExpirationDate(): Date {
        const date = new Date();
        date.setHours(date.getHours() + 24);
        return date;
    }

    // ──────────────────────────────────────────────────────────
    // Configuration Getters
    // ──────────────────────────────────────────────────────────

    /**
     * Get access token expiration time in minutes
     */
    getTokenExpirationMinutes(): number {
        return this.tokenExpirationMinutes;
    }

    /**
     * @deprecated Use getTokenExpirationMinutes() instead
     */
    getTokenExpirationHours(): number {
        return this.tokenExpirationMinutes / 60;
    }

    /**
     * Get refresh token expiration time
     */
    getRefreshTokenExpirationDays(): number {
        return this.refreshTokenExpirationDays;
    }

    /**
     * Get OTP expiration time
     */
    getOTPExpirationMinutes(): number {
        return this.otpExpirationMinutes;
    }
}

/**
 * Initialize auth service with JWT secret from environment
 */
export function initAuthService(): AuthService {
    return new AuthService(process.env.JWT_SECRET);
}
