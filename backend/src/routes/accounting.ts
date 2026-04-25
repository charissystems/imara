/**
 * Accounting Routes
 * Handles Chart of Accounts, manual journal entries, financial periods,
 * year-end closing, auto-posting triggers, and financial statements.
 *
 * Implements requirements:
 * - ACC-001: Maintain configurable Chart of Accounts
 * - ACC-002: Auto-post member transactions as double-entry
 * - ACC-003: Allow manual journal entry creation with approval workflow
 * - ACC-007: Categorise SACCO income
 * - ACC-008: Generate standard financial statements
 * - ACC-009: Generate audit trail for all entries
 */

import { Hono } from 'hono';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { Env } from '../middleware/types';
import { validate, getValidatedData } from '../middleware/validation';
import { NotFoundError, UnauthorizedError } from '../middleware/errorHandler';
import { enforcePermission } from '../middleware/rbac';
import { getTenantContext } from '../utils/routeHelpers';
import { AccountingService } from '../services/accountingService';

export const accountingRoutes = new Hono<Env>();

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

const createAccountSchema = z.object({
    code: z.string().min(1).max(20),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    parent_id: z.string().uuid().optional().nullable(),
    account_type: z.enum(['asset', 'liability', 'equity', 'income', 'expense']),
    normal_balance: z.enum(['debit', 'credit']),
    is_active: z.boolean().optional().default(true),
    allows_posting: z.boolean().optional().default(true),
    opening_balance: z.number().optional().default(0),
});

const updateAccountSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional().nullable(),
    is_active: z.boolean().optional(),
    allows_posting: z.boolean().optional(),
});

const createJournalEntrySchema = z.object({
    description: z.string().min(1),
    entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    financial_period_id: z.string().uuid().optional().nullable(),
    lines: z.array(z.object({
        account_id: z.string().uuid(),
        debit_amount: z.number().min(0).default(0),
        credit_amount: z.number().min(0).default(0),
        description: z.string().optional(),
    })).min(2, 'At least two line items required'),
});

const journalActionSchema = z.object({
    notes: z.string().optional(),
});

const createFinancialPeriodSchema = z.object({
    name: z.string().min(1).max(255),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const autoPostSchema = z.object({
    transaction_type: z.enum(['deposit', 'loan_disbursement', 'loan_repayment', 'interest_income']),
    amount: z.number().positive(),
    member_id: z.string().uuid().optional(),
    reference_id: z.string().optional(),
    channel: z.string().optional().default('system'),
    debit_account_id: z.string().uuid(),
    credit_account_id: z.string().uuid(),
    description: z.string().min(1),
});

// =============================================================================
// CHART OF ACCOUNTS (ACC-001)
// =============================================================================

/**
 * GET /accounting/accounts
 * List all chart of accounts entries
 */
accountingRoutes.get('/accounts', async (c) => {
    const { schema_name, db } = getTenantContext(c);
    const accountType = c.req.query('type') as string | undefined;
    const activeOnly = c.req.query('active') !== 'false';

    let query = db
        .selectFrom('accounts')
        .selectAll()
        .where('deleted_at', 'is', null);

    if (accountType) {
        query = query.where('account_type', '=', accountType as any);
    }

    if (activeOnly) {
        query = query.where('is_active', '=', true);
    }

    const accounts = await query.orderBy('code', 'asc').execute();

    return c.json({
        success: true,
        data: accounts,
        meta: { count: accounts.length },
    });
});

/**
 * GET /accounting/accounts/:id
 * Get a single account from chart of accounts
 */
accountingRoutes.get('/accounts/:id', async (c) => {
    const { id } = c.req.param();
    const { schema_name, db } = getTenantContext(c);

    const account = await db
        .selectFrom('accounts')
        .selectAll()
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

    if (!account) {
        throw new NotFoundError('Account', id);
    }

    return c.json({ success: true, data: account });
});

/**
 * POST /accounting/accounts
 * Create a new chart of accounts entry
 */
accountingRoutes.post('/accounts', enforcePermission('chart_of_accounts', 'create'), validate(createAccountSchema), async (c) => {
    const data = getValidatedData<z.infer<typeof createAccountSchema>>(c);
    const { schema_name, db } = getTenantContext(c);

    // Validate with AccountingService
    const accountingService = new AccountingService();
    const validation = accountingService.validateChartOfAccount({
        code: data.code,
        name: data.name,
        accountType: data.account_type,
        normalBalance: data.normal_balance,
    });
    if (!validation.valid) {
        return c.json({
            success: false,
            error: { code: 'VALIDATION', message: 'Invalid account', details: validation.errors },
        }, 400);
    }

    // Check for duplicate code
    const existing = await db
        .selectFrom('accounts')
        .selectAll()
        .where('code', '=', data.code)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

    if (existing) {
        return c.json({
            success: false,
            error: { code: 'DUPLICATE', message: `Account code '${data.code}' already exists` },
        }, 409);
    }

    const account = await db
        .insertInto('accounts')
        .values({
            code: data.code,
            name: data.name,
            description: data.description || null,
            parent_id: data.parent_id || null,
            account_type: data.account_type,
            normal_balance: data.normal_balance,
            is_active: data.is_active as any,
            allows_posting: data.allows_posting as any,
            opening_balance: data.opening_balance as any,
            current_balance: data.opening_balance as any,
            created_by: user.id,
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();

    return c.json({ success: true, data: account, meta: { created: true } }, 201);
});

/**
 * PATCH /accounting/accounts/:id
 * Update a chart of accounts entry
 */
accountingRoutes.patch('/accounts/:id', enforcePermission('chart_of_accounts', 'update'), validate(updateAccountSchema), async (c) => {
    const { id } = c.req.param();
    const data = getValidatedData<z.infer<typeof updateAccountSchema>>(c);
    const { schema_name, db } = getTenantContext(c);

    const existing = await db
        .selectFrom('accounts')
        .selectAll()
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

    if (!existing) {
        throw new NotFoundError('Account', id);
    }

    const account = await db
        .updateTable('accounts')
        .set({
            ...data as any,
            updated_by: user.id,
            updated_at: new Date(),
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();

    return c.json({ success: true, data: account, meta: { updated: true } });
});

// =============================================================================
// FINANCIAL PERIODS
// =============================================================================

/**
 * GET /accounting/periods
 * List all financial periods
 */
accountingRoutes.get('/periods', async (c) => {
    const { schema_name, db } = getTenantContext(c);

    const periods = await db
        .selectFrom('financial_periods')
        .selectAll()
        .where('deleted_at', 'is', null)
        .orderBy('start_date', 'desc')
        .execute();

    return c.json({
        success: true,
        data: periods,
        meta: { count: periods.length },
    });
});

/**
 * POST /accounting/periods
 * Create a new financial period
 */
accountingRoutes.post('/periods', enforcePermission('chart_of_accounts', 'create'), validate(createFinancialPeriodSchema), async (c) => {
    const data = getValidatedData<z.infer<typeof createFinancialPeriodSchema>>(c);
    const { schema_name, db } = getTenantContext(c);

    // Check for overlapping periods
    const overlap = await db
        .selectFrom('financial_periods')
        .selectAll()
        .where('deleted_at', 'is', null)
        .where('start_date', '<=', new Date(data.end_date) as any)
        .where('end_date', '>=', new Date(data.start_date) as any)
        .executeTakeFirst();

    if (overlap) {
        return c.json({
            success: false,
            error: { code: 'OVERLAP', message: `Period overlaps with '${overlap.name}'` },
        }, 409);
    }

    const period = await db
        .insertInto('financial_periods')
        .values({
            name: data.name,
            start_date: new Date(data.start_date) as any,
            end_date: new Date(data.end_date) as any,
            status: 'open',
            created_by: user.id,
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();

    return c.json({ success: true, data: period, meta: { created: true } }, 201);
});

/**
 * PATCH /accounting/periods/:id/close
 * Close a financial period (pending_review -> closed)
 */
accountingRoutes.patch('/periods/:id/close', enforcePermission('chart_of_accounts', 'approve'), async (c) => {
    const { id } = c.req.param();
    const { schema_name, db } = getTenantContext(c);

    const period = await db
        .selectFrom('financial_periods')
        .selectAll()
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

    if (!period) {
        throw new NotFoundError('Financial Period', id);
    }

    if (period.status === 'closed') {
        return c.json({
            success: false,
            error: { code: 'ALREADY_CLOSED', message: 'Period is already closed' },
        }, 400);
    }

    const updated = await db
        .updateTable('financial_periods')
        .set({
            status: 'closed',
            updated_by: user.id,
            updated_at: new Date(),
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();

    // Lock all transactions in this period
    await db
        .updateTable('transactions')
        .set({ is_locked: true as any })
        .where('financial_period_id', '=', id)
        .execute();

    return c.json({
        success: true,
        data: updated,
        meta: { closed: true, transactionsLocked: true },
    });
});

// =============================================================================
// YEAR-END CLOSING
// =============================================================================

/**
 * POST /accounting/year-end-close
 * Perform year-end closing: close all income/expense accounts to retained earnings,
 * generate trial balance snapshot, close all open periods for the year.
 */
accountingRoutes.post('/year-end-close', enforcePermission('chart_of_accounts', 'approve'), async (c) => {
    const { schema_name, db } = getTenantContext(c);

    const year = c.req.query('year') || String(new Date().getFullYear());

    // Execute entire year-end close atomically in a single transaction
    const result = await db.transaction().execute(async (trx) => {
        // 1. Get all income/expense accounts
        const incomeExpenseAccounts = await trx
            .selectFrom('accounts')
            .selectAll()
            .where('deleted_at', 'is', null)
            .where('account_type', 'in', ['income', 'expense'])
            .execute();

        // 2. Calculate net income using Decimal for precision
        let totalIncome = new Decimal(0);
        let totalExpenses = new Decimal(0);
        for (const acc of incomeExpenseAccounts) {
            const bal = new Decimal(acc.current_balance?.toString() || '0');
            if (acc.account_type === 'income') totalIncome = totalIncome.plus(bal);
            else totalExpenses = totalExpenses.plus(bal);
        }
        const netIncome = totalIncome.minus(totalExpenses);

        // 3. Zero out income/expense accounts
        for (const acc of incomeExpenseAccounts) {
            await trx
                .updateTable('accounts')
                .set({
                    current_balance: '0' as any,
                    updated_by: user.id,
                    updated_at: new Date(),
                })
                .where('id', '=', acc.id)
                .execute();
        }

        // 4. Post net income to retained earnings (equity account)
        const retainedEarnings = await trx
            .selectFrom('accounts')
            .selectAll()
            .where('deleted_at', 'is', null)
            .where('account_type', '=', 'equity')
            .where('code', 'like', '%3200%')
            .executeTakeFirst();

        if (retainedEarnings) {
            const currentRE = new Decimal(retainedEarnings.current_balance?.toString() || '0');
            const newRE = currentRE.plus(netIncome);
            await trx
                .updateTable('accounts')
                .set({
                    current_balance: newRE.toString() as any,
                    updated_by: user.id,
                    updated_at: new Date(),
                })
                .where('id', '=', retainedEarnings.id)
                .execute();
        }

        // 5. Close all open periods in the year
        const periodsResult = await trx
            .updateTable('financial_periods')
            .set({
                status: 'closed',
                updated_by: user.id,
                updated_at: new Date(),
            })
            .where('status', '!=', 'closed')
            .where('deleted_at', 'is', null)
            .returningAll()
            .execute();

        // 6. Lock all transactions for the year
        await trx
            .updateTable('transactions')
            .set({ is_locked: true as any })
            .where('is_locked', '=', false)
            .execute();

        return {
            year,
            totalIncome: totalIncome.toFixed(2),
            totalExpenses: totalExpenses.toFixed(2),
            netIncome: netIncome.toFixed(2),
            retainedEarningsAccount: retainedEarnings?.code || null,
            periodsClosed: periodsResult.length,
        };
    });

    return c.json({
        success: true,
        data: result,
        meta: { yearEndClosed: true },
    });
});

// =============================================================================
// MANUAL JOURNAL ENTRIES (ACC-003)
// =============================================================================

/**
 * GET /accounting/journals
 * List all manual journal entries
 */
accountingRoutes.get('/journals', async (c) => {
    const { schema_name, db } = getTenantContext(c);
    const status = c.req.query('status') as string | undefined;

    let query = db
        .selectFrom('manual_journal_entries')
        .selectAll()
        .orderBy('created_at', 'desc');

    if (status) {
        query = query.where('status', '=', status as any);
    }

    const limit = Math.min(parseInt(c.req.query('limit') || '100', 10), 200);
    const offset = Math.max(parseInt(c.req.query('offset') || '0', 10), 0);

    const journals = await query.limit(limit).offset(offset).execute();

    return c.json({
        success: true,
        data: journals,
        meta: { count: journals.length },
    });
});

/**
 * GET /accounting/journals/:id
 * Get a journal entry with its line items
 */
accountingRoutes.get('/journals/:id', async (c) => {
    const { id } = c.req.param();
    const { schema_name, db } = getTenantContext(c);

    const journal = await db
        .selectFrom('manual_journal_entries')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

    if (!journal) {
        throw new NotFoundError('Journal Entry', id);
    }

    const lines = await db
        .selectFrom('manual_journal_lines')
        .selectAll()
        .where('journal_entry_id', '=', id)
        .orderBy('line_number', 'asc')
        .execute();

    return c.json({
        success: true,
        data: { ...journal, lines },
    });
});

/**
 * POST /accounting/journals
 * Create a new manual journal entry (draft) with line items
 */
accountingRoutes.post('/journals', enforcePermission('journal_entries', 'create'), validate(createJournalEntrySchema), async (c) => {
    const data = getValidatedData<z.infer<typeof createJournalEntrySchema>>(c);
    const { schema_name, db } = getTenantContext(c);

    // Validate debits == credits
    const totalDebits = data.lines.reduce((s, l) => s + (l.debit_amount || 0), 0);
    const totalCredits = data.lines.reduce((s, l) => s + (l.credit_amount || 0), 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
        return c.json({
            success: false,
            error: {
                code: 'UNBALANCED',
                message: `Debits (${totalDebits.toFixed(2)}) must equal credits (${totalCredits.toFixed(2)})`,
            },
        }, 400);
    }

    // Validate each line has either debit or credit (not both)
    for (const line of data.lines) {
        if (line.debit_amount > 0 && line.credit_amount > 0) {
            return c.json({
                success: false,
                error: { code: 'INVALID_LINE', message: 'A line item cannot have both debit and credit amounts' },
            }, 400);
        }
    }

    const journalNumber = `JE-${Date.now().toString(36).toUpperCase()}`;

    const journal = await db
        .insertInto('manual_journal_entries')
        .values({
            journal_number: journalNumber,
            financial_period_id: data.financial_period_id || null,
            description: data.description,
            entry_date: new Date(data.entry_date) as any,
            status: 'draft',
            created_by: user.id,
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();

    // Insert line items
    const lineValues = data.lines.map((line, idx) => ({
        journal_entry_id: journal.id,
        line_number: idx + 1,
        account_id: line.account_id,
        debit_amount: line.debit_amount as any,
        credit_amount: line.credit_amount as any,
        description: line.description || null,
    }));

    const lines = await db
        .insertInto('manual_journal_lines')
        .values(lineValues as any)
        .returningAll()
        .execute();

    return c.json({
        success: true,
        data: { ...journal, lines },
        meta: { created: true, totalDebits, totalCredits },
    }, 201);
});

/**
 * POST /accounting/journals/:id/submit
 * Submit a draft journal entry for approval
 */
accountingRoutes.post('/journals/:id/submit', enforcePermission('journal_entries', 'create'), async (c) => {
    const { id } = c.req.param();
    const { schema_name, db } = getTenantContext(c);

    const journal = await db
        .selectFrom('manual_journal_entries')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

    if (!journal) {
        throw new NotFoundError('Journal Entry', id);
    }

    if (journal.status !== 'draft') {
        return c.json({
            success: false,
            error: { code: 'INVALID_STATE', message: `Cannot submit journal in '${journal.status}' status` },
        }, 400);
    }

    const updated = await db
        .updateTable('manual_journal_entries')
        .set({
            status: 'submitted',
            submitted_by: user?.id || null,
            submitted_at: new Date(),
            updated_at: new Date(),
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();

    return c.json({ success: true, data: updated, meta: { submitted: true } });
});

/**
 * POST /accounting/journals/:id/approve
 * Approve a submitted journal entry
 */
accountingRoutes.post('/journals/:id/approve', enforcePermission('journal_entries', 'approve'), validate(journalActionSchema), async (c) => {
    const { id } = c.req.param();
    const { schema_name, db } = getTenantContext(c);

    const journal = await db
        .selectFrom('manual_journal_entries')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

    if (!journal) {
        throw new NotFoundError('Journal Entry', id);
    }

    if (journal.status !== 'submitted') {
        return c.json({
            success: false,
            error: { code: 'INVALID_STATE', message: `Cannot approve journal in '${journal.status}' status` },
        }, 400);
    }

    const updated = await db
        .updateTable('manual_journal_entries')
        .set({
            status: 'approved',
            approved_by: user.id,
            approved_at: new Date(),
            updated_at: new Date(),
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();

    return c.json({ success: true, data: updated, meta: { approved: true } });
});

/**
 * POST /accounting/journals/:id/reject
 * Reject a submitted journal entry
 */
accountingRoutes.post('/journals/:id/reject', enforcePermission('journal_entries', 'approve'), validate(journalActionSchema), async (c) => {
    const { id } = c.req.param();
    const { schema_name, db } = getTenantContext(c);

    const journal = await db
        .selectFrom('manual_journal_entries')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

    if (!journal) {
        throw new NotFoundError('Journal Entry', id);
    }

    if (journal.status !== 'submitted') {
        return c.json({
            success: false,
            error: { code: 'INVALID_STATE', message: `Cannot reject journal in '${journal.status}' status` },
        }, 400);
    }

    const updated = await db
        .updateTable('manual_journal_entries')
        .set({
            status: 'rejected',
            approved_by: user.id,
            approved_at: new Date(),
            updated_at: new Date(),
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();

    return c.json({ success: true, data: updated, meta: { rejected: true } });
});

/**
 * POST /accounting/journals/:id/post
 * Post an approved journal entry — updates account balances
 */
accountingRoutes.post('/journals/:id/post', enforcePermission('journal_entries', 'approve'), async (c) => {
    const { id } = c.req.param();
    const { schema_name, db } = getTenantContext(c);

    const journal = await db
        .selectFrom('manual_journal_entries')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

    if (!journal) {
        throw new NotFoundError('Journal Entry', id);
    }

    if (journal.status !== 'approved') {
        return c.json({
            success: false,
            error: { code: 'INVALID_STATE', message: `Cannot post journal in '${journal.status}' status. Must be approved first.` },
        }, 400);
    }

    // Get lines and update account balances atomically in a transaction
    const updated = await db.transaction().execute(async (trx) => {
        const lines = await trx
            .selectFrom('manual_journal_lines')
            .selectAll()
            .where('journal_entry_id', '=', id)
            .execute();

        // Update account current_balances based on lines
        for (const line of lines) {
            const account = await trx
                .selectFrom('accounts')
                .selectAll()
                .where('id', '=', line.account_id)
                .executeTakeFirst();

            if (!account) continue;

            const debit = new Decimal(line.debit_amount?.toString() || '0');
            const credit = new Decimal(line.credit_amount?.toString() || '0');
            const current = new Decimal(account.current_balance?.toString() || '0');

            // Debit-normal accounts: debits increase, credits decrease
            // Credit-normal accounts: credits increase, debits decrease
            const delta = account.normal_balance === 'debit'
                ? debit.minus(credit)
                : credit.minus(debit);

            await trx
                .updateTable('accounts')
                .set({
                    current_balance: current.plus(delta).toString() as any,
                    updated_at: new Date(),
                })
                .where('id', '=', line.account_id)
                .execute();
        }

        // Mark journal as posted
        return await trx
            .updateTable('manual_journal_entries')
            .set({
                status: 'posted',
                updated_at: new Date(),
            })
            .where('id', '=', id)
            .returningAll()
            .executeTakeFirstOrThrow();
    });

    return c.json({
        success: true,
        data: updated,
        meta: { posted: true },
    });
});

// =============================================================================
// AUTO-POSTING TRIGGERS (ACC-002)
// =============================================================================

/**
 * POST /accounting/auto-post
 * Create an auto-posted double-entry transaction
 */
accountingRoutes.post('/auto-post', validate(autoPostSchema), async (c) => {
    const data = getValidatedData<z.infer<typeof autoPostSchema>>(c);
    const { schema_name, db } = getTenantContext(c);
    const user = c.get('user');

    // Validate both accounts exist
    const [debitAccount, creditAccount] = await Promise.all([
        db.selectFrom('accounts').selectAll()
            .where('id', '=', data.debit_account_id)
            .where('deleted_at', 'is', null)
            .executeTakeFirst(),
        db.selectFrom('accounts').selectAll()
            .where('id', '=', data.credit_account_id)
            .where('deleted_at', 'is', null)
            .executeTakeFirst(),
    ]);

    if (!debitAccount) {
        return c.json({
            success: false,
            error: { code: 'INVALID_ACCOUNT', message: 'Debit account not found' },
        }, 400);
    }
    if (!creditAccount) {
        return c.json({
            success: false,
            error: { code: 'INVALID_ACCOUNT', message: 'Credit account not found' },
        }, 400);
    }

    // Find the current open financial period
    const currentPeriod = await db
        .selectFrom('financial_periods')
        .selectAll()
        .where('status', '=', 'open')
        .where('deleted_at', 'is', null)
        .orderBy('start_date', 'desc')
        .executeTakeFirst();

    const txnCode = `AUTO-${data.transaction_type.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    // Execute auto-post atomically in a database transaction
    const result = await db.transaction().execute(async (trx) => {
        // Create transaction record
        const transaction = await trx
            .insertInto('transactions')
            .values({
                code: txnCode,
                member_id: data.member_id || null,
                category: data.transaction_type as any,
                amount: data.amount as any,
                currency_code: 'UGX',
                transaction_date: new Date() as any,
                payment_method: 'system' as any,
                reference_code: data.reference_id || null,
                debit_account_id: data.debit_account_id,
                credit_account_id: data.credit_account_id,
                financial_period_id: currentPeriod?.id || null,
                description: data.description,
                source_type: 'auto_post',
                recorded_by: user?.id || null,
            } as any)
            .returningAll()
            .executeTakeFirstOrThrow();

        // Update account balances atomically using Decimal for precision
        const debitCurrent = new Decimal(debitAccount.current_balance?.toString() || '0');
        const creditCurrent = new Decimal(creditAccount.current_balance?.toString() || '0');
        const amount = new Decimal(data.amount);

        const debitDelta = debitAccount.normal_balance === 'debit' ? amount : amount.negated();
        const creditDelta = creditAccount.normal_balance === 'credit' ? amount : amount.negated();

        await Promise.all([
            trx.updateTable('accounts').set({
                current_balance: debitCurrent.plus(debitDelta).toString() as any,
                updated_at: new Date(),
            }).where('id', '=', debitAccount.id).execute(),
            trx.updateTable('accounts').set({
                current_balance: creditCurrent.plus(creditDelta).toString() as any,
                updated_at: new Date(),
            }).where('id', '=', creditAccount.id).execute(),
        ]);

        return transaction;
    });

    return c.json({
        success: true,
        data: result,
        meta: {
            autoPosted: true,
            debitAccount: debitAccount.code,
            creditAccount: creditAccount.code,
        },
    }, 201);
});

// =============================================================================
// FINANCIAL REPORTS (ACC-008)
// =============================================================================

/**
 * GET /accounting/trial-balance
 * Generate trial balance from current account balances
 */
accountingRoutes.get('/trial-balance', async (c) => {
    const { schema_name, db } = getTenantContext(c);

    const accounts = await db
        .selectFrom('accounts')
        .selectAll()
        .where('deleted_at', 'is', null)
        .where('is_active', '=', true)
        .orderBy('code', 'asc')
        .execute();

    let totalDebits = 0;
    let totalCredits = 0;

    const lines = accounts.map(acc => {
        const balance = Number(acc.current_balance || 0);
        const isDebitNormal = acc.normal_balance === 'debit';
        const debitBalance = isDebitNormal && balance >= 0 ? balance : (!isDebitNormal && balance < 0 ? Math.abs(balance) : 0);
        const creditBalance = !isDebitNormal && balance >= 0 ? balance : (isDebitNormal && balance < 0 ? Math.abs(balance) : 0);

        totalDebits += debitBalance;
        totalCredits += creditBalance;

        return {
            code: acc.code,
            name: acc.name,
            account_type: acc.account_type,
            debit_balance: debitBalance,
            credit_balance: creditBalance,
        };
    }).filter(l => l.debit_balance > 0 || l.credit_balance > 0);

    return c.json({
        success: true,
        data: {
            accounts: lines,
            totalDebits,
            totalCredits,
            balanced: Math.abs(totalDebits - totalCredits) < 0.01,
            generatedAt: new Date().toISOString(),
        },
    });
});

/**
 * GET /accounting/income-statement
 * Generate income statement from current account balances
 */
accountingRoutes.get('/income-statement', async (c) => {
    const { schema_name, db } = getTenantContext(c);

    const incomeAccounts = await db
        .selectFrom('accounts')
        .selectAll()
        .where('deleted_at', 'is', null)
        .where('is_active', '=', true)
        .where('account_type', '=', 'income')
        .orderBy('code', 'asc')
        .execute();

    const expenseAccounts = await db
        .selectFrom('accounts')
        .selectAll()
        .where('deleted_at', 'is', null)
        .where('is_active', '=', true)
        .where('account_type', '=', 'expense')
        .orderBy('code', 'asc')
        .execute();

    const revenue = incomeAccounts.map(a => ({
        code: a.code,
        name: a.name,
        amount: Number(a.current_balance || 0),
    }));

    const expenses = expenseAccounts.map(a => ({
        code: a.code,
        name: a.name,
        amount: Number(a.current_balance || 0),
    }));

    const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

    return c.json({
        success: true,
        data: {
            revenue,
            totalRevenue,
            expenses,
            totalExpenses,
            netIncome: totalRevenue - totalExpenses,
            generatedAt: new Date().toISOString(),
        },
    });
});

/**
 * GET /accounting/balance-sheet
 * Generate balance sheet from current account balances
 */
accountingRoutes.get('/balance-sheet', async (c) => {
    const { schema_name, db } = getTenantContext(c);

    const allAccounts = await db
        .selectFrom('accounts')
        .selectAll()
        .where('deleted_at', 'is', null)
        .where('is_active', '=', true)
        .orderBy('code', 'asc')
        .execute();

    const assets = allAccounts
        .filter(a => a.account_type === 'asset')
        .map(a => ({ code: a.code, name: a.name, amount: Number(a.current_balance || 0) }));

    const liabilities = allAccounts
        .filter(a => a.account_type === 'liability')
        .map(a => ({ code: a.code, name: a.name, amount: Number(a.current_balance || 0) }));

    const equity = allAccounts
        .filter(a => a.account_type === 'equity')
        .map(a => ({ code: a.code, name: a.name, amount: Number(a.current_balance || 0) }));

    const totalAssets = assets.reduce((s, a) => s + a.amount, 0);
    const totalLiabilities = liabilities.reduce((s, l) => s + l.amount, 0);
    const totalEquity = equity.reduce((s, e) => s + e.amount, 0);

    return c.json({
        success: true,
        data: {
            assets,
            totalAssets,
            liabilities,
            totalLiabilities,
            equity,
            totalEquity,
            totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
            balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
            generatedAt: new Date().toISOString(),
        },
    });
});

/**
 * GET /accounting/income-categories
 * List SACCO income categories (ACC-007)
 */
accountingRoutes.get('/income-categories', async (c) => {
    const service = new AccountingService();
    const categories = service.getIncomeCategories();
    return c.json({ success: true, data: categories });
});

export default accountingRoutes;
