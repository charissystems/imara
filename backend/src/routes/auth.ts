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
    work_email: z.string().email('Invalid email format'),
    password: passwordSchema,
    work_phone: z.string().optional(),
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
        const { schema_name, code: tenantCode } = c.get('tenant');

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

        // Check if account is active
        if (!credentials.is_active) {
            throw new UnauthorizedError('Account is inactive');
        }

        // Check if account is locked
        if (authService.isAccountLocked(credentials)) {
            throw new UnauthorizedError('Account is locked. Try again later');
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
            is_locked: false,
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
                    email: staff.work_email,
                    department: staff.department,
                    jobTitle: staff.job_title,
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
        const { schema_name, code: tenantCode } = c.get('tenant');

        const staffRepo = new StaffRepository(schema_name);
        const authRepo = new AuthRepository(schema_name);
        const authService = new AuthService();

        // Check if email already exists
        const existingStaff = await staffRepo.findByEmail(data.work_email);
        if (existingStaff) {
            return c.json({
                success: false,
                error: {
                    code: 'DUPLICATE_EMAIL',
                    message: 'Email already registered',
                },
            }, 409);
        }

        // Hash password
        const passwordHash = await authService.hashPassword(data.password);

        // Create credentials
        const credentials = await authRepo.create({
            password_hash: passwordHash,
            password_changed_at: new Date(),
            is_active: true,
            is_locked: false,
            failed_login_attempts: 0,
            last_password_changed_at: new Date(),
        } as any);

        return c.json({
            success: true,
            data: {
                credentialsId: credentials.id,
            },
            meta: {
                message: 'Staff credentials created. Associate with staff record.',
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

        const { schema_name } = c.get('tenant');

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
                email: staff.work_email,
                phone: staff.work_phone,
                department: staff.department,
                jobTitle: staff.job_title,
                employmentStatus: staff.employment_status,
                hireDate: staff.hire_date,
                isActive: credentials?.is_active,
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

        const { schema_name } = c.get('tenant');
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

            const { schema_name } = c.get('tenant');
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
            const expirationDate = authService.getPasswordExpirationDate();
            await authRepo.updatePassword(
                currentUser.id,
                newHash,
                expirationDate
            );

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
 * Request a password reset token
 */
authRoutes.post('/forgot-password', validate(forgotPasswordSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof forgotPasswordSchema>>(c);
        const { schema_name } = c.get('tenant');

        const staffRepo = new StaffRepository(schema_name);
        const authRepo = new AuthRepository(schema_name);

        // Find staff by email
        const staff = await staffRepo.findByEmail(data.email);
        if (!staff) {
            // Don't reveal whether email exists
            return c.json({
                success: true,
                meta: {
                    message: 'If email exists, reset link has been sent',
                },
            });
        }

        // Generate reset token
        const authService = new AuthService();
        const resetToken = authService.generateResetToken();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1);

        // Save reset token
        await authRepo.setPasswordReset(staff.id, resetToken, expiresAt);

        // Here you would send an email with the reset token
        // For now, return it in response (development only)

        return c.json({
            success: true,
            data: {
                resetToken, // Remove in production - send via email instead
            },
            meta: {
                message: 'Password reset token generated. Send to email in production.',
            },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /auth/reset-password
 * Reset password using reset token
 */
authRoutes.post('/reset-password', validate(resetPasswordSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof resetPasswordSchema>>(c);
        const { schema_name } = c.get('tenant');

        const authRepo = new AuthRepository(schema_name);
        const authService = new AuthService();

        // Find credentials by reset token
        const credentials = await authRepo.findByResetToken(data.token);
        if (!credentials) {
            throw new UnauthorizedError('Invalid or expired reset token');
        }

        // Check if token has expired
        if (authService.isResetTokenExpired(credentials.reset_token_expires_at)) {
            throw new UnauthorizedError('Reset token has expired');
        }

        // Hash new password
        const passwordHash = await authService.hashPassword(data.newPassword);

        // Update password and clear reset token
        const expirationDate = authService.getPasswordExpirationDate();
        await authRepo.updatePassword(
            credentials.staff_id,
            passwordHash,
            expirationDate
        );

        return c.json({
            success: true,
            meta: {
                message: 'Password reset successfully. Please log in.',
            },
        });
    } catch (error) {
        throw error;
    }
});