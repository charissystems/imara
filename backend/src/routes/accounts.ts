// src/routes/accounts.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '../middleware/types';
import { validate, getValidatedData, commonSchemas } from '../middleware/validation';
import { ValidationError, NotFoundError, UnauthorizedError } from '../middleware/errorHandler';
import { AccountRepository } from '../repositories/accountRepository';
import { SavingsService } from '../services/savingsService';
import { hasPermission } from '../middleware/rbac';

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

export default accountRoutes;
