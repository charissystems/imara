// src/routes/fixedDeposits.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '../middleware/types';
import { validate, getValidatedData, commonSchemas } from '../middleware/validation';
import { NotFoundError, UnauthorizedError } from '../middleware/errorHandler';
import { FixedDepositService } from '../services/fixedDepositService';
import { hasPermission, enforcePermission } from '../middleware/rbac';

export const fixedDepositRoutes = new Hono<Env>();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createProductSchema = z.object({
    code: z.string().min(1).max(20),
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    tenure_days: z.number().int().positive(),
    tenure_type: z.enum(['days', 'months', 'years']),
    minimum_amount: z.number().positive(),
    maximum_amount: z.number().positive().optional(),
    fixed_interest_rate: z.number().min(0).max(100),
    interest_paid_frequency: z.enum(['monthly', 'quarterly', 'semi_annual', 'annual', 'at_maturity']),
    interest_calculation_method: z.enum(['simple', 'compound']).optional(),
    calculation_basis: z.string().optional(),
    allows_premature_withdrawal: z.boolean().optional(),
    premature_withdrawal_penalty_type: z.enum(['fixed_amount', 'percentage', 'interest_reduction']).optional(),
    premature_withdrawal_penalty: z.number().min(0).optional(),
    allows_auto_rollover: z.boolean().optional(),
    default_rollover_type: z.enum(['principal_only', 'principal_plus_interest', 'custom']).optional(),
    withholding_tax_rate: z.number().min(0).max(100).optional(),
});

const updateProductSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().optional(),
    fixed_interest_rate: z.number().min(0).max(100).optional(),
    minimum_amount: z.number().positive().optional(),
    maximum_amount: z.number().positive().optional(),
    allows_premature_withdrawal: z.boolean().optional(),
    allows_auto_rollover: z.boolean().optional(),
    is_active: z.boolean().optional(),
});

const openFdSchema = z.object({
    member_id: commonSchemas.uuid,
    product_id: commonSchemas.uuid,
    principal_amount: z.number().positive('Principal amount must be positive'),
    maturity_action: z.enum(['auto_rollover', 'manual_action_pending']).optional(),
    funding_account_id: commonSchemas.uuid.optional(),
});

const prematureWithdrawalSchema = z.object({
    confirm: z.boolean().refine(v => v === true, 'Must confirm premature withdrawal'),
});

// =============================================================================
// FD PRODUCTS
// =============================================================================

/**
 * GET /fixed-deposits/products
 * List all FD products
 */
fixedDepositRoutes.get('/products', async (c) => {
    try {
        const db = c.get('db')!;
        const activeOnly = c.req.query('active') === 'true';

        let query = db
            .selectFrom('fixed_deposit_products')
            .selectAll()
            .where('deleted_at', 'is', null);

        if (activeOnly) {
            query = query.where('is_active', '=', true);
        }

        const products = await query.orderBy('name', 'asc').execute();

        return c.json({
            success: true,
            data: products,
            meta: { count: products.length },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * GET /fixed-deposits/products/:productId
 * Get FD product details
 */
fixedDepositRoutes.get('/products/:productId', async (c) => {
    try {
        const { productId } = c.req.param();
        const db = c.get('db')!;

        const product = await db
            .selectFrom('fixed_deposit_products')
            .selectAll()
            .where('id', '=', productId)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

        if (!product) {
            throw new NotFoundError('FixedDepositProduct', productId);
        }

        return c.json({ success: true, data: product });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /fixed-deposits/products
 * Create a new FD product (admin only)
 */
fixedDepositRoutes.post('/products', validate(createProductSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof createProductSchema>>(c);
        const user = c.get('user');
        const db = c.get('db')!;

        if (!user || !hasPermission(user.role || '', 'fixed_deposits', 'create')) {
            throw new UnauthorizedError('Insufficient permissions');
        }

        const product = await db
            .insertInto('fixed_deposit_products')
            .values({
                code: data.code,
                name: data.name,
                description: data.description || null,
                tenure_days: data.tenure_days as any,
                tenure_type: data.tenure_type as any,
                minimum_amount: String(data.minimum_amount) as any,
                maximum_amount: data.maximum_amount ? String(data.maximum_amount) as any : null,
                fixed_interest_rate: String(data.fixed_interest_rate) as any,
                interest_paid_frequency: data.interest_paid_frequency as any,
                interest_calculation_method: (data.interest_calculation_method || 'simple') as any,
                calculation_basis: data.calculation_basis || '365_days',
                allows_premature_withdrawal: data.allows_premature_withdrawal ?? false,
                premature_withdrawal_penalty_type: (data.premature_withdrawal_penalty_type || 'percentage') as any,
                premature_withdrawal_penalty: String(data.premature_withdrawal_penalty ?? 0) as any,
                allows_auto_rollover: data.allows_auto_rollover ?? true,
                default_rollover_type: (data.default_rollover_type || 'principal_only') as any,
                withholding_tax_rate: String(data.withholding_tax_rate ?? 15) as any,
                is_active: true,
                created_by: user.id,
            } as any)
            .returningAll()
            .executeTakeFirstOrThrow();

        return c.json({
            success: true,
            data: product,
            meta: { created: true },
        }, 201);
    } catch (error) {
        throw error;
    }
});

/**
 * PATCH /fixed-deposits/products/:productId
 * Update an FD product
 */
fixedDepositRoutes.patch('/products/:productId', validate(updateProductSchema), async (c) => {
    try {
        const { productId } = c.req.param();
        const data = getValidatedData<z.infer<typeof updateProductSchema>>(c);
        const user = c.get('user');
        const db = c.get('db')!;

        if (!user || !hasPermission(user.role || '', 'fixed_deposits', 'update')) {
            throw new UnauthorizedError('Insufficient permissions');
        }

        const updates: Record<string, any> = { updated_at: new Date() };
        if (data.name !== undefined) updates.name = data.name;
        if (data.description !== undefined) updates.description = data.description;
        if (data.fixed_interest_rate !== undefined) updates.fixed_interest_rate = String(data.fixed_interest_rate);
        if (data.minimum_amount !== undefined) updates.minimum_amount = String(data.minimum_amount);
        if (data.maximum_amount !== undefined) updates.maximum_amount = String(data.maximum_amount);
        if (data.allows_premature_withdrawal !== undefined) updates.allows_premature_withdrawal = data.allows_premature_withdrawal;
        if (data.allows_auto_rollover !== undefined) updates.allows_auto_rollover = data.allows_auto_rollover;
        if (data.is_active !== undefined) updates.is_active = data.is_active;

        const product = await db
            .updateTable('fixed_deposit_products')
            .set(updates as any)
            .where('id', '=', productId)
            .where('deleted_at', 'is', null)
            .returningAll()
            .executeTakeFirstOrThrow();

        return c.json({ success: true, data: product });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// FIXED DEPOSITS
// =============================================================================

/**
 * GET /fixed-deposits
 * List fixed deposits (all or by member)
 */
fixedDepositRoutes.get('/', async (c) => {
    try {
        const db = c.get('db')!;
        const user = c.get('user');
        const memberId = c.req.query('member_id');
        const status = c.req.query('status') as 'active' | 'matured' | 'closed' | 'rolled_over' | undefined;

        let query = db
            .selectFrom('fixed_deposits as fd')
            .innerJoin('fixed_deposit_products as fp', 'fp.id', 'fd.product_id')
            .innerJoin('members as m', 'm.id', 'fd.member_id')
            .select([
                'fd.id',
                'fd.member_id',
                'fd.product_id',
                'fd.certificate_number',
                'fd.principal_amount',
                'fd.interest_rate',
                'fd.deposit_date',
                'fd.maturity_date',
                'fd.interest_accrued',
                'fd.interest_paid',
                'fd.withholding_tax_amount',
                'fd.status',
                'fd.maturity_action',
                'fd.created_at',
                'fp.name as product_name',
                'fp.code as product_code',
                'm.first_name',
                'm.last_name',
                'm.member_number',
            ])
            .where('fd.deleted_at', 'is', null);

        if (memberId) {
            query = query.where('fd.member_id', '=', memberId);
        }

        if (status) {
            query = query.where('fd.status', '=', status as any);
        }

        const deposits = await query.orderBy('fd.created_at', 'desc').execute();

        return c.json({
            success: true,
            data: deposits,
            meta: { count: deposits.length },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * GET /fixed-deposits/:depositId
 * Get FD details with interest schedule
 */
fixedDepositRoutes.get('/:depositId', async (c) => {
    try {
        const { depositId } = c.req.param();
        const db = c.get('db')!;

        const deposit = await db
            .selectFrom('fixed_deposits as fd')
            .innerJoin('fixed_deposit_products as fp', 'fp.id', 'fd.product_id')
            .innerJoin('members as m', 'm.id', 'fd.member_id')
            .select([
                'fd.id',
                'fd.member_id',
                'fd.product_id',
                'fd.certificate_number',
                'fd.principal_amount',
                'fd.interest_rate',
                'fd.deposit_date',
                'fd.maturity_date',
                'fd.interest_accrued',
                'fd.interest_paid',
                'fd.withholding_tax_amount',
                'fd.status',
                'fd.maturity_action',
                'fd.maturity_action_date',
                'fd.created_at',
                'fp.name as product_name',
                'fp.code as product_code',
                'fp.tenure_days',
                'fp.tenure_type',
                'fp.interest_paid_frequency',
                'fp.allows_premature_withdrawal',
                'fp.allows_auto_rollover',
                'm.first_name',
                'm.last_name',
                'm.member_number',
                'm.email',
            ])
            .where('fd.id', '=', depositId)
            .where('fd.deleted_at', 'is', null)
            .executeTakeFirst();

        if (!deposit) {
            throw new NotFoundError('FixedDeposit', depositId);
        }

        // Get interest schedule
        const interestSchedule = await db
            .selectFrom('fd_interest_schedules')
            .selectAll()
            .where('fixed_deposit_id', '=', depositId)
            .orderBy('interest_period_number', 'asc')
            .execute();

        // Get rollovers
        const rollovers = await db
            .selectFrom('fd_rollovers')
            .selectAll()
            .where('original_fd_id', '=', depositId)
            .orderBy('rollover_date', 'desc')
            .execute();

        return c.json({
            success: true,
            data: {
                ...deposit,
                interestSchedule,
                rollovers,
            },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /fixed-deposits/open
 * Open a new fixed deposit
 */
fixedDepositRoutes.post('/open', validate(openFdSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof openFdSchema>>(c);
        const user = c.get('user');
        const db = c.get('db')!;

        if (!user || !hasPermission(user.role || '', 'fixed_deposits', 'create')) {
            throw new UnauthorizedError('Insufficient permissions to open fixed deposit');
        }

        // Get product
        const product = await db
            .selectFrom('fixed_deposit_products')
            .selectAll()
            .where('id', '=', data.product_id)
            .where('deleted_at', 'is', null)
            .where('is_active', '=', true)
            .executeTakeFirst();

        if (!product) {
            throw new NotFoundError('FixedDepositProduct', data.product_id);
        }

        // Validate amount
        const minAmount = Number(product.minimum_amount?.toString() ?? 0);
        const maxAmount = product.maximum_amount ? Number(product.maximum_amount?.toString()) : Infinity;

        if (data.principal_amount < minAmount) {
            return c.json({
                success: false,
                error: {
                    code: 'BELOW_MINIMUM',
                    message: `Minimum deposit amount is ${minAmount}`,
                },
            }, 400);
        }

        if (data.principal_amount > maxAmount) {
            return c.json({
                success: false,
                error: {
                    code: 'ABOVE_MAXIMUM',
                    message: `Maximum deposit amount is ${maxAmount}`,
                },
            }, 400);
        }

        // Verify member exists
        const member = await db
            .selectFrom('members')
            .select(['id', 'first_name', 'last_name'])
            .where('id', '=', data.member_id)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

        if (!member) {
            throw new NotFoundError('Member', data.member_id);
        }

        // Calculate maturity date
        const depositDate = new Date();
        const maturityDate = new Date(depositDate);
        const tenureDays = Number(product.tenure_days);

        if (product.tenure_type === 'months') {
            maturityDate.setMonth(maturityDate.getMonth() + tenureDays);
        } else if (product.tenure_type === 'years') {
            maturityDate.setFullYear(maturityDate.getFullYear() + tenureDays);
        } else {
            maturityDate.setDate(maturityDate.getDate() + tenureDays);
        }

        const certNumber = `FD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        const fd = await db
            .insertInto('fixed_deposits')
            .values({
                member_id: data.member_id,
                product_id: data.product_id,
                certificate_number: certNumber,
                principal_amount: String(data.principal_amount) as any,
                interest_rate: product.fixed_interest_rate as any,
                deposit_date: depositDate as any,
                maturity_date: maturityDate as any,
                total_interest_payable: '0' as any,
                interest_accrued: '0' as any,
                interest_paid: '0' as any,
                withholding_tax_amount: '0' as any,
                status: 'active' as any,
                maturity_action: (data.maturity_action || 'manual_action_pending') as any,
                recorded_by: user.id,
            } as any)
            .returningAll()
            .executeTakeFirstOrThrow();

        return c.json({
            success: true,
            data: {
                ...fd,
                product_name: product.name,
                product_code: product.code,
                member_name: `${member.first_name} ${member.last_name}`,
            },
            meta: {
                opened: true,
                maturityDate: maturityDate.toISOString().split('T')[0],
                tenureDays: product.tenure_days,
            },
        }, 201);
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// PREMATURE WITHDRAWAL
// =============================================================================

/**
 * GET /fixed-deposits/:depositId/withdrawal-preview
 * Preview premature withdrawal (calculate penalty, WHT, net payout)
 */
fixedDepositRoutes.get('/:depositId/withdrawal-preview', async (c) => {
    try {
        const { depositId } = c.req.param();
        const db = c.get('db')!;

        const fdService = new FixedDepositService(db);
        const preview = await fdService.calculatePrematureWithdrawal(depositId);

        return c.json({
            success: true,
            data: {
                depositId: preview.depositId,
                principalAmount: preview.principalAmount.toFixed(2),
                interestEarned: preview.interestEarned.toFixed(2),
                penalty: preview.penalty.toFixed(2),
                withholdingTax: preview.withholdingTax.toFixed(2),
                netPayout: preview.netPayout.toFixed(2),
            },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /fixed-deposits/:depositId/withdraw
 * Process premature withdrawal
 */
fixedDepositRoutes.post('/:depositId/withdraw', validate(prematureWithdrawalSchema), async (c) => {
    try {
        const { depositId } = c.req.param();
        const user = c.get('user');
        const db = c.get('db')!;

        if (!user || !hasPermission(user.role || '', 'fixed_deposits', 'update')) {
            throw new UnauthorizedError('Insufficient permissions');
        }

        const fdService = new FixedDepositService(db);
        const result = await fdService.processPrematureWithdrawal(depositId, user.id);

        return c.json({
            success: true,
            data: {
                depositId: result.depositId,
                principalAmount: result.principalAmount.toFixed(2),
                interestEarned: result.interestEarned.toFixed(2),
                penalty: result.penalty.toFixed(2),
                withholdingTax: result.withholdingTax.toFixed(2),
                netPayout: result.netPayout.toFixed(2),
            },
            meta: { withdrawn: true },
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// FD CERTIFICATE
// =============================================================================

/**
 * GET /fixed-deposits/:depositId/certificate
 * Get FD certificate data
 */
fixedDepositRoutes.get('/:depositId/certificate', async (c) => {
    try {
        const { depositId } = c.req.param();
        const db = c.get('db')!;

        const fd = await db
            .selectFrom('fixed_deposits as fd')
            .innerJoin('fixed_deposit_products as fp', 'fp.id', 'fd.product_id')
            .innerJoin('members as m', 'm.id', 'fd.member_id')
            .select([
                'fd.certificate_number',
                'fd.principal_amount',
                'fd.interest_rate',
                'fd.deposit_date',
                'fd.maturity_date',
                'fd.status',
                'fp.name as product_name',
                'fp.code as product_code',
                'fp.tenure_days',
                'fp.tenure_type',
                'm.first_name',
                'm.last_name',
                'm.member_number',
            ])
            .where('fd.id', '=', depositId)
            .where('fd.deleted_at', 'is', null)
            .executeTakeFirst();

        if (!fd) {
            throw new NotFoundError('FixedDeposit', depositId);
        }

        const saccoConfig = await db
            .selectFrom('sacco_configuration')
            .select(['organization_name'])
            .executeTakeFirst();

        return c.json({
            success: true,
            data: {
                certificateNumber: fd.certificate_number,
                memberName: `${fd.first_name} ${fd.last_name}`,
                memberNumber: fd.member_number,
                productName: fd.product_name,
                productCode: fd.product_code,
                principalAmount: fd.principal_amount?.toString(),
                interestRate: fd.interest_rate?.toString(),
                depositDate: fd.deposit_date,
                maturityDate: fd.maturity_date,
                tenure: `${fd.tenure_days} ${fd.tenure_type}`,
                status: fd.status,
                saccoName: saccoConfig?.organization_name || 'SACCO',
                generatedAt: new Date().toISOString(),
            },
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// FD MATURITY ALERTS
// =============================================================================

/**
 * GET /fixed-deposits/:depositId/alerts
 * Get maturity alerts for an FD
 */
fixedDepositRoutes.get('/:depositId/alerts', async (c) => {
    try {
        const { depositId } = c.req.param();
        const db = c.get('db')!;

        const alerts = await db
            .selectFrom('fd_maturity_alerts')
            .selectAll()
            .where('fixed_deposit_id', '=', depositId)
            .orderBy('days_before', 'desc')
            .execute();

        return c.json({
            success: true,
            data: alerts,
            meta: { count: alerts.length },
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// MATURING FDs (FD-010)
// =============================================================================

/**
 * GET /fixed-deposits/maturing
 * List fixed deposits maturing within N days
 */
fixedDepositRoutes.get('/maturing', enforcePermission('fixed_deposits', 'read'), async (c) => {
    try {
        const db = c.get('db')!;
        const days = parseInt(c.req.query('days') || '30', 10);

        const now = new Date();
        const cutoffDate = new Date(now);
        cutoffDate.setDate(cutoffDate.getDate() + days);

        const maturingDeposits = await db
            .selectFrom('fixed_deposits as fd')
            .innerJoin('members as m', 'm.id', 'fd.member_id')
            .innerJoin('fixed_deposit_products as fp', 'fp.id', 'fd.product_id')
            .select([
                'fd.id',
                'fd.certificate_number',
                'fd.member_id',
                'fd.product_id',
                'fd.principal_amount',
                'fd.interest_rate',
                'fd.deposit_date',
                'fd.maturity_date',
                'fd.interest_accrued',
                'fd.status',
                'fd.maturity_action',
                'm.first_name',
                'm.last_name',
                'm.member_number',
                'm.phone',
                'm.email',
                'fp.name as product_name',
                'fp.code as product_code',
            ] as any[])
            .where('fd.maturity_date', '<=', cutoffDate as any)
            .where('fd.maturity_date', '>=', now as any)
            .where('fd.status', '=', 'active' as any)
            .where('fd.deleted_at', 'is', null)
            .orderBy('fd.maturity_date', 'asc')
            .execute();

        return c.json({
            success: true,
            data: maturingDeposits.map(fd => ({
                id: fd.id,
                certificate_number: fd.certificate_number,
                member: {
                    id: fd.member_id,
                    name: `${fd.first_name} ${fd.last_name}`,
                    member_number: fd.member_number,
                    phone: fd.phone,
                    email: fd.email,
                },
                product: {
                    id: fd.product_id,
                    name: fd.product_name,
                    code: fd.product_code,
                },
                principal_amount: fd.principal_amount?.toString(),
                interest_rate: fd.interest_rate?.toString(),
                interest_accrued: fd.interest_accrued?.toString(),
                deposit_date: fd.deposit_date,
                maturity_date: fd.maturity_date,
                days_to_maturity: Math.ceil(
                    (new Date(fd.maturity_date as any).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
                ),
                maturity_action: fd.maturity_action,
            })),
            meta: {
                count: maturingDeposits.length,
                days_window: days,
                as_of: now.toISOString(),
            },
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// FD MATURITY ALERT CONFIG (FD-011)
// =============================================================================

const alertConfigSchema = z.object({
    days_before: z.number().int().positive('Days before must be a positive integer'),
    alert_type: z.enum(['sms', 'email', 'both']),
    recipient_id: commonSchemas.uuid.optional(),
});

/**
 * POST /fixed-deposits/:id/alert-config
 * Configure maturity alert for a fixed deposit
 */
fixedDepositRoutes.post('/:id/alert-config', enforcePermission('fixed_deposits', 'update'), validate(alertConfigSchema), async (c) => {
    try {
        const { id } = c.req.param();
        const data = getValidatedData<z.infer<typeof alertConfigSchema>>(c);
        const user = c.get('user');
        const db = c.get('db')!;

        // Verify FD exists
        const fd = await db
            .selectFrom('fixed_deposits')
            .select(['id', 'member_id', 'certificate_number', 'maturity_date', 'status'])
            .where('id', '=', id)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

        if (!fd) {
            throw new NotFoundError('FixedDeposit', id);
        }

        const now = new Date();

        // Insert alert configuration
        const alertConfig = await db
            .insertInto('fd_maturity_alerts')
            .values({
                fixed_deposit_id: id,
                days_before: data.days_before as any,
                alert_type: data.alert_type as any,
                recipient_id: data.recipient_id || fd.member_id,
                is_sent: false as any,
                created_by: user!.id,
                created_at: now as any,
            } as any)
            .returningAll()
            .executeTakeFirstOrThrow();

        return c.json({
            success: true,
            data: {
                id: alertConfig.id,
                fixed_deposit_id: id,
                certificate_number: fd.certificate_number,
                maturity_date: fd.maturity_date,
                days_before: data.days_before,
                alert_type: data.alert_type,
                recipient_id: data.recipient_id || fd.member_id,
                alert_date: (() => {
                    const alertDate = new Date(fd.maturity_date as any);
                    alertDate.setDate(alertDate.getDate() - data.days_before);
                    return alertDate.toISOString().split('T')[0];
                })(),
                created_at: now.toISOString(),
            },
            meta: { created: true },
        }, 201);
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// FD LEDGER (FD-012)
// =============================================================================

/**
 * GET /fixed-deposits/ledger
 * Get FD ledger with interest schedules
 */
fixedDepositRoutes.get('/ledger', enforcePermission('fixed_deposits', 'read'), async (c) => {
    try {
        const db = c.get('db')!;
        const page = parseInt(c.req.query('page') || '1', 10);
        const limit = parseInt(c.req.query('limit') || '50', 10);
        const offset = (page - 1) * limit;
        const statusFilter = c.req.query('status') as string | undefined;

        // Count total
        let countQuery = db
            .selectFrom('fixed_deposits as fd')
            .select(db.fn.countAll().as('total'))
            .where('fd.deleted_at', 'is', null);

        if (statusFilter) {
            countQuery = countQuery.where('fd.status', '=', statusFilter as any);
        }

        const countResult = await countQuery.executeTakeFirst();
        const total = Number(countResult?.total || 0);

        // Fetch FD entries
        let fdQuery = db
            .selectFrom('fixed_deposits as fd')
            .innerJoin('fixed_deposit_products as fp', 'fp.id', 'fd.product_id')
            .innerJoin('members as m', 'm.id', 'fd.member_id')
            .select([
                'fd.id',
                'fd.certificate_number',
                'fd.member_id',
                'fd.product_id',
                'fd.principal_amount',
                'fd.interest_rate',
                'fd.deposit_date',
                'fd.maturity_date',
                'fd.interest_accrued',
                'fd.interest_paid',
                'fd.withholding_tax_amount',
                'fd.total_interest_payable',
                'fd.status',
                'fd.maturity_action',
                'fp.name as product_name',
                'fp.code as product_code',
                'fp.interest_paid_frequency',
                'm.first_name',
                'm.last_name',
                'm.member_number',
            ])
            .where('fd.deleted_at', 'is', null);

        if (statusFilter) {
            fdQuery = fdQuery.where('fd.status', '=', statusFilter as any);
        }

        const deposits = await fdQuery
            .orderBy('fd.deposit_date', 'desc')
            .offset(offset)
            .limit(limit)
            .execute();

        // Fetch interest schedules for these FDs
        const fdIds = deposits.map(d => d.id);
        let interestSchedules: any[] = [];

        if (fdIds.length > 0) {
            interestSchedules = await db
                .selectFrom('fd_interest_schedules')
                .selectAll()
                .where('fixed_deposit_id', 'in', fdIds)
                .orderBy('fixed_deposit_id', 'asc')
                .orderBy('interest_period_number', 'asc')
                .execute();
        }

        // Group schedules by FD
        const schedulesByFd: Record<string, any[]> = {};
        for (const schedule of interestSchedules) {
            const fdId = schedule.fixed_deposit_id as string;
            if (!schedulesByFd[fdId]) {
                schedulesByFd[fdId] = [];
            }
            schedulesByFd[fdId].push({
                period_number: schedule.interest_period_number,
                period_start: schedule.period_start_date,
                period_end: schedule.period_end_date,
                interest_amount: schedule.interest_amount?.toString(),
                withholding_tax: schedule.withholding_tax?.toString(),
                net_interest: schedule.net_interest?.toString(),
                status: schedule.status,
                paid_date: schedule.paid_date,
            });
        }

        return c.json({
            success: true,
            data: deposits.map(fd => ({
                id: fd.id,
                certificate_number: fd.certificate_number,
                member: {
                    id: fd.member_id,
                    name: `${fd.first_name} ${fd.last_name}`,
                    member_number: fd.member_number,
                },
                product: {
                    id: fd.product_id,
                    name: fd.product_name,
                    code: fd.product_code,
                    interest_paid_frequency: fd.interest_paid_frequency,
                },
                principal_amount: fd.principal_amount?.toString(),
                interest_rate: fd.interest_rate?.toString(),
                deposit_date: fd.deposit_date,
                maturity_date: fd.maturity_date,
                interest_accrued: fd.interest_accrued?.toString(),
                interest_paid: fd.interest_paid?.toString(),
                total_interest_payable: fd.total_interest_payable?.toString(),
                withholding_tax_amount: fd.withholding_tax_amount?.toString(),
                status: fd.status,
                maturity_action: fd.maturity_action,
                interest_schedule: schedulesByFd[fd.id] || [],
            })),
            meta: {
                page,
                limit,
                total,
                total_pages: Math.ceil(total / limit),
                status_filter: statusFilter || 'all',
            },
        });
    } catch (error) {
        throw error;
    }
});

export default fixedDepositRoutes;
