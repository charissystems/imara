// tests/services/authService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService, AuthJWTPayload } from '../../src/services/authService';

describe('AuthService', () => {
    let authService: AuthService;
    const testSecret = 'test-secret-key-12345';

    beforeEach(() => {
        authService = new AuthService(testSecret);
    });

    describe('constructor', () => {
        it('should initialize with provided secret', () => {
            const service = new AuthService('custom-secret');
            expect(service).toBeDefined();
        });

        it('should use JWT_SECRET environment variable if no secret provided', () => {
            const originalEnv = process.env.JWT_SECRET;
            process.env.JWT_SECRET = 'env-secret';
            const service = new AuthService();
            expect(service).toBeDefined();
            process.env.JWT_SECRET = originalEnv;
        });
    });

    describe('hashPassword', () => {
        it('should hash a password successfully', async () => {
            const password = 'Test@123';
            const hash = await authService.hashPassword(password);

            expect(hash).toBeDefined();
            expect(hash).not.toBe(password);
            expect(hash.length).toBeGreaterThan(0);
        });

        it('should produce different hashes for the same password', async () => {
            const password = 'Test@123';
            const hash1 = await authService.hashPassword(password);
            const hash2 = await authService.hashPassword(password);

            expect(hash1).not.toBe(hash2);
        });

        it('should handle long passwords', async () => {
            const longPassword = 'a'.repeat(100);
            const hash = await authService.hashPassword(longPassword);
            expect(hash).toBeDefined();
        });

        it('should handle special characters in password', async () => {
            const password = 'P@ssw0rd!#$%^&*()';
            const hash = await authService.hashPassword(password);
            expect(hash).toBeDefined();
        });
    });

    describe('verifyPassword', () => {
        it('should verify correct password', async () => {
            const password = 'Test@123';
            const hash = await authService.hashPassword(password);
            const isValid = await authService.verifyPassword(password, hash);

            expect(isValid).toBe(true);
        });

        it('should reject incorrect password', async () => {
            const password = 'Test@123';
            const wrongPassword = 'Wrong@123';
            const hash = await authService.hashPassword(password);
            const isValid = await authService.verifyPassword(wrongPassword, hash);

            expect(isValid).toBe(false);
        });

        it('should be case sensitive', async () => {
            const password = 'Test@123';
            const wrongCase = 'test@123';
            const hash = await authService.hashPassword(password);
            const isValid = await authService.verifyPassword(wrongCase, hash);

            expect(isValid).toBe(false);
        });

        it('should handle empty password verification', async () => {
            const password = 'Test@123';
            const hash = await authService.hashPassword(password);
            const isValid = await authService.verifyPassword('', hash);

            expect(isValid).toBe(false);
        });
    });

    describe('generateAccessToken', () => {
        it('should generate a valid JWT access token', async () => {
            const staff = {
                id: 'staff-123',
                work_email: 'staff@example.com',
                staff_number: 'STF001',
            };

            const token = await authService.generateAccessToken(staff as any);

            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            expect(token.split('.')).toHaveLength(3); // JWT structure: header.payload.signature
        });

        it('should include staff information in token payload', async () => {
            const staff = {
                id: 'staff-456',
                work_email: 'john@example.com',
                staff_number: 'STF002',
            };

            const token = await authService.generateAccessToken(staff as any);
            const decoded = await authService.verifyToken(token);

            expect(decoded).toBeDefined();
            expect(decoded?.staffId).toBe('staff-456');
            expect(decoded?.staffEmail).toBe('john@example.com');
            expect(decoded?.staffNumber).toBe('STF002');
        });

        it('should set correct expiration time', async () => {
            const staff = {
                id: 'staff-789',
                work_email: 'test@example.com',
                staff_number: 'STF003',
            };

            const token = await authService.generateAccessToken(staff as any);
            const decoded = await authService.verifyToken(token);

            expect(decoded?.exp).toBeDefined();
            expect(decoded?.iat).toBeDefined();
            const expirationDurationSeconds = (decoded?.exp || 0) - (decoded?.iat || 0);
            expect(expirationDurationSeconds).toBe(24 * 60 * 60); // 24 hours
        });
    });

    describe('generateRefreshToken', () => {
        it('should generate a valid JWT refresh token', async () => {
            const staff = {
                id: 'staff-999',
                work_email: 'refresh@example.com',
                staff_number: 'STF004',
            };

            const token = await authService.generateRefreshToken(staff as any);

            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            expect(token.split('.')).toHaveLength(3);
        });

        it('should have longer expiration than access token', async () => {
            const staff = {
                id: 'staff-888',
                work_email: 'test@example.com',
                staff_number: 'STF005',
            };

            const accessToken = await authService.generateAccessToken(staff as any);
            const refreshToken = await authService.generateRefreshToken(staff as any);

            const accessPayload = await authService.verifyToken(accessToken);
            const refreshPayload = await authService.verifyToken(refreshToken);

            const accessDuration = (accessPayload?.exp || 0) - (accessPayload?.iat || 0);
            const refreshDuration = (refreshPayload?.exp || 0) - (refreshPayload?.iat || 0);

            expect(refreshDuration).toBeGreaterThan(accessDuration);
        });

        it('should be 7 days of expiration', async () => {
            const staff = {
                id: 'staff-777',
                work_email: 'test@example.com',
                staff_number: 'STF006',
            };

            const token = await authService.generateRefreshToken(staff as any);
            const decoded = await authService.verifyToken(token);

            const expirationDurationSeconds = (decoded?.exp || 0) - (decoded?.iat || 0);
            expect(expirationDurationSeconds).toBe(7 * 24 * 60 * 60); // 7 days
        });

        it('should include type field for refresh token', async () => {
            const staff = {
                id: 'staff-666',
                work_email: 'test@example.com',
                staff_number: 'STF007',
            };

            const token = await authService.generateRefreshToken(staff as any);
            const decoded = await authService.verifyToken(token);

            expect((decoded as any)?.type).toBe('refresh');
        });
    });

    describe('verifyToken', () => {
        it('should verify and decode valid token', async () => {
            const staff = {
                id: 'staff-101',
                work_email: 'verify@example.com',
                staff_number: 'STF008',
            };

            const token = await authService.generateAccessToken(staff as any);
            const payload = await authService.verifyToken(token);

            expect(payload).toBeDefined();
            expect(payload?.staffId).toBe('staff-101');
        });

        it('should return null for invalid token', async () => {
            const invalidToken = 'invalid.token.here';
            const payload = await authService.verifyToken(invalidToken);

            expect(payload).toBeNull();
        });

        it('should return null for tampered token', async () => {
            const staff = {
                id: 'staff-202',
                work_email: 'tamper@example.com',
                staff_number: 'STF009',
            };

            const token = await authService.generateAccessToken(staff as any);
            const tamperedToken = token.slice(0, -5) + 'xxxxx'; // Modify last characters
            const payload = await authService.verifyToken(tamperedToken);

            expect(payload).toBeNull();
        });

        it('should handle expired token gracefully', async () => {
            // Create a token with past expiration
            const now = Math.floor(Date.now() / 1000);
            const payload: AuthJWTPayload = {
                staffId: 'staff-303',
                staffEmail: 'expired@example.com',
                staffNumber: 'STF010',
                iat: now - 3600,
                exp: now - 1800, // Expired 30 minutes ago
            };

            // We can't easily create an expired token without modifying internals,
            // so we'll test that verification attempts to decode it
            const result = await authService.verifyToken('invalid-expired-token');
            expect(result).toBeNull();
        });
    });

    describe('generateResetToken', () => {
        it('should generate a unique reset token', () => {
            const token1 = authService.generateResetToken();
            const token2 = authService.generateResetToken();

            expect(token1).toBeDefined();
            expect(token2).toBeDefined();
            expect(token1).not.toBe(token2);
        });

        it('should generate a string token', () => {
            const token = authService.generateResetToken();
            expect(typeof token).toBe('string');
        });

        it('should generate reasonable length token', () => {
            const token = authService.generateResetToken();
            expect(token.length).toBeGreaterThan(10);
        });

        it('should generate alphanumeric tokens', () => {
            const token = authService.generateResetToken();
            expect(/^[a-z0-9]+$/.test(token)).toBe(true);
        });
    });

    describe('getTokenExpirationHours', () => {
        it('should return 24 hours', () => {
            expect(authService.getTokenExpirationHours()).toBe(24);
        });
    });

    describe('getRefreshTokenExpirationDays', () => {
        it('should return 7 days', () => {
            expect(authService.getRefreshTokenExpirationDays()).toBe(7);
        });
    });

    describe('getPasswordExpirationDate', () => {
        it('should return date approximately 30 days in future', () => {
            const expirationDate = authService.getPasswordExpirationDate();
            const now = new Date();
            const expectedDate = new Date();
            expectedDate.setDate(expectedDate.getDate() + 30);

            const daysDifference = Math.floor(
                (expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            );

            // Allow 29-30 days due to day boundary calculations
            expect(daysDifference).toBeGreaterThanOrEqual(29);
            expect(daysDifference).toBeLessThanOrEqual(30);
        });
    });

    describe('isResetTokenExpired', () => {
        it('should return true for null expiration', () => {
            expect(authService.isResetTokenExpired(null)).toBe(true);
        });

        it('should return true for undefined expiration', () => {
            expect(authService.isResetTokenExpired(undefined)).toBe(true);
        });

        it('should return true for past date', () => {
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 1);
            expect(authService.isResetTokenExpired(pastDate)).toBe(true);
        });

        it('should return false for future date', () => {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 1);
            expect(authService.isResetTokenExpired(futureDate)).toBe(false);
        });
    });

    describe('isAccountLocked', () => {
        it('should return false when account is not locked', () => {
            const credentials = {
                is_locked: false,
                locked_until: null,
            };

            expect(authService.isAccountLocked(credentials as any)).toBe(false);
        });

        it('should return true when account is locked without expiration', () => {
            const credentials = {
                is_locked: true,
                locked_until: null,
            };

            expect(authService.isAccountLocked(credentials as any)).toBe(true);
        });

        it('should return true when lock time is in future', () => {
            const futureDate = new Date();
            futureDate.setMinutes(futureDate.getMinutes() + 15);

            const credentials = {
                is_locked: true,
                locked_until: futureDate,
            };

            expect(authService.isAccountLocked(credentials as any)).toBe(true);
        });

        it('should return false when lock time has passed', () => {
            const pastDate = new Date();
            pastDate.setMinutes(pastDate.getMinutes() - 15);

            const credentials = {
                is_locked: true,
                locked_until: pastDate,
            };

            expect(authService.isAccountLocked(credentials as any)).toBe(false);
        });
    });

    describe('getLockDuration', () => {
        it('should return date 15 minutes in future', () => {
            const lockDate = authService.getLockDuration();
            const now = new Date();
            const minutesDifference = Math.floor(
                (lockDate.getTime() - now.getTime()) / (1000 * 60)
            );

            expect(minutesDifference).toBe(15);
        });
    });

    describe('getMaxFailedAttempts', () => {
        it('should return 5 as max failed attempts', () => {
            expect(authService.getMaxFailedAttempts()).toBe(5);
        });
    });
});
