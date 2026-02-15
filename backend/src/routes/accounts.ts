// src/routes/accounts.ts
import { Hono } from 'hono';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { Env } from '../middleware/types';
import { validate, getValidatedData, commonSchemas } from '../middleware/validation';
import { ValidationError, NotFoundError, UnauthorizedError } from '../middleware/errorHandler';
import { AccountRepository } from '../repositories/accountRepository';
import { SavingsService } from '../services/savingsService';
import { hasPermission, enforcePermission } from '../middleware/rbac';

export const accountRoutes = new Hono<Env>();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createAccountSchema = z.object({
    member_id: commonSchemas.uuid,
    product_id: commonSchemas.uuid,
    account_number: z.string().min(3, 'Account number required'),
});

const depositSchema = z.object({
    savings_account_id: commonSchemas.uuid,
    member_id: commonSchemas.uuid,
    amount: z.number().positive('Amount must be positive'),
    payment_method: z.enum(['cash', 'mobile_money', 'bank_transfer', 'cheque', 'internal']),
    payment_reference: z.string().optional(),
    description: z.string().optional(),
});

const withdrawalSchema = z.object({
    savings_account_id: commonSchemas.uuid,
    member_id: commonSchemas.uuid,
    amount: z.number().positive('Amount must be positive'),
    payout_method: z.enum(['cash', 'mobile_money', 'bank_transfer', 'cheque']),
    payout_reference: z.string().optional(),
    payout_account: z.string().optional(),
    description: z.string().optional(),
});

const transferSchema = z.object({
    from_account_id: commonSchemas.uuid,
    to_account_id: commonSchemas.uuid,
    amount: z.number().positive('Amount must be positive'),
    description: z.string().optional(),
});

const closeAccountSchema = z.object({
    closure_reason: z.string().optional(),
});

const batchDepositSchema = z.object({
    deposits: z.array(z.object({
        savings_account_id: commonSchemas.uuid,
        member_id: commonSchemas.uuid,
        amount: z.number().positive(),
        payment_method: z.enum(['cash', 'mobile_money', 'bank_transfer', 'cheque', 'internal']),
        payment_reference: z.string().optional(),
        description: z.string().optional(),
    })).min(1, 'At least one deposit required').max(500, 'Maximum 500 deposits per batch'),
});

const createSavingsProductSchema = z.object({
    code: z.string().min(1).max(20),
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    interest_rate: z.number().min(0).max(100),
    interest_paid_frequency: z.enum(['monthly', 'quarterly', 'annually', 'on_withdrawal']),
    interest_calculation_method: z.enum(['simple', 'compound']).optional(),
    minimum_balance: z.number().min(0).optional(),
    maximum_balance: z.number().positive().optional(),
    allows_overdraft: z.boolean().optional(),
    overdraft_limit: z.number().min(0).optional(),
});

const updateSavingsProductSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().optional(),
    interest_rate: z.number().min(0).max(100).optional(),
    minimum_balance: z.number().min(0).optional(),
    maximum_balance: z.number().positive().optional(),
    is_active: z.boolean().optional(),
});

// =============================================================================
// ACCOUNTS
// =============================================================================

/**
 * GET /accounts
 * List all accounts for current member (or all accounts if admin)
 */
accountRoutes.get('/', async (c) => {
    try {
        const { schema_name } = c.get('tenant')!;
        const currentUser = c.get('user');
        const accountRepo = new AccountRepository(schema_name);

        let accounts;
        if (currentUser?.role === 'member') {
            accounts = await accountRepo.findAccountsByMemberId(currentUser.id);
        } else {
            accounts = await accountRepo.findAllAccounts();
        }

        return c.json({
            success: true,
            data: accounts,
            meta: { count: accounts.length }
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// SAVINGS PRODUCTS (registered before /:accountId to avoid route collision)
// =============================================================================

/**
 * GET /accounts/products
 * List all savings products
 */
accountRoutes.get('/products', async (c) => {
    try {
        const db = c.get('db')!;
        const activeOnly = c.req.query('active') === 'true';

        let query = db
            .selectFrom('savings_products')
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
 * GET /accounts/products/:productId
 * Get savings product details
 */
accountRoutes.get('/products/:productId', async (c) => {
    try {
        const { productId } = c.req.param();
        const db = c.get('db')!;

        const product = await db
            .selectFrom('savings_products')
            .selectAll()
            .where('id', '=', productId)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

        if (!product) {
            throw new NotFoundError('SavingsProduct', productId);
        }

        return c.json({ success: true, data: product });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /accounts/products
 * Create a new savings product (admin only)
 */
accountRoutes.post('/products', validate(createSavingsProductSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof createSavingsProductSchema>>(c);
        const user = c.get('user');
        const db = c.get('db')!;

        if (!user || !hasPermission(user.role || '', 'savings_products', 'create')) {
            throw new UnauthorizedError('Insufficient permissions');
        }

        const product = await db
            .insertInto('savings_products')
            .values({
                code: data.code,
                name: data.name,
                description: data.description || null,
                interest_rate: String(data.interest_rate) as any,
                interest_paid_frequency: data.interest_paid_frequency as any,
                interest_calculation_method: (data.interest_calculation_method || 'simple') as any,
                minimum_balance: String(data.minimum_balance ?? 0) as any,
                maximum_balance: data.maximum_balance ? String(data.maximum_balance) as any : null,
                allows_overdraft: data.allows_overdraft ?? false,
                overdraft_limit: String(data.overdraft_limit ?? 0) as any,
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
 * PATCH /accounts/products/:productId
 * Update a savings product
 */
accountRoutes.patch('/products/:productId', validate(updateSavingsProductSchema), async (c) => {
    try {
        const { productId } = c.req.param();
        const data = getValidatedData<z.infer<typeof updateSavingsProductSchema>>(c);
        const user = c.get('user');
        const db = c.get('db')!;

        if (!user || !hasPermission(user.role || '', 'savings_products', 'update')) {
            throw new UnauthorizedError('Insufficient permissions');
        }

        const updates: Record<string, any> = { updated_at: new Date() };
        if (data.name !== undefined) updates.name = data.name;
        if (data.description !== undefined) updates.description = data.description;
        if (data.interest_rate !== undefined) updates.interest_rate = String(data.interest_rate);
        if (data.minimum_balance !== undefined) updates.minimum_balance = String(data.minimum_balance);
        if (data.maximum_balance !== undefined) updates.maximum_balance = String(data.maximum_balance);
        if (data.is_active !== undefined) updates.is_active = data.is_active;

        const product = await db
            .updateTable('savings_products')
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

/**
 * GET /accounts/:accountId
 * Get account details
 */
accountRoutes.get('/:accountId', async (c) => {
    try {
        const { accountId } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const currentUser = c.get('user');
        const accountRepo = new AccountRepository(schema_name);

        const account = await accountRepo.findById(accountId);
        if (!account) {
            throw new NotFoundError('Account', accountId);
        }

        // Authorization: member can only see own account
        if (currentUser?.role === 'member' && account.member_id !== currentUser.id) {
            throw new UnauthorizedError('Cannot access other members\' accounts');
        }

        return c.json({
            success: true,
            data: account
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /accounts
 * Create a new savings account
 */
accountRoutes.post('/', validate(createAccountSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof createAccountSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const currentUser = c.get('user');
        const accountRepo = new AccountRepository(schema_name);

        // Authorization: member creates own account, admin creates for others
        if (currentUser?.role === 'member' && data.member_id !== currentUser.id) {
            throw new UnauthorizedError('Members can only create their own accounts');
        }

        const account = await accountRepo.create({
            member_id: data.member_id,
            product_id: data.product_id,
            account_number: data.account_number,
            status: 'active',
            principal_balance: '0',
            interest_accrued: '0',
            interest_paid: '0',
            opened_date: new Date(),
            created_by: currentUser?.id,
        } as any);

        return c.json({
            success: true,
            data: account,
            meta: { created: true }
        }, 201);
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// DEPOSITS
// =============================================================================

/**
 * POST /accounts/deposit
 * Record a deposit
 */
accountRoutes.post('/deposit', validate(depositSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof depositSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const currentUser = c.get('user');
        const accountRepo = new AccountRepository(schema_name);
        const savingsService = new SavingsService();

        // Verify account exists
        const account = await accountRepo.findById(data.savings_account_id);
        if (!account) {
            throw new NotFoundError('Account', data.savings_account_id);
        }

        // Create deposit record
        const depositNumber = savingsService.generateTransactionReference();
        const deposit = await accountRepo.createDeposit({
            savings_account_id: data.savings_account_id,
            member_id: data.member_id,
            deposit_number: depositNumber,
            amount: String(data.amount),
            deposit_date: new Date(),
            payment_method: data.payment_method,
            payment_reference: data.payment_reference || null,
            status: 'posted',
            description: data.description || null,
            recorded_by: currentUser?.id || null,
        } as any);

        // Update account balance
        const newBalance = Number(account.principal_balance) + data.amount;
        const updatedAccount = await accountRepo.update(data.savings_account_id, {
            principal_balance: String(newBalance),
        } as any);

        return c.json({
            success: true,
            data: { deposit, account: updatedAccount },
            meta: { deposited: true }
        }, 201);
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// WITHDRAWALS
// =============================================================================

/**
 * GET /accounts/:accountId/withdrawals
 * List withdrawal requests for an account
 */
accountRoutes.get('/:accountId/withdrawals', async (c) => {
    try {
        const { accountId } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const accountRepo = new AccountRepository(schema_name);

        const withdrawals = await accountRepo.findWithdrawalsByAccountId(accountId);

        return c.json({
            success: true,
            data: withdrawals,
            meta: { count: withdrawals.length }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /accounts/withdrawal
 * Request or record a withdrawal
 */
accountRoutes.post('/withdrawal', validate(withdrawalSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof withdrawalSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const currentUser = c.get('user');
        const accountRepo = new AccountRepository(schema_name);
        const savingsService = new SavingsService();

        // Verify account exists
        const account = await accountRepo.findById(data.savings_account_id);
        if (!account) {
            throw new NotFoundError('Account', data.savings_account_id);
        }

        // Authorization: member can only withdraw from own account
        if (currentUser?.role === 'member' && account.member_id !== currentUser.id) {
            throw new UnauthorizedError('Cannot withdraw from other members\' accounts');
        }

        // Validate sufficient balance
        const currentBalance = Number(account.principal_balance);
        if (data.amount > currentBalance) {
            return c.json({
                success: false,
                error: { code: 'INSUFFICIENT_FUNDS', message: 'Insufficient balance' }
            }, 400);
        }

        // Check if withdrawal requires approval
        const requiresApproval = savingsService.requiresWithdrawalApproval(data.amount);

        const withdrawalNumber = savingsService.generateTransactionReference();
        const withdrawal = await accountRepo.createWithdrawal({
            savings_account_id: data.savings_account_id,
            member_id: data.member_id,
            withdrawal_number: withdrawalNumber,
            amount: String(data.amount),
            withdrawal_date: new Date(),
            payout_method: data.payout_method,
            payout_reference: data.payout_reference || null,
            payout_account: data.payout_account || null,
            status: requiresApproval ? 'pending' : 'completed',
            description: data.description || null,
            requested_by: currentUser?.id || null,
        } as any);

        // If no approval required, update balance immediately
        if (!requiresApproval) {
            await accountRepo.update(data.savings_account_id, {
                principal_balance: String(currentBalance - data.amount),
            } as any);
        }

        return c.json({
            success: true,
            data: withdrawal,
            meta: {
                requiresApproval,
                status: requiresApproval ? 'pending' : 'completed'
            }
        }, 201);
    } catch (error) {
        throw error;
    }
});

/**
 * PATCH /accounts/withdrawals/:withdrawalId/approve
 * Approve a pending withdrawal
 */
accountRoutes.patch('/withdrawals/:withdrawalId/approve', async (c) => {
    try {
        const { withdrawalId } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');

        if (!user || !hasPermission(user.role || '', 'withdrawals', 'approve')) {
            throw new UnauthorizedError('Insufficient permissions to approve withdrawals');
        }

        const accountRepo = new AccountRepository(schema_name);

        const withdrawal = await accountRepo.findWithdrawalById(withdrawalId);
        if (!withdrawal) {
            throw new NotFoundError('Withdrawal', withdrawalId);
        }

        if (withdrawal.status !== 'pending') {
            return c.json({
                success: false,
                error: { code: 'INVALID_STATUS', message: 'Withdrawal is not pending' }
            }, 400);
        }

        // Approve withdrawal
        const updated = await accountRepo.updateWithdrawal(withdrawalId, {
            status: 'approved',
            approved_by: user.id,
            approved_at: new Date(),
        } as any);

        // Update account balance
        const account = await accountRepo.findById(withdrawal.savings_account_id);
        if (account) {
            const newBalance = Number(account.principal_balance) - Number(withdrawal.amount);
            await accountRepo.update(withdrawal.savings_account_id, {
                principal_balance: String(newBalance),
            } as any);
        }

        return c.json({
            success: true,
            data: updated,
            meta: { approved: true }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * PATCH /accounts/withdrawals/:withdrawalId/reject
 * Reject a pending withdrawal
 */
accountRoutes.patch('/withdrawals/:withdrawalId/reject', async (c) => {
    try {
        const { withdrawalId } = c.req.param();
        const body = await c.req.json();
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');

        if (!user || !hasPermission(user.role || '', 'withdrawals', 'approve')) {
            throw new UnauthorizedError('Insufficient permissions to reject withdrawals');
        }

        const accountRepo = new AccountRepository(schema_name);

        const withdrawal = await accountRepo.findWithdrawalById(withdrawalId);
        if (!withdrawal) {
            throw new NotFoundError('Withdrawal', withdrawalId);
        }

        const updated = await accountRepo.updateWithdrawal(withdrawalId, {
            status: 'rejected',
        } as any);

        return c.json({
            success: true,
            data: updated,
            meta: { rejected: true }
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// TRANSFERS
// =============================================================================

/**
 * POST /accounts/transfer
 * Transfer funds between accounts
 */
accountRoutes.post('/transfer', validate(transferSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof transferSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const currentUser = c.get('user');
        const accountRepo = new AccountRepository(schema_name);
        const savingsService = new SavingsService();

        // Verify both accounts exist
        const fromAccount = await accountRepo.findById(data.from_account_id);
        const toAccount = await accountRepo.findById(data.to_account_id);

        if (!fromAccount || !toAccount) {
            throw new NotFoundError('Account', 'One or both accounts not found');
        }

        // Authorization
        if (currentUser?.role === 'member' && fromAccount.member_id !== currentUser.id) {
            throw new UnauthorizedError('Cannot transfer from other members\' accounts');
        }

        // Validate sufficient balance
        const fromBalance = Number(fromAccount.principal_balance);
        if (fromBalance < data.amount) {
            return c.json({
                success: false,
                error: { code: 'INSUFFICIENT_FUNDS', message: 'Insufficient balance' }
            }, 400);
        }

        const transferNumber = savingsService.generateTransactionReference();

        // Create transfer record
        const transfer = await accountRepo.createTransfer({
            from_account_id: data.from_account_id,
            to_account_id: data.to_account_id,
            transfer_number: transferNumber,
            amount: String(data.amount),
            transfer_date: new Date(),
            status: 'posted',
            description: data.description || null,
            initiated_by: currentUser?.id || null,
        } as any);

        // Update both account balances
        const toBalance = Number(toAccount.principal_balance);
        await accountRepo.update(data.from_account_id, {
            principal_balance: String(fromBalance - data.amount),
        } as any);

        await accountRepo.update(data.to_account_id, {
            principal_balance: String(toBalance + data.amount),
        } as any);

        return c.json({
            success: true,
            data: transfer,
            meta: { transferred: true, reference: transferNumber }
        }, 201);
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// ACCOUNT CLOSURE
// =============================================================================

/**
 * PATCH /accounts/:accountId/close
 * Close an account
 */
accountRoutes.patch('/:accountId/close', validate(closeAccountSchema), async (c) => {
    try {
        const { accountId } = c.req.param();
        const data = getValidatedData<z.infer<typeof closeAccountSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const currentUser = c.get('user');
        const accountRepo = new AccountRepository(schema_name);

        const account = await accountRepo.findById(accountId);
        if (!account) {
            throw new NotFoundError('Account', accountId);
        }

        // Authorization
        if (currentUser?.role === 'member' && account.member_id !== currentUser.id) {
            throw new UnauthorizedError('Cannot close other members\' accounts');
        }

        const closedAccount = await accountRepo.update(accountId, {
            status: 'closed',
            closed_date: new Date(),
        } as any);

        return c.json({
            success: true,
            data: closedAccount,
            meta: { closed: true }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * GET /accounts/:accountId/deposits
 * Get deposit history for an account
 */
accountRoutes.get('/:accountId/deposits', async (c) => {
    try {
        const { accountId } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const currentUser = c.get('user');
        const accountRepo = new AccountRepository(schema_name);

        // Verify account exists and user has access
        const account = await accountRepo.findById(accountId);
        if (!account) {
            throw new NotFoundError('Account', accountId);
        }

        if (currentUser?.role === 'member' && account.member_id !== currentUser.id) {
            throw new UnauthorizedError('Cannot access other members\' deposits');
        }

        const deposits = await accountRepo.findDepositsByAccountId(accountId);

        return c.json({
            success: true,
            data: deposits,
            meta: { count: deposits.length }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * GET /accounts/:accountId/transfers
 * Get transfer history for an account
 */
accountRoutes.get('/:accountId/transfers', async (c) => {
    try {
        const { accountId } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const currentUser = c.get('user');
        const accountRepo = new AccountRepository(schema_name);

        const account = await accountRepo.findById(accountId);
        if (!account) {
            throw new NotFoundError('Account', accountId);
        }

        if (currentUser?.role === 'member' && account.member_id !== currentUser.id) {
            throw new UnauthorizedError('Cannot access other members\' transfers');
        }

        const transfers = await accountRepo.findTransfersByAccountId(accountId);

        return c.json({
            success: true,
            data: transfers,
            meta: { count: transfers.length }
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// BATCH DEPOSITS
// =============================================================================

/**
 * POST /accounts/batch-deposit
 * Process multiple deposits in a single request (payroll, bulk)
 */
accountRoutes.post('/batch-deposit', validate(batchDepositSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof batchDepositSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const currentUser = c.get('user');
        const accountRepo = new AccountRepository(schema_name);
        const savingsService = new SavingsService();

        if (!currentUser || !hasPermission(currentUser.role || '', 'savings', 'create')) {
            throw new UnauthorizedError('Insufficient permissions for batch deposits');
        }

        const results: Array<{ depositNumber: string; accountId: string; amount: number; status: string }> = [];
        const errors: Array<{ index: number; accountId: string; error: string }> = [];

        for (let i = 0; i < data.deposits.length; i++) {
            const item = data.deposits[i];
            try {
                const account = await accountRepo.findById(item.savings_account_id);
                if (!account) {
                    errors.push({ index: i, accountId: item.savings_account_id, error: 'Account not found' });
                    continue;
                }

                const depositNumber = savingsService.generateTransactionReference();
                const deposit = await accountRepo.createDeposit({
                    savings_account_id: item.savings_account_id,
                    member_id: item.member_id,
                    deposit_number: depositNumber,
                    amount: String(item.amount),
                    deposit_date: new Date(),
                    payment_method: item.payment_method,
                    payment_reference: item.payment_reference || null,
                    status: 'posted',
                    description: item.description || 'Batch deposit',
                    recorded_by: currentUser.id,
                } as any);

                const newBalance = Number(account.principal_balance) + item.amount;
                await accountRepo.update(item.savings_account_id, {
                    principal_balance: String(newBalance),
                } as any);

                results.push({
                    depositNumber,
                    accountId: item.savings_account_id,
                    amount: item.amount,
                    status: 'posted',
                });
            } catch (error) {
                const errMsg = error instanceof Error ? error.message : 'Unknown error';
                errors.push({ index: i, accountId: item.savings_account_id, error: errMsg });
            }
        }

        const totalDeposited = results.reduce((sum, r) => sum + r.amount, 0);

        return c.json({
            success: true,
            data: { results, errors },
            meta: {
                total: data.deposits.length,
                successful: results.length,
                failed: errors.length,
                totalDeposited,
            },
        }, 201);
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// INTEREST POSTING
// =============================================================================

/**
 * POST /accounts/:accountId/post-interest
 * Post accrued interest to an account balance
 */
accountRoutes.post('/:accountId/post-interest', async (c) => {
    try {
        const { accountId } = c.req.param();
        const user = c.get('user');
        const db = c.get('db')!;

        if (!user || !hasPermission(user.role || '', 'savings', 'update')) {
            throw new UnauthorizedError('Insufficient permissions to post interest');
        }

        const { schema_name } = c.get('tenant')!;
        const accountRepo = new AccountRepository(schema_name);

        const account = await accountRepo.findById(accountId);
        if (!account) {
            throw new NotFoundError('Account', accountId);
        }

        const accruedInterest = new Decimal(account.interest_accrued?.toString() ?? '0');

        if (accruedInterest.lte(0)) {
            return c.json({
                success: false,
                error: { code: 'NO_INTEREST', message: 'No accrued interest to post' },
            }, 400);
        }

        // Post interest: add to balance, reset accrued, track paid
        const currentBalance = new Decimal(account.principal_balance?.toString() ?? '0');
        const currentPaid = new Decimal(account.interest_paid?.toString() ?? '0');

        const newBalance = currentBalance.plus(accruedInterest);
        const newPaid = currentPaid.plus(accruedInterest);

        await accountRepo.update(accountId, {
            principal_balance: newBalance.toString(),
            interest_accrued: '0',
            interest_paid: newPaid.toString(),
        } as any);

        // Record interest schedule entry
        const now = new Date();
        await db
            .insertInto('interest_schedules')
            .values({
                savings_account_id: accountId,
                period_start: new Date(now.getFullYear(), now.getMonth(), 1) as any,
                period_end: now as any,
                opening_balance: currentBalance.toString() as any,
                closing_balance: newBalance.toString() as any,
                interest_rate: '0' as any,
                interest_accrued: accruedInterest.toString() as any,
                is_posted: true as any,
                posted_date: now as any,
                posted_by: user.id,
            } as any)
            .execute();

        return c.json({
            success: true,
            data: {
                accountId,
                interestPosted: accruedInterest.toFixed(2),
                newBalance: newBalance.toFixed(2),
                totalInterestPaid: newPaid.toFixed(2),
            },
            meta: { posted: true },
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// ACCOUNT STATEMENT
// =============================================================================

/**
 * GET /accounts/:accountId/statement
 * Generate account statement with all transactions
 */
accountRoutes.get('/:accountId/statement', async (c) => {
    try {
        const { accountId } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const currentUser = c.get('user');
        const accountRepo = new AccountRepository(schema_name);
        const db = c.get('db')!;

        const account = await accountRepo.findById(accountId);
        if (!account) {
            throw new NotFoundError('Account', accountId);
        }

        if (currentUser?.role === 'member' && account.member_id !== currentUser.id) {
            throw new UnauthorizedError('Cannot access other members\' statements');
        }

        const startDate = c.req.query('start_date');
        const endDate = c.req.query('end_date');

        // Build date range query
        const from = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
        const to = endDate ? new Date(endDate) : new Date();

        // Get deposits in range
        const deposits = await db
            .selectFrom('deposits')
            .selectAll()
            .where('savings_account_id', '=', accountId)
            .where('deleted_at', 'is', null)
            .where('deposit_date', '>=', from as any)
            .where('deposit_date', '<=', to as any)
            .where('status', '=', 'posted')
            .orderBy('deposit_date', 'asc')
            .execute();

        // Get withdrawals in range
        const withdrawals = await db
            .selectFrom('withdrawals')
            .selectAll()
            .where('savings_account_id', '=', accountId)
            .where('deleted_at', 'is', null)
            .where('withdrawal_date', '>=', from as any)
            .where('withdrawal_date', '<=', to as any)
            .where('status', 'in', ['approved', 'completed'])
            .orderBy('withdrawal_date', 'asc')
            .execute();

        // Get transfers in range
        const transfers = await db
            .selectFrom('internal_transfers')
            .selectAll()
            .where('deleted_at', 'is', null)
            .where('transfer_date', '>=', from as any)
            .where('transfer_date', '<=', to as any)
            .where('status', '=', 'posted')
            .where((eb) =>
                eb.or([
                    eb('from_account_id', '=', accountId),
                    eb('to_account_id', '=', accountId),
                ])
            )
            .orderBy('transfer_date', 'asc')
            .execute();

        // Get interest schedules
        const interestEntries = await db
            .selectFrom('interest_schedules')
            .selectAll()
            .where('savings_account_id', '=', accountId)
            .where('period_end', '>=', from as any)
            .where('period_end', '<=', to as any)
            .where('is_posted', '=', true)
            .orderBy('period_end', 'asc')
            .execute();

        // Build statement entries sorted by date
        type StatementEntry = {
            date: Date;
            type: string;
            reference: string;
            description: string;
            debit: string;
            credit: string;
        };

        const entries: StatementEntry[] = [];

        for (const d of deposits) {
            entries.push({
                date: new Date(d.deposit_date as any),
                type: 'deposit',
                reference: d.deposit_number,
                description: d.description || `Deposit via ${d.payment_method}`,
                debit: '',
                credit: d.amount?.toString() ?? '0',
            });
        }

        for (const w of withdrawals) {
            entries.push({
                date: new Date(w.withdrawal_date as any),
                type: 'withdrawal',
                reference: w.withdrawal_number,
                description: w.description || `Withdrawal via ${w.payout_method}`,
                debit: w.amount?.toString() ?? '0',
                credit: '',
            });
        }

        for (const t of transfers) {
            const isOutgoing = t.from_account_id === accountId;
            entries.push({
                date: new Date(t.transfer_date as any),
                type: isOutgoing ? 'transfer_out' : 'transfer_in',
                reference: t.transfer_number,
                description: t.description || (isOutgoing ? 'Transfer out' : 'Transfer in'),
                debit: isOutgoing ? (t.amount?.toString() ?? '0') : '',
                credit: isOutgoing ? '' : (t.amount?.toString() ?? '0'),
            });
        }

        for (const ie of interestEntries) {
            entries.push({
                date: new Date(ie.period_end as any),
                type: 'interest',
                reference: `INT-${new Date(ie.period_end as any).toISOString().slice(0, 7)}`,
                description: 'Interest posting',
                debit: '',
                credit: ie.interest_accrued?.toString() ?? '0',
            });
        }

        // Sort by date
        entries.sort((a, b) => a.date.getTime() - b.date.getTime());

        // Calculate running balance
        let runningBalance = new Decimal(0);
        const statementLines = entries.map(e => {
            const credit = e.credit ? new Decimal(e.credit) : new Decimal(0);
            const debit = e.debit ? new Decimal(e.debit) : new Decimal(0);
            runningBalance = runningBalance.plus(credit).minus(debit);
            return {
                ...e,
                date: e.date.toISOString().split('T')[0],
                balance: runningBalance.toFixed(2),
            };
        });

        // Get member info
        const member = await db
            .selectFrom('members')
            .select(['first_name', 'last_name', 'member_number'])
            .where('id', '=', account.member_id)
            .executeTakeFirst();

        return c.json({
            success: true,
            data: {
                account: {
                    id: account.id,
                    accountNumber: account.account_number,
                    status: account.status,
                    currentBalance: account.principal_balance?.toString(),
                },
                member: member ? {
                    name: `${member.first_name} ${member.last_name}`,
                    memberNumber: member.member_number,
                } : null,
                period: {
                    from: from.toISOString().split('T')[0],
                    to: to.toISOString().split('T')[0],
                },
                entries: statementLines,
                summary: {
                    totalDeposits: deposits.reduce((s, d) => s + Number(d.amount ?? 0), 0).toFixed(2),
                    totalWithdrawals: withdrawals.reduce((s, w) => s + Number(w.amount ?? 0), 0).toFixed(2),
                    totalInterest: interestEntries.reduce((s, ie) => s + Number(ie.interest_accrued ?? 0), 0).toFixed(2),
                    closingBalance: account.principal_balance?.toString() ?? '0',
                    entryCount: entries.length,
                },
            },
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// STANDING INSTRUCTIONS
// =============================================================================

const createStandingInstructionSchema = z.object({
    member_id: commonSchemas.uuid,
    instruction_type: z.enum(['savings_split', 'loan_repayment', 'transfer', 'share_purchase']),
    source_account_id: commonSchemas.uuid,
    destination_account_id: z.string().uuid().nullable().optional(),
    destination_external: z.record(z.string(), z.unknown()).nullable().optional(),
    amount: z.number().positive('Amount must be positive'),
    frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annually']),
    start_date: z.string().datetime(),
    end_date: z.string().datetime().nullable().optional(),
    max_executions: z.number().int().positive().nullable().optional(),
});

const updateStandingInstructionSchema = z.object({
    amount: z.number().positive().optional(),
    frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annually']).optional(),
    end_date: z.string().datetime().nullable().optional(),
    max_executions: z.number().int().positive().nullable().optional(),
    status: z.enum(['active', 'paused', 'completed', 'cancelled']).optional(),
});

const placeLienSchema = z.object({
    account_id: commonSchemas.uuid,
    amount: z.number().positive('Lien amount must be positive'),
    reason: z.string().min(1, 'Reason is required'),
    lien_type: z.enum(['loan_collateral', 'legal_hold', 'manual']).default('manual'),
    related_loan_id: z.string().uuid().nullable().optional(),
});

const releaseLienSchema = z.object({
    release_reason: z.string().min(1, 'Release reason is required'),
});

/**
 * GET /accounts/standing-instructions
 * List standing instructions, optionally filtered by member_id
 */
accountRoutes.get('/standing-instructions', enforcePermission('savings', 'read'), async (c) => {
    try {
        const db = c.get('db')!;
        const memberId = c.req.query('member_id');

        let query = db
            .selectFrom('standing_instructions')
            .selectAll()
            .where('deleted_at', 'is', null);

        if (memberId) {
            query = query.where('member_id', '=', memberId);
        }

        const instructions = await query
            .orderBy('created_at', 'desc')
            .execute();

        return c.json({
            success: true,
            data: instructions,
            meta: { count: instructions.length }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /accounts/standing-instructions
 * Create a new standing instruction
 */
accountRoutes.post('/standing-instructions', enforcePermission('savings', 'create'), validate(createStandingInstructionSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof createStandingInstructionSchema>>(c);
        const user = c.get('user');
        const db = c.get('db')!;
        const { schema_name } = c.get('tenant')!;
        const accountRepo = new AccountRepository(schema_name);

        // Verify source account exists
        const sourceAccount = await accountRepo.findById(data.source_account_id);
        if (!sourceAccount) {
            throw new NotFoundError('Account', data.source_account_id);
        }

        // Verify destination account if provided
        if (data.destination_account_id) {
            const destAccount = await accountRepo.findById(data.destination_account_id);
            if (!destAccount) {
                throw new NotFoundError('Account', data.destination_account_id);
            }
        }

        const instruction = await db
            .insertInto('standing_instructions')
            .values({
                member_id: data.member_id,
                instruction_type: data.instruction_type as any,
                source_account_id: data.source_account_id,
                destination_account_id: data.destination_account_id || null,
                destination_external: data.destination_external ? JSON.stringify(data.destination_external) as any : null,
                amount: String(data.amount) as any,
                frequency: data.frequency as any,
                start_date: new Date(data.start_date) as any,
                end_date: data.end_date ? new Date(data.end_date) as any : null,
                next_execution_date: new Date(data.start_date) as any,
                max_executions: data.max_executions || null,
                status: 'active' as any,
                created_by: user?.id || null,
            } as any)
            .returningAll()
            .executeTakeFirstOrThrow();

        return c.json({
            success: true,
            data: instruction,
            meta: { created: true }
        }, 201);
    } catch (error) {
        throw error;
    }
});

/**
 * PATCH /accounts/standing-instructions/:instructionId
 * Update a standing instruction
 */
accountRoutes.patch('/standing-instructions/:instructionId', enforcePermission('savings', 'update'), validate(updateStandingInstructionSchema), async (c) => {
    try {
        const { instructionId } = c.req.param();
        const data = getValidatedData<z.infer<typeof updateStandingInstructionSchema>>(c);
        const db = c.get('db')!;

        const existing = await db
            .selectFrom('standing_instructions')
            .selectAll()
            .where('id', '=', instructionId)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

        if (!existing) {
            throw new NotFoundError('StandingInstruction', instructionId);
        }

        const updates: Record<string, any> = { updated_at: new Date() };
        if (data.amount !== undefined) updates.amount = String(data.amount);
        if (data.frequency !== undefined) updates.frequency = data.frequency;
        if (data.end_date !== undefined) updates.end_date = data.end_date ? new Date(data.end_date) : null;
        if (data.max_executions !== undefined) updates.max_executions = data.max_executions;
        if (data.status !== undefined) updates.status = data.status;

        const updated = await db
            .updateTable('standing_instructions')
            .set(updates as any)
            .where('id', '=', instructionId)
            .returningAll()
            .executeTakeFirstOrThrow();

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
 * DELETE /accounts/standing-instructions/:instructionId
 * Soft-delete (cancel) a standing instruction
 */
accountRoutes.delete('/standing-instructions/:instructionId', enforcePermission('savings', 'update'), async (c) => {
    try {
        const { instructionId } = c.req.param();
        const db = c.get('db')!;

        const existing = await db
            .selectFrom('standing_instructions')
            .selectAll()
            .where('id', '=', instructionId)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

        if (!existing) {
            throw new NotFoundError('StandingInstruction', instructionId);
        }

        await db
            .updateTable('standing_instructions')
            .set({ deleted_at: new Date(), status: 'cancelled' } as any)
            .where('id', '=', instructionId)
            .execute();

        return c.json({
            success: true,
            meta: { deleted: true }
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// ACCOUNT LIENS
// =============================================================================

/**
 * GET /accounts/:accountId/liens
 * List liens on an account
 */
accountRoutes.get('/:accountId/liens', enforcePermission('savings', 'read'), async (c) => {
    try {
        const { accountId } = c.req.param();
        const db = c.get('db')!;
        const { schema_name } = c.get('tenant')!;
        const accountRepo = new AccountRepository(schema_name);

        const account = await accountRepo.findById(accountId);
        if (!account) {
            throw new NotFoundError('Account', accountId);
        }

        const statusFilter = c.req.query('status');

        let query = db
            .selectFrom('account_liens')
            .selectAll()
            .where('account_id', '=', accountId);

        if (statusFilter) {
            query = query.where('status', '=', statusFilter as any);
        }

        const liens = await query
            .orderBy('placed_at', 'desc')
            .execute();

        const totalActive = liens
            .filter(l => l.status === 'active')
            .reduce((sum, l) => sum + Number(l.amount || 0), 0);

        return c.json({
            success: true,
            data: liens,
            meta: {
                count: liens.length,
                totalActiveLienAmount: totalActive,
            }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /accounts/liens
 * Place a lien on an account
 */
accountRoutes.post('/liens', enforcePermission('savings', 'update'), validate(placeLienSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof placeLienSchema>>(c);
        const user = c.get('user');
        const db = c.get('db')!;
        const { schema_name } = c.get('tenant')!;
        const accountRepo = new AccountRepository(schema_name);

        // Verify account exists
        const account = await accountRepo.findById(data.account_id);
        if (!account) {
            throw new NotFoundError('Account', data.account_id);
        }

        // Check that lien does not exceed account balance
        const currentBalance = Number(account.principal_balance || 0);
        const existingLiens = await db
            .selectFrom('account_liens')
            .selectAll()
            .where('account_id', '=', data.account_id)
            .where('status', '=', 'active')
            .execute();

        const totalExistingLiens = existingLiens.reduce((sum, l) => sum + Number(l.amount || 0), 0);
        if (totalExistingLiens + data.amount > currentBalance) {
            throw new ValidationError(
                `Lien amount would exceed available balance. Balance: ${currentBalance}, existing liens: ${totalExistingLiens}, requested: ${data.amount}`
            );
        }

        const lien = await db
            .insertInto('account_liens')
            .values({
                account_id: data.account_id,
                amount: String(data.amount) as any,
                reason: data.reason,
                lien_type: data.lien_type as any,
                placed_by: user?.id || 'system',
                placed_at: new Date() as any,
                related_loan_id: data.related_loan_id || null,
                status: 'active' as any,
            } as any)
            .returningAll()
            .executeTakeFirstOrThrow();

        return c.json({
            success: true,
            data: lien,
            meta: { created: true }
        }, 201);
    } catch (error) {
        throw error;
    }
});

/**
 * PATCH /accounts/liens/:lienId/release
 * Release a lien on an account
 */
accountRoutes.patch('/liens/:lienId/release', enforcePermission('savings', 'update'), validate(releaseLienSchema), async (c) => {
    try {
        const { lienId } = c.req.param();
        const data = getValidatedData<z.infer<typeof releaseLienSchema>>(c);
        const user = c.get('user');
        const db = c.get('db')!;

        const existing = await db
            .selectFrom('account_liens')
            .selectAll()
            .where('id', '=', lienId)
            .executeTakeFirst();

        if (!existing) {
            throw new NotFoundError('AccountLien', lienId);
        }

        if (existing.status !== 'active') {
            return c.json({
                success: false,
                error: { code: 'INVALID_STATUS', message: 'Lien is not active' }
            }, 400);
        }

        const released = await db
            .updateTable('account_liens')
            .set({
                status: 'released',
                released_at: new Date(),
                released_by: user?.id || null,
                release_reason: data.release_reason,
                updated_at: new Date(),
            } as any)
            .where('id', '=', lienId)
            .returningAll()
            .executeTakeFirstOrThrow();

        return c.json({
            success: true,
            data: released,
            meta: { released: true }
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// INTEREST RATE CONFIGURATION
// =============================================================================

/**
 * GET /accounts/interest-rate-config
 * List interest rate configurations
 */
accountRoutes.get('/interest-rate-config', enforcePermission('savings', 'read'), async (c) => {
    try {
        const db = c.get('db')!;
        const rateType = c.req.query('rate_type');
        const currentOnly = c.req.query('current') === 'true';

        let query = db
            .selectFrom('interest_rate_configuration')
            .selectAll();

        if (rateType) {
            query = query.where('rate_type', '=', rateType as any);
        }

        if (currentOnly) {
            query = query.where('is_current', '=', true);
        }

        const configs = await query
            .orderBy('rate_type', 'asc')
            .orderBy('effective_from', 'desc')
            .execute();

        return c.json({
            success: true,
            data: configs,
            meta: { count: configs.length }
        });
    } catch (error) {
        throw error;
    }
});

export default accountRoutes;
