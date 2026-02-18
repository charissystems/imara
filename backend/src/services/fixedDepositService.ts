/**
 * Fixed Deposit Service
 *
 * Handles FD maturity checking, interest accrual, auto-rollover, and
 * premature withdrawal. Designed to run as a daily batch job via the
 * BullMQ scheduler.
 *
 * Requirements:
 *  - Send alerts at 30, 14, 7, and 0 days before maturity
 *  - Auto-rollover when maturity_action = 'auto_rollover'
 *  - Mark matured FDs and create rollover records
 *  - Calculate WHT on interest
 */

import Decimal from 'decimal.js';
import { nanoid } from 'nanoid';
import { Kysely, sql } from 'kysely';
import { TenantDatabase } from '../database/types';
import { NotificationService } from './notificationService';
import { appLogger } from '../middleware/logger';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface MaturityCheckResult {
    processedDate: Date;
    alertsSent: number;
    depositsMatured: number;
    depositsRolledOver: number;
    errors: Array<{ depositId: string; error: string }>;
    durationMs: number;
}

export interface FdInterestAccrualResult {
    processedDate: Date;
    depositsProcessed: number;
    totalInterestAccrued: Decimal;
    errors: Array<{ depositId: string; error: string }>;
    durationMs: number;
}

export interface PrematureWithdrawalResult {
    depositId: string;
    principalAmount: Decimal;
    interestEarned: Decimal;
    penalty: Decimal;
    withholdingTax: Decimal;
    netPayout: Decimal;
}

const ALERT_THRESHOLDS = [30, 14, 7, 0]; // days before maturity

// ────────────────────────────────────────────────────────────
// Fixed Deposit Service
// ────────────────────────────────────────────────────────────

export class FixedDepositService {
    private db: Kysely<TenantDatabase>;
    private notificationService: NotificationService;

    constructor(db: Kysely<TenantDatabase>) {
        this.db = db;
        this.notificationService = new NotificationService(db);
    }

    /**
     * Daily batch: check approaching and reached maturities.
     *
     * 1. Find active FDs within alert thresholds → send alerts
     * 2. Find matured FDs (maturity_date <= today) → process maturity
     * 3. Auto-rollover where configured
     */
    async runMaturityCheck(asOfDate: Date = new Date()): Promise<MaturityCheckResult> {
        const startTime = Date.now();
        const result: MaturityCheckResult = {
            processedDate: asOfDate,
            alertsSent: 0,
            depositsMatured: 0,
            depositsRolledOver: 0,
            errors: [],
            durationMs: 0,
        };

        const saccoConfig = await this.db
            .selectFrom('sacco_configuration')
            .select(['organization_name'])
            .executeTakeFirst();
        const saccoName = saccoConfig?.organization_name || 'SACCO';

        // ── Step 1: Send maturity alerts ────────────────────────
        for (const daysBefore of ALERT_THRESHOLDS) {
            try {
                const alertDate = new Date(asOfDate);
                alertDate.setDate(alertDate.getDate() + daysBefore);

                // Find active FDs maturing on this alert date that haven't been alerted
                const deposits = await this.db
                    .selectFrom('fixed_deposits as fd')
                    .innerJoin('members as m', 'm.id', 'fd.member_id')
                    .select([
                        'fd.id as deposit_id',
                        'fd.certificate_number',
                        'fd.principal_amount',
                        'fd.maturity_date',
                        'fd.member_id',
                        'm.first_name',
                        'm.last_name',
                        'm.email',
                    ])
                    .where('fd.status', '=', 'active')
                    .where('fd.deleted_at', 'is', null)
                    .where('fd.maturity_date', '=', alertDate as any)
                    .execute();

                for (const fd of deposits) {
                    try {
                        // Check if alert already sent for this threshold
                        const existingAlert = await this.db
                            .selectFrom('fd_maturity_alerts')
                            .select(['id'])
                            .where('fixed_deposit_id', '=', fd.deposit_id)
                            .where('days_before', '=', daysBefore)
                            .where('sent_to_member', '=', true as any)
                            .executeTakeFirst();

                        if (existingAlert) continue;

                        // Send alert
                        if (fd.email) {
                            await this.notificationService.sendMaturityAlert({
                                memberId: fd.member_id,
                                memberEmail: fd.email,
                                memberName: `${fd.first_name} ${fd.last_name}`,
                                depositAmount: new Decimal(fd.principal_amount?.toString() ?? '0').toFixed(2),
                                maturityDate: new Date(fd.maturity_date as any).toISOString().split('T')[0],
                                daysUntilMaturity: daysBefore,
                                accountNumber: fd.certificate_number,
                                saccoName,
                            });
                        }

                        // Record alert
                        await this.db
                            .insertInto('fd_maturity_alerts')
                            .values({
                                fixed_deposit_id: fd.deposit_id,
                                days_before: daysBefore,
                                alert_date: alertDate as any,
                                sent_to_member: true as any,
                                sent_to_staff: false as any,
                                sent_at: new Date() as any,
                                delivery_channel: 'email' as any,
                            })
                            .execute();

                        result.alertsSent++;
                    } catch (error) {
                        const errMsg = error instanceof Error ? error.message : 'Unknown error';
                        result.errors.push({ depositId: fd.deposit_id, error: errMsg });
                    }
                }
            } catch (error) {
                appLogger.error(`Failed to process maturity alerts for ${daysBefore} days`, error as Error);
            }
        }

        // ── Step 2: Process matured deposits ────────────────────
        try {
            const maturedDeposits = await this.db
                .selectFrom('fixed_deposits as fd')
                .innerJoin('fixed_deposit_products as fp', 'fp.id', 'fd.product_id')
                .select([
                    'fd.id as deposit_id',
                    'fd.member_id',
                    'fd.product_id',
                    'fd.certificate_number',
                    'fd.principal_amount',
                    'fd.interest_rate',
                    'fd.interest_accrued',
                    'fd.maturity_action',
                    'fd.deposit_date',
                    'fd.maturity_date',
                    'fp.tenure_days',
                    'fp.tenure_type',
                    'fp.allows_auto_rollover',
                    'fp.default_rollover_type',
                    'fp.withholding_tax_rate',
                    'fp.fixed_interest_rate',
                ])
                .where('fd.status', '=', 'active')
                .where('fd.deleted_at', 'is', null)
                .where('fd.maturity_date', '<=', asOfDate as any)
                .execute();

            for (const fd of maturedDeposits) {
                try {
                    if (fd.maturity_action === 'auto_rollover' && fd.allows_auto_rollover) {
                        await this.processAutoRollover(fd, saccoName);
                        result.depositsRolledOver++;
                    } else {
                        // Mark as matured, awaiting manual action
                        await this.db
                            .updateTable('fixed_deposits')
                            .set({
                                status: 'matured' as any,
                                maturity_action: 'manual_action_pending' as any,
                                maturity_action_date: asOfDate as any,
                                updated_at: new Date() as any,
                            })
                            .where('id', '=', fd.deposit_id)
                            .execute();
                    }

                    result.depositsMatured++;
                } catch (error) {
                    const errMsg = error instanceof Error ? error.message : 'Unknown error';
                    result.errors.push({ depositId: fd.deposit_id, error: errMsg });
                }
            }
        } catch (error) {
            appLogger.error('Failed to process matured deposits', error as Error);
        }

        result.durationMs = Date.now() - startTime;

        appLogger.info('FD maturity check completed', {
            date: asOfDate.toISOString(),
            alertsSent: result.alertsSent,
            matured: result.depositsMatured,
            rolledOver: result.depositsRolledOver,
            errors: result.errors.length,
            durationMs: result.durationMs,
        });

        return result;
    }

    /**
     * Daily batch: accrue interest on all active fixed deposits.
     */
    async runDailyInterestAccrual(asOfDate: Date = new Date()): Promise<FdInterestAccrualResult> {
        const startTime = Date.now();
        const result: FdInterestAccrualResult = {
            processedDate: asOfDate,
            depositsProcessed: 0,
            totalInterestAccrued: new Decimal(0),
            errors: [],
            durationMs: 0,
        };

        try {
            const activeDeposits = await this.db
                .selectFrom('fixed_deposits as fd')
                .innerJoin('fixed_deposit_products as fp', 'fp.id', 'fd.product_id')
                .select([
                    'fd.id as deposit_id',
                    'fd.principal_amount',
                    'fd.interest_rate',
                    'fd.interest_accrued',
                    'fd.deposit_date',
                    'fd.maturity_date',
                    'fp.interest_calculation_method',
                    'fp.calculation_basis',
                ])
                .where('fd.status', '=', 'active')
                .where('fd.deleted_at', 'is', null)
                .where('fd.deposit_date', '<=', asOfDate as any)
                // Idempotency guard: skip deposits already accrued for this date
                .where((eb: any) =>
                    eb.or([
                        eb(sql.ref('fd.last_accrual_date'), 'is', null),
                        eb(sql.ref('fd.last_accrual_date'), '<', asOfDate as any),
                    ])
                )
                .execute();

            for (const fd of activeDeposits) {
                try {
                    const principal = new Decimal(fd.principal_amount?.toString() ?? '0');
                    const annualRate = new Decimal(fd.interest_rate?.toString() ?? '0');
                    const existingAccrued = new Decimal(fd.interest_accrued?.toString() ?? '0');

                    const basisDays = fd.calculation_basis === '360_days' ? 360 : 365;
                    const dailyRate = annualRate.div(100).div(basisDays);

                    let dailyInterest: Decimal;
                    if (fd.interest_calculation_method === 'compound') {
                        // Compound: interest on principal + accrued
                        dailyInterest = principal.plus(existingAccrued).mul(dailyRate);
                    } else {
                        // Simple: interest on principal only
                        dailyInterest = principal.mul(dailyRate);
                    }

                    dailyInterest = dailyInterest.toDecimalPlaces(4);

                    await this.db
                        .updateTable('fixed_deposits')
                        .set({
                            interest_accrued: existingAccrued.plus(dailyInterest) as any,
                            last_accrual_date: asOfDate as any,
                            updated_at: new Date() as any,
                        } as any)
                        .where('id', '=', fd.deposit_id)
                        .execute();

                    result.totalInterestAccrued = result.totalInterestAccrued.plus(dailyInterest);
                    result.depositsProcessed++;
                } catch (error) {
                    const errMsg = error instanceof Error ? error.message : 'Unknown error';
                    result.errors.push({ depositId: fd.deposit_id, error: errMsg });
                }
            }
        } catch (error) {
            appLogger.error('FD interest accrual batch failed', error as Error);
            throw error;
        }

        result.durationMs = Date.now() - startTime;

        appLogger.info('FD interest accrual completed', {
            date: asOfDate.toISOString(),
            processed: result.depositsProcessed,
            totalAccrued: result.totalInterestAccrued.toString(),
            errors: result.errors.length,
            durationMs: result.durationMs,
        });

        return result;
    }

    /**
     * Calculate premature withdrawal payout.
     * Returns the net amount after penalty and WHT deductions.
     */
    async calculatePrematureWithdrawal(depositId: string): Promise<PrematureWithdrawalResult> {
        const fd = await this.db
            .selectFrom('fixed_deposits as fd')
            .innerJoin('fixed_deposit_products as fp', 'fp.id', 'fd.product_id')
            .select([
                'fd.id as deposit_id',
                'fd.principal_amount',
                'fd.interest_accrued',
                'fp.allows_premature_withdrawal',
                'fp.premature_withdrawal_penalty_type',
                'fp.premature_withdrawal_penalty',
                'fp.withholding_tax_rate',
            ])
            .where('fd.id', '=', depositId)
            .where('fd.status', '=', 'active')
            .executeTakeFirst();

        if (!fd) {
            throw new Error(`Active fixed deposit ${depositId} not found`);
        }

        if (!fd.allows_premature_withdrawal) {
            throw new Error('This fixed deposit product does not allow premature withdrawal');
        }

        const principal = new Decimal(fd.principal_amount?.toString() ?? '0');
        const interestEarned = new Decimal(fd.interest_accrued?.toString() ?? '0');
        const penaltyRate = new Decimal(fd.premature_withdrawal_penalty?.toString() ?? '0');
        const whtRate = new Decimal(fd.withholding_tax_rate?.toString() ?? '0');

        let penalty = new Decimal(0);
        const penaltyType = fd.premature_withdrawal_penalty_type;

        if (penaltyType === 'fixed_amount') {
            penalty = penaltyRate;
        } else if (penaltyType === 'percentage') {
            penalty = interestEarned.mul(penaltyRate).div(100);
        } else if (penaltyType === 'interest_reduction') {
            // Reduce interest by penalty percentage
            penalty = interestEarned.mul(penaltyRate).div(100);
        }

        const netInterest = Decimal.max(0, interestEarned.minus(penalty));
        const wht = netInterest.mul(whtRate).div(100);
        const netPayout = principal.plus(netInterest).minus(wht);

        return {
            depositId,
            principalAmount: principal,
            interestEarned,
            penalty,
            withholdingTax: wht,
            netPayout,
        };
    }

    /**
     * Process premature withdrawal of a fixed deposit.
     */
    async processPrematureWithdrawal(
        depositId: string,
        processedBy: string,
    ): Promise<PrematureWithdrawalResult> {
        const result = await this.calculatePrematureWithdrawal(depositId);

        // Use a transaction with status guard to prevent double-withdrawal
        await this.db.transaction().execute(async (trx) => {
            // Re-verify the deposit is still active within the transaction
            const fd = await trx
                .selectFrom('fixed_deposits')
                .select(['id', 'status'])
                .where('id', '=', depositId)
                .where('status', '=', 'active')
                .forUpdate()
                .executeTakeFirst();

            if (!fd) {
                throw new Error(`Fixed deposit ${depositId} is no longer active`);
            }

            await trx
                .updateTable('fixed_deposits')
                .set({
                    status: 'closed' as any,
                    maturity_action: 'withdrawn' as any,
                    maturity_action_date: new Date() as any,
                    interest_paid: result.interestEarned.minus(result.penalty).toFixed(4) as any,
                    withholding_tax_amount: result.withholdingTax.toFixed(4) as any,
                    updated_at: new Date() as any,
                })
                .where('id', '=', depositId)
                .execute();
        });

        appLogger.info('FD premature withdrawal processed', {
            depositId,
            principal: result.principalAmount.toString(),
            netPayout: result.netPayout.toString(),
            penalty: result.penalty.toString(),
            processedBy,
        });

        return result;
    }

    // ──────────────────────────────────────────────
    // Private
    // ──────────────────────────────────────────────

    /**
     * Auto-rollover a matured FD into a new FD.
     */
    private async processAutoRollover(
        fd: {
            deposit_id: string;
            member_id: string;
            product_id: string;
            certificate_number: string;
            principal_amount: any;
            interest_accrued: any;
            interest_rate: any;
            default_rollover_type: string;
            tenure_days: any;
            withholding_tax_rate: any;
            fixed_interest_rate: any;
        },
        saccoName: string,
    ): Promise<void> {
        const principal = new Decimal(fd.principal_amount?.toString() ?? '0');
        const accruedInterest = new Decimal(fd.interest_accrued?.toString() ?? '0');
        const whtRate = new Decimal(fd.withholding_tax_rate?.toString() ?? '0');
        const wht = accruedInterest.mul(whtRate).div(100);
        const netInterest = accruedInterest.minus(wht);

        let rolloverPrincipal: Decimal;
        if (fd.default_rollover_type === 'principal_plus_interest') {
            rolloverPrincipal = principal.plus(netInterest);
        } else {
            rolloverPrincipal = principal;
        }

        const newMaturityDate = new Date();
        newMaturityDate.setDate(newMaturityDate.getDate() + (fd.tenure_days as number));

        const newCertNumber = `FD-${nanoid(12)}`;

        // Wrap all three operations atomically in a transaction
        await this.db.transaction().execute(async (trx) => {
            // Create new FD
            const [newFd] = await trx
                .insertInto('fixed_deposits')
                .values({
                    member_id: fd.member_id,
                    product_id: fd.product_id,
                    certificate_number: newCertNumber,
                    principal_amount: rolloverPrincipal as any,
                    interest_rate: new Decimal(fd.fixed_interest_rate?.toString() ?? fd.interest_rate?.toString() ?? '0') as any,
                    deposit_date: new Date() as any,
                    maturity_date: newMaturityDate as any,
                    total_interest_payable: new Decimal(0) as any,
                    interest_accrued: new Decimal(0) as any,
                    interest_paid: new Decimal(0) as any,
                    withholding_tax_amount: new Decimal(0) as any,
                    status: 'active' as any,
                    maturity_action: 'auto_rollover' as any,
                })
                .returning('id')
                .execute();

            // Close original FD
            await trx
                .updateTable('fixed_deposits')
                .set({
                    status: 'rolled_over' as any,
                    maturity_action_date: new Date() as any,
                    interest_paid: netInterest as any,
                    withholding_tax_amount: wht as any,
                    updated_at: new Date() as any,
                })
                .where('id', '=', fd.deposit_id)
                .execute();

            // Create rollover record
            await trx
                .insertInto('fd_rollovers')
                .values({
                    original_fd_id: fd.deposit_id,
                    new_fd_id: newFd.id,
                    rollover_date: new Date() as any,
                    rollover_type: fd.default_rollover_type as any,
                    principal_rolled: rolloverPrincipal as any,
                    interest_option: fd.default_rollover_type === 'principal_plus_interest'
                        ? ('reinvested' as any)
                        : ('credited_to_savings' as any),
                    status: 'processed' as any,
                    processed_at: new Date() as any,
                })
                .execute();

            appLogger.info('FD auto-rollover processed', {
                originalId: fd.deposit_id,
                newId: newFd.id,
                principal: rolloverPrincipal.toString(),
                type: fd.default_rollover_type,
            });
        });
    }
}
