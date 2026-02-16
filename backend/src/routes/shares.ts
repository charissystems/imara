// src/routes/shares.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '../middleware/types';
import { validate, getValidatedData, commonSchemas } from '../middleware/validation';
import { NotFoundError, UnauthorizedError, ValidationError } from '../middleware/errorHandler';
import { ShareRepository } from '../repositories/shareRepository';
import { ShareService } from '../services/shareService';
import { hasPermission, enforcePermission } from '../middleware/rbac';

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
            data: {
                id: result.transaction.id,
                ...result,
            },
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
            data: {
                id: result.fromTransaction.id,
                ...result,
            },
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
            data: {
                id: result.declarationId,
                ...result,
            },
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

// =============================================================================
// DIGITAL SHARE CERTIFICATE (SHR-010)
// =============================================================================

/**
 * GET /shares/holdings/:id/certificate/digital
 * Get digital share certificate data for a specific holding
 */
shareRoutes.get('/holdings/:id/certificate/digital', enforcePermission('shares', 'read'), async (c) => {
    try {
        const { id } = c.req.param();
        const db = c.get('db')!;

        const holding = await db
            .selectFrom('share_holdings as sh')
            .innerJoin('share_classes as sc', 'sc.id', 'sh.share_class_id')
            .innerJoin('members as m', 'm.id', 'sh.member_id')
            .select([
                'sh.id',
                'sh.member_id',
                'sh.share_class_id',
                'sh.total_shares',
                'sh.average_cost_per_share',
                'sh.certificate_number',
                'sh.created_at',
                'sc.code as class_code',
                'sc.name as class_name',
                'sc.par_value',
                'sc.current_price',
                'm.first_name',
                'm.last_name',
                'm.member_number',
                'm.email',
            ] as any[])
            .where('sh.id', '=', id)
            .where('sh.deleted_at', 'is', null)
            .executeTakeFirst();

        if (!holding) {
            throw new NotFoundError('ShareHolding', id);
        }

        // Get SACCO info for certificate header
        const saccoConfig = await db
            .selectFrom('sacco_configuration')
            .select(['organization_name'])
            .executeTakeFirst();

        const totalValue = Number(holding.total_shares || 0) * Number(holding.current_price || 0);

        return c.json({
            success: true,
            data: {
                certificate_number: holding.certificate_number || `SC-${holding.id.substring(0, 8).toUpperCase()}`,
                organization: saccoConfig?.organization_name || 'SACCO',
                holder: {
                    name: `${holding.first_name} ${holding.last_name}`,
                    member_number: holding.member_number,
                    email: holding.email,
                },
                share_class: {
                    code: holding.class_code,
                    name: holding.class_name,
                    par_value: holding.par_value?.toString(),
                    current_price: holding.current_price?.toString(),
                },
                shares: {
                    total_shares: holding.total_shares,
                    average_cost_per_share: holding.average_cost_per_share?.toString(),
                    total_value: totalValue.toFixed(2),
                },
                issue_date: holding.created_at,
                generated_at: new Date().toISOString(),
            },
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// SHARE RETIREMENT (SHR-011)
// =============================================================================

const retireSharesSchema = z.object({
    holding_id: commonSchemas.uuid,
    shares_to_retire: z.number().int().positive('Shares to retire must be a positive integer'),
    reason: z.string().min(5, 'Reason must be at least 5 characters'),
});

/**
 * POST /shares/retire
 * Retire/buy-back shares from a member
 */
shareRoutes.post('/retire', enforcePermission('shares', 'update'), validate(retireSharesSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof retireSharesSchema>>(c);
        const user = c.get('user');
        const db = c.get('db')!;

        // Verify holding exists
        const holding = await db
            .selectFrom('share_holdings')
            .selectAll()
            .where('id', '=', data.holding_id)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

        if (!holding) {
            throw new NotFoundError('ShareHolding', data.holding_id);
        }

        // Check sufficient shares
        const currentQuantity = Number(holding.total_shares || 0);
        if (currentQuantity < data.shares_to_retire) {
            throw new ValidationError(
                `Insufficient shares to retire. Holding has ${currentQuantity}, requested ${data.shares_to_retire}.`
            );
        }

        // Get share class for pricing
        const shareClass = await db
            .selectFrom('share_classes')
            .selectAll()
            .where('id', '=', holding.share_class_id as string)
            .executeTakeFirst();

        const retirementPrice = Number(shareClass?.current_price || holding.average_cost_per_share || 0);
        const totalAmount = retirementPrice * data.shares_to_retire;
        const newQuantity = currentQuantity - data.shares_to_retire;
        const now = new Date();
        const txRef = `SR-${Date.now().toString(36).toUpperCase()}`;

        // Create share transaction for retirement
        await db
            .insertInto('share_transactions')
            .values({
                holding_id: data.holding_id,
                member_id: holding.member_id,
                share_class_id: holding.share_class_id,
                transaction_type: 'sell' as any,
                quantity: data.shares_to_retire as any,
                unit_price: String(retirementPrice) as any,
                total_amount: String(totalAmount) as any,
                transaction_date: now as any,
                reference_number: txRef,
                description: `Share retirement: ${data.reason}`,
                recorded_by: user!.id,
            } as any)
            .execute();

        // Update holding quantity
        await db
            .updateTable('share_holdings')
            .set({
                total_shares: newQuantity as any,
                updated_at: now as any,
            } as any)
            .where('id', '=', data.holding_id)
            .execute();

        return c.json({
            success: true,
            data: {
                holding_id: data.holding_id,
                member_id: holding.member_id,
                share_class_id: holding.share_class_id,
                shares_retired: data.shares_to_retire,
                retirement_price: retirementPrice,
                total_amount: totalAmount,
                remaining_quantity: newQuantity,
                reference: txRef,
                reason: data.reason,
                retired_at: now.toISOString(),
            },
            meta: { retired: true },
        }, 201);
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// FULL SHARE REGISTER (SHR-012)
// =============================================================================

/**
 * GET /shares/register/full
 * Get the full share register with member details and share class information
 */
shareRoutes.get('/register/full', enforcePermission('shares', 'read'), async (c) => {
    try {
        const db = c.get('db')!;
        const page = parseInt(c.req.query('page') || '1', 10);
        const limit = parseInt(c.req.query('limit') || '50', 10);
        const offset = (page - 1) * limit;

        // Count total entries
        const countResult = await db
            .selectFrom('share_holdings as sh')
            .innerJoin('members as m', 'm.id', 'sh.member_id')
            .innerJoin('share_classes as sc', 'sc.id', 'sh.share_class_id')
            .select(db.fn.countAll().as('total'))
            .where('sh.deleted_at', 'is', null)
            .where('sh.total_shares' as any, '>', 0 as any)
            .executeTakeFirst();

        const total = Number(countResult?.total || 0);

        // Fetch register entries
        const entries = await db
            .selectFrom('share_holdings as sh')
            .innerJoin('members as m', 'm.id', 'sh.member_id')
            .innerJoin('share_classes as sc', 'sc.id', 'sh.share_class_id')
            .select([
                'sh.id as holding_id',
                'sh.member_id',
                'sh.share_class_id',
                'sh.total_shares',
                'sh.average_cost_per_share',
                'sh.certificate_number',
                'sh.created_at as holding_since',
                'm.first_name',
                'm.last_name',
                'm.member_number',
                'm.email',
                'sc.code as class_code',
                'sc.name as class_name',
                'sc.par_value',
                'sc.current_price',
            ] as any[])
            .where('sh.deleted_at', 'is', null)
            .where('sh.total_shares' as any, '>', 0 as any)
            .orderBy('m.member_number', 'asc')
            .offset(offset)
            .limit(limit)
            .execute();

        // Calculate totals
        const totalShares = entries.reduce((sum, e) => sum + Number((e as any).total_shares || 0), 0);
        const totalValue = entries.reduce(
            (sum, e) => sum + (Number((e as any).total_shares || 0) * Number((e as any).current_price || 0)), 0
        );

        return c.json({
            success: true,
            data: entries.map(e => ({
                holding_id: e.holding_id,
                member: {
                    id: e.member_id,
                    name: `${e.first_name} ${e.last_name}`,
                    member_number: e.member_number,
                    email: e.email,
                },
                share_class: {
                    id: e.share_class_id,
                    code: e.class_code,
                    name: e.class_name,
                    par_value: e.par_value?.toString(),
                    current_price: e.current_price?.toString(),
                },
                quantity: e.quantity,
                average_cost: e.average_cost?.toString(),
                certificate_number: e.certificate_number,
                holding_since: e.holding_since,
                current_value: (Number(e.quantity || 0) * Number(e.current_price || 0)).toFixed(2),
            })),
            meta: {
                page,
                limit,
                total,
                total_pages: Math.ceil(total / limit),
                totals: {
                    total_shares: totalShares,
                    total_value: totalValue.toFixed(2),
                },
            },
        });
    } catch (error) {
        throw error;
    }
});

export default shareRoutes;

// =============================================================================
// ROUTE ALIASES AND ADDITIONAL ENDPOINTS
// =============================================================================

// Alias for purchases/:purchaseId - get single purchase
shareRoutes.get('/purchases/:purchaseId', async (c) => {
    try {
        const { purchaseId } = c.req.param();
        const db = c.get('db')!;

        const purchase = await db
            .selectFrom('share_transactions as st')
            .innerJoin('share_holdings as sh', 'sh.id', 'st.share_holding_id')
            .innerJoin('share_classes as sc', 'sc.id', 'sh.share_class_id')
            .innerJoin('members as m', 'm.id', 'st.member_id')
            .select([
                'st.id',
                'st.member_id',
                'sh.share_class_id',
                'st.quantity',
                'st.unit_price',
                'st.total_amount',
                'st.transaction_date as purchase_date',
                'st.created_at',
                'sc.name as share_class_name',
                'sc.code as share_class_code',
                'm.first_name',
                'm.last_name',
                'm.member_number',
            ])
            .where('st.id', '=', purchaseId)
            .where('st.transaction_type', '=', 'purchase')
            .executeTakeFirst();

        if (!purchase) {
            return c.json({ success: false, error: 'Purchase not found' }, 404);
        }

        return c.json({ success: true, data: purchase });
    } catch (error) {
        throw error;
    }
});

// Member holdings by member ID
shareRoutes.get('/members/:memberId/holdings', async (c) => {
    try {
        const { memberId } = c.req.param();
        const db = c.get('db')!;

        const holdings = await db
            .selectFrom('share_holdings as sh')
            .innerJoin('share_classes as sc', 'sc.id', 'sh.share_class_id')
            .select([
                'sh.id',
                'sh.member_id',
                'sh.share_class_id',
                'sh.total_shares',
                'sh.certificate_number',
                'sc.name as share_class_name',
                'sc.code as share_class_code',
                'sc.par_value',
            ])
            .where('sh.member_id', '=', memberId)
            .execute();

        return c.json({ success: true, data: holdings });
    } catch (error) {
        throw error;
    }
});

// Member share transactions
shareRoutes.get('/members/:memberId/transactions', async (c) => {
    try {
        const { memberId } = c.req.param();
        const db = c.get('db')!;

        const transactions = await db
            .selectFrom('share_transactions as st')
            .innerJoin('share_holdings as sh', 'sh.id', 'st.share_holding_id')
            .innerJoin('share_classes as sc', 'sc.id', 'sh.share_class_id')
            .select([
                'st.id',
                'st.transaction_date',
                'st.transaction_type',
                'st.quantity',
                'st.unit_price',
                'st.total_amount',
                'sc.name as share_class_name',
            ])
            .where('st.member_id', '=', memberId)
            .orderBy('st.transaction_date', 'desc')
            .execute();

        return c.json({ success: true, data: transactions });
    } catch (error) {
        throw error;
    }
});

// Transfer details by transfer ID  
shareRoutes.get('/transfers/:transferId', async (c) => {
    try {
        const { transferId } = c.req.param();
        const db = c.get('db')!;

        const transfer = await db
            .selectFrom('share_transactions as st')
            .innerJoin('share_holdings as sh', 'sh.id', 'st.share_holding_id')
            .innerJoin('share_classes as sc', 'sc.id', 'sh.share_class_id')
            .select([
                'st.id',
                'st.member_id',
                'st.counterparty_member_id',
                'sh.share_class_id',
                'st.quantity',
                'st.unit_price',
                'st.total_amount',
                'st.transaction_date as transfer_date',
                'st.status',
                'st.transaction_type',
                'sc.name as share_class_name',
            ])
            .where('st.id', '=', transferId)
            .where(({ or, eb }) =>
                or([
                    eb('st.transaction_type', '=', 'transfer_out'),
                    eb('st.transaction_type', '=', 'transfer_in')
                ])
            )
            .executeTakeFirst();

        if (!transfer) {
            return c.json({ success: false, error: 'Transfer not found' }, 404);
        }

        return c.json({ success: true, data: transfer });
    } catch (error) {
        throw error;
    }
});

// Dividend declarations list (alias to /dividends)
shareRoutes.get('/dividends/declarations', async (c) => {
    try {
        const db = c.get('db')!;
        const status = c.req.query('status');

        let query = db
            .selectFrom('dividend_declarations as dd')
            .innerJoin('share_classes as sc', 'sc.id', 'dd.share_class_id')
            .select([
                'dd.id',
                'dd.share_class_id',
                'dd.dividend_per_share',
                'dd.record_date',
                'dd.payment_date',
                'dd.created_at as declaration_date',
                'dd.total_dividend_amount',
                'dd.withholding_tax_rate',
                'dd.status',
                'sc.name as share_class_name',
                'sc.code as share_class_code',
            ])
            .orderBy('dd.created_at', 'desc');

        if (status) {
            query = query.where('dd.status', '=', status as any);
        }

        const declarations = await query.execute();

        return c.json({ success: true, data: declarations });
    } catch (error) {
        throw error;
    }
});

// Single dividend declaration
shareRoutes.get('/dividends/declarations/:declarationId', async (c) => {
    try {
        const { declarationId } = c.req.param();
        const db = c.get('db')!;

        const declaration = await db
            .selectFrom('dividend_declarations as dd')
            .innerJoin('share_classes as sc', 'sc.id', 'dd.share_class_id')
            .select([
                'dd.id',
                'dd.share_class_id',
                'dd.dividend_per_share',
                'dd.record_date',
                'dd.payment_date',
                'dd.created_at as declaration_date',
                'dd.total_dividend_amount',
                'dd.withholding_tax_rate',
                'dd.status',
                'sc.name as share_class_name',
            ])
            .where('dd.id', '=', declarationId)
            .executeTakeFirst();

        if (!declaration) {
            return c.json({ success: false, error: 'Declaration not found' }, 404);
        }

        return c.json({ success: true, data: declaration });
    } catch (error) {
        throw error;
    }
});

// Approve dividend declaration (alias to /dividends/:dividendId/approve)
shareRoutes.post('/dividends/declarations/:declarationId/approve', async (c) => {
    try {
        const { declarationId } = c.req.param();
        const db = c.get('db')!;

        const updated = await db
            .updateTable('dividend_declarations')
            .set({
                status: 'approved',
                updated_at: new Date(),
            })
            .where('id', '=', declarationId)
            .returning(['id', 'status'])
            .executeTakeFirst();

        if (!updated) {
            return c.json({ success: false, error: 'Declaration not found' }, 404);
        }

        return c.json({ success: true, data: updated });
    } catch (error) {
        throw error;
    }
});

// Member certificate
shareRoutes.get('/members/:memberId/certificate', async (c) => {
    try {
        const { memberId } = c.req.param();
        const db = c.get('db')!;

        const member = await db
            .selectFrom('members')
            .select(['id', 'first_name', 'last_name', 'member_number'])
            .where('id', '=', memberId)
            .executeTakeFirst();

        if (!member) {
            return c.json({ success: false, error: 'Member not found' }, 404);
        }

        const holdings = await db
            .selectFrom('share_holdings as sh')
            .innerJoin('share_classes as sc', 'sc.id', 'sh.share_class_id')
            .select([
                'sh.total_shares',
                'sh.certificate_number',
                'sc.name as share_class_name',
                'sc.par_value',
            ])
            .where('sh.member_id', '=', memberId)
            .where('sh.deleted_at', 'is', null)
            .execute();

        return c.json({
            success: true,
            data: {
                member_id: member.id,
                member_name: `${member.first_name} ${member.last_name}`,
                member_number: member.member_number,
                holdings,
            },
        });
    } catch (error) {
        throw error;
    }
});

// Share class analytics
shareRoutes.get('/classes/:classId/analytics', async (c) => {
    try {
        const { classId } = c.req.param();
        const db = c.get('db')!;

        const stats = await db
            .selectFrom('share_holdings')
            .select([
                db.fn.countAll().as('total_holders'),
                db.fn.sum<string>('total_shares').as('total_shares'),
            ])
            .where('share_class_id', '=', classId)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

        const purchases = await db
            .selectFrom('share_transactions as st')
            .innerJoin('share_holdings as sh', 'sh.id', 'st.share_holding_id')
            .select([
                db.fn.countAll().as('total_purchases'),
                db.fn.sum<string>('total_amount').as('total_value'),
            ])
            .where('sh.share_class_id', '=', classId)
            .where('st.transaction_type', '=', 'purchase')
            .executeTakeFirst();

        return c.json({
            success: true,
            data: {
                share_class_id: classId,
                total_holders: Number(stats?.total_holders || 0),
                total_shares: Number(stats?.total_shares || 0),
                total_purchases: Number(purchases?.total_purchases || 0),
                total_value: purchases?.total_value?.toString() || '0',
            },
        });
    } catch (error) {
        throw error;
    }
});
