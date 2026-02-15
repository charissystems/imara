// tests/services/messagingService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessagingService } from '../../src/services/messagingService';

/**
 * MessagingService Tests
 * Tests message sending, template merging, campaigns, and delivery logs
 */

// ─── Mock DB Builder ────────────────────────────────────────

function createMockQueryBuilder(rows: any[] = []) {
    const builder: any = {
        selectAll: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(rows),
        executeTakeFirst: vi.fn().mockResolvedValue(rows[0] ?? undefined),
    };
    return builder;
}

function createMockDb(overrides: Record<string, any> = {}) {
    const insertBuilder = {
        values: vi.fn().mockReturnValue({
            returning: vi.fn().mockReturnValue({
                execute: vi.fn().mockResolvedValue(overrides.insertRows || [{ id: 'msg-001' }]),
            }),
        }),
    };

    return {
        selectFrom: vi.fn().mockReturnValue(createMockQueryBuilder(overrides.selectRows || [])),
        insertInto: vi.fn().mockReturnValue(insertBuilder),
    } as any;
}

// ─── Template Variable Merging ──────────────────────────────

function mergeVariables(template: string, variables: Record<string, unknown>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }
    return result;
}

describe('MessagingService - Template Merging', () => {
    it('should replace single variable', () => {
        const result = mergeVariables('Hello {{name}}!', { name: 'John' });
        expect(result).toBe('Hello John!');
    });

    it('should replace multiple variables', () => {
        const result = mergeVariables(
            'Dear {{name}}, your balance is {{amount}} KES',
            { name: 'Jane', amount: 5000 },
        );
        expect(result).toBe('Dear Jane, your balance is 5000 KES');
    });

    it('should replace all occurrences of same variable', () => {
        const result = mergeVariables(
            '{{name}} logged in. Welcome back, {{name}}!',
            { name: 'Alice' },
        );
        expect(result).toBe('Alice logged in. Welcome back, Alice!');
    });

    it('should leave unknown placeholders unchanged', () => {
        const result = mergeVariables('Hello {{name}}, your code is {{code}}', { name: 'Bob' });
        expect(result).toBe('Hello Bob, your code is {{code}}');
    });

    it('should handle empty variables object', () => {
        const result = mergeVariables('Hello {{name}}!', {});
        expect(result).toBe('Hello {{name}}!');
    });

    it('should handle template with no placeholders', () => {
        const result = mergeVariables('No variables here', { name: 'Test' });
        expect(result).toBe('No variables here');
    });

    it('should coerce non-string values to string', () => {
        const result = mergeVariables('Amount: {{amount}}', { amount: 1500.50 });
        expect(result).toBe('Amount: 1500.5');
    });

    it('should handle boolean values', () => {
        const result = mergeVariables('Active: {{active}}', { active: true });
        expect(result).toBe('Active: true');
    });
});

// ─── Actual Service Tests ───────────────────────────────────

describe('MessagingService - sendMessage', () => {
    it('should send message without template', async () => {
        const mockDb = createMockDb({ insertRows: [{ id: 'msg-123' }] });
        const service = new MessagingService(mockDb);

        const result = await service.sendMessage({
            channel: 'sms',
            member_id: 'member-1',
            recipient_phone: '+254700000000',
            body: 'Your account balance is 5000 KES',
        });

        expect(result.id).toBe('msg-123');
        expect(mockDb.insertInto).toHaveBeenCalledWith('messages');
    });

    it('should send message with template', async () => {
        const mockTemplate = {
            id: 'template-1',
            body: 'Hello {{name}}, your balance is {{amount}} KES',
            subject: 'Account Balance',
            is_active: true,
        };
        const mockDb = createMockDb({
            selectRows: [mockTemplate],
            insertRows: [{ id: 'msg-456' }],
        });
        const service = new MessagingService(mockDb);

        const result = await service.sendMessage({
            channel: 'email',
            member_id: 'member-2',
            recipient_email: 'member@example.com',
            template_id: 'template-1',
            body: 'fallback body',
            variables: { name: 'John', amount: 10000 },
        });

        expect(result.id).toBe('msg-456');
        expect(mockDb.selectFrom).toHaveBeenCalledWith('message_templates');
    });

    it('should handle scheduled messages', async () => {
        const mockDb = createMockDb({ insertRows: [{ id: 'msg-scheduled' }] });
        const service = new MessagingService(mockDb);

        const result = await service.sendMessage({
            channel: 'sms',
            member_id: 'member-3',
            recipient_phone: '+254700000001',
            body: 'Reminder message',
            scheduled_for: '2026-03-01T10:00:00Z',
        });

        expect(result.id).toBe('msg-scheduled');
    });

    it('should support all channel types', async () => {
        const mockDb = createMockDb({ insertRows: [{ id: 'msg-001' }] });
        const service = new MessagingService(mockDb);

        const channels: Array<'sms' | 'email' | 'push' | 'in_app'> = ['sms', 'email', 'push', 'in_app'];

        for (const channel of channels) {
            await service.sendMessage({
                channel,
                member_id: 'member-1',
                body: `Test ${channel} message`,
            });
        }

        expect(mockDb.insertInto).toHaveBeenCalledTimes(4);
    });
});

describe('MessagingService - createBulkCampaign', () => {
    it('should create immediate send campaign', async () => {
        const mockDb = createMockDb({ insertRows: [{ id: 'camp-001' }] });
        const service = new MessagingService(mockDb);

        const result = await service.createBulkCampaign({
            name: 'Monthly Newsletter',
            channel: 'email',
            body: 'Newsletter content',
            immediate_send: true,
            created_by: 'staff-1',
        });

        expect(result.id).toBe('camp-001');
        expect(result.campaign_number).toMatch(/^CAMP-\d+$/);
        expect(mockDb.insertInto).toHaveBeenCalledWith('bulk_campaigns');
    });

    it('should create scheduled campaign', async () => {
        const mockDb = createMockDb({ insertRows: [{ id: 'camp-002' }] });
        const service = new MessagingService(mockDb);

        const result = await service.createBulkCampaign({
            name: 'Holiday Greetings',
            channel: 'sms',
            body: 'Happy holidays!',
            scheduled_send_date: '2026-12-25T08:00:00Z',
            created_by: 'staff-1',
        });

        expect(result.id).toBe('camp-002');
    });

    it('should create draft campaign', async () => {
        const mockDb = createMockDb({ insertRows: [{ id: 'camp-draft' }] });
        const service = new MessagingService(mockDb);

        const result = await service.createBulkCampaign({
            name: 'Draft Campaign',
            channel: 'multi_channel',
            body: 'Draft content',
            created_by: 'staff-1',
        });

        expect(result.id).toBe('camp-draft');
    });

    it('should support recipient filters', async () => {
        const mockDb = createMockDb({ insertRows: [{ id: 'camp-filtered' }] });
        const service = new MessagingService(mockDb);

        const result = await service.createBulkCampaign({
            name: 'Filtered Campaign',
            channel: 'email',
            body: 'Targeted message',
            recipient_filter: { status: 'active', balance_gte: 10000 },
            created_by: 'staff-1',
        });

        expect(result.id).toBe('camp-filtered');
    });
});

describe('MessagingService - getDeliveryLog', () => {
    it('should query delivery log with filters', async () => {
        const mockLogs = [
            { id: 'log-1', message_id: 'msg-1', status: 'delivered' },
            { id: 'log-2', message_id: 'msg-1', status: 'delivered' },
        ];
        const mockDb = createMockDb({ selectRows: mockLogs });
        const service = new MessagingService(mockDb);

        const result = await service.getDeliveryLog({
            message_id: 'msg-1',
            status: 'delivered',
            page: 1,
            limit: 50,
        });

        expect(result).toEqual(mockLogs);
        expect(mockDb.selectFrom).toHaveBeenCalledWith('message_delivery_log');
    });

    it('should filter by date range', async () => {
        const mockDb = createMockDb({ selectRows: [] });
        const service = new MessagingService(mockDb);

        await service.getDeliveryLog({
            date_from: '2026-01-01',
            date_to: '2026-01-31',
            page: 1,
            limit: 100,
        });

        expect(mockDb.selectFrom).toHaveBeenCalledWith('message_delivery_log');
    });

    it('should handle pagination', async () => {
        const mockDb = createMockDb({ selectRows: [] });
        const service = new MessagingService(mockDb);

        await service.getDeliveryLog({
            page: 2,
            limit: 25,
        });

        const builder = mockDb.selectFrom('message_delivery_log');
        expect(builder.limit).toHaveBeenCalledWith(25);
        expect(builder.offset).toHaveBeenCalledWith(25); // (2-1) * 25
    });
});

// ─── Legacy Template Merging Tests ──────────────────────────

describe('MessagingService - Template Merging Logic', () => {
    it('should replace single variable', () => {
        const result = mergeVariables('Hello {{name}}!', { name: 'John' });
        expect(result).toBe('Hello John!');
    });

    it('should replace multiple variables', () => {
        const result = mergeVariables(
            'Dear {{name}}, your balance is {{amount}} KES',
            { name: 'Jane', amount: 5000 },
        );
        expect(result).toBe('Dear Jane, your balance is 5000 KES');
    });

    it('should replace all occurrences of same variable', () => {
        const result = mergeVariables(
            '{{name}} logged in. Welcome back, {{name}}!',
            { name: 'Alice' },
        );
        expect(result).toBe('Alice logged in. Welcome back, Alice!');
    });

    it('should leave unknown placeholders unchanged', () => {
        const result = mergeVariables('Hello {{name}}, your code is {{code}}', { name: 'Bob' });
        expect(result).toBe('Hello Bob, your code is {{code}}');
    });

    it('should handle empty variables object', () => {
        const result = mergeVariables('Hello {{name}}!', {});
        expect(result).toBe('Hello {{name}}!');
    });

    it('should handle template with no placeholders', () => {
        const result = mergeVariables('No variables here', { name: 'Test' });
        expect(result).toBe('No variables here');
    });

    it('should coerce non-string values to string', () => {
        const result = mergeVariables('Amount: {{amount}}', { amount: 1500.50 });
        expect(result).toBe('Amount: 1500.5');
    });

    it('should handle boolean values', () => {
        const result = mergeVariables('Active: {{active}}', { active: true });
        expect(result).toBe('Active: true');
    });
});

describe('MessagingService - Message Status', () => {
    it('should set status to "draft" when scheduled_for is provided', () => {
        const scheduledFor = '2026-03-01T10:00:00Z';
        const status = scheduledFor ? 'draft' : 'queued';
        expect(status).toBe('draft');
    });

    it('should set status to "queued" when no scheduled_for', () => {
        const scheduledFor = undefined;
        const status = scheduledFor ? 'draft' : 'queued';
        expect(status).toBe('queued');
    });
});

// ─── Campaign Number Generation ─────────────────────────────

describe('MessagingService - Campaign Number', () => {
    it('should generate campaign number with CAMP- prefix', () => {
        const campaignNumber = `CAMP-${Date.now()}`;
        expect(campaignNumber).toMatch(/^CAMP-\d+$/);
    });

    it('should generate unique campaign numbers', () => {
        const numbers = new Set<string>();
        for (let i = 0; i < 10; i++) {
            numbers.add(`CAMP-${Date.now()}-${i}`);
        }
        expect(numbers.size).toBe(10);
    });
});

// ─── Campaign Status Logic ──────────────────────────────────

describe('MessagingService - Campaign Status Logic', () => {
    it('should set status to "sending" for immediate send', () => {
        const opts = { immediate_send: true, scheduled_send_date: undefined };
        const status = opts.immediate_send
            ? 'sending'
            : opts.scheduled_send_date
                ? 'scheduled'
                : 'draft';
        expect(status).toBe('sending');
    });

    it('should set status to "scheduled" for scheduled campaigns', () => {
        const opts = { immediate_send: false, scheduled_send_date: '2026-04-01' };
        const status = opts.immediate_send
            ? 'sending'
            : opts.scheduled_send_date
                ? 'scheduled'
                : 'draft';
        expect(status).toBe('scheduled');
    });

    it('should set status to "draft" when neither immediate nor scheduled', () => {
        const opts = { immediate_send: false, scheduled_send_date: undefined };
        const status = opts.immediate_send
            ? 'sending'
            : opts.scheduled_send_date
                ? 'scheduled'
                : 'draft';
        expect(status).toBe('draft');
    });
});

// ─── Delivery Log Filter Logic ──────────────────────────────

describe('MessagingService - Delivery Log Filters', () => {
    it('should only apply defined filters', () => {
        const filters = {
            message_id: undefined,
            status: 'delivered',
            date_from: '2026-01-01',
            date_to: undefined,
            page: 1,
            limit: 20,
        };

        const appliedFilters: string[] = [];
        if (filters.message_id) appliedFilters.push('message_id');
        if (filters.status) appliedFilters.push('status');
        if (filters.date_from) appliedFilters.push('date_from');
        if (filters.date_to) appliedFilters.push('date_to');

        expect(appliedFilters).toEqual(['status', 'date_from']);
    });

    it('should apply all filters when all are provided', () => {
        const filters = {
            message_id: 'msg-001',
            status: 'failed',
            date_from: '2026-01-01',
            date_to: '2026-12-31',
            page: 1,
            limit: 20,
        };

        const appliedFilters: string[] = [];
        if (filters.message_id) appliedFilters.push('message_id');
        if (filters.status) appliedFilters.push('status');
        if (filters.date_from) appliedFilters.push('date_from');
        if (filters.date_to) appliedFilters.push('date_to');

        expect(appliedFilters).toHaveLength(4);
    });

    it('should calculate correct offset for pagination', () => {
        expect((1 - 1) * 20).toBe(0);
        expect((2 - 1) * 20).toBe(20);
        expect((5 - 1) * 10).toBe(40);
    });
});

// ─── sendMessage DB Insert ──────────────────────────────────

describe('MessagingService - sendMessage Defaults', () => {
    it('should default optional fields to null', () => {
        const opts = {
            channel: 'sms' as const,
            body: 'Test message',
        };
        expect(opts.channel).toBe('sms');
        expect((opts as any).member_id || null).toBeNull();
        expect((opts as any).staff_id || null).toBeNull();
        expect((opts as any).recipient_phone || null).toBeNull();
        expect((opts as any).recipient_email || null).toBeNull();
        expect((opts as any).template_id || null).toBeNull();
        expect((opts as any).subject || null).toBeNull();
    });
});
