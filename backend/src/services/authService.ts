import bcrypt from 'bcryptjs';
import { sign, verify } from 'hono/jwt';
import { Staff, StaffCredentials } from '../database/types';

/**
 * JWT payload structure - extends JWTPayload to allow our custom fields
 */
export interface AuthJWTPayload extends Record<string, unknown> {
    staffId: string;
    staffEmail: string;
    staffNumber: string;
    iat: number;
    exp: number;
}

/**
 * Authentication service for password hashing, JWT management, and verification
 */
export class AuthService {
    private jwtSecret: string;
    private tokenExpirationHours: number = 24;
    private refreshTokenExpirationDays: number = 7;

    constructor(jwtSecret: string = process.env.JWT_SECRET || 'your-secret-key') {
        this.jwtSecret = jwtSecret;
    }

    /**
     * Hash a password using bcrypt
     */
    async hashPassword(password: string): Promise<string> {
        const salt = await bcrypt.genSalt(10);
        return bcrypt.hash(password, salt);
    }

    /**
     * Verify a password against its hash
     */
    async verifyPassword(password: string, hash: string): Promise<boolean> {
        return bcrypt.compare(password, hash);
    }

    /**
     * Generate a JWT access token
     */
    async generateAccessToken(staff: Staff): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        const expirationSeconds = this.tokenExpirationHours * 60 * 60;

        const payload: AuthJWTPayload = {
            staffId: staff.id,
            staffEmail: staff.work_email,
            staffNumber: staff.staff_number,
            iat: now,
            exp: now + expirationSeconds,
        };

        return await sign(payload, this.jwtSecret, 'HS256');
    }

    /**
     * Generate a JWT refresh token
     */
    async generateRefreshToken(staff: Staff): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        const expirationSeconds = this.refreshTokenExpirationDays * 24 * 60 * 60;

        const payload: AuthJWTPayload = {
            staffId: staff.id,
            staffEmail: staff.work_email,
            staffNumber: staff.staff_number,
            type: 'refresh',
            iat: now,
            exp: now + expirationSeconds,
        };

        return await sign(payload, this.jwtSecret, 'HS256');
    }

    /**
     * Verify and decode a JWT token
     */
    async verifyToken(token: string): Promise<AuthJWTPayload | null> {
        try {
            const payload = await verify(token, this.jwtSecret, 'HS256') as AuthJWTPayload;
            return payload;
        } catch (error) {
            return null;
        }
    }

    /**
     * Generate a password reset token (simple implementation)
     */
    generateResetToken(): string {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    }

    /**
     * Get token expiration time (hours)
     */
    getTokenExpirationHours(): number {
        return this.tokenExpirationHours;
    }

    /**
     * Get refresh token expiration time (days)
     */
    getRefreshTokenExpirationDays(): number {
        return this.refreshTokenExpirationDays;
    }

    /**
     * Get password expiration date (30 days from now)
     */
    getPasswordExpirationDate(): Date {
        const date = new Date();
        date.setDate(date.getDate() + 30);
        return date;
    }

    /**
     * Check if reset token has expired
     */
    isResetTokenExpired(expiresAt: Date | null | undefined): boolean {
        if (!expiresAt) return true;
        return new Date() > new Date(expiresAt);
    }

    /**
     * Check if account is locked
     */
    isAccountLocked(credentials: StaffCredentials): boolean {
        if (!credentials.is_locked) return false;
        
        if (credentials.locked_until) {
            return new Date() < new Date(credentials.locked_until);
        }
        
        return true;
    }

    /**
     * Calculate lock duration (15 minutes from now)
     */
    getLockDuration(): Date {
        const date = new Date();
        date.setMinutes(date.getMinutes() + 15);
        return date;
    }

    /**
     * Get max failed login attempts before lockout
     */
    getMaxFailedAttempts(): number {
        return 5;
    }
}

/**
 * Initialize auth service with JWT secret
 */
export function initAuthService(): AuthService {
    return new AuthService(process.env.JWT_SECRET);
}
