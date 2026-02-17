import { Hono } from 'hono';
import { z } from 'zod';
import { verify } from 'hono/jwt';
import { Env } from '../middleware/types';
import { validate, getValidatedData, commonSchemas } from '../middleware/validation';
import {
    ValidationError,
    NotFoundError,
    UnauthorizedError,
} from '../middleware/errorHandler';
import { StaffRepository } from '../repositories/staffRepository';
import { AuthRepository } from '../repositories/authRepository';
import { AuthService } from '../services/authService';
import { PasswordResetService } from '../services/passwordResetService';
import { TwoFactorService } from '../services/twoFactorService';
import { getTenantDb } from '../config/database';
import { appLogger } from '../middleware/logger';
import { blacklistToken } from '../services/tokenBlacklistService';
import { loginRateLimit, registerRateLimit, passwordResetRateLimit, otpRateLimit, rateLimit } from '../middleware/rateLimiter';
import { enforcePermission } from '../middleware/rbac';

export const authRoutes = new Hono<Env>();

/** Rate limiter for token refresh: 10 per 60s */
const refreshRateLimit = rateLimit({
    maxRequests: 10,
    windowSeconds: 60,
    keyPrefix: 'rl:refresh',
    message: 'Too many refresh attempts. Please try again in 1 minute.',
});

// Password validation regex: at least one uppercase, one lowercase, and one number
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

const passwordSchema = z.string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(passwordRegex, 'Password must contain at least one uppercase letter, one lowercase letter, and one number')
    .refine(pw => /[!@#$%^&*(),.?":{}|<>]/.test(pw), 'Password must contain at least one special character');

// Validation schemas
const registerSchema = z.object({
    first_name: z.string().min(2, 'First name required'),
    last_name: z.string().min(2, 'Last name required'),
    email: z.string().email('Invalid email format'),
    password: passwordSchema,
    phone: z.string().optional(),
});

const loginSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password required'),
});

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password required'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
}).refine(
    data => data.newPassword === data.confirmPassword,
    {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
    }
);

const resetPasswordSchema = z.object({
    token: z.string().min(1, 'Reset token required'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
}).refine(
    data => data.newPassword === data.confirmPassword,
    {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
    }
);

const forgotPasswordSchema = z.object({
    email: z.string().email('Invalid email format'),
});

/**
 * POST /auth/login
 * Authenticate a staff member and return JWT tokens
 */
authRoutes.post('/login', loginRateLimit, validate(loginSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof loginSchema>>(c);
        const { schema_name, code: tenantCode } = c.get('tenant')!;

        const staffRepo = new StaffRepository(schema_name);
        const authRepo = new AuthRepository(schema_name);
        const authService = new AuthService();

        // Find staff by email
        const staff = await staffRepo.findByEmail(data.email);
        if (!staff) {
            throw new UnauthorizedError('Invalid email or password');
        }

        // Get credentials
        const credentials = await authRepo.findByStaffId(staff.id);
        if (!credentials) {
            throw new UnauthorizedError('Account not properly configured');
        }

        // Check if account is locked
        if (credentials.account_locked) {
            if (credentials.locked_until && new Date(credentials.locked_until) > new Date()) {
                throw new UnauthorizedError('Account is locked. Try again later');
            }
            // Lock expired, unlock
            await authRepo.unlockAccount(staff.id);
        }

        // Verify password
        const isPasswordValid = await authService.verifyPassword(
            data.password,
            credentials.password_hash
        );

        if (!isPasswordValid) {
            // Increment failed attempts
            const updated = await authRepo.incrementFailedAttempts(staff.id);

            // Lock account if max attempts reached
            if (updated.failed_login_attempts >= authService.getMaxFailedAttempts()) {
                const lockUntil = authService.getLockDuration();
                await authRepo.lockAccount(staff.id, lockUntil);
            }

            throw new UnauthorizedError('Invalid email or password');
        }

        // Reset failed attempts on successful login
        await authRepo.update(staff.id, {
            failed_login_attempts: 0,
            account_locked: false,
            locked_until: null,
        });

        // Update last login
        await authRepo.updateLastLogin(staff.id);

        // Check if 2FA is enabled
        if (credentials.two_factor_enabled) {
            // Return a limited-scope token that can ONLY be used at /auth/2fa/verify.
            // Do NOT include staff.id / staff.email in the response — returning user
            // details before the second factor is verified leaks account existence
            // to attackers who have guessed a valid password.
            const tempToken = await authService.generate2faPendingToken(staff, c.get('tenant')!.id);
            return c.json({
                success: true,
                data: {
                    requiresTwoFactor: true,
                    tempToken,
                },
                meta: {
                    message: 'Two-factor authentication required',
                    tenant: tenantCode,
                },
            });
        }

        // Generate tokens with role and tenantId
        const staffRole = (staff as any).role || 'staff';
        const tenantId = c.get('tenant')!.id;
        const accessToken = await authService.generateAccessToken(staff, staffRole, tenantId);
        const refreshToken = await authService.generateRefreshToken(staff, tenantId);

        return c.json({
            success: true,
            data: {
                accessToken,
                refreshToken,
                staff: {
                    id: staff.id,
                    staffNumber: staff.staff_number,
                    email: staff.email,
                    department: staff.department,
                    position: staff.position,
                },
            },
            meta: {
                tokenExpiresIn: `${authService.getTokenExpirationMinutes()}m`,
                tenant: tenantCode,
            },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /auth/register
 * Register a new staff member (typically admin only)
 */
authRoutes.post('/register', enforcePermission('staff', 'create'), registerRateLimit, validate(registerSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof registerSchema>>(c);
        const { schema_name, code: tenantCode } = c.get('tenant')!;

        const staffRepo = new StaffRepository(schema_name);
        const authRepo = new AuthRepository(schema_name);
        const authService = new AuthService();

        // Check if email already exists
        const existingStaff = await staffRepo.findByEmail(data.email);
        if (existingStaff) {
            return c.json({
                success: false,
                error: {
                    code: 'DUPLICATE_EMAIL',
                    message: 'Email already registered',
                },
            }, 409);
        }

        // Create staff record first
        const newStaff = await staffRepo.create({
            first_name: data.first_name,
            last_name: data.last_name,
            email: data.email,
            phone: data.phone || `+000${Date.now().toString().slice(-8)}`,
            staff_number: `STF-${Date.now()}`,
            status: 'active',
            position: 'Staff',
            hire_date: new Date().toISOString().split('T')[0],
        } as any);

        // Hash password and create credentials
        const passwordHash = await authService.hashPassword(data.password);
        // bcrypt embeds the salt in the hash; store its prefix for the DB constraint
        const passwordSalt = passwordHash.substring(0, 29);

        const credentials = await authRepo.create({
            staff_id: newStaff.id,
            password_hash: passwordHash,
            password_salt: passwordSalt,
            password_changed_at: new Date(),
            failed_login_attempts: 0,
            account_locked: false,
        } as any);

        return c.json({
            success: true,
            data: {
                staffId: newStaff.id,
                staffNumber: newStaff.staff_number,
            },
            meta: {
                message: 'Staff account created successfully.',
                tenant: tenantCode,
            },
        }, 201);
    } catch (error) {
        throw error;
    }
});

/**
 * GET /auth/me
 * Get current authenticated user information
 */
authRoutes.get('/me', async (c) => {
    try {
        const currentUser = c.get('currentUser');

        if (!currentUser) {
            throw new UnauthorizedError('Not authenticated');
        }

        const { schema_name } = c.get('tenant')!;

        const staffRepo = new StaffRepository(schema_name);
        const authRepo = new AuthRepository(schema_name);

        // Get full staff details
        const staff = await staffRepo.findById(currentUser.id);
        if (!staff) {
            throw new NotFoundError('Staff', currentUser.id);
        }

        // Get credentials for additional info
        const credentials = await authRepo.findByStaffId(staff.id);

        return c.json({
            success: true,
            data: {
                id: staff.id,
                staffNumber: staff.staff_number,
                email: staff.email,
                phone: staff.phone,
                department: staff.department,
                position: staff.position,
                status: staff.status,
                hireDate: staff.hire_date,
                lastLogin: credentials?.last_login_at,
            },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /auth/refresh
 * Refresh access token using refresh token
 */
authRoutes.post('/refresh', refreshRateLimit, async (c) => {
    try {
        const bearerToken = c.req.header('Authorization');
        if (!bearerToken || !bearerToken.startsWith('Bearer ')) {
            throw new UnauthorizedError('Missing or invalid refresh token');
        }

        const refreshToken = bearerToken.substring(7);
        const authService = new AuthService();

        // Verify refresh token using the dedicated refresh secret
        const payload = await authService.verifyRefreshToken(refreshToken);
        if (!payload) {
            throw new UnauthorizedError('Invalid or expired refresh token');
        }

        const { schema_name } = c.get('tenant')!;
        const staffRepo = new StaffRepository(schema_name);

        // Get staff details
        const staff = await staffRepo.findById(payload.staffId);
        if (!staff) {
            throw new NotFoundError('Staff', payload.staffId);
        }

        // Generate new access token with role and tenantId from previous token
        const staffRole = (staff as any).role || payload.role || 'staff';
        const tenantId = payload.tenantId || c.get('tenant')!.id;
        const newAccessToken = await authService.generateAccessToken(staff, staffRole, tenantId);

        // Refresh token rotation: issue a new refresh token and invalidate the old one.
        // Without rotation a stolen refresh token is valid for its entire 7-day lifetime.
        const newRefreshToken = await authService.generateRefreshToken(staff, tenantId);
        if (payload.exp) {
            await blacklistToken(refreshToken, payload.exp).catch(() => {
                // Non-fatal: log but don't block the response
                appLogger.warn('Failed to blacklist old refresh token during rotation', {
                    staffId: payload.staffId,
                });
            });
        }

        return c.json({
            success: true,
            data: {
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
            },
            meta: {
                tokenExpiresIn: `${authService.getTokenExpirationMinutes()}m`,
            },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /auth/logout
 * Logout user — blacklists the current token so it cannot be reused
 */
authRoutes.post('/logout', async (c) => {
    try {
        const currentUser = c.get('currentUser');

        if (!currentUser) {
            throw new UnauthorizedError('Not authenticated');
        }

        // Extract token and its expiration, then add to blacklist
        const authHeader = c.req.header('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const authService = new AuthService();
            const payload = await authService.verifyToken(token);
            if (payload?.exp) {
                await blacklistToken(token, payload.exp);
            }
        }

        return c.json({
            success: true,
            meta: {
                message: 'Logged out successfully',
            },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /auth/change-password
 * Change password for authenticated user
 */
authRoutes.post(
    '/change-password',
    validate(changePasswordSchema),
    async (c) => {
        try {
            const data = getValidatedData<z.infer<typeof changePasswordSchema>>(c);
            const currentUser = c.get('currentUser');

            if (!currentUser) {
                throw new UnauthorizedError('Not authenticated');
            }

            const { schema_name } = c.get('tenant')!;
            const authRepo = new AuthRepository(schema_name);
            const authService = new AuthService();

            // Get current credentials
            const credentials = await authRepo.findByStaffId(currentUser.id);
            if (!credentials) {
                throw new NotFoundError('Credentials', currentUser.id);
            }

            // Verify current password
            const isValid = await authService.verifyPassword(
                data.currentPassword,
                credentials.password_hash
            );

            if (!isValid) {
                throw new UnauthorizedError('Current password is incorrect');
            }

            // Hash new password
            const newHash = await authService.hashPassword(data.newPassword);

            // Update password
            await authRepo.updatePassword(currentUser.id, newHash);

            return c.json({
                success: true,
                meta: {
                    message: 'Password changed successfully',
                },
            });
        } catch (error) {
            throw error;
        }
    }
);

/**
 * POST /auth/forgot-password
 * Request a password reset link (sent via email)
 */
authRoutes.post('/forgot-password', passwordResetRateLimit, validate(forgotPasswordSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof forgotPasswordSchema>>(c);
        const { schema_name, sacco_name } = c.get('tenant')!;
        const db = c.get('db')!;

        const resetService = new PasswordResetService(db, schema_name);
        const result = await resetService.requestReset(data.email, sacco_name);

        return c.json({
            success: true,
            meta: {
                message: result.message,
            },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /auth/reset-password
 * Reset password using a valid reset token
 */
authRoutes.post('/reset-password', passwordResetRateLimit, validate(resetPasswordSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof resetPasswordSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const db = c.get('db')!;

        const resetService = new PasswordResetService(db, schema_name);
        const result = await resetService.resetPassword(data.token, data.newPassword);

        if (!result.success) {
            return c.json({
                success: false,
                error: {
                    code: result.error || 'RESET_FAILED',
                    message: result.message,
                },
            }, 400);
        }

        return c.json({
            success: true,
            meta: {
                message: result.message,
            },
        });
    } catch (error) {
        throw error;
    }
});

// ────────────────────────────────────────────────────────────
// Two-Factor Authentication Routes
// ────────────────────────────────────────────────────────────

const verify2faSchema = z.object({
    code: z.string().min(1, '2FA code required'),
    tempToken: z.string().min(1, 'Temporary token required'),
});

const setup2faConfirmSchema = z.object({
    code: z.string().length(6, 'TOTP code must be 6 digits'),
});

const disable2faSchema = z.object({
    code: z.string().min(1, 'TOTP or backup code required'),
});

const regenerateBackupCodesSchema = z.object({
    code: z.string().length(6, 'TOTP code must be 6 digits'),
});

/**
 * POST /auth/2fa/verify
 * Verify 2FA code during login flow
 */
authRoutes.post('/2fa/verify', otpRateLimit, validate(verify2faSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof verify2faSchema>>(c);
        const { schema_name, code: tenantCode } = c.get('tenant')!;

        // Decrypt the temp token to get staff info
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new UnauthorizedError('Authentication service is misconfigured');
        }
        const payload = await verify(data.tempToken, secret, 'HS256');

        if (!payload || !payload.staffId) {
            throw new UnauthorizedError('Invalid temporary token');
        }

        // Ensure this is a 2FA pending token, not a regular access token
        if (payload.type !== '2fa_pending') {
            throw new UnauthorizedError('Invalid token type: expected 2FA pending token');
        }

        const twoFactorDb = getTenantDb(schema_name);
        const twoFactorService = new TwoFactorService(twoFactorDb);

        const verifyResult = await twoFactorService.verify(payload.staffId as string, data.code);

        if (!verifyResult.valid) {
            return c.json({
                success: false,
                error: {
                    code: 'INVALID_2FA_CODE',
                    message: 'Invalid two-factor authentication code',
                },
            }, 401);
        }

        // 2FA verified — generate full tokens with role and tenantId
        const staffRepo = new StaffRepository(schema_name);
        const authService = new AuthService();
        const staff = await staffRepo.findById(payload.staffId as string);

        if (!staff) {
            throw new UnauthorizedError('Staff not found');
        }

        const staffRole = (staff as any).role || 'staff';
        const tenantId = (payload.tenantId as string) || c.get('tenant')!.id;
        const accessToken = await authService.generateAccessToken(staff, staffRole, tenantId);
        const refreshToken = await authService.generateRefreshToken(staff, tenantId);

        return c.json({
            success: true,
            data: {
                accessToken,
                refreshToken,
                staff: {
                    id: staff.id,
                    staffNumber: staff.staff_number,
                    email: staff.email,
                    department: staff.department,
                    position: staff.position,
                },
                usedBackupCode: verifyResult.usedBackupCode,
            },
            meta: {
                tokenExpiresIn: `${authService.getTokenExpirationMinutes()}m`,
                tenant: tenantCode,
            },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /auth/2fa/setup
 * Generate 2FA setup (QR code + secret).
 * Requires authenticated user.
 */
authRoutes.post('/2fa/setup', async (c) => {
    try {
        const user = c.get('user');
        if (!user) throw new UnauthorizedError('Authentication required');

        const { schema_name } = c.get('tenant')!;
        const twoFactorDb = getTenantDb(schema_name);
        const twoFactorService = new TwoFactorService(twoFactorDb);

        const setup = await twoFactorService.generateSetup(user.staffId || user.id);

        return c.json({
            success: true,
            data: {
                qrCodeDataUrl: setup.qrCodeDataUrl,
                backupCodes: setup.backupCodes,
            },
            meta: {
                message: 'Scan the QR code with your authenticator app, then confirm with a code',
            },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /auth/2fa/confirm
 * Confirm 2FA setup by providing a valid TOTP code.
 * Requires authenticated user.
 */
authRoutes.post('/2fa/confirm', validate(setup2faConfirmSchema), async (c) => {
    try {
        const user = c.get('user');
        if (!user) throw new UnauthorizedError('Authentication required');

        const data = getValidatedData<z.infer<typeof setup2faConfirmSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const twoFactorDb = getTenantDb(schema_name);
        const twoFactorService = new TwoFactorService(twoFactorDb);

        const confirmed = await twoFactorService.confirmSetup(user.staffId || user.id, data.code);

        if (!confirmed) {
            return c.json({
                success: false,
                error: {
                    code: 'INVALID_CODE',
                    message: 'Invalid TOTP code. Make sure your authenticator is synced.',
                },
            }, 400);
        }

        return c.json({
            success: true,
            meta: {
                message: 'Two-factor authentication has been enabled',
            },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /auth/2fa/disable
 * Disable 2FA. Requires valid TOTP or backup code.
 */
authRoutes.post('/2fa/disable', validate(disable2faSchema), async (c) => {
    try {
        const user = c.get('user');
        if (!user) throw new UnauthorizedError('Authentication required');

        const data = getValidatedData<z.infer<typeof disable2faSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const twoFactorDb = getTenantDb(schema_name);
        const twoFactorService = new TwoFactorService(twoFactorDb);

        const disabled = await twoFactorService.disable(user.staffId || user.id, data.code);

        if (!disabled) {
            return c.json({
                success: false,
                error: {
                    code: 'INVALID_CODE',
                    message: 'Invalid code. Cannot disable 2FA.',
                },
            }, 400);
        }

        return c.json({
            success: true,
            meta: {
                message: 'Two-factor authentication has been disabled',
            },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * GET /auth/2fa/status
 * Get 2FA status for the authenticated user.
 */
authRoutes.get('/2fa/status', async (c) => {
    try {
        const user = c.get('user');
        if (!user) throw new UnauthorizedError('Authentication required');

        const { schema_name } = c.get('tenant')!;
        const twoFactorDb = getTenantDb(schema_name);
        const twoFactorService = new TwoFactorService(twoFactorDb);

        const status = await twoFactorService.getStatus(user.staffId || user.id);

        return c.json({
            success: true,
            data: status,
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /auth/2fa/backup-codes
 * Regenerate backup codes. Requires valid TOTP code.
 */
authRoutes.post('/2fa/backup-codes', validate(regenerateBackupCodesSchema), async (c) => {
    try {
        const user = c.get('user');
        if (!user) throw new UnauthorizedError('Authentication required');

        const data = getValidatedData<z.infer<typeof regenerateBackupCodesSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const twoFactorDb = getTenantDb(schema_name);
        const twoFactorService = new TwoFactorService(twoFactorDb);

        const codes = await twoFactorService.regenerateBackupCodes(user.staffId || user.id, data.code);

        return c.json({
            success: true,
            data: {
                backupCodes: codes,
            },
            meta: {
                message: 'New backup codes generated. Store them securely.',
            },
        });
    } catch (error) {
        throw error;
    }
});