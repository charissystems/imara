// src/routes/messaging.ts
import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'crypto';
import { Env } from '../middleware/types';
import { validate, getValidatedData, commonSchemas } from '../middleware/validation';
import { enforcePermission } from '../middleware/rbac';
import { NotFoundError } from '../middleware/errorHandler';
import { MessagingService } from '../services/messagingService';

export const messagingRoutes = new Hono<Env>();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const sendMessageSchema = z.object({
    channel: z.enum(['sms', 'email', 'push', 'in_app']),
    body: z.string().min(1, 'Message body is required'),
    member_id: commonSchemas.uuid.optional(),
    recipient_phone: z.string().optional(),
    recipient_email: z.string().email().optional(),
    template_id: commonSchemas.uuid.optional(),
    subject: z.string().optional(),
    variables: z.record(z.string(), z.unknown()).optional(),
    scheduled_for: z.string().optional(),
});

const bulkCampaignSchema = z.object({
    name: z.string().min(1, 'Campaign name is required'),
    channel: z.enum(['sms', 'email', 'push', 'multi_channel']),
    body: z.string().min(1, 'Campaign body is required'),
    template_id: commonSchemas.uuid.optional(),
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
    promotional_messages: z.boolean().optional(),
    transaction_alerts: z.boolean().optional(),
    loan_related: z.boolean().optional(),
});

const scheduleMessageSchema = z.object({
    channel: z.enum(['sms', 'email', 'push', 'in_app']),
    body: z.string().min(1, 'Message body is required'),
    scheduled_for: z.string().min(1, 'Scheduled time is required'),
    member_id: commonSchemas.uuid.optional(),
    recipient_phone: z.string().optional(),
    recipient_email: z.string().email().optional(),
    template_id: commonSchemas.uuid.optional(),
    subject: z.string().optional(),
    variables: z.record(z.string(), z.unknown()).optional(),
});

// =============================================================================
// SINGLE MESSAGE
// =============================================================================

/**
 * POST /messaging/send
 * Send a single message
 */
messagingRoutes.post('/send', enforcePermission('messaging', 'create'), validate(sendMessageSchema), async (c) => {
    const data = getValidatedData<z.infer<typeof sendMessageSchema>>(c);
    const db = c.get('db')!;
    const user = c.get('user');

    // Validate recipient is provided
    if (!data.member_id && !data.recipient_phone && !data.recipient_email) {
        return c.json({
            success: false,
            error: { code: 'MISSING_RECIPIENT', message: 'At least one of member_id, recipient_phone, or recipient_email is required' },
        }, 400);
    }

    const service = new MessagingService(db);

    const message = await service.sendMessage({
        ...data,
        created_by: user?.id,
    });

    return c.json({
        success: true,
        data: message,
        meta: { sent: true },
    }, 201);
});

// =============================================================================
// BULK CAMPAIGNS
// =============================================================================

/**
 * POST /messaging/bulk
 * Create a bulk campaign
 */
messagingRoutes.post('/bulk', enforcePermission('messaging', 'create'), validate(bulkCampaignSchema), async (c) => {
    const data = getValidatedData<z.infer<typeof bulkCampaignSchema>>(c);
    const db = c.get('db')!;
    const user = c.get('user');
    const service = new MessagingService(db);

    const campaign = await service.createBulkCampaign({
        ...data,
        created_by: user?.id,
    });

    return c.json({
        success: true,
        data: campaign,
        meta: { created: true },
    }, 201);
});

/**
 * GET /messaging/campaigns
 * List campaigns with pagination
 */
messagingRoutes.get('/campaigns', enforcePermission('messaging', 'read'), async (c) => {
    const db = c.get('db')!;
    const status = c.req.query('status');
    const channel = c.req.query('channel');
    const page = Number(c.req.query('page') || '1');
    const limit = Number(c.req.query('limit') || '20');

    let query = db.selectFrom('bulk_campaigns').selectAll();

    if (status) {
        query = query.where('status', '=', status as any);
    }
    if (channel) {
        query = query.where('channel', '=', channel as any);
    }

    const offset = (page - 1) * limit;
    const campaigns = await query
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset)
        .execute();

    return c.json({
        success: true,
        data: campaigns,
        meta: { page, limit, count: campaigns.length },
    });
});

/**
 * GET /messaging/campaigns/:campaignId
 * Get campaign details
 */
messagingRoutes.get('/campaigns/:campaignId', enforcePermission('messaging', 'read'), async (c) => {
    const { campaignId } = c.req.param();
    const db = c.get('db')!;

    const campaign = await db
        .selectFrom('bulk_campaigns')
        .selectAll()
        .where('id', '=', campaignId)
        .executeTakeFirst();

    if (!campaign) {
        throw new NotFoundError('Campaign', campaignId);
    }

    return c.json({
        success: true,
        data: campaign,
    });
});

/**
 * PATCH /messaging/campaigns/:campaignId/approve
 * Approve a campaign
 */
messagingRoutes.patch('/campaigns/:campaignId/approve', enforcePermission('messaging', 'approve'), async (c) => {
    const { campaignId } = c.req.param();
    const db = c.get('db')!;
    const user = c.get('user');

    const campaign = await db
        .selectFrom('bulk_campaigns')
        .selectAll()
        .where('id', '=', campaignId)
        .executeTakeFirst();

    if (!campaign) {
        throw new NotFoundError('Campaign', campaignId);
    }

    const updated = await db
        .updateTable('bulk_campaigns')
        .set({
            status: 'scheduled' as any,
            approved_by: user?.id || null,
            approved_at: new Date().toISOString() as any,
            updated_at: new Date().toISOString() as any,
        })
        .where('id', '=', campaignId)
        .returningAll()
        .executeTakeFirstOrThrow();

    return c.json({
        success: true,
        data: updated,
        meta: { approved: true },
    });
});

/**
 * POST /messaging/campaigns/:campaignId/send
 * Trigger campaign send
 */
messagingRoutes.post('/campaigns/:campaignId/send', enforcePermission('messaging', 'create'), async (c) => {
    const { campaignId } = c.req.param();
    const db = c.get('db')!;

    const campaign = await db
        .selectFrom('bulk_campaigns')
        .selectAll()
        .where('id', '=', campaignId)
        .executeTakeFirst();

    if (!campaign) {
        throw new NotFoundError('Campaign', campaignId);
    }

    const updated = await db
        .updateTable('bulk_campaigns')
        .set({
            status: 'sending' as any,
            started_at: new Date().toISOString() as any,
            updated_at: new Date().toISOString() as any,
        })
        .where('id', '=', campaignId)
        .returningAll()
        .executeTakeFirstOrThrow();

    return c.json({
        success: true,
        data: updated,
        meta: { sending: true },
    });
});

// =============================================================================
// MESSAGE TEMPLATES
// =============================================================================

/**
 * GET /messaging/templates
 * List message templates
 */
messagingRoutes.get('/templates', enforcePermission('messaging', 'read'), async (c) => {
    const db = c.get('db')!;
    const channel = c.req.query('channel');
    const isActive = c.req.query('is_active');
    const page = Number(c.req.query('page') || '1');
    const limit = Number(c.req.query('limit') || '20');

    let query = db
        .selectFrom('message_templates')
        .selectAll()
        .where('deleted_at', 'is', null);

    if (channel) {
        query = query.where('channel', '=', channel as any);
    }
    if (isActive !== undefined) {
        query = query.where('is_active', '=', isActive === 'true');
    }

    const offset = (page - 1) * limit;
    const templates = await query
        .orderBy('name', 'asc')
        .limit(limit)
        .offset(offset)
        .execute();

    return c.json({
        success: true,
        data: templates,
        meta: { page, limit, count: templates.length },
    });
});

/**
 * GET /messaging/templates/:templateId
 * Get a single template
 */
messagingRoutes.get('/templates/:templateId', enforcePermission('messaging', 'read'), async (c) => {
    const { templateId } = c.req.param();
    const db = c.get('db')!;

    const template = await db
        .selectFrom('message_templates')
        .selectAll()
        .where('id', '=', templateId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

    if (!template) {
        throw new NotFoundError('MessageTemplate', templateId);
    }

    return c.json({
        success: true,
        data: template,
    });
});

/**
 * POST /messaging/templates
 * Create a new message template
 */
messagingRoutes.post('/templates', enforcePermission('messaging', 'create'), validate(createTemplateSchema), async (c) => {
    const data = getValidatedData<z.infer<typeof createTemplateSchema>>(c);
    const db = c.get('db')!;
    const user = c.get('user');

    const template = await db
        .insertInto('message_templates')
        .values({
            code: data.code,
            name: data.name,
            channel: data.channel as any,
            body: data.body,
            subject: data.subject || null,
            description: data.description || null,
            merge_fields: data.merge_fields ? JSON.stringify(data.merge_fields) as any : null,
            is_active: true,
            created_by: user?.id || null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

    return c.json({
        success: true,
        data: template,
        meta: { created: true },
    }, 201);
});

/**
 * PUT /messaging/templates/:templateId
 * Update a message template
 */
messagingRoutes.put('/templates/:templateId', enforcePermission('messaging', 'update'), validate(updateTemplateSchema), async (c) => {
    const { templateId } = c.req.param();
    const data = getValidatedData<z.infer<typeof updateTemplateSchema>>(c);
    const db = c.get('db')!;

    const existing = await db
        .selectFrom('message_templates')
        .select('id')
        .where('id', '=', templateId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

    if (!existing) {
        throw new NotFoundError('MessageTemplate', templateId);
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (data.code !== undefined) updates.code = data.code;
    if (data.name !== undefined) updates.name = data.name;
    if (data.channel !== undefined) updates.channel = data.channel;
    if (data.body !== undefined) updates.body = data.body;
    if (data.subject !== undefined) updates.subject = data.subject;
    if (data.description !== undefined) updates.description = data.description;
    if (data.merge_fields !== undefined) updates.merge_fields = JSON.stringify(data.merge_fields);
    if (data.is_active !== undefined) updates.is_active = data.is_active;

    const template = await db
        .updateTable('message_templates')
        .set(updates as any)
        .where('id', '=', templateId)
        .returningAll()
        .executeTakeFirstOrThrow();

    return c.json({
        success: true,
        data: template,
    });
});

/**
 * PATCH /messaging/templates/:templateId
 * Partially update a message template (alias for PUT)
 */
messagingRoutes.patch('/templates/:templateId', enforcePermission('messaging', 'update'), validate(updateTemplateSchema), async (c) => {
    const { templateId } = c.req.param();
    const data = getValidatedData<z.infer<typeof updateTemplateSchema>>(c);
    const db = c.get('db')!;

    const existing = await db
        .selectFrom('message_templates')
        .select('id')
        .where('id', '=', templateId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

    if (!existing) {
        throw new NotFoundError('MessageTemplate', templateId);
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (data.code !== undefined) updates.code = data.code;
    if (data.name !== undefined) updates.name = data.name;
    if (data.channel !== undefined) updates.channel = data.channel;
    if (data.body !== undefined) updates.body = data.body;
    if (data.subject !== undefined) updates.subject = data.subject;
    if (data.description !== undefined) updates.description = data.description;
    if (data.merge_fields !== undefined) updates.merge_fields = JSON.stringify(data.merge_fields);
    if (data.is_active !== undefined) updates.is_active = data.is_active;

    const template = await db
        .updateTable('message_templates')
        .set(updates as any)
        .where('id', '=', templateId)
        .returningAll()
        .executeTakeFirstOrThrow();

    return c.json({
        success: true,
        data: template,
    });
});

/**
 * DELETE /messaging/templates/:templateId
 * Soft delete a message template
 */
messagingRoutes.delete('/templates/:templateId', enforcePermission('messaging', 'delete'), async (c) => {
    const { templateId } = c.req.param();
    const db = c.get('db')!;

    const existing = await db
        .selectFrom('message_templates')
        .select('id')
        .where('id', '=', templateId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

    if (!existing) {
        throw new NotFoundError('MessageTemplate', templateId);
    }

    await db
        .updateTable('message_templates')
        .set({ deleted_at: new Date().toISOString() as any })
        .where('id', '=', templateId)
        .execute();

    return c.json({
        success: true,
        data: { id: templateId },
        meta: { deleted: true },
    });
});

// =============================================================================
// DELIVERY LOG
// =============================================================================

/**
 * GET /messaging/delivery-log
 * Delivery logs with filters
 */
messagingRoutes.get('/delivery-log', enforcePermission('messaging', 'read'), async (c) => {
    const db = c.get('db')!;
    const status = c.req.query('status');
    const channel = c.req.query('channel');
    const dateFrom = c.req.query('date_from');
    const dateTo = c.req.query('date_to');
    const page = Number(c.req.query('page') || '1');
    const limit = Number(c.req.query('limit') || '20');

    const service = new MessagingService(db);
    const results = await service.getDeliveryLog({
        status: status || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        limit,
    });

    return c.json({
        success: true,
        data: results,
        meta: { page, limit, count: results.length },
    });
});

/**
 * GET /messaging/delivery-log/:messageId
 * Delivery attempts for a specific message
 */
messagingRoutes.get('/delivery-log/:messageId', enforcePermission('messaging', 'read'), async (c) => {
    const { messageId } = c.req.param();
    const db = c.get('db')!;
    const service = new MessagingService(db);

    const results = await service.getDeliveryLog({
        message_id: messageId,
        page: 1,
        limit: 100,
    });

    return c.json({
        success: true,
        data: results,
        meta: { message_id: messageId, count: results.length },
    });
});

// =============================================================================
// COMMUNICATION PREFERENCES
// =============================================================================

/**
 * GET /messaging/preferences/:memberId
 * Get communication preferences for a member
 */
messagingRoutes.get('/preferences/:memberId', enforcePermission('messaging', 'read'), async (c) => {
    const { memberId } = c.req.param();
    const db = c.get('db')!;

    const preferences = await db
        .selectFrom('communication_preferences')
        .selectAll()
        .where('member_id', '=', memberId)
        .executeTakeFirst();

    if (!preferences) {
        // Return defaults if no preferences set
        return c.json({
            success: true,
            data: {
                member_id: memberId,
                sms_enabled: true,
                email_enabled: true,
                push_enabled: true,
                in_app_enabled: true,
                promotional_messages: false,
                transaction_alerts: true,
                loan_related: true,
            },
            meta: { defaults: true },
        });
    }

    return c.json({
        success: true,
        data: preferences,
    });
});

/**
 * PUT /messaging/preferences/:memberId
 * Upsert communication preferences for a member
 */
messagingRoutes.put('/preferences/:memberId', enforcePermission('messaging', 'update'), validate(preferencesSchema), async (c) => {
    const { memberId } = c.req.param();
    const data = getValidatedData<z.infer<typeof preferencesSchema>>(c);
    const db = c.get('db')!;

    const existing = await db
        .selectFrom('communication_preferences')
        .select('id')
        .where('member_id', '=', memberId)
        .executeTakeFirst();

    let result;
    if (existing) {
        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (data.sms_enabled !== undefined) updates.sms_enabled = data.sms_enabled;
        if (data.email_enabled !== undefined) updates.email_enabled = data.email_enabled;
        if (data.push_enabled !== undefined) updates.push_enabled = data.push_enabled;
        if (data.in_app_enabled !== undefined) updates.in_app_enabled = data.in_app_enabled;
        if (data.promotional_messages !== undefined) updates.promotional_messages = data.promotional_messages;
        if (data.transaction_alerts !== undefined) updates.transaction_alerts = data.transaction_alerts;
        if (data.loan_related !== undefined) updates.loan_related = data.loan_related;

        result = await db
            .updateTable('communication_preferences')
            .set(updates as any)
            .where('member_id', '=', memberId)
            .returningAll()
            .executeTakeFirstOrThrow();
    } else {
        result = await db
            .insertInto('communication_preferences')
            .values({
                member_id: memberId,
                sms_enabled: data.sms_enabled ?? true,
                email_enabled: data.email_enabled ?? true,
                push_enabled: data.push_enabled ?? true,
                in_app_enabled: data.in_app_enabled ?? true,
                promotional_messages: data.promotional_messages ?? false,
                transaction_alerts: data.transaction_alerts ?? true,
                loan_related: data.loan_related ?? true,
            } as any)
            .returningAll()
            .executeTakeFirstOrThrow();
    }

    return c.json({
        success: true,
        data: result,
        meta: { upserted: true },
    });
});

// =============================================================================
// SCHEDULED MESSAGES
// =============================================================================

/**
 * POST /messaging/schedule
 * Schedule a message for future delivery
 */
messagingRoutes.post('/schedule', enforcePermission('messaging', 'create'), validate(scheduleMessageSchema), async (c) => {
    const data = getValidatedData<z.infer<typeof scheduleMessageSchema>>(c);
    const db = c.get('db')!;
    const user = c.get('user');
    const service = new MessagingService(db);

    const message = await service.sendMessage({
        ...data,
        created_by: user?.id,
    });

    return c.json({
        success: true,
        data: message,
        meta: { scheduled: true, scheduled_for: data.scheduled_for },
    }, 201);
});

// =============================================================================
// SINGLE MESSAGE RETRIEVAL
// =============================================================================

/**
 * GET /messaging/messages/:messageId
 * Get a single message status/details
 */
messagingRoutes.get('/messages/:messageId', enforcePermission('messaging', 'read'), async (c) => {
    const { messageId } = c.req.param();
    const db = c.get('db')!;

    const message = await db
        .selectFrom('messages')
        .selectAll()
        .where('id', '=', messageId)
        .executeTakeFirst();

    if (!message) {
        throw new NotFoundError('Message', messageId);
    }

    return c.json({ success: true, data: message });
});

/**
 * GET /messaging/messages
 * List all messages with optional filters
 */
messagingRoutes.get('/messages', enforcePermission('messaging', 'read'), async (c) => {
    const db = c.get('db')!;
    const channel = c.req.query('channel');
    const status = c.req.query('status');
    const limit = parseInt(c.req.query('limit') || '20', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    let query = db.selectFrom('messages').selectAll();

    if (channel) {
        query = query.where('channel', '=', channel as any);
    }
    if (status) {
        query = query.where('status', '=', status as any);
    }

    const messages = await query
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset)
        .execute();

    return c.json({
        success: true,
        data: messages,
        meta: { count: messages.length, limit, offset },
    });
});

// =============================================================================
// CAMPAIGN STATUS
// =============================================================================

/**
 * GET /messaging/campaigns/:campaignId/status
 * Get campaign delivery status
 */
messagingRoutes.get('/campaigns/:campaignId/status', enforcePermission('messaging', 'read'), async (c) => {
    const { campaignId } = c.req.param();
    const db = c.get('db')!;

    const campaign = await db
        .selectFrom('bulk_campaigns')
        .selectAll()
        .where('id', '=', campaignId)
        .executeTakeFirst();

    if (!campaign) {
        throw new NotFoundError('Campaign', campaignId);
    }

    return c.json({
        success: true,
        data: {
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            total_recipients: campaign.recipient_count,
            sent_count: campaign.messages_sent,
            failed_count: campaign.messages_failed,
        },
    });
});

// =============================================================================
// SCHEDULED MESSAGE LISTING & CANCELLATION
// =============================================================================

/**
 * GET /messaging/scheduled
 * List scheduled messages
 */
messagingRoutes.get('/scheduled', enforcePermission('messaging', 'read'), async (c) => {
    const db = c.get('db')!;

    const messages = await db
        .selectFrom('messages')
        .selectAll()
        .where('scheduled_for', 'is not', null)
        .where('status', 'in', ['draft', 'queued'] as any)
        .orderBy('scheduled_for', 'asc')
        .execute();

    return c.json({
        success: true,
        data: messages,
        meta: { count: messages.length },
    });
});

/**
 * DELETE /messaging/scheduled/:messageId
 * Cancel a scheduled message
 */
messagingRoutes.delete('/scheduled/:messageId', enforcePermission('messaging', 'delete'), async (c) => {
    const { messageId } = c.req.param();
    const db = c.get('db')!;

    const message = await db
        .selectFrom('messages')
        .select(['id', 'status', 'scheduled_for'])
        .where('id', '=', messageId)
        .executeTakeFirst();

    if (!message) {
        throw new NotFoundError('Message', messageId);
    }

    await db
        .updateTable('messages')
        .set({ status: 'failed' as any, failed_reason: 'Cancelled by user' } as any)
        .where('id', '=', messageId)
        .execute();

    return c.json({
        success: true,
        data: { id: messageId, cancelled: true },
    });
});

// =============================================================================
// MEMBER PREFERENCES (ALTERNATE PATH)
// =============================================================================

/**
 * GET /messaging/members/:memberId/preferences
 * Get communication preferences for a member (alternate path)
 */
messagingRoutes.get('/members/:memberId/preferences', enforcePermission('messaging', 'read'), async (c) => {
    const { memberId } = c.req.param();
    const db = c.get('db')!;

    const preferences = await db
        .selectFrom('communication_preferences')
        .selectAll()
        .where('member_id', '=', memberId)
        .executeTakeFirst();

    if (!preferences) {
        return c.json({
            success: true,
            data: {
                member_id: memberId,
                sms_enabled: true,
                email_enabled: true,
                push_enabled: true,
                in_app_enabled: true,
                promotional_messages: false,
                transaction_alerts: true,
                loan_related: true,
            },
            meta: { defaults: true },
        });
    }

    return c.json({ success: true, data: preferences });
});

/**
 * PUT /messaging/members/:memberId/preferences
 * Upsert communication preferences for a member (alternate path)
 */
messagingRoutes.put('/members/:memberId/preferences', enforcePermission('messaging', 'update'), validate(preferencesSchema), async (c) => {
    const { memberId } = c.req.param();
    const data = getValidatedData<z.infer<typeof preferencesSchema>>(c);
    const db = c.get('db')!;

    const existing = await db
        .selectFrom('communication_preferences')
        .select('id')
        .where('member_id', '=', memberId)
        .executeTakeFirst();

    let result;
    if (existing) {
        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (data.sms_enabled !== undefined) updates.sms_enabled = data.sms_enabled;
        if (data.email_enabled !== undefined) updates.email_enabled = data.email_enabled;
        if (data.push_enabled !== undefined) updates.push_enabled = data.push_enabled;
        if (data.in_app_enabled !== undefined) updates.in_app_enabled = data.in_app_enabled;
        if (data.promotional_messages !== undefined) updates.promotional_messages = data.promotional_messages;
        if (data.transaction_alerts !== undefined) updates.transaction_alerts = data.transaction_alerts;
        if (data.loan_related !== undefined) updates.loan_related = data.loan_related;

        result = await db
            .updateTable('communication_preferences')
            .set(updates as any)
            .where('member_id', '=', memberId)
            .returningAll()
            .executeTakeFirstOrThrow();
    } else {
        result = await db
            .insertInto('communication_preferences')
            .values({
                member_id: memberId,
                sms_enabled: data.sms_enabled ?? true,
                email_enabled: data.email_enabled ?? true,
                push_enabled: data.push_enabled ?? true,
                in_app_enabled: data.in_app_enabled ?? true,
                promotional_messages: data.promotional_messages ?? false,
                transaction_alerts: data.transaction_alerts ?? true,
                loan_related: data.loan_related ?? true,
            } as any)
            .returningAll()
            .executeTakeFirstOrThrow();
    }

    return c.json({
        success: true,
        data: result,
        meta: { upserted: true },
    });
});

// =============================================================================
// MEMBER MESSAGE HISTORY
// =============================================================================

/**
 * GET /messaging/members/:memberId/messages
 * List messages for a specific member
 */
messagingRoutes.get('/members/:memberId/messages', enforcePermission('messaging', 'read'), async (c) => {
    const { memberId } = c.req.param();
    const db = c.get('db')!;
    const limit = parseInt(c.req.query('limit') || '20', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    const messages = await db
        .selectFrom('messages')
        .selectAll()
        .where('member_id', '=', memberId)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset)
        .execute();

    return c.json({
        success: true,
        data: messages,
        meta: { count: messages.length, member_id: memberId },
    });
});

// =============================================================================
// WEBHOOKS
// =============================================================================

/**
 * POST /messaging/webhooks/delivery-status
 * Handle delivery status webhook
 */
messagingRoutes.post('/webhooks/delivery-status', async (c) => {
    // Verify webhook signature (HMAC-SHA256)
    const webhookSecret = process.env.WEBHOOK_SIGNING_SECRET;
    if (!webhookSecret) {
        return c.json({ success: false, error: 'Webhook verification not configured' }, 500);
    }

    const rawBody = await c.req.text();
    const signatureHeader = c.req.header('X-Webhook-Signature') || '';

    const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

    // Timing-safe comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signatureHeader);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        return c.json({ success: false, error: 'Invalid webhook signature' }, 401);
    }

    const body = JSON.parse(rawBody);
    const db = c.get('db');

    if (!body.message_id || !body.status) {
        return c.json({ success: false, error: 'Missing message_id or status' }, 400);
    }

    // Validate status against allowed values
    const ALLOWED_STATUSES = ['sent', 'delivered', 'failed', 'bounced', 'rejected'];
    if (!ALLOWED_STATUSES.includes(body.status)) {
        return c.json({ success: false, error: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}` }, 400);
    }

    if (db) {
        await db
            .updateTable('messages')
            .set({ status: body.status as any, sent_at: body.delivered_at ? new Date(body.delivered_at) as any : undefined })
            .where('id', '=', body.message_id)
            .execute();
    }

    return c.json({ success: true });
});

export default messagingRoutes;

// =============================================================================
// ANALYTICS
// =============================================================================

/**
 * GET /messaging/analytics/summary
 * Get messaging analytics summary
 */
messagingRoutes.get('/analytics/summary', enforcePermission('messaging', 'read'), async (c) => {
    const db = c.get('db')!;

    const stats = await db
        .selectFrom('message_delivery_log')
        .select([
            db.fn.countAll().as('total_messages'),
            db.fn.count('id').as('delivered'),
        ])
        .executeTakeFirst();

    return c.json({
        success: true,
        data: {
            total_messages: Number(stats?.total_messages || 0),
            delivered: Number(stats?.delivered || 0),
            delivery_rate: Number(stats?.total_messages) > 0 
                ? (Number(stats?.delivered) / Number(stats?.total_messages) * 100).toFixed(2)
                : '0',
        },
    });
});

/**
 * GET /messaging/analytics/delivery-rates
 * Get message delivery rates by channel
 */
messagingRoutes.get('/analytics/delivery-rates', enforcePermission('messaging', 'read'), async (c) => {
    const db = c.get('db')!;

    const rates = await db
        .selectFrom('message_delivery_log as mdl')
        .innerJoin('messages as m', 'm.id', 'mdl.message_id')
        .select([
            'm.channel',
            db.fn.countAll().as('total'),
            db.fn.countAll().as('attempts'),
        ])
        .groupBy('m.channel')
        .execute();

    return c.json({
        success: true,
        data: rates.map(r => ({
            channel: r.channel,
            total: Number(r.total),
            attempts: Number(r.attempts),
            delivery_rate: Number(r.total) > 0 
                ? (Number(r.attempts) / Number(r.total) * 100).toFixed(2)
                : '0',
        })),
    });
});

/**
 * GET /messaging/analytics/channel-performance
 * Get performance metrics by channel
 */
messagingRoutes.get('/analytics/channel-performance', enforcePermission('messaging', 'read'), async (c) => {
    const db = c.get('db')!;

    const performance = await db
        .selectFrom('message_delivery_log as mdl')
        .innerJoin('messages as m', 'm.id', 'mdl.message_id')
        .select([
            'm.channel',
            db.fn.countAll().as('count'),
            'mdl.status',
        ])
        .groupBy(['m.channel', 'mdl.status'])
        .execute();

    const channelStats = new Map<string, any>();
    
    for (const row of performance) {
        if (!channelStats.has(row.channel)) {
            channelStats.set(row.channel, {
                channel: row.channel,
                total: 0,
                delivered: 0,
                failed: 0,
                sent: 0,
            });
        }
        
        const stats = channelStats.get(row.channel);
        const count = Number(row.count);
        stats.total += count;
        
        if (row.status === 'delivered') stats.delivered += count;
        else if (row.status === 'failed') stats.failed += count;
        else if (row.status === 'sent') stats.sent += count;
    }

    return c.json({
        success: true,
        data: Array.from(channelStats.values()),
    });
});
