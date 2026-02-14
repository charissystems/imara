// src/routes/admin.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '../middleware/types';
import { validate, getValidatedData, commonSchemas } from '../middleware/validation';
import { ValidationError, NotFoundError } from '../middleware/errorHandler';
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

export default app;