// src/routes/audit.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '../middleware/types';
import { validate, getValidatedData, commonSchemas } from '../middleware/validation';
import { enforcePermission, enforceAllPermissions } from '../middleware/rbac';
import { NotFoundError } from '../middleware/errorHandler';
import { AuditService } from '../services/auditService';
import { MemberCredentialService } from '../services/memberCredentialService';

export const auditRoutes = new Hono<Env>();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const reversalSchema = z.object({
    entity_type: z.string().min(1, 'Entity type is required'),
    entity_id: commonSchemas.uuid,
    reason: z.string().min(1, 'Reason is required'),
});

const setPinSchema = z.object({
    member_id: commonSchemas.uuid,
    pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 digits'),
});

const resetPinSchema = z.object({
    member_id: commonSchemas.uuid,
    reason: z.string().min(1, 'Reason is required'),
});

// =============================================================================
// AUDIT TRAIL
// =============================================================================

/**
 * GET /audit/trail
 * Query the audit trail with filters
 */
auditRoutes.get('/trail', enforcePermission('audit_logs', 'read'), async (c) => {
    const db = c.get('db')!;
    const service = new AuditService(db);

    const entityType = c.req.query('entity_type');
    const entityId = c.req.query('entity_id');
    const changeType = c.req.query('change_type');
    const userId = c.req.query('user_id');
    const dateFrom = c.req.query('date_from');
    const dateTo = c.req.query('date_to');
    const page = Number(c.req.query('page') || '1');
    const limit = Number(c.req.query('limit') || '50');

    const results = await service.queryAuditTrail({
        entity_type: entityType || undefined,
        entity_id: entityId || undefined,
        change_type: changeType || undefined,
        user_id: userId || undefined,
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

// =============================================================================
// ACTIVITY LOG
// =============================================================================

/**
 * GET /audit/activity
 * Query the activity log with filters
 */
auditRoutes.get('/activity', enforcePermission('audit_logs', 'read'), async (c) => {
    const db = c.get('db')!;
    const service = new AuditService(db);

    const entityType = c.req.query('entity_type');
    const entityId = c.req.query('entity_id');
    const userId = c.req.query('user_id');
    const dateFrom = c.req.query('date_from');
    const dateTo = c.req.query('date_to');
    const page = Number(c.req.query('page') || '1');
    const limit = Number(c.req.query('limit') || '50');

    const results = await service.queryActivityLog({
        entity_type: entityType || undefined,
        entity_id: entityId || undefined,
        user_id: userId || undefined,
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

// =============================================================================
// SECURITY EVENTS
// =============================================================================

/**
 * GET /audit/security-events
 * Query security events with filters
 */
auditRoutes.get('/security-events', enforcePermission('audit_logs', 'read'), async (c) => {
    const db = c.get('db')!;
    const service = new AuditService(db);

    const severity = c.req.query('severity');
    const eventType = c.req.query('event_type');
    const userId = c.req.query('user_id');
    const dateFrom = c.req.query('date_from');
    const dateTo = c.req.query('date_to');
    const page = Number(c.req.query('page') || '1');
    const limit = Number(c.req.query('limit') || '50');

    const results = await service.querySecurityEvents({
        severity: severity || undefined,
        event_type: eventType || undefined,
        user_id: userId || undefined,
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

// =============================================================================
// REVERSALS
// =============================================================================

/**
 * POST /audit/reversal
 * Initiate a transaction reversal
 */
auditRoutes.post(
    '/reversal',
    enforceAllPermissions([
        { resource: 'transactions', action: 'update' },
        { resource: 'audit_logs', action: 'create' },
    ]),
    validate(reversalSchema),
    async (c) => {
        const data = getValidatedData<z.infer<typeof reversalSchema>>(c);
        const db = c.get('db')!;
        const user = c.get('user');
        const service = new AuditService(db);

        const result = await service.initiateReversal({
            entity_type: data.entity_type,
            entity_id: data.entity_id,
            reason: data.reason,
            initiated_by: user!.id,
            user_ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || undefined,
        });

        return c.json({
            success: true,
            data: result,
            meta: { initiated: true },
        }, 201);
    }
);

/**
 * PATCH /audit/reversal/:reversalId/approve
 * Approve a pending reversal (dual authorization)
 */
auditRoutes.patch('/reversal/:reversalId/approve', enforcePermission('transactions', 'approve'), async (c) => {
    const { reversalId } = c.req.param();
    const db = c.get('db')!;
    const user = c.get('user');
    const service = new AuditService(db);

    const result = await service.approveReversal(reversalId, user!.id);

    return c.json({
        success: true,
        data: result,
        meta: { approved: true },
    });
});

// =============================================================================
// MEMBER CREDENTIALS (PIN Management)
// =============================================================================

/**
 * POST /audit/member-pin
 * Set a member PIN
 */
auditRoutes.post('/member-pin', enforcePermission('member_credentials', 'create'), validate(setPinSchema), async (c) => {
    const data = getValidatedData<z.infer<typeof setPinSchema>>(c);
    const db = c.get('db')!;
    const user = c.get('user');
    const service = new MemberCredentialService(db);

    const result = await service.setPin(data.member_id, data.pin, user?.id);

    return c.json({
        success: true,
        data: result,
        meta: { pin_set: true },
    }, 201);
});

/**
 * POST /audit/member-pin/reset
 * Reset a member PIN (generates temporary PIN)
 */
auditRoutes.post('/member-pin/reset', enforcePermission('member_credentials', 'update'), validate(resetPinSchema), async (c) => {
    const data = getValidatedData<z.infer<typeof resetPinSchema>>(c);
    const db = c.get('db')!;
    const user = c.get('user');
    const service = new MemberCredentialService(db);

    const result = await service.resetPin(data.member_id, user!.id);

    return c.json({
        success: true,
        data: result,
        meta: { pin_reset: true, reason: data.reason },
    });
});

export default auditRoutes;
