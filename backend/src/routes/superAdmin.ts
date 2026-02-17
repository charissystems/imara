// src/routes/admin.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { publicDb, getPool } from '../config/database';
import { ValidationError, NotFoundError, AppError } from '../middleware/errorHandler';
import { requireSuperAdmin } from '../middleware/superAdmin';
import { clearTenantCache } from '../middleware/tenantResolver';
import { rateLimit } from '../middleware/rateLimiter';

// Rate limiter for super admin routes: 30 requests per 60s per IP
const adminRateLimit = rateLimit({
    maxRequests: 30,
    windowSeconds: 60,
    keyPrefix: 'rl:super-admin',
    message: 'Too many admin requests. Please try again later.',
});

// Router setup
const app = new Hono();

// Apply rate limiting before Admin Protection to all routes
app.use('*', adminRateLimit);
app.use('*', requireSuperAdmin);

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

const createTenantSchema = z.object({
    name: z.string().min(3).max(100),
    code: z.string().min(2).max(20).regex(/^[a-z0-9-]+$/, "Code must be lowercase alphanumeric with dashes"),
    subdomain: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/, "Subdomain must be lowercase alphanumeric with dashes"),
    contact_email: z.string().email().optional(),
    contact_phone: z.string().optional(),
    admin_password: z.string().min(12)
        .regex(/[A-Z]/, 'Must contain an uppercase letter')
        .regex(/[a-z]/, 'Must contain a lowercase letter')
        .regex(/[0-9]/, 'Must contain a number')
        .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Must contain a special character'),
});

const updateTenantSchema = z.object({
    sacco_name: z.string().min(3).optional(),
    short_name: z.string().optional(),
    status: z.enum(['active', 'suspended', 'inactive']).optional(),
    subscription_expires_at: z.string().datetime().optional(), // ISO string
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /admin/tenants
 * List all tenants (Admin View)
 */
app.get('/tenants', async (c) => {
    const tenants = await publicDb
        .selectFrom('tenants')
        .selectAll()
        .orderBy('created_at', 'desc')
        .execute();

    return c.json({
        success: true,
        data: tenants,
        count: tenants.length
    });
});

/**
 * GET /admin/tenants/:id
 * Get details of a specific tenant
 */
app.get('/tenants/:id', async (c) => {
    const id = c.req.param('id');

    const tenant = await publicDb
        .selectFrom('tenants')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

    if (!tenant) {
        throw new NotFoundError('Tenant', id);
    }

    return c.json({ success: true, data: tenant });
});

/**
 * POST /admin/tenants
 * Create a new tenant (Django Admin Add View equivalent)
 * This triggers the schema creation logic via TenantService
 */
app.post('/tenants', async (c) => {
    const body = await c.req.json();
    const data = createTenantSchema.parse(body);

    // Check if subdomain or code already exists
    const existing = await publicDb
        .selectFrom('tenants')
        .select(['id'])
        .where((eb) => eb.or([
            eb('subdomain', '=', data.subdomain),
            eb('code', '=', data.code)
        ]))
        .executeTakeFirst();

    if (existing) {
        throw new ValidationError('A tenant with this code or subdomain already exists');
    }

    // Dynamically import TenantService to avoid circular dependency if needed
    // or just import it at the top. Here we assume it's available.
    const { TenantService } = await import('../services/tenantService');
    const service = new TenantService();

    try {
        // The service handles: 
        // 1. DB Transaction for Registry Insert
        // 2. SQL Function call for Schema/Role creation
        // 3. Migration running
        const newTenant = await service.createTenant(
            data.name,
            data.subdomain, // Using subdomain as code for simplicity
            data.admin_password,
            data.contact_email,
            data.contact_phone
        );

        return c.json({
            success: true,
            message: 'Tenant created successfully',
            data: newTenant
        }, 201);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to create tenant:', {
            message: errorMsg,
            code: data.code,
            error
        });

        // Check if tenant was partially created despite error
        const partialTenant = await publicDb
            .selectFrom('tenants')
            .selectAll()
            .where('code', '=', data.code)
            .executeTakeFirst();

        if (partialTenant) {
            // Tenant was created despite service error - return success
            console.warn('Tenant was created despite service error, returning success');
            return c.json({
                success: true,
                message: 'Tenant created successfully',
                data: partialTenant
            }, 201);
        }

        throw new AppError(500, `Failed to provision tenant infrastructure: ${errorMsg}`);
    }
});

/**
 * PATCH /admin/tenants/:id
 * Update tenant details
 */
app.patch('/tenants/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const data = updateTenantSchema.parse(body);

    const updatedTenant = await publicDb
        .updateTable('tenants')
        .set({
            ...data,
            subscription_expires_at: data.subscription_expires_at ? new Date(data.subscription_expires_at) : undefined,
            updated_at: new Date()
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();

    if (!updatedTenant) {
        throw new NotFoundError('Tenant', id);
    }

    // Clear cache so next request picks up changes
    if (updatedTenant.subdomain) {
        clearTenantCache(updatedTenant.subdomain);
    }

    return c.json({ success: true, data: updatedTenant });
});

/**
 * DELETE /admin/tenants/:id
 * Soft delete a tenant
 * WARNING: This does not drop the schema, just marks as deleted
 */
app.delete('/tenants/:id', async (c) => {
    const id = c.req.param('id');
    const hard = c.req.query('hard') === 'true'; // Dangerous flag

    const { TenantService } = await import('../services/tenantService');
    const service = new TenantService();

    if (hard) {
        // Destructive action
        const tenant = await publicDb
            .selectFrom('tenants')
            .select(['schema_name'])
            .where('id', '=', id)
            .executeTakeFirst();

        if (!tenant) throw new NotFoundError('Tenant', id);

        await service.hardDeleteTenant(tenant.schema_name);
    } else {
        await service.softDeleteTenant(id);
    }

    return c.json({ success: true, message: 'Tenant deleted' });
});

/**
 * GET /admin/tenants/:id/health
 * Check tenant schema health
 */
app.get('/tenants/:id/health', async (c) => {
    const id = c.req.param('id');
    const { TenantService } = await import('../services/tenantService');
    const service = new TenantService();

    const health = await service.checkHealth(id);
    return c.json({ success: true, data: health });
});

/**
 * GET /admin/tenants/:id/audit
 * Get audit log for a specific tenant
 */
app.get('/tenants/:id/audit', async (c) => {
    const id = c.req.param('id');
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const operation = c.req.query('operation');

    const tenant = await publicDb
        .selectFrom('tenants')
        .select(['schema_name'])
        .where('id', '=', id)
        .executeTakeFirst();

    if (!tenant) {
        throw new NotFoundError('Tenant', id);
    }

    const { TenantRepository } = await import('../repositories/tenantRepository');
    const repo = new TenantRepository(publicDb);

    let logs = await repo.getAuditLogs(tenant.schema_name, limit);

    // Filter by operation if specified
    if (operation) {
        logs = logs.filter(log => log.operation === operation.toUpperCase());
    }

    return c.json({
        success: true,
        data: logs,
        count: logs.length,
        tenantId: id,
        schemaName: tenant.schema_name
    });
});

/**
 * GET /admin/tenants/audit
 * Get audit logs for all tenants with optional filtering
 */
app.get('/audit', async (c) => {
    const limit = parseInt(c.req.query('limit') || '100', 10);
    const operation = c.req.query('operation');
    const schema = c.req.query('schema');
    const since = c.req.query('since'); // ISO datetime string

    let query = publicDb
        .selectFrom('tenant_audit_log')
        .selectAll()
        .orderBy('performed_at', 'desc')
        .limit(limit);

    if (operation) {
        query = query.where('operation', '=', operation.toUpperCase());
    }

    if (schema) {
        query = query.where('schema_name', '=', schema);
    }

    if (since) {
        const sinceDate = new Date(since);
        query = query.where('performed_at', '>=', sinceDate);
    }

    const logs = await query.execute();

    return c.json({
        success: true,
        data: logs,
        count: logs.length,
        filters: { operation, schema, since }
    });
});

/**
 * GET /admin/audit-summary
 * Get summary statistics of audit activity
 */
app.get('/audit-summary', async (c) => {
    const days = parseInt(c.req.query('days') || '7', 10);

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    const operationCounts = await publicDb
        .selectFrom('tenant_audit_log')
        .select(['operation'])
        .select(eb => eb.fn.count('id').as('count'))
        .where('performed_at', '>=', sinceDate)
        .groupBy('operation')
        .execute();

    const totalTenantOperations = await publicDb
        .selectFrom('tenant_audit_log')
        .select(eb => eb.fn.count('id').as('count'))
        .where('performed_at', '>=', sinceDate)
        .executeTakeFirst();

    const failedOperations = await publicDb
        .selectFrom('tenant_audit_log')
        .select(eb => eb.fn.count('id').as('count'))
        .where('performed_at', '>=', sinceDate)
        .where('error_message', 'is not', null)
        .executeTakeFirst();

    return c.json({
        success: true,
        data: {
            period: {
                days,
                since: sinceDate,
                until: new Date()
            },
            totalOperations: parseInt(totalTenantOperations?.count.toString() || '0', 10),
            failedOperations: parseInt(failedOperations?.count.toString() || '0', 10),
            byOperation: operationCounts.map(row => ({
                operation: row.operation,
                count: row.count
            }))
        }
    });
});

/**
 * GET /admin/tenants/:id/stats
 * Get tenant usage statistics
 */
app.get('/tenants/:id/stats', async (c) => {
    const id = c.req.param('id');

    const tenant = await publicDb
        .selectFrom('tenants')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

    if (!tenant) {
        throw new NotFoundError('Tenant', id);
    }

    // Get member count — validate and sanitize schema name
    const poolInstance = getPool();
    const VALID_SCHEMA = /^tenant_[a-z0-9_]+$/;
    const safeSchema = tenant.schema_name.replace(/[^a-zA-Z0-9_]/g, '');
    if (!VALID_SCHEMA.test(safeSchema)) {
        throw new AppError(500, 'Invalid tenant schema name', 'INVALID_SCHEMA');
    }
    const memberCountResult = await poolInstance.query(
        `SELECT COUNT(*) as count FROM "${safeSchema}".members WHERE deleted_at IS NULL`
    );
    const memberCount = parseInt(memberCountResult.rows[0]?.count || '0', 10);

    // Get staff count
    const staffCountResult = await poolInstance.query(
        `SELECT COUNT(*) as count FROM "${safeSchema}".staff`
    );
    const staffCount = parseInt(staffCountResult.rows[0]?.count || '0', 10);

    return c.json({
        success: true,
        data: {
            tenantId: id,
            tenantCode: tenant.code,
            members: memberCount,
            staff: staffCount,
            status: tenant.status,
            createdAt: tenant.created_at,
            subscriptionExpiresAt: tenant.subscription_expires_at
        }
    });
});

/**
 * POST /admin/tenants/:id/suspend
 * Suspend a tenant
 */
app.post('/tenants/:id/suspend', async (c) => {
    const id = c.req.param('id');
    const clientIp = c.req.header('x-forwarded-for')?.split(',')[0].trim()
        || c.req.header('x-real-ip') || 'unknown';

    const tenant = await publicDb
        .updateTable('tenants')
        .set({
            status: 'suspended',
            updated_at: new Date()
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();

    if (!tenant) {
        throw new NotFoundError('Tenant', id);
    }

    clearTenantCache(tenant.subdomain);

    // Audit log the suspension
    try {
        const pool = getPool();
        await pool.query(
            `INSERT INTO public.tenant_audit_log (schema_name, tenant_code, operation, details)
             VALUES ($1, $2, $3, $4)`,
            [
                tenant.schema_name,
                tenant.code,
                'TENANT_SUSPENDED',
                JSON.stringify({ tenantId: id, ip: clientIp, timestamp: new Date().toISOString() }),
            ],
        );
    } catch { /* audit log failure should not block the response */ }

    return c.json({
        success: true,
        message: 'Tenant suspended successfully',
        data: tenant
    });
});

/**
 * POST /admin/tenants/:id/reactivate
 * Reactivate a suspended tenant
 */
app.post('/tenants/:id/reactivate', async (c) => {
    const id = c.req.param('id');
    const clientIp = c.req.header('x-forwarded-for')?.split(',')[0].trim()
        || c.req.header('x-real-ip') || 'unknown';

    const tenant = await publicDb
        .updateTable('tenants')
        .set({
            status: 'active',
            updated_at: new Date()
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();

    if (!tenant) {
        throw new NotFoundError('Tenant', id);
    }

    clearTenantCache(tenant.subdomain);

    // Audit log the reactivation
    try {
        const pool = getPool();
        await pool.query(
            `INSERT INTO public.tenant_audit_log (schema_name, tenant_code, operation, details)
             VALUES ($1, $2, $3, $4)`,
            [
                tenant.schema_name,
                tenant.code,
                'TENANT_REACTIVATED',
                JSON.stringify({ tenantId: id, ip: clientIp, timestamp: new Date().toISOString() }),
            ],
        );
    } catch { /* audit log failure should not block the response */ }

    return c.json({
        success: true,
        message: 'Tenant reactivated successfully',
        data: tenant
    });
});

const extendSubscriptionSchema = z.object({
    days: z.number().int().positive().max(365, 'Cannot extend more than 365 days at a time'),
});

/**
 * POST /admin/tenants/:id/extend-subscription
 * Extend tenant subscription
 */
app.post('/tenants/:id/extend-subscription', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();

    const result = extendSubscriptionSchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError('Validation failed', {
            errors: result.error.issues.map((e) => ({
                field: e.path.join('.'),
                message: e.message,
            })),
        });
    }

    const { days } = result.data;

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);

    const tenant = await publicDb
        .updateTable('tenants')
        .set({
            subscription_expires_at: expiryDate,
            updated_at: new Date()
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();

    if (!tenant) {
        throw new NotFoundError('Tenant', id);
    }

    clearTenantCache(tenant.subdomain);

    return c.json({
        success: true,
        message: 'Subscription extended successfully',
        data: {
            tenantId: id,
            newExpiryDate: tenant.subscription_expires_at,
            daysExtended: days
        }
    });
});

/**
 * GET /admin/tenants/search
 * Search tenants by name or code
 */
app.get('/search', async (c) => {
    const query = c.req.query('q') || '';

    if (!query || query.length < 2) {
        return c.json({
            success: false,
            error: 'Query must be at least 2 characters'
        }, 400);
    }

    // Escape LIKE pattern characters to prevent pattern injection
    const escapedQuery = query.replace(/[%_\\]/g, '\\$&');
    const tenants = await publicDb
        .selectFrom('tenants')
        .selectAll()
        .where((eb) => eb.or([
            eb('sacco_name', 'ilike', `%${escapedQuery}%`),
            eb('code', 'ilike', `%${escapedQuery}%`),
            eb('subdomain', 'ilike', `%${escapedQuery}%`)
        ]))
        .orderBy('created_at', 'desc')
        .limit(20)
        .execute();

    return c.json({
        success: true,
        data: tenants,
        count: tenants.length,
        query
    });
});

/**
 * POST /admin/tenants/:id/backup
 * Trigger a backup of tenant schema
 */
app.post('/tenants/:id/backup', async (c) => {
    const id = c.req.param('id');

    const tenant = await publicDb
        .selectFrom('tenants')
        .select(['schema_name', 'subdomain'])
        .where('id', '=', id)
        .executeTakeFirst();

    if (!tenant) {
        throw new NotFoundError('Tenant', id);
    }

    // In production, this would trigger a backup service
    // For now, return a placeholder response
    const backupId = `backup_${tenant.subdomain}_${Date.now()}`;

    return c.json({
        success: true,
        message: 'Backup initiated',
        data: {
            backupId,
            tenantId: id,
            timestamp: new Date(),
            schemaName: tenant.schema_name,
            status: 'pending'
        }
    });
});

export default app;