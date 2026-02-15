/**
 * Job Scheduler
 * 
 * BullMQ-based job processing for recurring SACCO operations.
 * Each tenant's jobs run in isolation via the multi-tenant architecture.
 * 
 * Job types:
 *  - interest_accrual:     Daily savings interest accrual (SAV-016)
 *  - interest_posting:     Periodic interest posting to account balances (SAV-016)
 *  - penalty_calculation:  Daily penalty computation for overdue loans (LON-023)
 *  - npl_flagging:         Daily NPL classification check (LON-028)
 *  - repayment_reminders:  Upcoming repayment notifications (LON-024)
 *  - fd_maturity_check:    Daily FD maturity alerts + auto-rollover
 *  - fd_interest_accrual:  Daily FD interest accrual
 * 
 * Architecture:
 *  - One shared Redis connection across all queues
 *  - One queue per job type (jobs carry tenantSchemaName in data)
 *  - Workers process jobs for any tenant
 *  - scheduled_tasks / scheduled_task_logs tables track execution
 */

import { Queue, Worker, Job } from 'bullmq';
import { createBullRedisConnection } from '../config/redis';
import { getTenantDb, publicDb } from '../config/database';
import { InterestAccrualEngine } from '../services/interestAccrualService';
import { RepaymentService } from '../services/repaymentService';
import { NotificationService } from '../services/notificationService';
import { FixedDepositService } from '../services/fixedDepositService';
import { appLogger } from '../middleware/logger';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface JobData {
    tenantSchemaName: string;
    tenantId: string;
    /** ISO date string — allows replaying a specific date */
    asOfDate?: string;
}

export type JobType =
    | 'interest_accrual'
    | 'interest_posting'
    | 'penalty_calculation'
    | 'npl_flagging'
    | 'repayment_reminders'
    | 'fd_maturity_check'
    | 'fd_interest_accrual';

interface JobDefinition {
    queueName: string;
    /** Cron expression (UTC) */
    cronExpression: string;
    /** Human-readable description */
    description: string;
}

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

const JOB_DEFINITIONS: Record<JobType, JobDefinition> = {
    interest_accrual: {
        queueName: 'sacco-interest-accrual',
        cronExpression: '0 1 * * *',        // Daily at 01:00 UTC
        description: 'Daily savings interest accrual',
    },
    interest_posting: {
        queueName: 'sacco-interest-posting',
        cronExpression: '0 2 1 * *',         // 1st of every month at 02:00 UTC
        description: 'Monthly interest posting to account balances',
    },
    penalty_calculation: {
        queueName: 'sacco-penalty-calculation',
        cronExpression: '0 3 * * *',         // Daily at 03:00 UTC
        description: 'Daily late payment penalty computation',
    },
    npl_flagging: {
        queueName: 'sacco-npl-flagging',
        cronExpression: '0 4 * * *',         // Daily at 04:00 UTC
        description: 'Daily NPL classification check',
    },
    repayment_reminders: {
        queueName: 'sacco-repayment-reminders',
        cronExpression: '0 7 * * *',         // Daily at 07:00 UTC (business hours)
        description: 'Send upcoming repayment reminders',
    },
    fd_maturity_check: {
        queueName: 'sacco-fd-maturity-check',
        cronExpression: '0 5 * * *',         // Daily at 05:00 UTC
        description: 'FD maturity alerts and auto-rollover',
    },
    fd_interest_accrual: {
        queueName: 'sacco-fd-interest-accrual',
        cronExpression: '30 1 * * *',        // Daily at 01:30 UTC (after savings accrual)
        description: 'Daily fixed deposit interest accrual',
    },
};

// Redis connection provided by centralized config/redis.ts

// ────────────────────────────────────────────────────────────
// Job Processor Functions
// ────────────────────────────────────────────────────────────

async function processInterestAccrual(job: Job<JobData>): Promise<void> {
    const { tenantSchemaName, asOfDate } = job.data;
    const db = getTenantDb(tenantSchemaName);
    const engine = new InterestAccrualEngine(db);
    const date = asOfDate ? new Date(asOfDate) : new Date();

    const result = await engine.runDailyAccrual(date);

    await logTaskExecution(tenantSchemaName, 'interest_accrual', {
        recordsProcessed: result.accountsProcessed,
        recordsFailed: result.errors.length,
        status: result.errors.length === 0 ? 'success' : 'partial',
        logs: `Accrued: ${result.totalInterestAccrued.toString()}, Skipped: ${result.accountsSkipped}`,
        errorMessage: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
        durationMs: result.durationMs,
    });
}

async function processInterestPosting(job: Job<JobData>): Promise<void> {
    const { tenantSchemaName, asOfDate } = job.data;
    const db = getTenantDb(tenantSchemaName);
    const engine = new InterestAccrualEngine(db);
    const date = asOfDate ? new Date(asOfDate) : new Date();

    const result = await engine.postAccruedInterest(date);

    await logTaskExecution(tenantSchemaName, 'interest_accrual', {
        recordsProcessed: result.accountsPosted,
        recordsFailed: result.errors.length,
        status: result.errors.length === 0 ? 'success' : 'partial',
        logs: `Posted: ${result.totalInterestPosted.toString()}`,
        errorMessage: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
        durationMs: result.durationMs,
    });
}

async function processPenaltyCalculation(job: Job<JobData>): Promise<void> {
    const { tenantSchemaName, asOfDate } = job.data;
    const db = getTenantDb(tenantSchemaName);
    const service = new RepaymentService(db);
    const notificationService = new NotificationService(db);
    const date = asOfDate ? new Date(asOfDate) : new Date();

    const result = await service.runPenaltyCalculation(date);

    // Send penalty notifications to affected members
    if (result.loansProcessed > 0) {
        try {
            const saccoConfig = await db
                .selectFrom('sacco_configuration')
                .select(['organization_name'])
                .executeTakeFirst();
            const saccoName = saccoConfig?.organization_name || 'SACCO';

            // Get overdue installments with member details for notification
            const overdueLoans = await db
                .selectFrom('loan_schedules as ls')
                .innerJoin('loan_accounts as la', 'la.id', 'ls.loan_account_id')
                .innerJoin('members as m', 'm.id', 'la.member_id')
                .select([
                    'la.loan_number',
                    'la.total_outstanding',
                    'm.id as member_id',
                    'm.first_name',
                    'm.last_name',
                    'm.email',
                    'ls.penalty_payment',
                    'ls.days_overdue',
                ])
                .where('ls.status', '=', 'overdue' as any)
                .where('ls.days_overdue', '>', 0)
                .execute();

            // Deduplicate by member+loan and send notices
            const seen = new Set<string>();
            for (const loan of overdueLoans) {
                const key = `${loan.member_id}:${loan.loan_number}`;
                if (seen.has(key) || !loan.email) continue;
                seen.add(key);

                try {
                    await notificationService.sendPenaltyNotice({
                        memberId: loan.member_id,
                        memberEmail: loan.email,
                        memberName: `${loan.first_name} ${loan.last_name}`,
                        loanAccountNumber: loan.loan_number,
                        penaltyAmount: new (await import('decimal.js')).default(loan.penalty_payment?.toString() ?? '0').toFixed(2),
                        outstandingBalance: new (await import('decimal.js')).default(loan.total_outstanding?.toString() ?? '0').toFixed(2),
                        daysOverdue: loan.days_overdue as number,
                        saccoName,
                    });
                } catch {
                    // Non-fatal: notification failure shouldn't crash the job
                }
            }
        } catch (error) {
            appLogger.error('Failed to send penalty notifications', error as Error);
        }
    }

    await logTaskExecution(tenantSchemaName, 'penalty_calculation', {
        recordsProcessed: result.loansProcessed,
        recordsFailed: result.errors.length,
        status: result.errors.length === 0 ? 'success' : 'partial',
        logs: `Penalties added: ${result.totalPenaltiesAdded.toString()}`,
        errorMessage: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
        durationMs: result.durationMs,
    });
}

async function processNplFlagging(job: Job<JobData>): Promise<void> {
    const { tenantSchemaName, asOfDate } = job.data;
    const db = getTenantDb(tenantSchemaName);
    const service = new RepaymentService(db);
    const notificationService = new NotificationService(db);
    const date = asOfDate ? new Date(asOfDate) : new Date();

    const result = await service.runNplFlagging(date);

    // Send NPL warnings to staff for newly flagged loans
    if (result.loansFlagged > 0) {
        try {
            const saccoConfig = await db
                .selectFrom('sacco_configuration')
                .select(['organization_name'])
                .executeTakeFirst();
            const saccoName = saccoConfig?.organization_name || 'SACCO';

            // Get admin/manager staff to notify
            const adminStaff = await db
                .selectFrom('staff as s')
                .innerJoin('roles as r', 'r.id', 's.role_id')
                .select(['s.email', 's.first_name', 's.last_name'])
                .where('s.status', '=', 'active')
                .where('r.name', 'in', ['admin', 'manager', 'loan_officer'])
                .execute();

            // Get newly flagged NPL loans
            const nplLoans = await db
                .selectFrom('loan_accounts as la')
                .innerJoin('members as m', 'm.id', 'la.member_id')
                .select([
                    'la.loan_number',
                    'la.total_outstanding',
                    'm.first_name',
                    'm.last_name',
                ])
                .where('la.status', '=', 'defaulted')
                .where('la.updated_at', '>=', date as any)
                .execute();

            for (const staffMember of adminStaff) {
                if (!staffMember.email) continue;
                for (const loan of nplLoans) {
                    try {
                        await notificationService.sendNplWarning({
                            staffEmail: staffMember.email,
                            staffName: `${staffMember.first_name} ${staffMember.last_name}`,
                            memberName: `${loan.first_name} ${loan.last_name}`,
                            loanAccountNumber: loan.loan_number,
                            outstandingBalance: new (await import('decimal.js')).default(loan.total_outstanding?.toString() ?? '0').toFixed(2),
                            daysOverdue: 90,
                            saccoName,
                        });
                    } catch {
                        // Non-fatal
                    }
                }
            }
        } catch (error) {
            appLogger.error('Failed to send NPL notifications', error as Error);
        }
    }

    await logTaskExecution(tenantSchemaName, 'npl_flagging', {
        recordsProcessed: result.loansFlagged,
        recordsFailed: result.errors.length,
        status: result.errors.length === 0 ? 'success' : 'partial',
        logs: `Flagged: ${result.loansFlagged}, Already NPL: ${result.loansAlreadyNpl}`,
        errorMessage: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
        durationMs: result.durationMs,
    });
}

async function processRepaymentReminders(job: Job<JobData>): Promise<void> {
    const { tenantSchemaName } = job.data;
    const db = getTenantDb(tenantSchemaName);
    const repaymentService = new RepaymentService(db);
    const notificationService = new NotificationService(db);
    const startTime = Date.now();

    const reminders = await repaymentService.getUpcomingReminders(7);

    let sent = 0;
    let failed = 0;

    // Get SACCO name for email templates
    const saccoConfig = await db
        .selectFrom('sacco_configuration')
        .select(['organization_name'])
        .executeTakeFirst();
    const saccoName = saccoConfig?.organization_name || 'SACCO';

    for (const reminder of reminders) {
        try {
            // Look up member details for notification
            const member = await db
                .selectFrom('members')
                .select(['id', 'first_name', 'last_name', 'email', 'phone'])
                .where('id', '=', reminder.memberId)
                .executeTakeFirst();

            if (!member || !member.email) {
                failed++;
                continue;
            }

            await notificationService.sendRepaymentReminder({
                memberId: member.id,
                memberName: `${member.first_name} ${member.last_name}`,
                memberEmail: member.email,
                loanAccountNumber: reminder.loanNumber,
                installmentAmount: reminder.amountDue.toFixed(2),
                dueDate: reminder.dueDate.toISOString().split('T')[0],
                daysUntilDue: reminder.daysUntilDue,
                outstandingBalance: reminder.amountDue.toFixed(2),
                saccoName,
            });
            sent++;
        } catch (error) {
            failed++;
            appLogger.error('Failed to send reminder', error as Error, {
                loanAccountId: reminder.loanAccountId,
                memberId: reminder.memberId,
            });
        }
    }

    const durationMs = Date.now() - startTime;

    appLogger.info('Repayment reminders processed', {
        tenant: tenantSchemaName,
        total: reminders.length,
        sent,
        failed,
    });

    await logTaskExecution(tenantSchemaName, 'reminder_sending', {
        recordsProcessed: sent,
        recordsFailed: failed,
        status: failed === 0 ? 'success' : (sent > 0 ? 'partial' : 'failed'),
        logs: `Sent: ${sent}, Failed: ${failed}, Total: ${reminders.length}`,
        errorMessage: null,
        durationMs,
    });
}

async function processFdMaturityCheck(job: Job<JobData>): Promise<void> {
    const { tenantSchemaName, asOfDate } = job.data;
    const db = getTenantDb(tenantSchemaName);
    const service = new FixedDepositService(db);
    const date = asOfDate ? new Date(asOfDate) : new Date();

    const result = await service.runMaturityCheck(date);

    await logTaskExecution(tenantSchemaName, 'fd_maturity_check', {
        recordsProcessed: result.depositsMatured + result.alertsSent,
        recordsFailed: result.errors.length,
        status: result.errors.length === 0 ? 'success' : 'partial',
        logs: `Alerts: ${result.alertsSent}, Matured: ${result.depositsMatured}, Rolled over: ${result.depositsRolledOver}`,
        errorMessage: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
        durationMs: result.durationMs,
    });
}

async function processFdInterestAccrual(job: Job<JobData>): Promise<void> {
    const { tenantSchemaName, asOfDate } = job.data;
    const db = getTenantDb(tenantSchemaName);
    const service = new FixedDepositService(db);
    const date = asOfDate ? new Date(asOfDate) : new Date();

    const result = await service.runDailyInterestAccrual(date);

    await logTaskExecution(tenantSchemaName, 'fd_interest_accrual', {
        recordsProcessed: result.depositsProcessed,
        recordsFailed: result.errors.length,
        status: result.errors.length === 0 ? 'success' : 'partial',
        logs: `Accrued: ${result.totalInterestAccrued.toString()}`,
        errorMessage: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
        durationMs: result.durationMs,
    });
}

// ────────────────────────────────────────────────────────────
// Task Execution Logging (writes to scheduled_task_logs)
// ────────────────────────────────────────────────────────────

async function logTaskExecution(
    schemaName: string,
    taskType: string,
    data: {
        recordsProcessed: number;
        recordsFailed: number;
        status: 'success' | 'failed' | 'partial';
        logs: string;
        errorMessage: string | null;
        durationMs: number;
    },
): Promise<void> {
    try {
        const db = getTenantDb(schemaName);
        const now = new Date();

        // Find the task by type
        const task = await db
            .selectFrom('scheduled_tasks')
            .select(['id'])
            .where('task_type', '=', taskType as any)
            .where('is_active', '=', true as any)
            .executeTakeFirst();

        if (!task) return;

        // Update task last execution info
        await db
            .updateTable('scheduled_tasks')
            .set({
                last_execution_at: now as any,
                last_execution_status: data.status as any,
                updated_at: now as any,
            })
            .where('id', '=', task.id)
            .execute();

        // Insert execution log
        const executionEnd = new Date(now.getTime() + data.durationMs);

        await db
            .insertInto('scheduled_task_logs')
            .values({
                task_id: task.id,
                execution_start: now as any,
                execution_end: executionEnd as any,
                execution_status: data.status as any,
                records_processed: data.recordsProcessed,
                records_failed: data.recordsFailed,
                error_message: data.errorMessage,
                logs: data.logs,
            })
            .execute();
    } catch (error) {
        // Non-fatal: logging should never crash the job
        appLogger.error('Failed to log task execution', error as Error, {
            schema: schemaName,
            taskType,
        });
    }
}

// ────────────────────────────────────────────────────────────
// Scheduler Manager
// ────────────────────────────────────────────────────────────

export class JobScheduler {
    // Cast needed: ioredis version used directly may differ from BullMQ's bundled version
    private connection: any;
    private queues: Map<JobType, Queue> = new Map();
    private workers: Map<JobType, Worker> = new Map();

    constructor() {
        this.connection = createBullRedisConnection();
    }

    /**
     * Initialize all queues and workers.
     * Call this once at server startup.
     */
    async start(): Promise<void> {
        appLogger.info('Starting job scheduler...');

        // Create queues
        for (const [jobType, def] of Object.entries(JOB_DEFINITIONS) as [JobType, JobDefinition][]) {
            const queue = new Queue(def.queueName, {
                connection: this.connection,
                defaultJobOptions: {
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 5000 },
                    removeOnComplete: { count: 100 },
                    removeOnFail: { count: 200 },
                },
            });

            this.queues.set(jobType, queue);
        }

        // Create workers
        this.createWorker('interest_accrual', processInterestAccrual);
        this.createWorker('interest_posting', processInterestPosting);
        this.createWorker('penalty_calculation', processPenaltyCalculation);
        this.createWorker('npl_flagging', processNplFlagging);
        this.createWorker('repayment_reminders', processRepaymentReminders);
        this.createWorker('fd_maturity_check', processFdMaturityCheck);
        this.createWorker('fd_interest_accrual', processFdInterestAccrual);

        // Schedule repeating jobs for all active tenants
        await this.scheduleAllTenants();

        appLogger.info('Job scheduler started', {
            queues: Array.from(this.queues.keys()),
        });
    }

    /**
     * Schedule recurring jobs for all active tenants.
     */
    async scheduleAllTenants(): Promise<void> {
        try {
            const tenants = await publicDb
                .selectFrom('tenants')
                .select(['id', 'schema_name', 'sacco_name'])
                .where('status', '=', 'active')
                .where('is_active', '=', true as any)
                .execute();

            for (const tenant of tenants) {
                await this.scheduleTenantJobs(tenant.id, tenant.schema_name);
            }

            appLogger.info('Scheduled jobs for all tenants', { count: tenants.length });
        } catch (error) {
            appLogger.error('Failed to schedule tenant jobs', error as Error);
        }
    }

    /**
     * Schedule all recurring jobs for a specific tenant.
     */
    async scheduleTenantJobs(tenantId: string, schemaName: string): Promise<void> {
        const jobData: JobData = { tenantSchemaName: schemaName, tenantId };

        for (const [jobType, def] of Object.entries(JOB_DEFINITIONS) as [JobType, JobDefinition][]) {
            const queue = this.queues.get(jobType as JobType);
            if (!queue) continue;

            const repeatJobId = `${jobType}:${schemaName}`;

            await queue.add(repeatJobId, jobData, {
                repeat: {
                    pattern: def.cronExpression,
                },
                jobId: repeatJobId,
            });
        }
    }

    /**
     * Remove all scheduled jobs for a tenant (e.g., when suspended).
     */
    async unscheduleTenantJobs(schemaName: string): Promise<void> {
        for (const [jobType, queue] of this.queues) {
            const repeatJobId = `${jobType}:${schemaName}`;

            const repeatable = await queue.getRepeatableJobs();
            for (const rj of repeatable) {
                if (rj.id === repeatJobId) {
                    await queue.removeRepeatableByKey(rj.key);
                }
            }
        }
    }

    /**
     * Manually trigger a job for a specific tenant (admin action).
     */
    async triggerJob(
        jobType: JobType,
        tenantId: string,
        schemaName: string,
        asOfDate?: Date,
    ): Promise<string> {
        const queue = this.queues.get(jobType);
        if (!queue) throw new Error(`Unknown job type: ${jobType}`);

        const jobData: JobData = {
            tenantSchemaName: schemaName,
            tenantId,
            asOfDate: asOfDate?.toISOString(),
        };

        const job = await queue.add(`manual:${jobType}:${schemaName}`, jobData, {
            priority: 1, // Higher priority than scheduled jobs
        });

        appLogger.info('Manual job triggered', {
            jobType,
            tenant: schemaName,
            jobId: job.id,
        });

        return job.id ?? 'unknown';
    }

    /**
     * Graceful shutdown.
     */
    async stop(): Promise<void> {
        appLogger.info('Stopping job scheduler...');

        for (const worker of this.workers.values()) {
            await worker.close();
        }

        for (const queue of this.queues.values()) {
            await queue.close();
        }

        await this.connection.quit();

        appLogger.info('Job scheduler stopped');
    }

    /**
     * Get queue stats for monitoring.
     */
    async getStats(): Promise<Record<JobType, { waiting: number; active: number; completed: number; failed: number }>> {
        const stats: Record<string, any> = {};

        for (const [jobType, queue] of this.queues) {
            const [waiting, active, completed, failed] = await Promise.all([
                queue.getWaitingCount(),
                queue.getActiveCount(),
                queue.getCompletedCount(),
                queue.getFailedCount(),
            ]);
            stats[jobType] = { waiting, active, completed, failed };
        }

        return stats as Record<JobType, any>;
    }

    // ──────────────────────────────────────────────
    // Private
    // ──────────────────────────────────────────────

    private createWorker(jobType: JobType, processor: (job: Job<JobData>) => Promise<void>): void {
        const def = JOB_DEFINITIONS[jobType];

        const worker = new Worker(def.queueName, processor, {
            connection: this.connection,
            concurrency: 2,
            limiter: {
                max: 5,
                duration: 60_000, // Max 5 jobs per minute per queue
            },
        });

        worker.on('completed', (job) => {
            appLogger.info(`Job completed: ${job.name}`, { jobId: job.id });
        });

        worker.on('failed', (job, err) => {
            appLogger.error(`Job failed: ${job?.name}`, err, { jobId: job?.id });
        });

        worker.on('error', (err) => {
            appLogger.error(`Worker error on ${def.queueName}`, err);
        });

        this.workers.set(jobType, worker);
    }
}

// Singleton instance
let _scheduler: JobScheduler | null = null;

export function getJobScheduler(): JobScheduler {
    if (!_scheduler) {
        _scheduler = new JobScheduler();
    }
    return _scheduler;
}

export async function startJobScheduler(): Promise<void> {
    const scheduler = getJobScheduler();
    await scheduler.start();
}

export async function stopJobScheduler(): Promise<void> {
    if (_scheduler) {
        await _scheduler.stop();
        _scheduler = null;
    }
}
