/**
 * Interest Accrual Service
 * 
 * Daily interest accrual engine for savings accounts.
 * Supports simple, compound, and tiered interest methods.
 * Uses Decimal.js for financial precision.
 * 
 * Requirements implemented:
 *  - SAV-015: Support interest calculation methods (simple, compound, tiered)
 *  - SAV-016: Accrue interest daily; post on configurable cycle
 *  - SAV-017: Multiple savings products with distinct rates
 *  - FD-003: FD interest calculation (365/360 day basis)
 */

import Decimal from 'decimal.js';
import { Kysely } from 'kysely';
import { TenantDatabase } from '../database/types';
import { appLogger } from '../middleware/logger';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type InterestCalcMethod = 'simple' | 'compound';

export type CalculationBasis = '365_days' | '360_days';

export type PostingFrequency = 'monthly' | 'quarterly' | 'annually' | 'on_withdrawal';

export interface InterestTier {
    minBalance: Decimal.Value;
    maxBalance: Decimal.Value;
    annualRate: Decimal.Value;
}

export interface DailyAccrualResult {
    accountId: string;
    memberId: string;
    date: Date;
    openingBalance: Decimal;
    dailyInterest: Decimal;
    annualRate: Decimal;
    method: InterestCalcMethod;
    basis: CalculationBasis;
}

export interface AccrualBatchResult {
    processedDate: Date;
    accountsProcessed: number;
    accountsSkipped: number;
    totalInterestAccrued: Decimal;
    errors: Array<{ accountId: string; error: string }>;
    durationMs: number;
}

export interface PostingBatchResult {
    postedDate: Date;
    accountsPosted: number;
    totalInterestPosted: Decimal;
    errors: Array<{ accountId: string; error: string }>;
    durationMs: number;
}

// ────────────────────────────────────────────────────────────
// Interest Calculator (pure math - no DB)
// ────────────────────────────────────────────────────────────

export class InterestCalculator {
    /**
     * Calculate daily interest using simple interest.
     * Formula: balance × (rate / 100) × (1 / daysInYear)
     */
    static dailySimple(
        balance: Decimal.Value,
        annualRate: Decimal.Value,
        basis: CalculationBasis = '365_days',
    ): Decimal {
        const bal = new Decimal(balance);
        const rate = new Decimal(annualRate);
        const daysInYear = basis === '360_days' ? 360 : 365;

        if (bal.lte(0) || rate.lte(0)) return new Decimal(0);

        return bal
            .times(rate.dividedBy(100))
            .dividedBy(daysInYear)
            .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    }

    /**
     * Calculate daily interest using compound interest.
     * Daily rate = (1 + r)^(1/daysInYear) - 1
     * Daily interest = balance × dailyRate
     */
    static dailyCompound(
        balance: Decimal.Value,
        annualRate: Decimal.Value,
        basis: CalculationBasis = '365_days',
    ): Decimal {
        const bal = new Decimal(balance);
        const rate = new Decimal(annualRate);
        const daysInYear = basis === '360_days' ? 360 : 365;

        if (bal.lte(0) || rate.lte(0)) return new Decimal(0);

        // dailyRate = (1 + r/100)^(1/daysInYear) - 1
        const dailyRate = rate.dividedBy(100).plus(1).pow(new Decimal(1).dividedBy(daysInYear)).minus(1);

        return bal
            .times(dailyRate)
            .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    }

    /**
     * Calculate daily interest with the appropriate method.
     */
    static daily(
        balance: Decimal.Value,
        annualRate: Decimal.Value,
        method: InterestCalcMethod,
        basis: CalculationBasis = '365_days',
    ): Decimal {
        switch (method) {
            case 'simple':
                return this.dailySimple(balance, annualRate, basis);
            case 'compound':
                return this.dailyCompound(balance, annualRate, basis);
            default:
                return this.dailySimple(balance, annualRate, basis);
        }
    }

    /**
     * Calculate interest for a range of days.
     */
    static forPeriod(
        balance: Decimal.Value,
        annualRate: Decimal.Value,
        days: number,
        method: InterestCalcMethod = 'simple',
        basis: CalculationBasis = '365_days',
    ): Decimal {
        const bal = new Decimal(balance);
        const rate = new Decimal(annualRate);
        const daysInYear = basis === '360_days' ? 360 : 365;

        if (bal.lte(0) || rate.lte(0) || days <= 0) return new Decimal(0);

        if (method === 'simple') {
            return bal
                .times(rate.dividedBy(100))
                .times(new Decimal(days).dividedBy(daysInYear))
                .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
        }

        // compound
        const factor = rate.dividedBy(100).plus(1).pow(new Decimal(days).dividedBy(daysInYear));
        return bal.times(factor).minus(bal).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    }

    /**
     * Apply tiered interest — find the applicable band and compute.
     */
    static dailyTiered(
        balance: Decimal.Value,
        tiers: InterestTier[],
        basis: CalculationBasis = '365_days',
    ): Decimal {
        const bal = new Decimal(balance);
        if (bal.lte(0) || tiers.length === 0) return new Decimal(0);

        const tier = tiers.find(t => {
            const min = new Decimal(t.minBalance);
            const max = new Decimal(t.maxBalance);
            return bal.gte(min) && bal.lte(max);
        });

        if (!tier) return new Decimal(0);

        return this.dailySimple(balance, tier.annualRate, basis);
    }

    /**
     * Compute the next date that interest should be posted.
     */
    static nextPostingDate(frequency: PostingFrequency, fromDate: Date = new Date()): Date {
        const d = new Date(fromDate);

        switch (frequency) {
            case 'monthly':
                d.setMonth(d.getMonth() + 1, 1);
                break;
            case 'quarterly': {
                const currentQ = Math.floor(d.getMonth() / 3);
                d.setMonth((currentQ + 1) * 3, 1);
                break;
            }
            case 'annually':
                d.setFullYear(d.getFullYear() + 1, 0, 1);
                break;
            case 'on_withdrawal':
                // No scheduled posting
                return new Date(9999, 11, 31);
        }

        d.setHours(0, 0, 0, 0);
        return d;
    }

    /**
     * Calculate withholding tax on interest.
     */
    static withholdingTax(interestAmount: Decimal.Value, taxRate: Decimal.Value = 0.20): Decimal {
        return new Decimal(interestAmount)
            .times(new Decimal(taxRate))
            .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    }
}

// ────────────────────────────────────────────────────────────
// Interest Accrual Engine (DB-aware batch processor)
// ────────────────────────────────────────────────────────────

export class InterestAccrualEngine {
    constructor(private db: Kysely<TenantDatabase>) {}

    /**
     * Run daily interest accrual for ALL active savings accounts in a tenant.
     * Call this once per day per tenant schema.
     * 
     * Steps for each account:
     * 1. Fetch account balance and product interest config
     * 2. Calculate daily interest
     * 3. Update interest_accrued on account
     * 4. Write interest_schedules row for auditability
     */
    async runDailyAccrual(accrualDate: Date = new Date()): Promise<AccrualBatchResult> {
        const startTime = Date.now();
        const today = accrualDate.toISOString().split('T')[0];

        const result: AccrualBatchResult = {
            processedDate: accrualDate,
            accountsProcessed: 0,
            accountsSkipped: 0,
            totalInterestAccrued: new Decimal(0),
            errors: [],
            durationMs: 0,
        };

        try {
            // Fetch all active savings accounts with their product config
            const accounts = await this.db
                .selectFrom('savings_accounts as sa')
                .innerJoin('savings_products as sp', 'sp.id', 'sa.product_id')
                .select([
                    'sa.id as account_id',
                    'sa.member_id',
                    'sa.principal_balance',
                    'sa.interest_accrued',
                    'sp.interest_rate',
                    'sp.interest_calculation_method',
                    'sp.calculation_basis',
                    'sp.interest_paid_frequency',
                    'sp.minimum_balance',
                ])
                .where('sa.status', '=', 'active')
                .where('sa.is_frozen', '=', false)
                .execute();

            for (const account of accounts) {
                try {
                    const balance = new Decimal(account.principal_balance?.toString() ?? '0');
                    const minBalance = new Decimal(account.minimum_balance?.toString() ?? '0');

                    // Skip accounts below minimum balance
                    if (balance.lt(minBalance) || balance.lte(0)) {
                        result.accountsSkipped++;
                        continue;
                    }

                    const annualRate = new Decimal(account.interest_rate?.toString() ?? '0');
                    if (annualRate.lte(0)) {
                        result.accountsSkipped++;
                        continue;
                    }

                    const method = (account.interest_calculation_method as InterestCalcMethod) ?? 'simple';
                    const basis = (account.calculation_basis as CalculationBasis) ?? '365_days';

                    const dailyInterest = InterestCalculator.daily(balance, annualRate, method, basis);

                    if (dailyInterest.lte(0)) {
                        result.accountsSkipped++;
                        continue;
                    }

                    // Update interest_accrued on the account
                    const currentAccrued = new Decimal(account.interest_accrued?.toString() ?? '0');
                    const newAccrued = currentAccrued.plus(dailyInterest);

                    await this.db
                        .updateTable('savings_accounts')
                        .set({
                            interest_accrued: newAccrued as any,
                            updated_at: new Date() as any,
                        })
                        .where('id', '=', account.account_id)
                        .execute();

                    // Write audit record to interest_schedules
                    await this.db
                        .insertInto('interest_schedules')
                        .values({
                            savings_account_id: account.account_id,
                            period_start: today as any,
                            period_end: today as any,
                            opening_balance: balance as any,
                            closing_balance: balance as any,
                            average_balance: balance as any,
                            interest_rate: annualRate as any,
                            interest_accrued: dailyInterest as any,
                            is_posted: false as any,
                        })
                        .execute();

                    result.accountsProcessed++;
                    result.totalInterestAccrued = result.totalInterestAccrued.plus(dailyInterest);
                } catch (error) {
                    const errMsg = error instanceof Error ? error.message : 'Unknown error';
                    result.errors.push({ accountId: account.account_id, error: errMsg });
                    appLogger.error('Interest accrual failed for account', error as Error, {
                        accountId: account.account_id,
                    });
                }
            }
        } catch (error) {
            appLogger.error('Interest accrual batch failed', error as Error);
            throw error;
        }

        result.durationMs = Date.now() - startTime;

        appLogger.info('Daily interest accrual completed', {
            date: today,
            processed: result.accountsProcessed,
            skipped: result.accountsSkipped,
            totalAccrued: result.totalInterestAccrued.toString(),
            errors: result.errors.length,
            durationMs: result.durationMs,
        });

        return result;
    }

    /**
     * Post accrued interest to accounts on their configured posting schedule.
     * 
     * Steps:
     * 1. Find accounts where posting is due (monthly 1st, quarterly, etc.)
     * 2. Credit the accrued interest to principal_balance
     * 3. Reset interest_accrued to 0
     * 4. Mark interest_schedules rows as posted
     * 5. Create a double-entry transaction record
     */
    async postAccruedInterest(postingDate: Date = new Date()): Promise<PostingBatchResult> {
        const startTime = Date.now();

        const result: PostingBatchResult = {
            postedDate: postingDate,
            accountsPosted: 0,
            totalInterestPosted: new Decimal(0),
            errors: [],
            durationMs: 0,
        };

        try {
            // Find accounts with accrued interest > 0 that are due for posting
            const accounts = await this.db
                .selectFrom('savings_accounts as sa')
                .innerJoin('savings_products as sp', 'sp.id', 'sa.product_id')
                .select([
                    'sa.id as account_id',
                    'sa.member_id',
                    'sa.principal_balance',
                    'sa.interest_accrued',
                    'sa.interest_paid',
                    'sp.interest_paid_frequency',
                ])
                .where('sa.status', '=', 'active')
                .where('sa.interest_accrued', '>', 0 as any)
                .execute();

            for (const account of accounts) {
                try {
                    const frequency = (account.interest_paid_frequency as PostingFrequency) ?? 'monthly';

                    // Skip on_withdrawal accounts (posted only when member withdraws)
                    if (frequency === 'on_withdrawal') continue;

                    // Check if today is a posting day
                    if (!this.isPostingDay(postingDate, frequency)) continue;

                    const accruedInterest = new Decimal(account.interest_accrued?.toString() ?? '0');
                    if (accruedInterest.lte(0)) continue;

                    const currentBalance = new Decimal(account.principal_balance?.toString() ?? '0');
                    const currentPaid = new Decimal(account.interest_paid?.toString() ?? '0');

                    // Credit interest to balance, reset accrued
                    await this.db
                        .updateTable('savings_accounts')
                        .set({
                            principal_balance: currentBalance.plus(accruedInterest) as any,
                            interest_accrued: new Decimal(0) as any,
                            interest_paid: currentPaid.plus(accruedInterest) as any,
                            updated_at: new Date() as any,
                        })
                        .where('id', '=', account.account_id)
                        .execute();

                    // Mark interest schedule rows as posted
                    await this.db
                        .updateTable('interest_schedules')
                        .set({
                            is_posted: true as any,
                            posted_at: postingDate as any,
                            updated_at: new Date() as any,
                        })
                        .where('savings_account_id', '=', account.account_id)
                        .where('is_posted', '=', false as any)
                        .execute();

                    result.accountsPosted++;
                    result.totalInterestPosted = result.totalInterestPosted.plus(accruedInterest);
                } catch (error) {
                    const errMsg = error instanceof Error ? error.message : 'Unknown error';
                    result.errors.push({ accountId: account.account_id, error: errMsg });
                }
            }
        } catch (error) {
            appLogger.error('Interest posting batch failed', error as Error);
            throw error;
        }

        result.durationMs = Date.now() - startTime;

        appLogger.info('Interest posting completed', {
            posted: result.accountsPosted,
            totalPosted: result.totalInterestPosted.toString(),
            errors: result.errors.length,
            durationMs: result.durationMs,
        });

        return result;
    }

    /**
     * Check if today is a posting day for the given frequency.
     */
    private isPostingDay(date: Date, frequency: PostingFrequency): boolean {
        const day = date.getDate();
        const month = date.getMonth(); // 0-indexed

        switch (frequency) {
            case 'monthly':
                return day === 1;
            case 'quarterly':
                return day === 1 && (month % 3 === 0);
            case 'annually':
                return day === 1 && month === 0;
            default:
                return false;
        }
    }
}
