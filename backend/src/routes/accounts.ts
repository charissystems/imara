// src/routes/accounts.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '../middleware/types';
import { validate, getValidatedData, commonSchemas } from '../middleware/validation';
import { ValidationError, NotFoundError, UnauthorizedError } from '../middleware/errorHandler';
import { AccountRepository } from '../repositories/accountRepository';
import { TransactionRepository } from '../repositories/transactionRepository';
import { SavingsService } from '../services/savingsService';
import { hasPermission } from '../middleware/rbac';

export const accountRoutes = new Hono<Env>();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createAccountSchema = z.object({
    member_id: commonSchemas.uuid,
    account_type: z.enum(['savings', 'current', 'personal']),
    account_name: z.string().min(2, 'Account name required'),
    currency: z.string().length(3, 'Currency code must be 3 characters').default('USD'),
});

const depositSchema = z.object({
    account_id: commonSchemas.uuid,
    amount: z.number().positive('Amount must be positive'),
    channel: z.enum(['cash', 'mobile_money', 'bank_transfer', 'payroll']),
    reference: z.string().optional(),
    notes: z.string().optional(),
});

const withdrawalSchema = z.object({
    account_id: commonSchemas.uuid,
    amount: z.number().positive('Amount must be positive'),
    withdrawal_method: z.enum(['cash', 'bank_transfer', 'mobile_money']),
    reference: z.string().optional(),
    justification: z.string().optional(),
});

const approveWithdrawalSchema = z.object({
    withdrawal_id: commonSchemas.uuid,
    approval_notes: z.string().optional(),
});

const rejectWithdrawalSchema = z.object({
    withdrawal_id: commonSchemas.uuid,
    rejection_reason: z.string().min(5, 'Rejection reason required'),
});

const transferSchema = z.object({
    from_account_id: commonSchemas.uuid,
    to_account_id: commonSchemas.uuid,
    amount: z.number().positive('Amount must be positive'),
    transfer_type: z.enum(['intra_member', 'inter_member']),
    notes: z.string().optional(),
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
        const { schema_name } = c.get('tenant');
        const currentUser = c.get('currentUser');
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
        const { schema_name } = c.get('tenant');
        const currentUser = c.get('currentUser');
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
        const { schema_name } = c.get('tenant');
        const currentUser = c.get('currentUser');
        const accountRepo = new AccountRepository(schema_name);

        // Authorization: member creates own account, admin creates for others
        if (currentUser?.role === 'member' && data.member_id !== currentUser.id) {
            throw new UnauthorizedError('Members can only create their own accounts');
        }

        const savingsService = new SavingsService();
        const transactionRef = savingsService.generateTransactionReference();

        const account = await accountRepo.create({
            ...data,
            balance: 0,
            status: 'active',
            created_at: new Date(),
            updated_at: new Date(),
            last_transaction_reference: transactionRef,
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
 * Record a deposit transaction
 */
accountRoutes.post('/deposit', validate(depositSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof depositSchema>>(c);
        const { schema_name } = c.get('tenant');
        const currentUser = c.get('currentUser');
        const accountRepo = new AccountRepository(schema_name);
        const transactionRepo = new TransactionRepository(schema_name);
        const savingsService = new SavingsService();

        // Verify account exists
        const account = await accountRepo.findById(data.account_id);
        if (!account) {
            throw new NotFoundError('Account', data.account_id);
        }

        // Validate deposit amount (with minimal product defaults)
        const validation = savingsService.validateDepositAmount(data.amount, {
            minDepositAmount: 1,
            maxDepositAmount: 1000000,
            name: 'Standard Savings'
        } as any);

        if (!validation.valid) {
            return c.json({
                success: false,
                error: { code: 'INVALID_AMOUNT', message: validation.errors[0] || 'Invalid deposit amount' }
            }, 400);
        }

        // Create transaction
        const transactionRef = savingsService.generateTransactionReference();
        const transaction = await transactionRepo.create({
            account_id: data.account_id,
            transaction_type: 'deposit',
            amount: data.amount,
            channel: data.channel,
            reference: data.reference || transactionRef,
            status: 'completed',
            notes: data.notes,
            transaction_date: new Date(),
            created_at: new Date(),
        } as any);

        // Update account balance
        const updatedAccount = await accountRepo.update(data.account_id, {
            balance: account.balance + data.amount,
            last_transaction_date: new Date(),
            last_transaction_reference: transactionRef,
        } as any);

        return c.json({
            success: true,
            data: { transaction, account: updatedAccount },
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
        const { schema_name } = c.get('tenant');
        const transactionRepo = new TransactionRepository(schema_name);

        const withdrawals = await transactionRepo.findWithdrawalsByAccountId(accountId);

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
        const { schema_name } = c.get('tenant');
        const currentUser = c.get('user');
        const accountRepo = new AccountRepository(schema_name);
        const transactionRepo = new TransactionRepository(schema_name);
        const savingsService = new SavingsService();

        // Verify account exists
        const account = await accountRepo.findById(data.account_id);
        if (!account) {
            throw new NotFoundError('Account', data.account_id);
        }

        // Authorization: member can only withdraw from own account
        if (currentUser?.role === 'member' && account.member_id !== currentUser.id) {
            throw new UnauthorizedError('Cannot withdraw from other members\' accounts');
        }

        // Validate withdrawal
        const validation = savingsService.validateWithdrawal(
            data.amount,
            account.balance,
            account.minimum_balance || 0,
            0,
            false
        );
        if (!validation.valid) {
            return c.json({
                success: false,
                error: { code: 'INVALID_WITHDRAWAL', message: validation.errors[0] || 'Invalid withdrawal' }
            }, 400);
        }

        // Check if withdrawal requires approval
        const requiresApproval = savingsService.requiresWithdrawalApproval(data.amount);

        const transactionRef = savingsService.generateTransactionReference();
        const transaction = await transactionRepo.create({
            account_id: data.account_id,
            transaction_type: 'withdrawal',
            amount: data.amount,
            withdrawal_method: data.withdrawal_method,
            reference: data.reference || transactionRef,
            status: requiresApproval ? 'pending' : 'completed',
            notes: data.justification,
            transaction_date: new Date(),
            created_at: new Date(),
        } as any);

        // If no approval required, update balance immediately
        if (!requiresApproval) {
            await accountRepo.update(data.account_id, {
                balance: account.balance - data.amount,
                last_transaction_date: new Date(),
            } as any);
        }

        return c.json({
            success: true,
            data: transaction,
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
accountRoutes.patch('/withdrawals/:withdrawalId/approve', validate(approveWithdrawalSchema), async (c) => {
    try {
        const { withdrawalId } = c.req.param();
        const data = getValidatedData<z.infer<typeof approveWithdrawalSchema>>(c);
        const { schema_name } = c.get('tenant');
        const user = c.get('user');

        if (!user || !hasPermission(user.role, 'withdrawals', 'approve')) {
            throw new UnauthorizedError('Insufficient permissions to approve withdrawals');
        }

        const transactionRepo = new TransactionRepository(schema_name);
        const accountRepo = new AccountRepository(schema_name);

        const withdrawal = await transactionRepo.findById(withdrawalId);
        if (!withdrawal || withdrawal.transaction_type !== 'withdrawal') {
            throw new NotFoundError('Withdrawal', withdrawalId);
        }

        // Update transaction status
        const updated = await transactionRepo.update(withdrawalId, {
            status: 'approved',
            approval_date: new Date(),
            approval_notes: data.approval_notes,
        } as any);

        // Update account balance
        const account = await accountRepo.findById(withdrawal.account_id);
        if (account) {
            await accountRepo.update(withdrawal.account_id, {
                balance: account.balance - withdrawal.amount,
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
accountRoutes.patch('/withdrawals/:withdrawalId/reject', validate(rejectWithdrawalSchema), async (c) => {
    try {
        const { withdrawalId } = c.req.param();
        const data = getValidatedData<z.infer<typeof rejectWithdrawalSchema>>(c);
        const { schema_name } = c.get('tenant');
        const user = c.get('user');

        if (!user || !hasPermission(user.role, 'withdrawals', 'approve')) {
            throw new UnauthorizedError('Insufficient permissions to reject withdrawals');
        }

        const transactionRepo = new TransactionRepository(schema_name);

        const withdrawal = await transactionRepo.findById(withdrawalId);
        if (!withdrawal) {
            throw new NotFoundError('Withdrawal', withdrawalId);
        }

        const updated = await transactionRepo.update(withdrawalId, {
            status: 'rejected',
            rejection_reason: data.rejection_reason,
            rejection_date: new Date(),
        } as any);

        return c.json({
            success: true,
            data: updated,
            meta: { rejected: true }
        });
    } catch (error) {
        throw error;
    }
})

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
        const { schema_name } = c.get('tenant');
        const currentUser = c.get('user');
        const accountRepo = new AccountRepository(schema_name);
        const transactionRepo = new TransactionRepository(schema_name);
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
        if (fromAccount.balance < data.amount) {
            return c.json({
                success: false,
                error: { code: 'INSUFFICIENT_FUNDS', message: 'Insufficient balance' }
            }, 400);
        }

        const transactionRef = savingsService.generateTransactionReference();

        // Create debit transaction
        const debitTx = await transactionRepo.create({
            account_id: data.from_account_id,
            transaction_type: 'transfer_out',
            amount: data.amount,
            reference: transactionRef,
            status: 'completed',
            notes: data.notes,
            transaction_date: new Date(),
            created_at: new Date(),
        } as any);

        // Create credit transaction
        const creditTx = await transactionRepo.create({
            account_id: data.to_account_id,
            transaction_type: 'transfer_in',
            amount: data.amount,
            reference: transactionRef,
            status: 'completed',
            notes: data.notes,
            transaction_date: new Date(),
            created_at: new Date(),
        } as any);

        // Update both account balances
        await accountRepo.update(data.from_account_id, {
            balance: fromAccount.balance - data.amount,
            last_transaction_date: new Date(),
        } as any);

        await accountRepo.update(data.to_account_id, {
            balance: toAccount.balance + data.amount,
            last_transaction_date: new Date(),
        } as any);

        return c.json({
            success: true,
            data: { debit: debitTx, credit: creditTx },
            meta: { transferred: true, reference: transactionRef }
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
        const { schema_name } = c.get('tenant');
        const currentUser = c.get('user');
        const accountRepo = new AccountRepository(schema_name);
        const savingsService = new SavingsService();

        const account = await accountRepo.findById(accountId);
        if (!account) {
            throw new NotFoundError('Account', accountId);
        }

        // Authorization
        if (currentUser?.role === 'member' && account.member_id !== currentUser.id) {
            throw new UnauthorizedError('Cannot close other members\' accounts');
        }

        // Calculate exit fee (with minimal membership months)
        const exitFee = savingsService.calculateExitFee(account.balance, 12);

        const closedAccount = await accountRepo.update(accountId, {
            status: 'closed',
            closure_date: new Date(),
            closure_reason: data.closure_reason,
            closing_balance: account.balance - exitFee,
        } as any);

        return c.json({
            success: true,
            data: closedAccount,
            meta: {
                closed: true,
                exitFee,
                closingBalance: account.balance - exitFee
            }
        });
    } catch (error) {
        throw error;
    }
})

/**
 * GET /accounts/:accountId/transactions
 * Get transaction history for an account
 */
accountRoutes.get('/:accountId/transactions', async (c) => {
    try {
        const { accountId } = c.req.param();
        const { schema_name } = c.get('tenant');
        const currentUser = c.get('currentUser');
        const accountRepo = new AccountRepository(schema_name);
        const transactionRepo = new TransactionRepository(schema_name);

        // Verify account exists and user has access
        const account = await accountRepo.findById(accountId);
        if (!account) {
            throw new NotFoundError('Account', accountId);
        }

        if (currentUser?.role === 'member' && account.member_id !== currentUser.id) {
            throw new UnauthorizedError('Cannot access other members\' transactions');
        }

        const transactions = await transactionRepo.findByAccountId(accountId);

        return c.json({
            success: true,
            data: transactions,
            meta: { count: transactions.length }
        });
    } catch (error) {
        throw error;
    }
});

export default accountRoutes;
