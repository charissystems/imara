import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '../middleware/types';
import { validate, getValidatedData, commonSchemas } from '../middleware/validation';
import { ValidationError, NotFoundError } from '../middleware/errorHandler';
import { MemberRepository } from '../repositories/memberRepository';

export const memberRoutes = new Hono<Env>();

// Validation schemas
const createMemberSchema = z.object({
    first_name: z.string().min(2, 'First name must be at least 2 characters'),
    last_name: z.string().min(2, 'Last name must be at least 2 characters'),
    phone: commonSchemas.phone.optional(),
    email: commonSchemas.email.optional(),
    member_number: z.string().min(3, 'Member number must be at least 3 characters'),
    joined_date: z.string().datetime().optional(),
    status: z.enum(['active', 'inactive', 'suspended']).default('active'),
});

const updateMemberSchema = createMemberSchema.partial();

/**
 * GET /members
 * List all members for the current tenant
 * Optional query params: ?status=active
 */
memberRoutes.get('/', async (c) => {
    try {
        const { schema_name } = c.get('tenant')!;
        const status = c.req.query('status') as string | undefined;
        
        const memberRepo = new MemberRepository(schema_name);
        const members = await memberRepo.findAll(status as any);
        
        return c.json({
            success: true,
            data: members,
            meta: {
                count: members.length,
                tenant: c.get('tenant')!.code
            }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * GET /members/:id
 * Get a specific member by ID
 */
memberRoutes.get('/:id', async (c) => {
    try {
        const { id } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        
        const memberRepo = new MemberRepository(schema_name);
        const member = await memberRepo.findById(id);
        
        if (!member) {
            throw new NotFoundError('Member', id);
        }
        
        return c.json({
            success: true,
            data: member
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /members
 * Create a new member
 */
memberRoutes.post('/', validate(createMemberSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof createMemberSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        
        const memberRepo = new MemberRepository(schema_name);
        
        // Check if member number already exists
        const existing = await memberRepo.findByMemberNumber(data.member_number);
        if (existing) {
            return c.json({
                success: false,
                error: { code: 'DUPLICATE', message: 'Member number already exists' }
            }, 409);
        }
        
        const newMember = await memberRepo.create({
            ...data,
            joined_date: data.joined_date ? new Date(data.joined_date) : new Date(),
        } as any);
        
        return c.json({
            success: true,
            data: newMember,
            meta: { created: true }
        }, 201);
    } catch (error) {
        throw error;
    }
});

/**
 * PUT /members/:id
 * Update a member
 */
memberRoutes.put('/:id', validate(updateMemberSchema), async (c) => {
    try {
        const { id } = c.req.param();
        const data = getValidatedData<z.infer<typeof updateMemberSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        
        const memberRepo = new MemberRepository(schema_name);
        
        // Verify member exists
        const existing = await memberRepo.findById(id);
        if (!existing) {
            throw new NotFoundError('Member', id);
        }
        
        const updated = await memberRepo.update(id, data as any);
        
        return c.json({
            success: true,
            data: updated,
            meta: { updated: true }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * DELETE /members/:id
 * Soft delete a member
 */
memberRoutes.delete('/:id', async (c) => {
    try {
        const { id } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        
        const memberRepo = new MemberRepository(schema_name);
        
        // Verify member exists
        const existing = await memberRepo.findById(id);
        if (!existing) {
            throw new NotFoundError('Member', id);
        }
        
        await memberRepo.softDelete(id);
        
        return c.json({
            success: true,
            meta: { deleted: true }
        });
    } catch (error) {
        throw error;
    }
});
