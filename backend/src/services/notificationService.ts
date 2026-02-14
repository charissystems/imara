/**
 * Notification Service
 *
 * Centralized notification dispatcher for the SACCO platform.
 * Coordinates template rendering, channel selection, and delivery
 * across email (and future SMS/push channels).
 *
 * Features:
 *  - Template engine with {{merge_field}} substitution
 *  - Per-member communication preference checks
 *  - Channel dispatch (email now, SMS/push later)
 *  - Bulk notification support
 *  - Notification settings per notification type
 */

import { Kysely } from 'kysely';
import { TenantDatabase } from '../database/types';
import { EmailService, SendEmailResult } from './emailService';
import { appLogger } from '../middleware/logger';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type NotificationChannel = 'email' | 'sms' | 'push' | 'in_app';

export interface NotificationRecipient {
    memberId?: string;
    staffId?: string;
    email?: string;
    phone?: string;
    name?: string;
}

export interface SendNotificationOptions {
    /** The notification type (e.g., 'loan_repayment_reminder', 'password_reset') */
    type: string;
    /** Recipient info */
    recipient: NotificationRecipient;
    /** Template code to use (from message_templates) */
    templateCode?: string;
    /** Override channels (uses notification_settings if not provided) */
    channels?: NotificationChannel[];
    /** Variables to merge into the template */
    variables: Record<string, string | number | boolean>;
    /** Direct subject override (skips template) */
    subject?: string;
    /** Direct body override (skips template) */
    body?: string;
    /** Source entity for audit trail */
    sourceType?: string;
    sourceId?: string;
}

export interface NotificationResult {
    success: boolean;
    channelResults: {
        channel: NotificationChannel;
        success: boolean;
        messageId?: string;
        error?: string;
    }[];
}

export interface BulkNotificationOptions {
    type: string;
    templateCode: string;
    recipients: (NotificationRecipient & { variables?: Record<string, string | number | boolean> })[];
    /** Shared variables applied to all recipients */
    sharedVariables?: Record<string, string | number | boolean>;
    channels?: NotificationChannel[];
    sourceType?: string;
    sourceId?: string;
}

export interface BulkNotificationResult {
    total: number;
    sent: number;
    failed: number;
    results: NotificationResult[];
}

// ────────────────────────────────────────────────────────────
// Template Types
// ────────────────────────────────────────────────────────────

interface ResolvedTemplate {
    subject: string;
    body: string;
    channel: NotificationChannel;
    templateId: string;
}

// ────────────────────────────────────────────────────────────
// Notification Service
// ────────────────────────────────────────────────────────────

export class NotificationService {
    private db: Kysely<TenantDatabase>;
    private emailService: EmailService;

    constructor(db: Kysely<TenantDatabase>) {
        this.db = db;
        this.emailService = new EmailService(db);
    }

    /**
     * Send a notification to a single recipient.
     * Resolves template, checks preferences, dispatches to channels.
     */
    async send(options: SendNotificationOptions): Promise<NotificationResult> {
        const channelResults: NotificationResult['channelResults'] = [];

        // 1. Determine which channels to use
        const channels = options.channels || (await this.resolveChannels(options.type));

        // 2. Check member communication preferences (if applicable)
        const allowedChannels = options.recipient.memberId
            ? await this.filterByPreferences(options.recipient.memberId, channels, options.type)
            : channels;

        if (allowedChannels.length === 0) {
            appLogger.info('Notification skipped — all channels opted out', {
                type: options.type,
                memberId: options.recipient.memberId,
            });
            return { success: true, channelResults: [] };
        }

        // 3. Resolve template (or use direct subject/body)
        for (const channel of allowedChannels) {
            try {
                let subject: string;
                let body: string;
                let templateId: string | undefined;

                if (options.templateCode) {
                    const template = await this.resolveTemplate(
                        options.templateCode,
                        channel,
                        options.variables,
                    );
                    subject = template.subject;
                    body = template.body;
                    templateId = template.templateId;
                } else {
                    subject = this.mergeVariables(options.subject || '', options.variables);
                    body = this.mergeVariables(options.body || '', options.variables);
                }

                // 4. Dispatch to channel
                const result = await this.dispatch(channel, {
                    recipient: options.recipient,
                    subject,
                    body,
                    templateId,
                    sourceType: options.sourceType,
                    sourceId: options.sourceId,
                });

                channelResults.push(result);
            } catch (error) {
                channelResults.push({
                    channel,
                    success: false,
                    error: (error as Error).message,
                });
            }
        }

        const overallSuccess = channelResults.some((r) => r.success);

        return { success: overallSuccess, channelResults };
    }

    /**
     * Send notifications to multiple recipients.
     */
    async sendBulk(options: BulkNotificationOptions): Promise<BulkNotificationResult> {
        const results: NotificationResult[] = [];
        let sent = 0;
        let failed = 0;

        for (const recipient of options.recipients) {
            const variables = {
                ...options.sharedVariables,
                ...recipient.variables,
            };

            const result = await this.send({
                type: options.type,
                recipient,
                templateCode: options.templateCode,
                channels: options.channels,
                variables,
                sourceType: options.sourceType,
                sourceId: options.sourceId,
            });

            results.push(result);
            if (result.success) sent++;
            else failed++;
        }

        appLogger.info('Bulk notification complete', {
            type: options.type,
            total: options.recipients.length,
            sent,
            failed,
        });

        return {
            total: options.recipients.length,
            sent,
            failed,
            results,
        };
    }

    // ──────────────────────────────────────────────
    // Channel Resolution
    // ──────────────────────────────────────────────

    /**
     * Determine which channels are enabled for a notification type
     * from the notification_settings table.
     */
    private async resolveChannels(notificationType: string): Promise<NotificationChannel[]> {
        try {
            const setting = await this.db
                .selectFrom('notification_settings')
                .selectAll()
                .where('notification_type', '=', notificationType)
                .executeTakeFirst();

            if (!setting) {
                // Default: email only
                return ['email'];
            }

            const channels: NotificationChannel[] = [];
            if (setting.email_enabled) channels.push('email');
            if (setting.sms_enabled) channels.push('sms');
            if (setting.push_enabled) channels.push('push');
            if (setting.in_app_enabled) channels.push('in_app');

            return channels.length > 0 ? channels : ['email'];
        } catch {
            return ['email'];
        }
    }

    /**
     * Filter channels by member's communication preferences.
     */
    private async filterByPreferences(
        memberId: string,
        channels: NotificationChannel[],
        notificationType: string,
    ): Promise<NotificationChannel[]> {
        try {
            const prefs = await this.db
                .selectFrom('communication_preferences')
                .selectAll()
                .where('member_id', '=', memberId)
                .executeTakeFirst();

            if (!prefs) return channels; // No preferences set = allow all

            return channels.filter((channel) => {
                // Check channel-level opt-in
                switch (channel) {
                    case 'email': if (!prefs.email_enabled) return false; break;
                    case 'sms': if (!prefs.sms_enabled) return false; break;
                    case 'push': if (!prefs.push_enabled) return false; break;
                    case 'in_app': if (!prefs.in_app_enabled) return false; break;
                }

                // Check category-level opt-in
                if (notificationType.includes('loan') && !prefs.loan_related) return false;
                if (notificationType.includes('transaction') && !prefs.transaction_alerts) return false;
                if (notificationType.includes('statement') && !prefs.account_statements) return false;
                if (notificationType.includes('promotional') && !prefs.promotional_messages) return false;

                return true;
            });
        } catch {
            return channels;
        }
    }

    // ──────────────────────────────────────────────
    // Template Engine
    // ──────────────────────────────────────────────

    /**
     * Resolve a template by code and channel, then merge variables.
     */
    private async resolveTemplate(
        templateCode: string,
        channel: NotificationChannel,
        variables: Record<string, string | number | boolean>,
    ): Promise<ResolvedTemplate> {
        const template = await this.db
            .selectFrom('message_templates')
            .selectAll()
            .where('code', '=', templateCode)
            .where('channel', '=', channel as any)
            .where('is_active', '=', true as any)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

        if (!template) {
            // Try any channel as fallback
            const fallback = await this.db
                .selectFrom('message_templates')
                .selectAll()
                .where('code', '=', templateCode)
                .where('is_active', '=', true as any)
                .where('deleted_at', 'is', null)
                .executeTakeFirst();

            if (!fallback) {
                throw new Error(`Template not found: ${templateCode} (channel: ${channel})`);
            }

            return {
                subject: this.mergeVariables(fallback.subject || '', variables),
                body: this.mergeVariables(fallback.body, variables),
                channel: fallback.channel as NotificationChannel,
                templateId: fallback.id,
            };
        }

        return {
            subject: this.mergeVariables(template.subject || '', variables),
            body: this.mergeVariables(template.body, variables),
            channel: template.channel as NotificationChannel,
            templateId: template.id,
        };
    }

    /**
     * Replace {{variable_name}} placeholders with actual values.
     * Supports nested access: {{member.name}}, {{loan.amount}}
     */
    mergeVariables(
        text: string,
        variables: Record<string, string | number | boolean>,
    ): string {
        return text.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, key: string) => {
            const value = variables[key];
            if (value !== undefined && value !== null) {
                return String(value);
            }
            // Leave placeholder if variable not found (aids debugging)
            return `{{${key}}}`;
        });
    }

    // ──────────────────────────────────────────────
    // Channel Dispatch
    // ──────────────────────────────────────────────

    /**
     * Dispatch a notification to a specific channel.
     */
    private async dispatch(
        channel: NotificationChannel,
        data: {
            recipient: NotificationRecipient;
            subject: string;
            body: string;
            templateId?: string;
            sourceType?: string;
            sourceId?: string;
        },
    ): Promise<NotificationResult['channelResults'][number]> {
        switch (channel) {
            case 'email':
                return this.dispatchEmail(data);

            case 'sms':
                // SMS integration deferred — log and skip
                appLogger.info('SMS notification skipped (not configured)', {
                    recipient: data.recipient.phone,
                    subject: data.subject,
                });
                return { channel: 'sms', success: false, error: 'SMS not configured' };

            case 'push':
                appLogger.info('Push notification skipped (not configured)', {
                    recipient: data.recipient.memberId,
                });
                return { channel: 'push', success: false, error: 'Push not configured' };

            case 'in_app':
                return this.dispatchInApp(data);

            default:
                return { channel, success: false, error: `Unknown channel: ${channel}` };
        }
    }

    /**
     * Send via email channel.
     */
    private async dispatchEmail(data: {
        recipient: NotificationRecipient;
        subject: string;
        body: string;
        templateId?: string;
        sourceType?: string;
        sourceId?: string;
    }): Promise<NotificationResult['channelResults'][number]> {
        const email = data.recipient.email;
        if (!email) {
            return { channel: 'email', success: false, error: 'No email address for recipient' };
        }

        const result: SendEmailResult = await this.emailService.send({
            to: email,
            subject: data.subject,
            html: data.body,
            memberId: data.recipient.memberId,
            staffId: data.recipient.staffId,
            templateId: data.templateId,
            sourceType: data.sourceType,
            sourceId: data.sourceId,
        });

        return {
            channel: 'email',
            success: result.success,
            messageId: result.messageId,
            error: result.error,
        };
    }

    /**
     * Record in-app notification in messages table.
     */
    private async dispatchInApp(data: {
        recipient: NotificationRecipient;
        subject: string;
        body: string;
        templateId?: string;
        sourceType?: string;
        sourceId?: string;
    }): Promise<NotificationResult['channelResults'][number]> {
        try {
            const result = await this.db
                .insertInto('messages')
                .values({
                    member_id: data.recipient.memberId ?? null,
                    staff_id: data.recipient.staffId ?? null,
                    channel: 'in_app',
                    subject: data.subject,
                    body: data.body,
                    status: 'delivered',
                    sent_at: new Date() as any,
                    template_id: data.templateId ?? null,
                    source_type: data.sourceType ?? null,
                    source_id: data.sourceId ?? null,
                } as any)
                .returning('id')
                .executeTakeFirstOrThrow();

            return { channel: 'in_app', success: true, messageId: result.id };
        } catch (error) {
            return {
                channel: 'in_app',
                success: false,
                error: (error as Error).message,
            };
        }
    }

    // ──────────────────────────────────────────────
    // Convenience Methods for Common Notifications
    // ──────────────────────────────────────────────

    /**
     * Send a loan repayment reminder.
     */
    async sendRepaymentReminder(data: {
        memberId: string;
        memberName: string;
        memberEmail: string;
        loanAccountNumber: string;
        installmentAmount: string;
        dueDate: string;
        daysUntilDue: number;
        outstandingBalance: string;
        saccoName: string;
    }): Promise<NotificationResult> {
        return this.send({
            type: 'loan_repayment_reminder',
            recipient: {
                memberId: data.memberId,
                email: data.memberEmail,
                name: data.memberName,
            },
            templateCode: 'LOAN_REPAYMENT_REMINDER',
            variables: {
                member_name: data.memberName,
                loan_account: data.loanAccountNumber,
                installment_amount: data.installmentAmount,
                due_date: data.dueDate,
                days_until_due: data.daysUntilDue,
                outstanding_balance: data.outstandingBalance,
                sacco_name: data.saccoName,
            },
            sourceType: 'loan_reminder',
        });
    }

    /**
     * Send a password reset email.
     */
    async sendPasswordReset(data: {
        staffId: string;
        staffEmail: string;
        staffName: string;
        resetToken: string;
        expiresInMinutes: number;
        saccoName: string;
    }): Promise<NotificationResult> {
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${data.resetToken}`;

        return this.send({
            type: 'password_reset',
            recipient: {
                staffId: data.staffId,
                email: data.staffEmail,
                name: data.staffName,
            },
            channels: ['email'], // Password reset is always email-only
            subject: `Password Reset — ${data.saccoName}`,
            body: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Password Reset Request</h2>
                    <p>Hello ${data.staffName},</p>
                    <p>We received a request to reset your password for <strong>${data.saccoName}</strong>.</p>
                    <p>Click the button below to reset your password:</p>
                    <p style="text-align: center; margin: 30px 0;">
                        <a href="${resetUrl}" 
                           style="background-color: #4F46E5; color: white; padding: 12px 32px; 
                                  text-decoration: none; border-radius: 6px; font-size: 16px;">
                            Reset Password
                        </a>
                    </p>
                    <p style="color: #666; font-size: 14px;">
                        This link expires in <strong>${data.expiresInMinutes} minutes</strong>.
                    </p>
                    <p style="color: #666; font-size: 14px;">
                        If you did not request this reset, please ignore this email.
                    </p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="color: #999; font-size: 12px;">${data.saccoName} — Secure Banking Platform</p>
                </div>
            `,
            variables: {
                staff_name: data.staffName,
                reset_url: resetUrl,
                expires_in: data.expiresInMinutes,
                sacco_name: data.saccoName,
            },
        });
    }

    /**
     * Send a welcome notification to a new member.
     */
    async sendWelcome(data: {
        memberId: string;
        memberName: string;
        memberEmail: string;
        memberNumber: string;
        saccoName: string;
    }): Promise<NotificationResult> {
        return this.send({
            type: 'member_welcome',
            recipient: {
                memberId: data.memberId,
                email: data.memberEmail,
                name: data.memberName,
            },
            templateCode: 'MEMBER_WELCOME',
            variables: {
                member_name: data.memberName,
                member_number: data.memberNumber,
                sacco_name: data.saccoName,
            },
            sourceType: 'member_registration',
            sourceId: data.memberId,
        });
    }

    /**
     * Send a transaction alert (deposit/withdrawal).
     */
    async sendTransactionAlert(data: {
        memberId: string;
        memberEmail: string;
        memberName: string;
        transactionType: 'deposit' | 'withdrawal' | 'transfer';
        amount: string;
        accountNumber: string;
        newBalance: string;
        reference: string;
        saccoName: string;
    }): Promise<NotificationResult> {
        return this.send({
            type: 'transaction_alert',
            recipient: {
                memberId: data.memberId,
                email: data.memberEmail,
                name: data.memberName,
            },
            templateCode: 'TRANSACTION_ALERT',
            variables: {
                member_name: data.memberName,
                transaction_type: data.transactionType,
                amount: data.amount,
                account_number: data.accountNumber,
                new_balance: data.newBalance,
                reference: data.reference,
                sacco_name: data.saccoName,
            },
            sourceType: 'transaction',
        });
    }

    /**
     * Send penalty notice to a member when a late payment penalty is applied.
     */
    async sendPenaltyNotice(data: {
        memberId: string;
        memberEmail: string;
        memberName: string;
        loanAccountNumber: string;
        penaltyAmount: string;
        outstandingBalance: string;
        daysOverdue: number;
        saccoName: string;
    }): Promise<NotificationResult> {
        return this.send({
            type: 'loan_penalty_notice',
            recipient: {
                memberId: data.memberId,
                email: data.memberEmail,
                name: data.memberName,
            },
            templateCode: 'LOAN_PENALTY_NOTICE',
            variables: {
                member_name: data.memberName,
                loan_account: data.loanAccountNumber,
                penalty_amount: data.penaltyAmount,
                outstanding_balance: data.outstandingBalance,
                days_overdue: data.daysOverdue,
                sacco_name: data.saccoName,
            },
            sourceType: 'penalty_notice',
        });
    }

    /**
     * Send NPL warning to staff when a loan is flagged as non-performing.
     */
    async sendNplWarning(data: {
        staffEmail: string;
        staffName: string;
        memberName: string;
        loanAccountNumber: string;
        outstandingBalance: string;
        daysOverdue: number;
        saccoName: string;
    }): Promise<NotificationResult> {
        return this.send({
            type: 'npl_warning',
            recipient: {
                email: data.staffEmail,
                name: data.staffName,
            },
            templateCode: 'NPL_WARNING',
            variables: {
                staff_name: data.staffName,
                member_name: data.memberName,
                loan_account: data.loanAccountNumber,
                outstanding_balance: data.outstandingBalance,
                days_overdue: data.daysOverdue,
                sacco_name: data.saccoName,
            },
            sourceType: 'npl_warning',
        });
    }

    /**
     * Send overdue notice to a member when their installment is past due.
     */
    async sendOverdueNotice(data: {
        memberId: string;
        memberEmail: string;
        memberName: string;
        loanAccountNumber: string;
        installmentAmount: string;
        dueDate: string;
        daysOverdue: number;
        outstandingBalance: string;
        saccoName: string;
    }): Promise<NotificationResult> {
        return this.send({
            type: 'loan_overdue_notice',
            recipient: {
                memberId: data.memberId,
                email: data.memberEmail,
                name: data.memberName,
            },
            templateCode: 'LOAN_OVERDUE_NOTICE',
            variables: {
                member_name: data.memberName,
                loan_account: data.loanAccountNumber,
                installment_amount: data.installmentAmount,
                due_date: data.dueDate,
                days_overdue: data.daysOverdue,
                outstanding_balance: data.outstandingBalance,
                sacco_name: data.saccoName,
            },
            sourceType: 'overdue_notice',
        });
    }

    /**
     * Send FD maturity alert.
     */
    async sendMaturityAlert(data: {
        memberId: string;
        memberEmail: string;
        memberName: string;
        depositAmount: string;
        maturityDate: string;
        daysUntilMaturity: number;
        accountNumber: string;
        saccoName: string;
    }): Promise<NotificationResult> {
        return this.send({
            type: 'fd_maturity_alert',
            recipient: {
                memberId: data.memberId,
                email: data.memberEmail,
                name: data.memberName,
            },
            templateCode: 'FD_MATURITY_ALERT',
            variables: {
                member_name: data.memberName,
                deposit_amount: data.depositAmount,
                maturity_date: data.maturityDate,
                days_until_maturity: data.daysUntilMaturity,
                account_number: data.accountNumber,
                sacco_name: data.saccoName,
            },
            sourceType: 'maturity_alert',
        });
    }
}
