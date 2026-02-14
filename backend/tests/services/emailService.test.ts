/**
 * Tests for EmailService
 *
 * Tests email sending with mock transporter, gateway resolution,
 * message recording, and delivery logging.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailService } from '../../src/services/emailService';

// Mock nodemailer
vi.mock('nodemailer', () => ({
    default: {
        createTransport: vi.fn(() => ({
            sendMail: vi.fn().mockResolvedValue({
                messageId: '<test-message-id@mail.example.com>',
                accepted: ['user@example.com'],
                rejected: [],
            }),
        })),
    },
}));

// Mock DB (minimal Kysely mock)
function createMockDb() {
    const chainable = {
        selectAll: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue(null),
        executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'msg-1' }),
        insertInto: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockReturnThis(),
        returningAll: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue([]),
        updateTable: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
    };

    return {
        selectFrom: vi.fn(() => chainable),
        insertInto: vi.fn(() => chainable),
        updateTable: vi.fn(() => chainable),
    } as any;
}

describe('EmailService', () => {
    let emailService: EmailService;
    let mockDb: ReturnType<typeof createMockDb>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockDb = createMockDb();
        emailService = new EmailService(mockDb);

        // Set env vars for SMTP fallback
        process.env.SMTP_HOST = 'localhost';
        process.env.SMTP_PORT = '587';
        process.env.SMTP_FROM_EMAIL = 'test@sacco.local';
        process.env.SMTP_FROM_NAME = 'Test SACCO';
    });

    describe('send', () => {
        it('should send an email successfully', async () => {
            const result = await emailService.send({
                to: 'user@example.com',
                subject: 'Test Email',
                html: '<p>Hello World</p>',
            });

            expect(result.success).toBe(true);
            expect(result.provider).toBe('smtp');
            expect(result.providerReference).toBeDefined();
        });

        it('should accept array of recipients', async () => {
            const result = await emailService.send({
                to: ['user1@example.com', 'user2@example.com'],
                subject: 'Bulk Test',
                html: '<p>Hello</p>',
            });

            expect(result.success).toBe(true);
        });

        it('should use DB gateway config when available', async () => {
            // Mock DB returning a configured gateway
            const chainable = {
                selectAll: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue({
                    provider: 'sendgrid',
                    api_key: 'SG.test-key',
                    from_email: 'sacco@example.com',
                    from_name: 'My SACCO',
                    smtp_host: null,
                    smtp_port: null,
                    smtp_username: null,
                    smtp_password: null,
                    smtp_use_tls: true,
                }),
                executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'msg-1' }),
                insertInto: vi.fn().mockReturnThis(),
                values: vi.fn().mockReturnThis(),
                returning: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue([]),
                updateTable: vi.fn().mockReturnThis(),
                set: vi.fn().mockReturnThis(),
            };

            mockDb.selectFrom = vi.fn(() => chainable);
            mockDb.insertInto = vi.fn(() => chainable);
            mockDb.updateTable = vi.fn(() => chainable);

            const result = await emailService.send({
                to: 'user@example.com',
                subject: 'SendGrid Test',
                html: '<p>Via SendGrid</p>',
            });

            expect(result.success).toBe(true);
        });

        it('should record message in DB before sending', async () => {
            await emailService.send({
                to: 'user@example.com',
                subject: 'Test',
                html: '<p>Hi</p>',
                memberId: 'member-123',
                sourceType: 'test',
            });

            expect(mockDb.insertInto).toHaveBeenCalled();
        });
    });

    describe('sendWithRetry', () => {
        it('should retry on failure', async () => {
            // First call fails, second succeeds
            const sendSpy = vi.spyOn(emailService, 'send');
            sendSpy.mockResolvedValueOnce({
                success: false,
                provider: 'smtp',
                error: 'Connection refused',
                messageId: 'msg-1',
            });
            sendSpy.mockResolvedValueOnce({
                success: true,
                provider: 'smtp',
                messageId: 'msg-2',
                providerReference: 'ref-2',
            });

            const result = await emailService.sendWithRetry(
                {
                    to: 'user@example.com',
                    subject: 'Retry Test',
                    html: '<p>Hi</p>',
                },
                2,
            );

            expect(result.success).toBe(true);
            expect(sendSpy).toHaveBeenCalledTimes(2);
        });
    });

    describe('stripHtml (via text fallback)', () => {
        it('should generate plain text from HTML in send', async () => {
            const result = await emailService.send({
                to: 'user@example.com',
                subject: 'HTML Test',
                html: '<h1>Title</h1><p>Line 1</p><p>Line 2</p>',
            });

            // The email was sent (text generation is internal)
            expect(result.success).toBe(true);
        });
    });

    describe('testGateway', () => {
        it('should send a test email', async () => {
            const result = await emailService.testGateway('admin@test.com');

            expect(result.success).toBe(true);
        });
    });
});
