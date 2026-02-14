/**
 * Tests for NotificationService
 *
 * Tests template rendering, channel resolution, preference filtering,
 * and dispatch to email/in_app channels.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService } from '../../src/services/notificationService';

// Mock EmailService
const mockEmailSend = vi.fn().mockResolvedValue({
    success: true,
    messageId: 'msg-1',
    provider: 'smtp',
    providerReference: 'ref-1',
});

vi.mock('../../src/services/emailService', () => {
    return {
        EmailService: class MockEmailService {
            send = mockEmailSend;
        },
    };
});

// Mock DB
function createMockDb() {
    const mockResults: Record<string, any> = {};

    const chainable = {
        selectAll: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn(() => {
            // Return based on what table was queried
            return Promise.resolve(mockResults.lastQuery || null);
        }),
        executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'id-1' }),
        insertInto: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockReturnThis(),
        returningAll: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue([]),
        updateTable: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
    };

    const db = {
        selectFrom: vi.fn((table: string) => {
            // Configure responses based on table
            if (table === 'notification_settings') {
                chainable.executeTakeFirst = vi.fn().mockResolvedValue({
                    email_enabled: true,
                    sms_enabled: false,
                    push_enabled: false,
                    in_app_enabled: true,
                });
            } else if (table === 'communication_preferences') {
                chainable.executeTakeFirst = vi.fn().mockResolvedValue(null);
            } else if (table === 'message_templates') {
                chainable.executeTakeFirst = vi.fn().mockResolvedValue({
                    id: 'tpl-1',
                    code: 'DEFAULT',
                    channel: 'email',
                    subject: 'Notification from {{sacco_name}}',
                    body: 'Hello {{member_name}}, this is a notification.',
                    is_active: true,
                    deleted_at: null,
                });
            }
            return chainable;
        }),
        insertInto: vi.fn(() => chainable),
        updateTable: vi.fn(() => chainable),
        _setMockResult: (key: string, value: any) => {
            mockResults[key] = value;
        },
    };

    return db as any;
}

describe('NotificationService', () => {
    let notificationService: NotificationService;
    let mockDb: ReturnType<typeof createMockDb>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockDb = createMockDb();
        notificationService = new NotificationService(mockDb);
    });

    describe('mergeVariables', () => {
        it('should replace simple placeholders', () => {
            const result = notificationService.mergeVariables(
                'Hello {{name}}, your balance is {{balance}}.',
                { name: 'John', balance: '1000' },
            );
            expect(result).toBe('Hello John, your balance is 1000.');
        });

        it('should handle numeric values', () => {
            const result = notificationService.mergeVariables(
                'You have {{count}} items.',
                { count: 5 },
            );
            expect(result).toBe('You have 5 items.');
        });

        it('should handle boolean values', () => {
            const result = notificationService.mergeVariables(
                'Active: {{is_active}}',
                { is_active: true },
            );
            expect(result).toBe('Active: true');
        });

        it('should leave unknown placeholders unchanged', () => {
            const result = notificationService.mergeVariables(
                'Hello {{name}}, your {{unknown_field}} is ready.',
                { name: 'Jane' },
            );
            expect(result).toBe('Hello Jane, your {{unknown_field}} is ready.');
        });

        it('should handle empty variables object', () => {
            const result = notificationService.mergeVariables(
                'Hello {{name}}!',
                {},
            );
            expect(result).toBe('Hello {{name}}!');
        });

        it('should handle template with no placeholders', () => {
            const result = notificationService.mergeVariables(
                'No variables here.',
                { name: 'John' },
            );
            expect(result).toBe('No variables here.');
        });

        it('should handle multiple occurrences of the same variable', () => {
            const result = notificationService.mergeVariables(
                '{{name}} is great. Thanks, {{name}}!',
                { name: 'Alice' },
            );
            expect(result).toBe('Alice is great. Thanks, Alice!');
        });
    });

    describe('send', () => {
        it('should send a notification via email', async () => {
            const result = await notificationService.send({
                type: 'test_notification',
                recipient: {
                    email: 'user@example.com',
                    name: 'Test User',
                },
                channels: ['email'],
                subject: 'Test Subject',
                body: '<p>Test Body</p>',
                variables: {},
            });

            expect(result.success).toBe(true);
            expect(result.channelResults).toHaveLength(1);
            expect(result.channelResults[0].channel).toBe('email');
            expect(result.channelResults[0].success).toBe(true);
        });

        it('should skip SMS channel (not configured)', async () => {
            const result = await notificationService.send({
                type: 'test_notification',
                recipient: {
                    phone: '+256700000000',
                    name: 'Test User',
                },
                channels: ['sms'],
                subject: 'Test',
                body: 'Test',
                variables: {},
            });

            expect(result.success).toBe(false);
            expect(result.channelResults[0].channel).toBe('sms');
            expect(result.channelResults[0].error).toContain('not configured');
        });

        it('should send to multiple channels', async () => {
            const result = await notificationService.send({
                type: 'test_notification',
                recipient: {
                    email: 'user@example.com',
                    memberId: 'member-1',
                },
                channels: ['email', 'in_app'],
                subject: 'Test',
                body: 'Test Body',
                variables: {},
            });

            expect(result.success).toBe(true);
            expect(result.channelResults).toHaveLength(2);
        });

        it('should fail gracefully when recipient has no email', async () => {
            const result = await notificationService.send({
                type: 'test_notification',
                recipient: {
                    name: 'No Email User',
                },
                channels: ['email'],
                subject: 'Test',
                body: 'Test',
                variables: {},
            });

            expect(result.channelResults[0].success).toBe(false);
            expect(result.channelResults[0].error).toContain('No email address');
        });
    });

    describe('sendBulk', () => {
        it('should send to multiple recipients', async () => {
            const result = await notificationService.sendBulk({
                type: 'test_notification',
                templateCode: 'TEST',
                recipients: [
                    { email: 'user1@test.com', variables: { name: 'Alice' } },
                    { email: 'user2@test.com', variables: { name: 'Bob' } },
                ],
                sharedVariables: { sacco_name: 'Test SACCO' },
                channels: ['email'],
            });

            expect(result.total).toBe(2);
            expect(result.sent + result.failed).toBe(2);
        });
    });

    describe('sendRepaymentReminder', () => {
        it('should send a repayment reminder notification', async () => {
            const result = await notificationService.sendRepaymentReminder({
                memberId: 'member-1',
                memberName: 'John Doe',
                memberEmail: 'john@example.com',
                loanAccountNumber: 'LN-001',
                installmentAmount: '50000.00',
                dueDate: '2026-02-20',
                daysUntilDue: 6,
                outstandingBalance: '450000.00',
                saccoName: 'Test SACCO',
            });

            expect(result.success).toBe(true);
        });
    });

    describe('sendPasswordReset', () => {
        it('should send a password reset email', async () => {
            const result = await notificationService.sendPasswordReset({
                staffId: 'staff-1',
                staffEmail: 'admin@sacco.com',
                staffName: 'Admin User',
                resetToken: 'abc123token',
                expiresInMinutes: 30,
                saccoName: 'Test SACCO',
            });

            expect(result.success).toBe(true);
            expect(result.channelResults[0].channel).toBe('email');
        });
    });

    describe('sendWelcome', () => {
        it('should send a welcome notification', async () => {
            const result = await notificationService.sendWelcome({
                memberId: 'member-1',
                memberName: 'Jane Doe',
                memberEmail: 'jane@example.com',
                memberNumber: 'MEM-001',
                saccoName: 'Test SACCO',
            });

            expect(result.success).toBe(true);
        });
    });

    describe('sendTransactionAlert', () => {
        it('should send a transaction alert', async () => {
            const result = await notificationService.sendTransactionAlert({
                memberId: 'member-1',
                memberEmail: 'user@test.com',
                memberName: 'User',
                transactionType: 'deposit',
                amount: '100000.00',
                accountNumber: 'SAV-001',
                newBalance: '500000.00',
                reference: 'TXN-12345',
                saccoName: 'Test SACCO',
            });

            expect(result.success).toBe(true);
        });
    });

    describe('sendMaturityAlert', () => {
        it('should send a FD maturity alert', async () => {
            const result = await notificationService.sendMaturityAlert({
                memberId: 'member-1',
                memberEmail: 'user@test.com',
                memberName: 'User',
                depositAmount: '5000000.00',
                maturityDate: '2026-03-15',
                daysUntilMaturity: 30,
                accountNumber: 'FD-001',
                saccoName: 'Test SACCO',
            });

            expect(result.success).toBe(true);
        });
    });
});
