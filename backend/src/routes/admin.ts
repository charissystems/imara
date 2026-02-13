// src/routes/admin.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '../middleware/types';
import { validate, getValidatedData, commonSchemas } from '../middleware/validation';
import { ValidationError, NotFoundError } from '../middleware/errorHandler';
import { dbManager } from '../config/database'; // Import only if you need to switch schemas (rare)

const app = new Hono<Env>();

// NOTE: The 'tenantResolver' middleware has already run by the time we get here.
// c.get('db') is already connected to the correct tenant schema.
// c.get('tenant') contains the SACCO's details (name, id, etc.)

/**
 * GET /admin/staff
 * List all staff members for THIS specific SACCO
 */
app.get('/staff', async (c) => {
    const db = c.get('db'); // This is the Kysely instance for the tenant schema

    const staff = await db
        .selectFrom('staff')
        .innerJoin('members', 'members.id', 'staff.member_id')
        .select([
            'staff.id',
            'staff.staff_number',
            'staff.work_email',
            'staff.job_title',
            'members.first_name',
            'members.last_name',
        ])
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
    const db = c.get('db');
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
        })
        .returningAll()
        .executeTakeFirstOrThrow();

    return c.json({
        success: true,
        message: 'Member created',
        data: newMember
    }, 201);
});

const createStaffSchema = z.object({
    member_id: commonSchemas.uuid,
    staff_number: z.string().min(3).max(10),
    work_email: commonSchemas.email,
    job_title: z.string(),
    role_id: commonSchemas.uuid.optional(),
    hire_date: commonSchemas.date.optional(),
});

type CreateStaffInput = z.infer<typeof createStaffSchema>;

/**
 * POST /admin/staff
 * Create a new staff member for THIS specific SACCO
 */
app.post('/staff', validate(createStaffSchema), async (c) => {
    const db = c.get('db');
    const data = getValidatedData<CreateStaffInput>(c);
    const currentTenantId = c.get('tenant').id; // For audit logging if needed

    // Check if member exists
    const member = await db
        .selectFrom('members')
        .select('id')
        .where('id', '=', data.member_id)
        .executeTakeFirst();

    if (!member) {
        throw new NotFoundError('Member', data.member_id);
    }

    const newStaff = await db
        .insertInto('staff')
        .values({
            member_id: data.member_id,
            staff_number: data.staff_number,
            work_email: data.work_email,
            job_title: data.job_title,
            role_id: data.role_id,
            hire_date: data.hire_date || new Date().toISOString().split('T')[0], // Default to today
            // employment_status defaults to 'active'
        })
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
    const db = c.get('db');
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
    const db = c.get('db');

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
            sacco_name: c.get('tenant').sacco_name,
            active_members: memberCount?.total || 0,
            // Add more tenant-specific stats here
        }
    });
});

export default app;