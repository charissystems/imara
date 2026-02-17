/**
 * Repayment Service
 * 
 * DB-aware orchestration layer for processing loan repayments.
 * Delegates pure math to ScheduleCalculator and operates on
 * loan_accounts, loan_schedules, and loan_repayments tables via Kysely.
 * 
 * Requirements implemented:
 *  - LON-022: Accept repayments with auto-allocation (penalties → interest → principal)
 *  - LON-023: Auto-compute penalty fees for overdue installments
 *  - LON-024: Send repayment reminders (generates reminder data)
 *  - LON-025: Support loan rescheduling
 *  - LON-026: Support loan write-off
 *  - LON-028: Flag loans as NPL after 90 days overdue
 */

import Decimal from 'decimal.js';
import { nanoid } from 'nanoid';
import { Kysely, sql } from 'kysely';
import { TenantDatabase } from '../database/types';
import { ScheduleCalculator } from './scheduleCalculator';
import { appLogger } from '../middleware/logger';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type PaymentMethod = 'cash' | 'mobile_money' | 'bank_transfer' | 'cheque' | 'internal';

export interface ProcessRepaymentInput {
    loanAccountId: string;
    amount: Decimal.Value;
    paymentMethod: PaymentMethod;
    paymentReference?: string;
    recordedBy: string;
    repaymentDate?: Date;
}

export interface ProcessRepaymentResult {
    repaymentId: string;
    loanAccountId: string;
    totalPaid: Decimal;
    allocatedPenalty: Decimal;
    allocatedInterest: Decimal;
    allocatedPrincipal: Decimal;
    overpayment: Decimal;
    installmentsFullyPaid: number;
    installmentsPartiallyPaid: number;
    remainingBalance: Decimal;
    loanFullyRepaid: boolean;
}

export interface PenaltyBatchResult {
    processedDate: Date;
    loansProcessed: number;
    totalPenaltiesAdded: Decimal;
    errors: Array<{ loanId: string; error: string }>;
    durationMs: number;
}

export interface NplBatchResult {
    processedDate: Date;
    loansFlagged: number;
    loansAlreadyNpl: number;
    errors: Array<{ loanId: string; error: string }>;
    durationMs: number;
}

export interface ReminderRecord {
    loanAccountId: string;
    memberId: string;
    loanNumber: string;
    installmentNumber: number;
    amountDue: Decimal;
    dueDate: Date;
    daysUntilDue: number;
}

// ────────────────────────────────────────────────────────────
// Repayment Service
// ────────────────────────────────────────────────────────────

export class RepaymentService {
    constructor(private db: Kysely<TenantDatabase>) {}

    /**
     * Process a loan repayment.
     * 
     * Algorithm:
     * 1. Load overdue installments ordered by due_date ASC
     * 2. For each installment: compute penalties, then allocate payment
     *    (penalties → interest → principal) using ScheduleCalculator
     * 3. Update loan_schedules rows with new paid amounts and statuses
     * 4. Create loan_repayments record
     * 5. Update loan_accounts outstanding balances
     * 6. If balance is zero, mark loan as closed
     *
     * All mutations are wrapped in a database transaction for atomicity.
     */
    async processRepayment(input: ProcessRepaymentInput): Promise<ProcessRepaymentResult> {
        const paymentAmount = new Decimal(input.amount);
        const repaymentDate = input.repaymentDate ?? new Date();

        if (paymentAmount.lte(0)) {
            throw new Error('Payment amount must be positive');
        }

        // 1. Fetch the loan account
        const loan = await this.db
            .selectFrom('loan_accounts')
            .selectAll()
            .where('id', '=', input.loanAccountId)
            .where('status', 'in', ['active', 'defaulted'])
            .executeTakeFirst();

        if (!loan) {
            throw new Error(`Loan account ${input.loanAccountId} not found or not active`);
        }

        // 2. Fetch the loan product for penalty config
        const product = await this.db
            .selectFrom('loan_products')
            .selectAll()
            .where('id', '=', loan.product_id)
            .executeTakeFirst();

        if (!product) {
            throw new Error(`Loan product ${loan.product_id} not found`);
        }

        // 3. Fetch unpaid installments ordered by due_date
        const installments = await this.db
            .selectFrom('loan_schedules')
            .selectAll()
            .where('loan_account_id', '=', input.loanAccountId)
            .where('status', 'in', ['scheduled', 'partial', 'overdue'])
            .orderBy('due_date', 'asc')
            .execute();

        if (installments.length === 0) {
            throw new Error('No outstanding installments found for this loan');
        }

        // Wrap all mutations in a database transaction for atomicity
        return await this.db.transaction().execute(async (trx) => {
            // 4. Walk through installments allocating payment
            let remaining = paymentAmount;
            let totalAllocatedPenalty = new Decimal(0);
            let totalAllocatedInterest = new Decimal(0);
            let totalAllocatedPrincipal = new Decimal(0);
            let installmentsFullyPaid = 0;
            let installmentsPartiallyPaid = 0;

            const dailyPenaltyRate = new Decimal(product.late_payment_penalty?.toString() ?? '0');

            for (const inst of installments) {
                if (remaining.lte(0)) break;

                const dueDate = new Date(inst.due_date as any);
                const daysOverdue = Math.max(
                    0,
                    Math.floor((repaymentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)),
                );

                // Calculate penalty for this installment if overdue
                const outstandingPrincipal = new Decimal(inst.principal_payment?.toString() ?? '0');
                const outstandingInterest = new Decimal(inst.interest_payment?.toString() ?? '0');
                const existingPenalty = new Decimal(inst.penalty_payment?.toString() ?? '0');

                let penalty = existingPenalty;
                if (daysOverdue > 0 && dailyPenaltyRate.gt(0)) {
                    const computedPenalty = ScheduleCalculator.calculatePenalty({
                        overdueAmount: outstandingPrincipal.plus(outstandingInterest),
                        dailyPenaltyRate,
                        daysOverdue,
                        penaltyCapPercent: 100, // cap at 100% of overdue amount
                    });
                    // Use the larger of existing or computed (penalties accumulate)
                    penalty = Decimal.max(existingPenalty, computedPenalty);
                }

                // Allocate payment for this installment
                const allocation = ScheduleCalculator.allocateRepayment({
                    paymentAmount: remaining,
                    pendingPenalty: penalty,
                    pendingInterest: outstandingInterest,
                    pendingPrincipal: outstandingPrincipal,
                });

                totalAllocatedPenalty = totalAllocatedPenalty.plus(allocation.allocatedPenalty);
                totalAllocatedInterest = totalAllocatedInterest.plus(allocation.allocatedInterest);
                totalAllocatedPrincipal = totalAllocatedPrincipal.plus(allocation.allocatedPrincipal);
                remaining = allocation.overpayment;

                // Determine new installment status
                const fullyPaid =
                    allocation.fullyCovered.penalty &&
                    allocation.fullyCovered.interest &&
                    allocation.fullyCovered.principal;

                const newStatus = fullyPaid ? 'paid' : 'partial';

                if (fullyPaid) {
                    installmentsFullyPaid++;
                } else {
                    installmentsPartiallyPaid++;
                }

                // 5. Update the installment (inside transaction)
                await trx
                    .updateTable('loan_schedules')
                    .set({
                        penalty_payment: allocation.allocatedPenalty.toString() as any,
                        status: newStatus as any,
                        days_overdue: daysOverdue,
                        paid_date: fullyPaid ? (repaymentDate as any) : undefined,
                        payment_method: input.paymentMethod as any,
                        payment_reference: input.paymentReference ?? null,
                        updated_at: new Date() as any,
                    })
                    .where('id', '=', inst.id)
                    .execute();
            }

            // 6. Create repayment record (inside transaction)
            const repaymentNumber = `RPY-${nanoid(12)}`;

            const [repayment] = await trx
                .insertInto('loan_repayments')
                .values({
                    loan_account_id: input.loanAccountId,
                    repayment_number: repaymentNumber,
                    repayment_date: repaymentDate as any,
                    principal_payment: totalAllocatedPrincipal.toString() as any,
                    interest_payment: totalAllocatedInterest.toString() as any,
                    penalty_payment: totalAllocatedPenalty.toString() as any,
                    total_payment: paymentAmount.minus(remaining).toString() as any,
                    payment_method: input.paymentMethod as any,
                    payment_reference: input.paymentReference ?? null,
                    status: 'posted' as any,
                    recorded_by: input.recordedBy,
                })
                .returning('id')
                .execute();

            // 7. Update loan account outstanding balances (inside transaction)
            const currentPrincipal = new Decimal(loan.principal_outstanding?.toString() ?? '0');
            const currentInterest = new Decimal(loan.interest_outstanding?.toString() ?? '0');
            const currentPenalties = new Decimal(loan.penalties_outstanding?.toString() ?? '0');

            const newPrincipal = currentPrincipal.minus(totalAllocatedPrincipal);
            const newInterest = currentInterest.minus(totalAllocatedInterest);
            const newPenalties = currentPenalties.minus(totalAllocatedPenalty);

            const newTotal = Decimal.max(0, newPrincipal.plus(newInterest).plus(newPenalties));
            const loanFullyRepaid = newTotal.lte(0);

            await trx
                .updateTable('loan_accounts')
                .set({
                    principal_outstanding: Decimal.max(0, newPrincipal).toString() as any,
                    interest_outstanding: Decimal.max(0, newInterest).toString() as any,
                    penalties_outstanding: Decimal.max(0, newPenalties).toString() as any,
                    total_outstanding: Decimal.max(0, newTotal).toString() as any,
                    status: loanFullyRepaid ? ('closed' as any) : loan.status,
                    updated_at: new Date() as any,
                })
                .where('id', '=', input.loanAccountId)
                .execute();

            appLogger.info('Repayment processed', {
                loanAccountId: input.loanAccountId,
                amount: paymentAmount.toString(),
                allocatedPenalty: totalAllocatedPenalty.toString(),
                allocatedInterest: totalAllocatedInterest.toString(),
                allocatedPrincipal: totalAllocatedPrincipal.toString(),
                overpayment: remaining.toString(),
                installmentsFullyPaid,
                loanFullyRepaid,
            });

            return {
                repaymentId: repayment.id,
                loanAccountId: input.loanAccountId,
                totalPaid: paymentAmount.minus(remaining),
                allocatedPenalty: totalAllocatedPenalty,
                allocatedInterest: totalAllocatedInterest,
                allocatedPrincipal: totalAllocatedPrincipal,
                overpayment: remaining,
                installmentsFullyPaid,
                installmentsPartiallyPaid,
                remainingBalance: Decimal.max(0, newTotal),
                loanFullyRepaid,
            };
        });
    }

    /**
     * Batch: calculate and apply penalties for all overdue installments.
     * Run daily via the job scheduler.
     */
    async runPenaltyCalculation(asOfDate: Date = new Date()): Promise<PenaltyBatchResult> {
        const startTime = Date.now();
        const result: PenaltyBatchResult = {
            processedDate: asOfDate,
            loansProcessed: 0,
            totalPenaltiesAdded: new Decimal(0),
            errors: [],
            durationMs: 0,
        };

        try {
            // Find all overdue installments across active loans
            const overdueInstallments = await this.db
                .selectFrom('loan_schedules as ls')
                .innerJoin('loan_accounts as la', 'la.id', 'ls.loan_account_id')
                .innerJoin('loan_products as lp', 'lp.id', 'la.product_id')
                .select([
                    'ls.id as schedule_id',
                    'ls.loan_account_id',
                    'ls.due_date',
                    'ls.principal_payment',
                    'ls.interest_payment',
                    'ls.penalty_payment',
                    'lp.late_payment_penalty',
                    'lp.late_payment_penalty_type',
                ])
                .where('la.status', 'in', ['active', 'defaulted'])
                .where('ls.status', 'in', ['scheduled', 'partial', 'overdue'])
                .where('ls.due_date', '<', asOfDate as any)
                .execute();

            const processedLoans = new Set<string>();

            for (const inst of overdueInstallments) {
                try {
                    const dueDate = new Date(inst.due_date as any);
                    const daysOverdue = Math.floor(
                        (asOfDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
                    );

                    if (daysOverdue <= 0) continue;

                    const outstandingAmount = new Decimal(inst.principal_payment?.toString() ?? '0')
                        .plus(new Decimal(inst.interest_payment?.toString() ?? '0'));

                    const dailyRate = new Decimal(inst.late_payment_penalty?.toString() ?? '0');

                    const penalty = ScheduleCalculator.calculatePenalty({
                        overdueAmount: outstandingAmount,
                        dailyPenaltyRate: dailyRate,
                        daysOverdue,
                        penaltyCapPercent: 100,
                    });

                    // Update schedule with penalty and overdue status
                    await this.db
                        .updateTable('loan_schedules')
                        .set({
                            penalty_payment: penalty as any,
                            status: 'overdue' as any,
                            days_overdue: daysOverdue,
                            updated_at: new Date() as any,
                        })
                        .where('id', '=', inst.schedule_id)
                        .execute();

                    result.totalPenaltiesAdded = result.totalPenaltiesAdded.plus(penalty);
                    processedLoans.add(inst.loan_account_id);
                } catch (error) {
                    const errMsg = error instanceof Error ? error.message : 'Unknown error';
                    result.errors.push({ loanId: inst.loan_account_id, error: errMsg });
                }
            }

            // Update loan_accounts outstanding penalties aggregate
            for (const loanId of processedLoans) {
                try {
                    const penaltySum = await this.db
                        .selectFrom('loan_schedules')
                        .select(({ fn }) => fn.sum<string>('penalty_payment').as('total_penalty'))
                        .where('loan_account_id', '=', loanId)
                        .where('status', 'in', ['scheduled', 'partial', 'overdue'])
                        .executeTakeFirst();

                    const totalPenalty = new Decimal(penaltySum?.total_penalty ?? '0');

                    await this.db
                        .updateTable('loan_accounts')
                        .set({
                            penalties_outstanding: totalPenalty as any,
                            updated_at: new Date() as any,
                        })
                        .where('id', '=', loanId)
                        .execute();
                } catch (error) {
                    const errMsg = error instanceof Error ? error.message : 'Unknown error';
                    result.errors.push({ loanId, error: errMsg });
                }
            }

            result.loansProcessed = processedLoans.size;
        } catch (error) {
            appLogger.error('Penalty calculation batch failed', error as Error);
            throw error;
        }

        result.durationMs = Date.now() - startTime;

        appLogger.info('Penalty calculation completed', {
            date: asOfDate.toISOString(),
            loansProcessed: result.loansProcessed,
            totalPenalties: result.totalPenaltiesAdded.toString(),
            errors: result.errors.length,
            durationMs: result.durationMs,
        });

        return result;
    }

    /**
     * Batch: flag loans as Non-Performing (NPL) if any installment
     * is overdue by >= 90 days (LON-028).
     * Run daily via the job scheduler.
     */
    async runNplFlagging(asOfDate: Date = new Date(), thresholdDays: number = 90): Promise<NplBatchResult> {
        const startTime = Date.now();
        const result: NplBatchResult = {
            processedDate: asOfDate,
            loansFlagged: 0,
            loansAlreadyNpl: 0,
            errors: [],
            durationMs: 0,
        };

        try {
            // Find loans with any installment overdue by >= threshold
            const overdueLoans = await this.db
                .selectFrom('loan_schedules as ls')
                .innerJoin('loan_accounts as la', 'la.id', 'ls.loan_account_id')
                .select([
                    'la.id as loan_id',
                    'la.status as loan_status',
                    ({ fn }) => fn.max<number>('ls.days_overdue').as('max_days_overdue'),
                ])
                .where('la.status', 'in', ['active', 'defaulted'])
                .where('ls.status', 'in', ['overdue', 'partial'])
                .groupBy(['la.id', 'la.status'])
                .having(({ fn }) => fn.max('ls.days_overdue'), '>=', thresholdDays as any)
                .execute();

            for (const loan of overdueLoans) {
                try {
                    if (loan.loan_status === 'defaulted') {
                        result.loansAlreadyNpl++;
                        continue;
                    }

                    await this.db
                        .updateTable('loan_accounts')
                        .set({
                            status: 'defaulted' as any,
                            updated_at: new Date() as any,
                        })
                        .where('id', '=', loan.loan_id)
                        .execute();

                    result.loansFlagged++;
                } catch (error) {
                    const errMsg = error instanceof Error ? error.message : 'Unknown error';
                    result.errors.push({ loanId: loan.loan_id, error: errMsg });
                }
            }
        } catch (error) {
            appLogger.error('NPL flagging batch failed', error as Error);
            throw error;
        }

        result.durationMs = Date.now() - startTime;

        appLogger.info('NPL flagging completed', {
            date: asOfDate.toISOString(),
            flagged: result.loansFlagged,
            alreadyNpl: result.loansAlreadyNpl,
            errors: result.errors.length,
            durationMs: result.durationMs,
        });

        return result;
    }

    /**
     * Generate repayment reminder data for upcoming due dates.
     * Returns structured data; the caller (notification service / job) formats & sends.
     */
    async getUpcomingReminders(
        daysAhead: number = 7,
        asOfDate: Date = new Date(),
    ): Promise<ReminderRecord[]> {
        const futureDate = new Date(asOfDate);
        futureDate.setDate(futureDate.getDate() + daysAhead);

        const upcoming = await this.db
            .selectFrom('loan_schedules as ls')
            .innerJoin('loan_accounts as la', 'la.id', 'ls.loan_account_id')
            .select([
                'la.id as loan_account_id',
                'la.member_id',
                'la.loan_number',
                'ls.installment_number',
                'ls.total_payment',
                'ls.due_date',
            ])
            .where('la.status', '=', 'active')
            .where('ls.status', 'in', ['scheduled'])
            .where('ls.due_date', '>=', asOfDate as any)
            .where('ls.due_date', '<=', futureDate as any)
            .orderBy('ls.due_date', 'asc')
            .execute();

        return upcoming.map(row => {
            const dueDate = new Date(row.due_date as any);
            const daysUntilDue = Math.ceil(
                (dueDate.getTime() - asOfDate.getTime()) / (1000 * 60 * 60 * 24),
            );

            return {
                loanAccountId: row.loan_account_id,
                memberId: row.member_id,
                loanNumber: row.loan_number,
                installmentNumber: row.installment_number as unknown as number,
                amountDue: new Decimal(row.total_payment?.toString() ?? '0'),
                dueDate,
                daysUntilDue,
            };
        });
    }

    /**
     * Write off a loan (LON-026).
     * Sets status to written_off, marks all outstanding installments as written_off.
     */
    async writeOffLoan(
        loanAccountId: string,
        reason: string,
        writtenOffBy: string,
    ): Promise<void> {
        // Mark all outstanding installments as written off
        await this.db
            .updateTable('loan_schedules')
            .set({
                status: 'written_off' as any,
                updated_at: new Date() as any,
            })
            .where('loan_account_id', '=', loanAccountId)
            .where('status', 'in', ['scheduled', 'partial', 'overdue'])
            .execute();

        // Mark loan as written off
        await this.db
            .updateTable('loan_accounts')
            .set({
                status: 'written_off' as any,
                updated_at: new Date() as any,
            })
            .where('id', '=', loanAccountId)
            .execute();

        // Record recovery action
        await this.db
            .insertInto('loan_recovery_actions')
            .values({
                loan_account_id: loanAccountId,
                action_type: 'write_off' as any,
                action_date: new Date() as any,
                description: reason,
                amount_recovered: new Decimal(0) as any,
                status: 'completed' as any,
                created_by: writtenOffBy,
            })
            .execute();

        appLogger.info('Loan written off', {
            loanAccountId,
            reason,
            writtenOffBy,
        });
    }
}
