// src/routes/admin.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '../middleware/types';
import { validate, getValidatedData, commonSchemas } from '../middleware/validation';
import { ValidationError, NotFoundError } from '../middleware/errorHandler';
import { enforcePermission } from '../middleware/rbac';
import { dbManager } from '../config/database'; // Import only if you need to switch schemas (rare)
import { getJobScheduler } from '../jobs/scheduler';
import type { JobType } from '../jobs/scheduler';

const app = new Hono<Env>();

// NOTE: The 'tenantResolver' middleware has already run by the time we get here.
// c.get('db') is already connected to the correct tenant schema.
// c.get('tenant') contains the SACCO's details (name, id, etc.)

/**
 * GET /admin/staff
 * List all staff members for THIS specific SACCO
 */
app.get('/staff', async (c) => {
    const db = c.get('db')!; // This is the Kysely instance for the tenant schema

    const staff = await db
        .selectFrom('staff')
        .select([
            'staff.id',
            'staff.staff_number',
            'staff.first_name',
            'staff.last_name',
            'staff.email',
            'staff.position',
            'staff.department',
            'staff.status',
        ])
        .where('staff.deleted_at', 'is', null)
        .orderBy('staff.created_at', 'desc')
        .execute();

    return c.json({
        success: true,
        data: staff
    });
});


const createMemberSchema = z.object({
    first_name: z.string().min(2),
    last_name: z.string().min(2),
    // Use generic phone/email regex or commonSchemas if available, but for now just string
    phone: commonSchemas.phone,
    email: commonSchemas.email,
    member_number: z.string().min(3),
    joined_date: commonSchemas.date,
    gender: z.enum(['male', 'female', 'other', 'unknown']).default('unknown'),
    marital_status: z.enum(['single', 'married', 'divorced', 'widowed']).default('single'),
});

type CreateMemberInput = z.infer<typeof createMemberSchema>;

/**
 * POST /admin/members
 * Create a new member (Required for creating staff)
 */
app.post('/members', validate(createMemberSchema), async (c) => {
    const db = c.get('db')!;
    const data = getValidatedData<CreateMemberInput>(c);

    const newMember = await db
        .insertInto('members')
        .values({
            first_name: data.first_name,
            last_name: data.last_name,
            phone: data.phone,
            email: data.email,
            member_number: data.member_number,
            joined_date: data.joined_date,
            gender: data.gender,
            marital_status: data.marital_status,
            status: 'active'
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();

    return c.json({
        success: true,
        message: 'Member created',
        data: newMember
    }, 201);
});

const createStaffSchema = z.object({
    staff_number: z.string().min(3).max(10),
    first_name: z.string().min(2),
    last_name: z.string().min(2),
    email: commonSchemas.email,
    phone: commonSchemas.phone.optional(),
    position: z.string().optional(),
    department: z.string().optional(),
    role_id: commonSchemas.uuid.optional(),
    hire_date: commonSchemas.date.optional(),
});

type CreateStaffInput = z.infer<typeof createStaffSchema>;

/**
 * POST /admin/staff
 * Create a new staff member for THIS specific SACCO
 */
app.post('/staff', validate(createStaffSchema), async (c) => {
    const db = c.get('db')!;
    const data = getValidatedData<CreateStaffInput>(c);

    // Check if email already exists
    const existing = await db
        .selectFrom('staff')
        .select('id')
        .where('email', '=', data.email)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

    if (existing) {
        throw new ValidationError('Email already registered for a staff member');
    }

    const newStaff = await db
        .insertInto('staff')
        .values({
            staff_number: data.staff_number,
            first_name: data.first_name,
            last_name: data.last_name,
            email: data.email,
            phone: data.phone ?? null,
            position: data.position ?? null,
            department: data.department ?? null,
            role_id: data.role_id ?? null,
            hire_date: data.hire_date || new Date().toISOString().split('T')[0],
            status: 'active',
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();

    return c.json({
        success: true,
        message: 'Staff member added',
        data: newStaff
    }, 201);
});

/**
 * PATCH /admin/staff/:id
 * Update staff details
 */
app.patch('/staff/:id', async (c) => {
    const db = c.get('db')!;
    const id = c.req.param('id');
    const body = await c.req.json();

    // Ensure we are only updating staff belonging to this tenant
    // (Implicitly guaranteed because 'db' only connects to this tenant)

    const updated = await db
        .updateTable('staff')
        .set({ ...body, updated_at: new Date() })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();

    if (!updated) {
        throw new NotFoundError('Staff', id);
    }

    return c.json({ success: true, data: updated });
});

/**
 * GET /admin/dashboard
 * Get stats specific to this SACCO
 */
app.get('/dashboard', async (c) => {
    const db = c.get('db')!;

    // Example: Count active members in THIS tenant's DB
    const memberCount = await db
        .selectFrom('members')
        .select((eb) => [
            eb.fn.count('members.id').as('total')
        ])
        .where('status', '=', 'active')
        .executeTakeFirst();

    return c.json({
        success: true,
        data: {
            sacco_name: c.get('tenant')!.sacco_name,
            active_members: memberCount?.total || 0,
            // Add more tenant-specific stats here
        }
    });
});

// =============================================================================
// JOB SCHEDULER ADMIN
// =============================================================================

const VALID_JOB_TYPES: JobType[] = [
    'interest_accrual',
    'interest_posting',
    'penalty_calculation',
    'npl_flagging',
    'repayment_reminders',
];

const triggerJobSchema = z.object({
    job_type: z.enum(VALID_JOB_TYPES as [string, ...string[]]),
    as_of_date: commonSchemas.date.optional(),
});

/**
 * POST /admin/jobs/trigger
 * Manually trigger a scheduled job for this tenant.
 */
app.post('/jobs/trigger', validate(triggerJobSchema), async (c) => {
    const data = getValidatedData<z.infer<typeof triggerJobSchema>>(c);
    const tenant = c.get('tenant')!;

    try {
        const scheduler = getJobScheduler();
        const jobId = await scheduler.triggerJob(
            data.job_type as JobType,
            tenant.id,
            tenant.schema_name,
            data.as_of_date ? new Date(data.as_of_date) : undefined,
        );

        return c.json({
            success: true,
            data: { jobId, jobType: data.job_type },
            meta: { message: `Job ${data.job_type} queued successfully` },
        });
    } catch (error) {
        return c.json({
            success: false,
            error: {
                code: 'SCHEDULER_ERROR',
                message: `Failed to trigger job: ${(error as Error).message}`,
            },
        }, 500);
    }
});

/**
 * GET /admin/jobs/stats
 * Get job queue statistics.
 */
app.get('/jobs/stats', async (c) => {
    try {
        const scheduler = getJobScheduler();
        const stats = await scheduler.getStats();

        return c.json({ success: true, data: stats });
    } catch (error) {
        return c.json({
            success: false,
            error: {
                code: 'SCHEDULER_ERROR',
                message: `Failed to get stats: ${(error as Error).message}`,
            },
        }, 500);
    }
});

// =============================================================================
// VALIDATION SCHEMAS — Configuration, Fee Schedules, Transaction Limits
// =============================================================================

const updateConfigSchema = z.object({
    sacco_name: z.string().optional(),
    registration_number: z.string().optional(),
    physical_address: z.string().optional(),
    postal_address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    website: z.string().optional(),
    logo_url: z.string().optional(),
});

type UpdateConfigInput = z.infer<typeof updateConfigSchema>;

const fiscalYearSchema = z.object({
    fiscal_year_start_month: z.number().int().min(1).max(12),
    fiscal_year_end_month: z.number().int().min(1).max(12),
});

type FiscalYearInput = z.infer<typeof fiscalYearSchema>;

const createFeeScheduleSchema = z.object({
    code: z.string().min(2),
    name: z.string().min(2),
    description: z.string().optional(),
    fee_type: z.enum(['registration', 'account_maintenance', 'withdrawal', 'loan_processing', 'late_payment', 'exit', 'transfer', 'statement', 'card_issuance', 'other']),
    amount: z.number().min(0),
    calculation_method: z.enum(['fixed', 'percentage', 'tiered']).default('fixed'),
    percentage_rate: z.number().min(0).max(100).optional(),
    minimum_fee: z.number().min(0).optional(),
    maximum_fee: z.number().min(0).optional(),
    applicable_to: z.enum(['all_members', 'savings', 'loans', 'shares', 'fixed_deposits', 'transfers', 'withdrawals']),
    is_active: z.boolean().default(true),
    effective_from: z.string(),
    effective_to: z.string().optional(),
});

type CreateFeeScheduleInput = z.infer<typeof createFeeScheduleSchema>;

const updateFeeScheduleSchema = createFeeScheduleSchema.partial();

type UpdateFeeScheduleInput = z.infer<typeof updateFeeScheduleSchema>;

const createTransactionLimitSchema = z.object({
    role: z.string(),
    channel: z.enum(['teller', 'mobile', 'ussd', 'agent', 'portal', 'api']),
    transaction_type: z.enum(['deposit', 'withdrawal', 'transfer', 'loan_disbursement', 'loan_repayment', 'share_purchase']),
    per_transaction_limit: z.number().positive(),
    daily_limit: z.number().positive(),
    monthly_limit: z.number().positive().optional(),
    requires_approval_above: z.number().positive().optional(),
    is_active: z.boolean().default(true),
});

type CreateTransactionLimitInput = z.infer<typeof createTransactionLimitSchema>;

const updateTransactionLimitSchema = createTransactionLimitSchema.partial();

type UpdateTransactionLimitInput = z.infer<typeof updateTransactionLimitSchema>;

// =============================================================================
// SACCO CONFIGURATION
// =============================================================================

/**
 * GET /admin/config
 * Get SACCO configuration
 */
app.get('/config', enforcePermission('configuration', 'read'), async (c) => {
    const db = c.get('db')!;

    const config = await db
        .selectFrom('sacco_configuration')
        .selectAll()
        .executeTakeFirst();

    return c.json({
        success: true,
        data: config ?? null,
        meta: { description: 'SACCO configuration' },
    });
});

/**
 * PUT /admin/config
 * Update organization profile
 */
app.put('/config', enforcePermission('configuration', 'update'), validate(updateConfigSchema), async (c) => {
    const db = c.get('db')!;
    const user = c.get('user');
    const data = getValidatedData<UpdateConfigInput>(c);

    const updated = await db
        .updateTable('sacco_configuration')
        .set({
            ...data,
            updated_by: user!.id,
            updated_at: new Date(),
        } as any)
        .returningAll()
        .executeTakeFirst();

    if (!updated) {
        throw new NotFoundError('SaccoConfiguration', 'default');
    }

    return c.json({
        success: true,
        data: updated,
        meta: { message: 'Configuration updated successfully' },
    });
});

/**
 * GET /admin/config/fiscal-year
 * Get fiscal year setting
 */
app.get('/config/fiscal-year', enforcePermission('configuration', 'read'), async (c) => {
    const db = c.get('db')!;

    const setting = await db
        .selectFrom('system_settings')
        .selectAll()
        .where('setting_key', '=', 'fiscal_year')
        .executeTakeFirst();

    return c.json({
        success: true,
        data: setting ?? null,
        meta: { description: 'Fiscal year setting' },
    });
});

/**
 * PUT /admin/config/fiscal-year
 * Update fiscal year setting
 */
app.put('/config/fiscal-year', enforcePermission('configuration', 'update'), validate(fiscalYearSchema), async (c) => {
    const db = c.get('db')!;
    const data = getValidatedData<FiscalYearInput>(c);

    const existing = await db
        .selectFrom('system_settings')
        .select('id')
        .where('setting_key', '=', 'fiscal_year')
        .executeTakeFirst();

    let result;
    if (existing) {
        result = await db
            .updateTable('system_settings')
            .set({
                setting_value: JSON.stringify(data),
                value_type: 'json',
                updated_at: new Date(),
            } as any)
            .where('setting_key', '=', 'fiscal_year')
            .returningAll()
            .executeTakeFirstOrThrow();
    } else {
        result = await db
            .insertInto('system_settings')
            .values({
                setting_key: 'fiscal_year',
                setting_value: JSON.stringify(data),
                value_type: 'json',
                description: 'Fiscal year start and end months',
                is_configurable: true,
            } as any)
            .returningAll()
            .executeTakeFirstOrThrow();
    }

    return c.json({
        success: true,
        data: result,
        meta: { message: 'Fiscal year setting updated successfully' },
    });
});

// =============================================================================
// FEE SCHEDULES
// =============================================================================

/**
 * GET /admin/fee-schedules
 * List fee schedules with optional filters
 */
app.get('/fee-schedules', enforcePermission('fee_schedules', 'read'), async (c) => {
    const db = c.get('db')!;

    const feeType = c.req.query('fee_type');
    const isActive = c.req.query('is_active');

    let query = db
        .selectFrom('fee_schedules')
        .selectAll()
        .where('deleted_at', 'is', null)
        .orderBy('created_at', 'desc');

    if (feeType) {
        query = query.where('fee_type', '=', feeType as any);
    }

    if (isActive !== undefined) {
        query = query.where('is_active', '=', isActive === 'true');
    }

    const feeSchedules = await query.execute();

    return c.json({
        success: true,
        data: feeSchedules,
        meta: { total: feeSchedules.length },
    });
});

/**
 * GET /admin/fee-schedules/:id
 * Get a single fee schedule by ID
 */
app.get('/fee-schedules/:id', enforcePermission('fee_schedules', 'read'), async (c) => {
    const db = c.get('db')!;
    const id = c.req.param('id');

    const feeSchedule = await db
        .selectFrom('fee_schedules')
        .selectAll()
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

    if (!feeSchedule) {
        throw new NotFoundError('FeeSchedule', id);
    }

    return c.json({
        success: true,
        data: feeSchedule,
    });
});

/**
 * POST /admin/fee-schedules
 * Create a new fee schedule
 */
app.post('/fee-schedules', enforcePermission('fee_schedules', 'create'), validate(createFeeScheduleSchema), async (c) => {
    const db = c.get('db')!;
    const user = c.get('user');
    const data = getValidatedData<CreateFeeScheduleInput>(c);

    const newFeeSchedule = await db
        .insertInto('fee_schedules')
        .values({
            code: data.code,
            name: data.name,
            description: data.description ?? null,
            fee_type: data.fee_type,
            amount: String(data.amount) as any,
            calculation_method: data.calculation_method,
            percentage_rate: data.percentage_rate !== undefined ? String(data.percentage_rate) as any : null,
            minimum_fee: data.minimum_fee !== undefined ? String(data.minimum_fee) as any : null,
            maximum_fee: data.maximum_fee !== undefined ? String(data.maximum_fee) as any : null,
            applicable_to: data.applicable_to,
            is_active: data.is_active,
            effective_from: data.effective_from,
            effective_to: data.effective_to ?? null,
            created_by: user!.id,
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();

    return c.json({
        success: true,
        data: newFeeSchedule,
        meta: { message: 'Fee schedule created successfully' },
    }, 201);
});

/**
 * PUT /admin/fee-schedules/:id
 * Update an existing fee schedule
 */
app.put('/fee-schedules/:id', enforcePermission('fee_schedules', 'update'), validate(updateFeeScheduleSchema), async (c) => {
    const db = c.get('db')!;
    const id = c.req.param('id');
    const data = getValidatedData<UpdateFeeScheduleInput>(c);

    const updatePayload: Record<string, unknown> = {
        ...data,
        updated_at: new Date(),
    };

    // Convert financial values to strings for decimal columns
    if (data.amount !== undefined) {
        updatePayload.amount = String(data.amount) as any;
    }
    if (data.percentage_rate !== undefined) {
        updatePayload.percentage_rate = String(data.percentage_rate) as any;
    }
    if (data.minimum_fee !== undefined) {
        updatePayload.minimum_fee = String(data.minimum_fee) as any;
    }
    if (data.maximum_fee !== undefined) {
        updatePayload.maximum_fee = String(data.maximum_fee) as any;
    }

    const updated = await db
        .updateTable('fee_schedules')
        .set(updatePayload as any)
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();

    if (!updated) {
        throw new NotFoundError('FeeSchedule', id);
    }

    return c.json({
        success: true,
        data: updated,
        meta: { message: 'Fee schedule updated successfully' },
    });
});

/**
 * DELETE /admin/fee-schedules/:id
 * Soft-delete a fee schedule
 */
app.delete('/fee-schedules/:id', enforcePermission('fee_schedules', 'delete'), async (c) => {
    const db = c.get('db')!;
    const id = c.req.param('id');

    const deleted = await db
        .updateTable('fee_schedules')
        .set({
            deleted_at: new Date().toISOString(),
            is_active: false,
            updated_at: new Date(),
        } as any)
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();

    if (!deleted) {
        throw new NotFoundError('FeeSchedule', id);
    }

    return c.json({
        success: true,
        data: deleted,
        meta: { message: 'Fee schedule deleted successfully' },
    });
});

// =============================================================================
// TRANSACTION LIMITS
// =============================================================================

/**
 * GET /admin/transaction-limits
 * List transaction limits with optional filters
 */
app.get('/transaction-limits', enforcePermission('transaction_limits', 'read'), async (c) => {
    const db = c.get('db')!;

    const role = c.req.query('role');
    const channel = c.req.query('channel');

    let query = db
        .selectFrom('transaction_limits')
        .selectAll()
        .where('deleted_at', 'is', null)
        .orderBy('created_at', 'desc');

    if (role) {
        query = query.where('role', '=', role);
    }

    if (channel) {
        query = query.where('channel', '=', channel as any);
    }

    const limits = await query.execute();

    return c.json({
        success: true,
        data: limits,
        meta: { total: limits.length },
    });
});

/**
 * POST /admin/transaction-limits
 * Create a new transaction limit
 */
app.post('/transaction-limits', enforcePermission('transaction_limits', 'create'), validate(createTransactionLimitSchema), async (c) => {
    const db = c.get('db')!;
    const user = c.get('user');
    const data = getValidatedData<CreateTransactionLimitInput>(c);

    const newLimit = await db
        .insertInto('transaction_limits')
        .values({
            role: data.role,
            channel: data.channel,
            transaction_type: data.transaction_type,
            per_transaction_limit: String(data.per_transaction_limit) as any,
            daily_limit: String(data.daily_limit) as any,
            monthly_limit: data.monthly_limit !== undefined ? String(data.monthly_limit) as any : null,
            requires_approval_above: data.requires_approval_above !== undefined ? String(data.requires_approval_above) as any : null,
            is_active: data.is_active,
            created_by: user!.id,
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();

    return c.json({
        success: true,
        data: newLimit,
        meta: { message: 'Transaction limit created successfully' },
    }, 201);
});

/**
 * PUT /admin/transaction-limits/:id
 * Update an existing transaction limit
 */
app.put('/transaction-limits/:id', enforcePermission('transaction_limits', 'update'), validate(updateTransactionLimitSchema), async (c) => {
    const db = c.get('db')!;
    const id = c.req.param('id');
    const data = getValidatedData<UpdateTransactionLimitInput>(c);

    const updatePayload: Record<string, unknown> = {
        ...data,
        updated_at: new Date(),
    };

    // Convert financial values to strings for decimal columns
    if (data.per_transaction_limit !== undefined) {
        updatePayload.per_transaction_limit = String(data.per_transaction_limit) as any;
    }
    if (data.daily_limit !== undefined) {
        updatePayload.daily_limit = String(data.daily_limit) as any;
    }
    if (data.monthly_limit !== undefined) {
        updatePayload.monthly_limit = String(data.monthly_limit) as any;
    }
    if (data.requires_approval_above !== undefined) {
        updatePayload.requires_approval_above = String(data.requires_approval_above) as any;
    }

    const updated = await db
        .updateTable('transaction_limits')
        .set(updatePayload as any)
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();

    if (!updated) {
        throw new NotFoundError('TransactionLimit', id);
    }

    return c.json({
        success: true,
        data: updated,
        meta: { message: 'Transaction limit updated successfully' },
    });
});

// =============================================================================
// SCHEDULED TASKS
// =============================================================================

/**
 * GET /admin/scheduled-tasks
 * List scheduled tasks with their latest execution log
 */
app.get('/scheduled-tasks', enforcePermission('configuration', 'read'), async (c) => {
    const db = c.get('db')!;

    const tasks = await db
        .selectFrom('scheduled_tasks')
        .leftJoin('scheduled_task_logs', (join) =>
            join
                .onRef('scheduled_task_logs.task_id', '=', 'scheduled_tasks.id')
                .on('scheduled_task_logs.id', '=', (eb) =>
                    eb
                        .selectFrom('scheduled_task_logs as stl')
                        .select('stl.id')
                        .whereRef('stl.task_id', '=', 'scheduled_tasks.id')
                        .orderBy('stl.execution_start', 'desc')
                        .limit(1)
                )
        )
        .select([
            'scheduled_tasks.id',
            'scheduled_tasks.task_name',
            'scheduled_tasks.description',
            'scheduled_tasks.cron_expression',
            'scheduled_tasks.task_type',
            'scheduled_tasks.is_active',
            'scheduled_tasks.last_execution_at',
            'scheduled_tasks.last_execution_status',
            'scheduled_tasks.next_execution_at',
            'scheduled_tasks.created_at',
            'scheduled_task_logs.execution_start as last_run_start',
            'scheduled_task_logs.execution_end as last_run_end',
            'scheduled_task_logs.execution_status as last_run_status',
            'scheduled_task_logs.records_processed as last_run_records_processed',
            'scheduled_task_logs.records_failed as last_run_records_failed',
            'scheduled_task_logs.error_message as last_run_error',
        ])
        .orderBy('scheduled_tasks.task_name', 'asc')
        .execute();

    return c.json({
        success: true,
        data: tasks,
        meta: { total: tasks.length },
    });
});

export default app;