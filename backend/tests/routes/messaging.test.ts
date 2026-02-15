// tests/routes/messaging.test.ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * Messaging Route Validation Schema Tests
 * Tests all Zod schemas used in the messaging route
 */

const uuidSchema = z.string().uuid('Invalid UUID format');

const sendMessageSchema = z.object({
    channel: z.enum(['sms', 'email', 'push', 'in_app']),
    body: z.string().min(1, 'Message body is required'),
    member_id: uuidSchema.optional(),
    recipient_phone: z.string().optional(),
    recipient_email: z.string().email().optional(),
    template_id: uuidSchema.optional(),
    subject: z.string().optional(),
    variables: z.record(z.string(), z.unknown()).optional(),
    scheduled_for: z.string().optional(),
});

const bulkCampaignSchema = z.object({
    name: z.string().min(1, 'Campaign name is required'),
    channel: z.enum(['sms', 'email', 'push', 'multi_channel']),
    body: z.string().min(1, 'Campaign body is required'),
    template_id: uuidSchema.optional(),
    subject: z.string().optional(),
    recipient_filter: z.record(z.string(), z.unknown()).optional(),
    scheduled_send_date: z.string().optional(),
    immediate_send: z.boolean().optional(),
});

const createTemplateSchema = z.object({
    code: z.string().min(1, 'Template code is required').max(50),
    name: z.string().min(1, 'Template name is required').max(200),
    channel: z.enum(['sms', 'email', 'push', 'in_app']),
    body: z.string().min(1, 'Template body is required'),
    subject: z.string().optional(),
    description: z.string().optional(),
    merge_fields: z.array(z.string()).optional(),
});

const updateTemplateSchema = z.object({
    code: z.string().min(1).max(50).optional(),
    name: z.string().min(1).max(200).optional(),
    channel: z.enum(['sms', 'email', 'push', 'in_app']).optional(),
    body: z.string().min(1).optional(),
    subject: z.string().optional(),
    description: z.string().optional(),
    merge_fields: z.array(z.string()).optional(),
    is_active: z.boolean().optional(),
});

const preferencesSchema = z.object({
    sms_enabled: z.boolean().optional(),
    email_enabled: z.boolean().optional(),
    push_enabled: z.boolean().optional(),
    in_app_enabled: z.boolean().optional(),
    marketing_opt_in: z.boolean().optional(),
    transaction_alerts: z.boolean().optional(),
    loan_reminders: z.boolean().optional(),
    preferred_language: z.string().optional(),
});

const scheduleMessageSchema = z.object({
    channel: z.enum(['sms', 'email', 'push', 'in_app']),
    body: z.string().min(1, 'Message body is required'),
    scheduled_for: z.string().min(1, 'Scheduled time is required'),
    member_id: uuidSchema.optional(),
    recipient_phone: z.string().optional(),
    recipient_email: z.string().email().optional(),
    template_id: uuidSchema.optional(),
    subject: z.string().optional(),
    variables: z.record(z.string(), z.unknown()).optional(),
});

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

// ═══════════════════════════════════════════════════════════════
// sendMessageSchema
// ═══════════════════════════════════════════════════════════════

describe('sendMessageSchema', () => {
    const validMessage = {
        channel: 'sms' as const,
        body: 'Your balance is KES 5,000',
    };

    it('should pass with minimal valid data', () => {
        expect(sendMessageSchema.safeParse(validMessage).success).toBe(true);
    });

    it('should accept all valid channels', () => {
        for (const ch of ['sms', 'email', 'push', 'in_app']) {
            expect(sendMessageSchema.safeParse({ ...validMessage, channel: ch }).success).toBe(true);
        }
    });

    it('should reject invalid channel', () => {
        expect(sendMessageSchema.safeParse({ ...validMessage, channel: 'whatsapp' }).success).toBe(false);
    });

    it('should reject empty body', () => {
        expect(sendMessageSchema.safeParse({ ...validMessage, body: '' }).success).toBe(false);
    });

    it('should reject missing body', () => {
        expect(sendMessageSchema.safeParse({ channel: 'sms' }).success).toBe(false);
    });

    it('should accept optional member_id as UUID', () => {
        expect(sendMessageSchema.safeParse({ ...validMessage, member_id: VALID_UUID }).success).toBe(true);
    });

    it('should reject non-UUID member_id', () => {
        expect(sendMessageSchema.safeParse({ ...validMessage, member_id: 'bad' }).success).toBe(false);
    });

    it('should accept valid recipient_email', () => {
        expect(sendMessageSchema.safeParse({ ...validMessage, recipient_email: 'test@example.com' }).success).toBe(true);
    });

    it('should reject invalid recipient_email', () => {
        expect(sendMessageSchema.safeParse({ ...validMessage, recipient_email: 'not-an-email' }).success).toBe(false);
    });

    it('should accept optional template_id as UUID', () => {
        expect(sendMessageSchema.safeParse({ ...validMessage, template_id: VALID_UUID }).success).toBe(true);
    });

    it('should accept variables as record', () => {
        expect(sendMessageSchema.safeParse({
            ...validMessage,
            variables: { name: 'John', amount: 5000 },
        }).success).toBe(true);
    });

    it('should accept optional scheduled_for', () => {
        expect(sendMessageSchema.safeParse({
            ...validMessage,
            scheduled_for: '2026-03-01T10:00:00Z',
        }).success).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════
// bulkCampaignSchema
// ═══════════════════════════════════════════════════════════════

describe('bulkCampaignSchema', () => {
    const validCampaign = {
        name: 'Monthly Reminder',
        channel: 'sms' as const,
        body: 'Please deposit your savings this month',
    };

    it('should pass with valid data', () => {
        expect(bulkCampaignSchema.safeParse(validCampaign).success).toBe(true);
    });

    it('should accept multi_channel', () => {
        expect(bulkCampaignSchema.safeParse({ ...validCampaign, channel: 'multi_channel' }).success).toBe(true);
    });

    it('should reject invalid channel', () => {
        expect(bulkCampaignSchema.safeParse({ ...validCampaign, channel: 'telegram' }).success).toBe(false);
    });

    it('should reject empty name', () => {
        expect(bulkCampaignSchema.safeParse({ ...validCampaign, name: '' }).success).toBe(false);
    });

    it('should reject empty body', () => {
        expect(bulkCampaignSchema.safeParse({ ...validCampaign, body: '' }).success).toBe(false);
    });

    it('should accept optional template_id', () => {
        expect(bulkCampaignSchema.safeParse({ ...validCampaign, template_id: VALID_UUID }).success).toBe(true);
    });

    it('should accept optional recipient_filter', () => {
        expect(bulkCampaignSchema.safeParse({
            ...validCampaign,
            recipient_filter: { branch: 'main', status: 'active' },
        }).success).toBe(true);
    });

    it('should accept immediate_send flag', () => {
        expect(bulkCampaignSchema.safeParse({ ...validCampaign, immediate_send: true }).success).toBe(true);
    });

    it('should accept scheduled_send_date', () => {
        expect(bulkCampaignSchema.safeParse({
            ...validCampaign,
            scheduled_send_date: '2026-03-15T09:00:00Z',
        }).success).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════
// createTemplateSchema
// ═══════════════════════════════════════════════════════════════

describe('createTemplateSchema', () => {
    const validTemplate = {
        code: 'WELCOME_SMS',
        name: 'Welcome SMS',
        channel: 'sms' as const,
        body: 'Welcome to our SACCO, {{name}}!',
    };

    it('should pass with valid data', () => {
        expect(createTemplateSchema.safeParse(validTemplate).success).toBe(true);
    });

    it('should reject empty code', () => {
        expect(createTemplateSchema.safeParse({ ...validTemplate, code: '' }).success).toBe(false);
    });

    it('should reject code longer than 50 chars', () => {
        expect(createTemplateSchema.safeParse({ ...validTemplate, code: 'A'.repeat(51) }).success).toBe(false);
    });

    it('should reject empty name', () => {
        expect(createTemplateSchema.safeParse({ ...validTemplate, name: '' }).success).toBe(false);
    });

    it('should reject name longer than 200 chars', () => {
        expect(createTemplateSchema.safeParse({ ...validTemplate, name: 'A'.repeat(201) }).success).toBe(false);
    });

    it('should reject empty body', () => {
        expect(createTemplateSchema.safeParse({ ...validTemplate, body: '' }).success).toBe(false);
    });

    it('should accept all valid channels', () => {
        for (const ch of ['sms', 'email', 'push', 'in_app']) {
            expect(createTemplateSchema.safeParse({ ...validTemplate, channel: ch }).success).toBe(true);
        }
    });

    it('should reject invalid channel', () => {
        expect(createTemplateSchema.safeParse({ ...validTemplate, channel: 'fax' }).success).toBe(false);
    });

    it('should accept optional merge_fields', () => {
        expect(createTemplateSchema.safeParse({
            ...validTemplate,
            merge_fields: ['name', 'amount', 'date'],
        }).success).toBe(true);
    });

    it('should accept optional subject', () => {
        expect(createTemplateSchema.safeParse({
            ...validTemplate,
            channel: 'email',
            subject: 'Welcome to SACCO',
        }).success).toBe(true);
    });

    it('should accept optional description', () => {
        expect(createTemplateSchema.safeParse({
            ...validTemplate,
            description: 'Sent to new members upon registration',
        }).success).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════
// updateTemplateSchema
// ═══════════════════════════════════════════════════════════════

describe('updateTemplateSchema', () => {
    it('should pass with empty object (all optional)', () => {
        expect(updateTemplateSchema.safeParse({}).success).toBe(true);
    });

    it('should accept partial update with name only', () => {
        expect(updateTemplateSchema.safeParse({ name: 'Updated Name' }).success).toBe(true);
    });

    it('should accept is_active toggle', () => {
        expect(updateTemplateSchema.safeParse({ is_active: false }).success).toBe(true);
    });

    it('should reject empty code when provided', () => {
        expect(updateTemplateSchema.safeParse({ code: '' }).success).toBe(false);
    });

    it('should reject code longer than 50 chars', () => {
        expect(updateTemplateSchema.safeParse({ code: 'A'.repeat(51) }).success).toBe(false);
    });

    it('should reject empty body when provided', () => {
        expect(updateTemplateSchema.safeParse({ body: '' }).success).toBe(false);
    });

    it('should accept updated merge_fields', () => {
        expect(updateTemplateSchema.safeParse({ merge_fields: ['name', 'balance'] }).success).toBe(true);
    });

    it('should reject invalid channel', () => {
        expect(updateTemplateSchema.safeParse({ channel: 'carrier_pigeon' }).success).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════
// preferencesSchema
// ═══════════════════════════════════════════════════════════════

describe('preferencesSchema', () => {
    it('should pass with empty object (all optional)', () => {
        expect(preferencesSchema.safeParse({}).success).toBe(true);
    });

    it('should accept all boolean preferences', () => {
        expect(preferencesSchema.safeParse({
            sms_enabled: true,
            email_enabled: false,
            push_enabled: true,
            in_app_enabled: true,
            marketing_opt_in: false,
            transaction_alerts: true,
            loan_reminders: true,
        }).success).toBe(true);
    });

    it('should accept preferred_language', () => {
        expect(preferencesSchema.safeParse({ preferred_language: 'sw' }).success).toBe(true);
    });

    it('should reject non-boolean values for boolean fields', () => {
        expect(preferencesSchema.safeParse({ sms_enabled: 'yes' }).success).toBe(false);
    });

    it('should accept partial preferences', () => {
        expect(preferencesSchema.safeParse({ marketing_opt_in: true }).success).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════
// scheduleMessageSchema
// ═══════════════════════════════════════════════════════════════

describe('scheduleMessageSchema', () => {
    const validScheduled = {
        channel: 'email' as const,
        body: 'Your loan repayment is due tomorrow',
        scheduled_for: '2026-03-01T09:00:00Z',
    };

    it('should pass with valid data', () => {
        expect(scheduleMessageSchema.safeParse(validScheduled).success).toBe(true);
    });

    it('should reject empty scheduled_for', () => {
        expect(scheduleMessageSchema.safeParse({ ...validScheduled, scheduled_for: '' }).success).toBe(false);
    });

    it('should reject missing scheduled_for', () => {
        const { scheduled_for, ...rest } = validScheduled;
        expect(scheduleMessageSchema.safeParse(rest).success).toBe(false);
    });

    it('should reject empty body', () => {
        expect(scheduleMessageSchema.safeParse({ ...validScheduled, body: '' }).success).toBe(false);
    });

    it('should accept optional member_id', () => {
        expect(scheduleMessageSchema.safeParse({
            ...validScheduled,
            member_id: VALID_UUID,
        }).success).toBe(true);
    });

    it('should accept optional subject for email', () => {
        expect(scheduleMessageSchema.safeParse({
            ...validScheduled,
            subject: 'Loan Reminder',
        }).success).toBe(true);
    });

    it('should accept optional variables', () => {
        expect(scheduleMessageSchema.safeParse({
            ...validScheduled,
            variables: { loan_id: 'L001', amount: 10000 },
        }).success).toBe(true);
    });

    it('should reject invalid recipient_email', () => {
        expect(scheduleMessageSchema.safeParse({
            ...validScheduled,
            recipient_email: 'not-email',
        }).success).toBe(false);
    });
});
