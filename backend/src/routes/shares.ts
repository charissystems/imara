// src/routes/shares.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '../middleware/types';
import { validate, getValidatedData, commonSchemas } from '../middleware/validation';
import { NotFoundError, UnauthorizedError } from '../middleware/errorHandler';
import { ShareRepository } from '../repositories/shareRepository';
import { ShareService } from '../services/shareService';
import { hasPermission } from '../middleware/rbac';

export const shareRoutes = new Hono<Env>();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createShareClassSchema = z.object({
    code: z.string().min(1).max(20),
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    par_value: z.number().positive(),
    current_price: z.number().positive(),
    minimum_shares: z.number().int().positive().optional(),
    maximum_shares: z.number().int().positive().optional(),
    dividend_eligible: z.boolean().optional(),
    dividend_percentage: z.number().min(0).max(100).optional(),
});

const updateShareClassSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().optional(),
    current_price: z.number().positive().optional(),
    minimum_shares: z.number().int().positive().optional(),
    maximum_shares: z.number().int().positive().optional(),
    dividend_eligible: z.boolean().optional(),
    dividend_percentage: z.number().min(0).max(100).optional(),
    is_active: z.boolean().optional(),
});

const purchaseSharesSchema = z.object({
    member_id: commonSchemas.uuid,
    share_class_id: commonSchemas.uuid,
    quantity: z.number().int().positive('Quantity must be a positive integer'),
    unit_price: z.number().positive().optional(),
    payment_method: z.enum(['cash', 'mobile_money', 'bank_transfer', 'savings_deduction']),
    payment_reference: z.string().optional(),
});

const transferSharesSchema = z.object({
    from_member_id: commonSchemas.uuid,
    to_member_id: commonSchemas.uuid,
    share_class_id: commonSchemas.uuid,
    quantity: z.number().int().positive('Quantity must be a positive integer'),
    transfer_price: z.number().positive().optional(),
});

const declareDividendSchema = z.object({
    share_class_id: commonSchemas.uuid,
    dividend_per_share: z.number().positive(),
    record_date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    payment_date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    withholding_tax_rate: z.number().min(0).max(100).optional(),
});

const approveDividendSchema = z.object({
    action: z.enum(['approve', 'reject']),
});

// =============================================================================
// SHARE CLASSES
// =============================================================================

/**
 * GET /shares/classes
 * List all share classes
 */
shareRoutes.get('/classes', async (c) => {
    try {
        const { schema_name } = c.get('tenant')!;
        const activeOnly = c.req.query('active') === 'true';
        const shareRepo = new ShareRepository(schema_name);

        const classes = await shareRepo.findAllClasses(activeOnly);

        return c.json({
            success: true,
            data: classes,
            meta: { count: classes.length },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * GET /shares/classes/:classId
 * Get share class details
 */
shareRoutes.get('/classes/:classId', async (c) => {
    try {
        const { classId } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const shareRepo = new ShareRepository(schema_name);

        const shareClass = await shareRepo.findClassById(classId);
        if (!shareClass) {
            throw new NotFoundError('ShareClass', classId);
        }

        return c.json({ success: true, data: shareClass });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /shares/classes
 * Create a new share class (admin only)
 */
shareRoutes.post('/classes', validate(createShareClassSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof createShareClassSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');

        if (!user || !hasPermission(user.role || '', 'shares', 'create')) {
            throw new UnauthorizedError('Insufficient permissions');
        }

        const shareRepo = new ShareRepository(schema_name);

        const shareClass = await shareRepo.createClass({
            code: data.code,
            name: data.name,
            description: data.description || null,
            par_value: String(data.par_value) as any,
            current_price: String(data.current_price) as any,
            minimum_shares: data.minimum_shares,
            maximum_shares: data.maximum_shares || null,
            dividend_eligible: data.dividend_eligible ?? true,
            dividend_percentage: data.dividend_percentage != null ? String(data.dividend_percentage) as any : null,
            is_active: true,
            created_by: user.id,
        } as any);

        return c.json({
            success: true,
            data: shareClass,
            meta: { created: true },
        }, 201);
    } catch (error) {
        throw error;
    }
});

/**
 * PATCH /shares/classes/:classId
 * Update a share class
 */
shareRoutes.patch('/classes/:classId', validate(updateShareClassSchema), async (c) => {
    try {
        const { classId } = c.req.param();
        const data = getValidatedData<z.infer<typeof updateShareClassSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');

        if (!user || !hasPermission(user.role || '', 'shares', 'update')) {
            throw new UnauthorizedError('Insufficient permissions');
        }

        const shareRepo = new ShareRepository(schema_name);
        const updates: Record<string, any> = {};

        if (data.name !== undefined) updates.name = data.name;
        if (data.description !== undefined) updates.description = data.description;
        if (data.current_price !== undefined) updates.current_price = String(data.current_price);
        if (data.minimum_shares !== undefined) updates.minimum_shares = data.minimum_shares;
        if (data.maximum_shares !== undefined) updates.maximum_shares = data.maximum_shares;
        if (data.dividend_eligible !== undefined) updates.dividend_eligible = data.dividend_eligible;
        if (data.dividend_percentage !== undefined) updates.dividend_percentage = String(data.dividend_percentage);
        if (data.is_active !== undefined) updates.is_active = data.is_active;

        const updated = await shareRepo.updateClass(classId, updates as any);

        return c.json({ success: true, data: updated });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// SHARE PURCHASE
// =============================================================================

/**
 * POST /shares/purchase
 * Purchase shares for a member
 */
shareRoutes.post('/purchase', validate(purchaseSharesSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof purchaseSharesSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');
        const db = c.get('db')!;

        if (!user || !hasPermission(user.role || '', 'shares', 'create')) {
            throw new UnauthorizedError('Insufficient permissions to process share purchase');
        }

        const shareService = new ShareService(db);

        const result = await shareService.purchaseShares({
            memberId: data.member_id,
            shareClassId: data.share_class_id,
            quantity: data.quantity,
            unitPrice: data.unit_price ? String(data.unit_price) : undefined,
            paymentMethod: data.payment_method,
            paymentReference: data.payment_reference,
            recordedBy: user.id,
        });

        return c.json({
            success: true,
            data: result,
            meta: { purchased: true },
        }, 201);
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// SHARE TRANSFER
// =============================================================================

/**
 * POST /shares/transfer
 * Transfer shares between members
 */
shareRoutes.post('/transfer', validate(transferSharesSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof transferSharesSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');
        const db = c.get('db')!;

        if (!user || !hasPermission(user.role || '', 'shares', 'update')) {
            throw new UnauthorizedError('Insufficient permissions for share transfer');
        }

        const shareService = new ShareService(db);

        const result = await shareService.transferShares({
            fromMemberId: data.from_member_id,
            toMemberId: data.to_member_id,
            shareClassId: data.share_class_id,
            quantity: data.quantity,
            transferPrice: data.transfer_price ? String(data.transfer_price) : undefined,
            initiatedBy: user.id,
            approvedBy: user.id,
        });

        return c.json({
            success: true,
            data: result,
            meta: { transferred: true },
        }, 201);
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// SHARE HOLDINGS
// =============================================================================

/**
 * GET /shares/holdings
 * List holdings for current member or all (admin)
 */
shareRoutes.get('/holdings', async (c) => {
    try {
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');
        const memberId = c.req.query('member_id');
        const shareRepo = new ShareRepository(schema_name);

        let holdings;
        if (memberId && user && hasPermission(user.role || '', 'shares', 'read')) {
            holdings = await shareRepo.findHoldingsByMemberId(memberId);
        } else if (user?.memberId) {
            holdings = await shareRepo.findHoldingsByMemberId(user.memberId);
        } else {
            // Admin: list all holdings
            holdings = await shareRepo.findHoldingsByMemberId(''); // Returns empty for safety
            // Use the register endpoint for full listing
        }

        return c.json({
            success: true,
            data: holdings,
            meta: { count: holdings.length },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * GET /shares/holdings/:holdingId
 * Get holding details
 */
shareRoutes.get('/holdings/:holdingId', async (c) => {
    try {
        const { holdingId } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const shareRepo = new ShareRepository(schema_name);

        const holding = await shareRepo.findHoldingById(holdingId);
        if (!holding) {
            throw new NotFoundError('ShareHolding', holdingId);
        }

        return c.json({ success: true, data: holding });
    } catch (error) {
        throw error;
    }
});

/**
 * GET /shares/holdings/:holdingId/transactions
 * Get transactions for a holding
 */
shareRoutes.get('/holdings/:holdingId/transactions', async (c) => {
    try {
        const { holdingId } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const shareRepo = new ShareRepository(schema_name);

        const transactions = await shareRepo.findTransactionsByHoldingId(holdingId);

        return c.json({
            success: true,
            data: transactions,
            meta: { count: transactions.length },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * GET /shares/holdings/:holdingId/certificate
 * Get share certificate data (for PDF generation)
 */
shareRoutes.get('/holdings/:holdingId/certificate', async (c) => {
    try {
        const { holdingId } = c.req.param();
        const db = c.get('db')!;

        const shareService = new ShareService(db);
        const certData = await shareService.getShareCertificateData(holdingId);

        return c.json({ success: true, data: certData });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// DIVIDENDS
// =============================================================================

/**
 * GET /shares/dividends
 * List dividend declarations
 */
shareRoutes.get('/dividends', async (c) => {
    try {
        const { schema_name } = c.get('tenant')!;
        const shareClassId = c.req.query('share_class_id');
        const shareRepo = new ShareRepository(schema_name);

        if (!shareClassId) {
            return c.json({
                success: false,
                error: { code: 'MISSING_PARAM', message: 'share_class_id query parameter required' },
            }, 400);
        }

        const dividends = await shareRepo.findDividendsByClassId(shareClassId);

        return c.json({
            success: true,
            data: dividends,
            meta: { count: dividends.length },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /shares/dividends/declare
 * Declare a dividend (creates in draft status)
 */
shareRoutes.post('/dividends/declare', validate(declareDividendSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof declareDividendSchema>>(c);
        const user = c.get('user');
        const db = c.get('db')!;

        if (!user || !hasPermission(user.role || '', 'shares', 'create')) {
            throw new UnauthorizedError('Insufficient permissions to declare dividend');
        }

        const shareService = new ShareService(db);

        const result = await shareService.declareDividend({
            shareClassId: data.share_class_id,
            dividendPerShare: String(data.dividend_per_share),
            recordDate: new Date(data.record_date),
            paymentDate: new Date(data.payment_date),
            withholdingTaxRate: data.withholding_tax_rate != null ? String(data.withholding_tax_rate) : undefined,
            declaredBy: user.id,
        });

        return c.json({
            success: true,
            data: result,
            meta: { declared: true },
        }, 201);
    } catch (error) {
        throw error;
    }
});

/**
 * PATCH /shares/dividends/:dividendId/approve
 * Approve or reject a dividend declaration
 */
shareRoutes.patch('/dividends/:dividendId/approve', validate(approveDividendSchema), async (c) => {
    try {
        const { dividendId } = c.req.param();
        const data = getValidatedData<z.infer<typeof approveDividendSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');

        if (!user || !hasPermission(user.role || '', 'shares', 'approve')) {
            throw new UnauthorizedError('Insufficient permissions to approve dividend');
        }

        const shareRepo = new ShareRepository(schema_name);
        // We need to find by class ID — but we have the declaration ID
        // Use direct DB query via repo's db:
        const db = c.get('db')!;

        const declaration = await db
            .selectFrom('dividend_declarations')
            .selectAll()
            .where('id', '=', dividendId)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

        if (!declaration) {
            throw new NotFoundError('DividendDeclaration', dividendId);
        }

        if (declaration.status !== 'draft') {
            return c.json({
                success: false,
                error: { code: 'INVALID_STATUS', message: `Cannot ${data.action} a declaration in '${declaration.status}' status` },
            }, 400);
        }

        const newStatus = data.action === 'approve' ? 'approved' : 'draft';

        await db
            .updateTable('dividend_declarations')
            .set({
                status: newStatus as any,
                approved_by: data.action === 'approve' ? user.id : null,
                approved_at: data.action === 'approve' ? new Date() as any : null,
                updated_at: new Date() as any,
            })
            .where('id', '=', dividendId)
            .execute();

        return c.json({
            success: true,
            data: { id: dividendId, status: newStatus },
            meta: { action: data.action },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /shares/dividends/:dividendId/distribute
 * Distribute an approved dividend to all holders
 */
shareRoutes.post('/dividends/:dividendId/distribute', async (c) => {
    try {
        const { dividendId } = c.req.param();
        const user = c.get('user');
        const db = c.get('db')!;

        if (!user || !hasPermission(user.role || '', 'shares', 'approve')) {
            throw new UnauthorizedError('Insufficient permissions to distribute dividend');
        }

        const shareService = new ShareService(db);
        const result = await shareService.distributeDividend(dividendId, user.id);

        return c.json({
            success: true,
            data: result,
            meta: { distributed: true },
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// SHARE REGISTER
// =============================================================================

/**
 * GET /shares/register
 * Get share register (all members' holdings)
 */
shareRoutes.get('/register', async (c) => {
    try {
        const shareClassId = c.req.query('share_class_id');
        const db = c.get('db')!;

        const shareService = new ShareService(db);
        const register = await shareService.getShareRegister(shareClassId);

        return c.json({
            success: true,
            data: register,
            meta: { count: register.length },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * GET /shares/register/member/:memberId
 * Get share register entries for a specific member
 */
shareRoutes.get('/register/member/:memberId', async (c) => {
    try {
        const { memberId } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const shareRepo = new ShareRepository(schema_name);

        const entries = await shareRepo.findRegisterByMemberId(memberId);

        return c.json({
            success: true,
            data: entries,
            meta: { count: entries.length },
        });
    } catch (error) {
        throw error;
    }
});

export default shareRoutes;
