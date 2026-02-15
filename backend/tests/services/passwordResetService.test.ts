/**
 * Tests for PasswordResetService
 *
 * Tests token generation, Redis storage, password reset flow,
 * and security properties (anti-enumeration, single-use tokens).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PasswordResetService } from '../../src/services/passwordResetService';

// Mock ioredis
const mockRedis = {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(0),
};

vi.mock('../../src/config/redis', () => ({
    getCacheRedis: () => mockRedis,
}));

// Mock NotificationService
const mockSendPasswordReset = vi.fn().mockResolvedValue({
    success: true,
    channelResults: [{ channel: 'email', success: true }],
});

vi.mock('../../src/services/notificationService', () => {
    return {
        NotificationService: class MockNotificationService {
            sendPasswordReset = mockSendPasswordReset;
        },
    };
});

// Mock AuthService
const mockValidatePasswordStrength = vi.fn().mockReturnValue({ valid: true, errors: [] });
const mockHashPassword = vi.fn().mockResolvedValue('$2a$10$hashedpassword');

vi.mock('../../src/services/authService', () => {
    return {
        AuthService: class MockAuthService {
            validatePasswordStrength = mockValidatePasswordStrength;
            hashPassword = mockHashPassword;
        },
    };
});

// Mock AuthRepository
const mockUpdatePassword = vi.fn().mockResolvedValue({});

vi.mock('../../src/repositories/authRepository', () => {
    return {
        AuthRepository: class MockAuthRepository {
            updatePassword = mockUpdatePassword;
        },
    };
});

function createMockDb() {
    const chainable = {
        selectAll: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue(null),
        executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'id-1' }),
    };

    return {
        selectFrom: vi.fn(() => chainable),
        _chainable: chainable,
    } as any;
}

describe('PasswordResetService', () => {
    let resetService: PasswordResetService;
    let mockDb: ReturnType<typeof createMockDb>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockDb = createMockDb();
        process.env.JWT_SECRET = 'test-secret';
        resetService = new PasswordResetService(mockDb, 'tenant_001');
    });

    afterEach(() => {
        delete process.env.JWT_SECRET;
    });

    describe('requestReset', () => {
        it('should generate token and store in Redis when email exists', async () => {
            // Mock staff found
            mockDb._chainable.executeTakeFirst.mockResolvedValueOnce({
                id: 'staff-1',
                email: 'admin@sacco.com',
                first_name: 'Admin',
                last_name: 'User',
            });

            const result = await resetService.requestReset('admin@sacco.com', 'Test SACCO');

            expect(result.success).toBe(true);
            expect(result.message).toContain('If the email is registered');
            expect(mockRedis.set).toHaveBeenCalledTimes(1);

            // Verify Redis call includes TTL
            const redisCall = mockRedis.set.mock.calls[0];
            expect(redisCall[2]).toBe('EX'); // TTL flag
            expect(redisCall[3]).toBe(1800); // 30 minutes in seconds
        });

        it('should return same response for non-existent email (prevent enumeration)', async () => {
            // Mock staff NOT found
            mockDb._chainable.executeTakeFirst.mockResolvedValueOnce(null);

            const result = await resetService.requestReset('unknown@sacco.com', 'Test SACCO');

            expect(result.success).toBe(true);
            expect(result.message).toContain('If the email is registered');
            // Should NOT store token in Redis
            expect(mockRedis.set).not.toHaveBeenCalled();
        });

        it('should generate unique tokens for each request', async () => {
            // Mock staff found twice
            mockDb._chainable.executeTakeFirst
                .mockResolvedValueOnce({
                    id: 'staff-1',
                    email: 'admin@sacco.com',
                    first_name: 'Admin',
                    last_name: 'User',
                })
                .mockResolvedValueOnce({
                    id: 'staff-1',
                    email: 'admin@sacco.com',
                    first_name: 'Admin',
                    last_name: 'User',
                });

            await resetService.requestReset('admin@sacco.com', 'Test SACCO');
            await resetService.requestReset('admin@sacco.com', 'Test SACCO');

            // Two different Redis keys
            const key1 = mockRedis.set.mock.calls[0][0];
            const key2 = mockRedis.set.mock.calls[1][0];
            expect(key1).not.toBe(key2);
        });
    });

    describe('resetPassword', () => {
        it('should reset password with valid token', async () => {
            const tokenData = JSON.stringify({
                staffId: 'staff-1',
                email: 'admin@sacco.com',
                createdAt: new Date().toISOString(),
            });

            mockRedis.get.mockResolvedValueOnce(tokenData);

            const result = await resetService.resetPassword(
                'valid-token-hash',
                'NewP@ssw0rd123!',
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain('reset successfully');

            // Token should be deleted (single-use)
            expect(mockRedis.del).toHaveBeenCalledTimes(1);
        });

        it('should reject invalid token', async () => {
            mockRedis.get.mockResolvedValueOnce(null);

            const result = await resetService.resetPassword(
                'invalid-token',
                'NewP@ssw0rd123!',
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('TOKEN_INVALID');
        });

        it('should reject weak passwords', async () => {
            const tokenData = JSON.stringify({
                staffId: 'staff-1',
                email: 'admin@sacco.com',
                createdAt: new Date().toISOString(),
            });

            mockRedis.get.mockResolvedValueOnce(tokenData);

            // Override mock to return invalid
            const { AuthService } = await import('../../src/services/authService');
            const mockValidate = vi.fn().mockReturnValue({
                valid: false,
                errors: ['Password must be at least 12 characters'],
            });

            // Access the internal authService and mock it
            (resetService as any).authService.validatePasswordStrength = mockValidate;

            const result = await resetService.resetPassword(
                'valid-token',
                'weak',
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('WEAK_PASSWORD');
        });
    });

    describe('validateToken', () => {
        it('should return true for valid token', async () => {
            mockRedis.exists.mockResolvedValueOnce(1);

            const isValid = await resetService.validateToken('valid-token');
            expect(isValid).toBe(true);
        });

        it('should return false for expired/invalid token', async () => {
            mockRedis.exists.mockResolvedValueOnce(0);

            const isValid = await resetService.validateToken('expired-token');
            expect(isValid).toBe(false);
        });
    });
});
