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
import { appLogger } from '../middleware/logger';

export const authRoutes = new Hono<Env>();

// Password validation regex: at least one uppercase, one lowercase, and one number
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

const passwordSchema = z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(passwordRegex, 'Password must contain at least one uppercase letter, one lowercase letter, and one number');

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
authRoutes.post('/login', validate(loginSchema), async (c) => {
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

        // Generate tokens
        const accessToken = await authService.generateAccessToken(staff);
        const refreshToken = await authService.generateRefreshToken(staff);

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
                tokenExpiresIn: `${authService.getTokenExpirationHours()}h`,
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
authRoutes.post('/register', validate(registerSchema), async (c) => {
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
            phone: data.phone,
            staff_number: `STF-${Date.now()}`, // TODO: proper staff number generation
            status: 'active',
            hire_date: new Date().toISOString().split('T')[0],
        } as any);

        // Hash password and create credentials
        const passwordHash = await authService.hashPassword(data.password);

        const credentials = await authRepo.create({
            staff_id: newStaff.id,
            password_hash: passwordHash,
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
authRoutes.post('/refresh', async (c) => {
    try {
        const bearerToken = c.req.header('Authorization');
        if (!bearerToken || !bearerToken.startsWith('Bearer ')) {
            throw new UnauthorizedError('Missing or invalid refresh token');
        }

        const refreshToken = bearerToken.substring(7);
        const authService = new AuthService();

        // Verify refresh token
        const payload = await authService.verifyToken(refreshToken);
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

        // Generate new access token
        const newAccessToken = await authService.generateAccessToken(staff);

        return c.json({
            success: true,
            data: {
                accessToken: newAccessToken,
            },
            meta: {
                tokenExpiresIn: `${authService.getTokenExpirationHours()}h`,
            },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /auth/logout
 * Logout user (token blacklist implementation recommended)
 */
authRoutes.post('/logout', async (c) => {
    try {
        const currentUser = c.get('currentUser');

        if (!currentUser) {
            throw new UnauthorizedError('Not authenticated');
        }

        // Note: Token blacklist would be implemented here
        // For now, logout is client-side (discard token)

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
 * Request a password reset link
 * TODO: Requires a password_reset_tokens table or Redis-based token store.
 *       The staff_credentials table does not have reset_token columns.
 *       For now, this endpoint validates the email and returns a stub response.
 */
authRoutes.post('/forgot-password', validate(forgotPasswordSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof forgotPasswordSchema>>(c);
        const { schema_name } = c.get('tenant')!;

        const staffRepo = new StaffRepository(schema_name);

        // Find staff by email (don't reveal whether email exists)
        const staff = await staffRepo.findByEmail(data.email);

        if (staff) {
            // TODO: Generate token, store in separate table/Redis, send via email
            appLogger.info('Password reset requested', { staffId: staff.id });
        }

        // Always return same response to prevent email enumeration
        return c.json({
            success: true,
            meta: {
                message: 'If the email is registered, a reset link has been sent.',
            },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /auth/reset-password
 * Reset password using reset token
 * TODO: Implement once password_reset_tokens table is added.
 */
authRoutes.post('/reset-password', validate(resetPasswordSchema), async (c) => {
    // TODO: Look up token in password_reset_tokens table, validate expiry,
    //       hash new password, call authRepo.updatePassword(), delete token.
    return c.json({
        success: false,
        error: {
            code: 'NOT_IMPLEMENTED',
            message: 'Password reset is not yet available. Contact an administrator.',
        },
    }, 501);
});