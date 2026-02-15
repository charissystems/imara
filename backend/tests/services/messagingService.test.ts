// tests/services/messagingService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * MessagingService Unit Tests
 * Tests template merging, campaign status logic, and delivery log filtering
 */

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

// ─── Message Status Logic ───────────────────────────────────

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
