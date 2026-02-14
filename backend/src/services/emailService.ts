/**
 * Email Service
 *
 * SMTP-based email sending with support for:
 *  - Per-tenant gateway configuration (from email_gateways table)
 *  - Fallback to env-based SMTP config
 *  - Template rendering with merge fields
 *  - Delivery tracking via message_delivery_log
 *  - Retry with exponential backoff
 *  - HTML and plain-text content
 *  - Attachments
 */

import nodemailer, { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { Kysely } from 'kysely';
import { TenantDatabase } from '../database/types';
import { appLogger } from '../middleware/logger';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface EmailAttachment {
    filename: string;
    content: string | Buffer;
    contentType?: string;
    encoding?: 'base64' | 'utf-8';
}

export interface SendEmailOptions {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    cc?: string | string[];
    bcc?: string | string[];
    attachments?: EmailAttachment[];
    /** Link to source entity (e.g., loan_id, member_id) */
    sourceType?: string;
    sourceId?: string;
    /** Link to member/staff for message tracking */
    memberId?: string;
    staffId?: string;
    /** Template that was used (for audit trail) */
    templateId?: string;
}

export interface SendEmailResult {
    success: boolean;
    messageId?: string;
    provider: string;
    providerReference?: string;
    error?: string;
}

export interface EmailGatewayConfig {
    provider: 'sendgrid' | 'aws_ses' | 'mailgun' | 'smtp';
    apiKey?: string;
    fromEmail: string;
    fromName?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpUsername?: string;
    smtpPassword?: string;
    smtpUseTls?: boolean;
}

// ────────────────────────────────────────────────────────────
// Email Service
// ────────────────────────────────────────────────────────────

export class EmailService {
    private db: Kysely<TenantDatabase>;
    private transporterCache: Map<string, Transporter> = new Map();

    constructor(db: Kysely<TenantDatabase>) {
        this.db = db;
    }

    /**
     * Send an email using the tenant's configured gateway.
     * Falls back to environment SMTP config if no gateway is configured.
     */
    async send(options: SendEmailOptions): Promise<SendEmailResult> {
        const gateway = await this.getActiveGateway();
        const transporter = await this.getTransporter(gateway);

        const recipients = Array.isArray(options.to) ? options.to : [options.to];

        // Record the message in the messages table BEFORE sending
        const messageId = await this.recordMessage(options, gateway);

        try {
            const mailOptions: nodemailer.SendMailOptions = {
                from: gateway.fromName
                    ? `"${gateway.fromName}" <${gateway.fromEmail}>`
                    : gateway.fromEmail,
                to: recipients.join(', '),
                subject: options.subject,
                html: options.html,
                text: options.text || this.stripHtml(options.html),
                cc: options.cc
                    ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc)
                    : undefined,
                bcc: options.bcc
                    ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc)
                    : undefined,
                attachments: options.attachments?.map((a) => ({
                    filename: a.filename,
                    content: a.content,
                    contentType: a.contentType,
                    encoding: a.encoding,
                })),
            };

            const info = await transporter.sendMail(mailOptions);

            // Update message status to 'sent'
            await this.updateMessageStatus(messageId, 'sent', info.messageId);

            // Log delivery attempt
            await this.logDelivery(messageId, {
                status: 'sent',
                provider: gateway.provider,
                providerReference: info.messageId,
                providerResponse: { accepted: info.accepted, rejected: info.rejected },
            });

            appLogger.success('Email sent', {
                to: recipients,
                subject: options.subject,
                provider: gateway.provider,
                messageId: info.messageId,
            });

            return {
                success: true,
                messageId,
                provider: gateway.provider,
                providerReference: info.messageId,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            // Update message status to 'failed'
            await this.updateMessageStatus(messageId, 'failed', undefined, errorMessage);

            // Log failed delivery attempt
            await this.logDelivery(messageId, {
                status: 'failed',
                provider: gateway.provider,
                errorMessage,
            });

            appLogger.error('Email send failed', error as Error, {
                to: recipients,
                subject: options.subject,
                provider: gateway.provider,
            });

            return {
                success: false,
                messageId,
                provider: gateway.provider,
                error: errorMessage,
            };
        }
    }

    /**
     * Send email with automatic retry (exponential backoff).
     * @param options - Email options
     * @param maxRetries - Maximum number of retry attempts (default 3)
     */
    async sendWithRetry(
        options: SendEmailOptions,
        maxRetries = 3,
    ): Promise<SendEmailResult> {
        let lastResult: SendEmailResult | null = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            if (attempt > 0) {
                const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                await new Promise((resolve) => setTimeout(resolve, delay));
                appLogger.info(`Retrying email send (attempt ${attempt + 1}/${maxRetries + 1})`, {
                    to: options.to,
                    subject: options.subject,
                });
            }

            lastResult = await this.send(options);
            if (lastResult.success) return lastResult;
        }

        return lastResult!;
    }

    /**
     * Test the email gateway configuration by sending a test email.
     */
    async testGateway(testEmail: string): Promise<SendEmailResult> {
        return this.send({
            to: testEmail,
            subject: 'SACCO Email Gateway Test',
            html: `
                <h2>Email Gateway Test</h2>
                <p>This is a test email from your SACCO system.</p>
                <p>If you received this, your email gateway is configured correctly.</p>
                <p><small>Sent at: ${new Date().toISOString()}</small></p>
            `,
        });
    }

    // ──────────────────────────────────────────────
    // Gateway Resolution
    // ──────────────────────────────────────────────

    /**
     * Get the active (primary) email gateway from the database.
     * Falls back to environment variables if none configured.
     */
    private async getActiveGateway(): Promise<EmailGatewayConfig> {
        try {
            const gateway = await this.db
                .selectFrom('email_gateways')
                .selectAll()
                .where('is_active', '=', true as any)
                .where('is_primary', '=', true as any)
                .executeTakeFirst();

            if (gateway) {
                return {
                    provider: gateway.provider as EmailGatewayConfig['provider'],
                    apiKey: gateway.api_key ?? undefined,
                    fromEmail: gateway.from_email,
                    fromName: gateway.from_name ?? undefined,
                    smtpHost: gateway.smtp_host ?? undefined,
                    smtpPort: gateway.smtp_port ?? undefined,
                    smtpUsername: gateway.smtp_username ?? undefined,
                    smtpPassword: gateway.smtp_password ?? undefined,
                    smtpUseTls: gateway.smtp_use_tls ?? true,
                };
            }
        } catch {
            // Table may not exist yet — fall through to env config
        }

        // Fallback to environment variables
        return this.getEnvGatewayConfig();
    }

    /**
     * Build gateway config from environment variables.
     */
    private getEnvGatewayConfig(): EmailGatewayConfig {
        return {
            provider: 'smtp',
            fromEmail: process.env.SMTP_FROM_EMAIL || 'noreply@sacco.local',
            fromName: process.env.SMTP_FROM_NAME || 'SACCO System',
            smtpHost: process.env.SMTP_HOST || 'localhost',
            smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
            smtpUsername: process.env.SMTP_USERNAME,
            smtpPassword: process.env.SMTP_PASSWORD,
            smtpUseTls: process.env.SMTP_USE_TLS !== 'false',
        };
    }

    // ──────────────────────────────────────────────
    // Transporter Management
    // ──────────────────────────────────────────────

    /**
     * Get or create a nodemailer transporter for the given gateway config.
     */
    private async getTransporter(config: EmailGatewayConfig): Promise<Transporter> {
        const cacheKey = `${config.provider}:${config.smtpHost}:${config.smtpPort}:${config.fromEmail}`;

        if (this.transporterCache.has(cacheKey)) {
            return this.transporterCache.get(cacheKey)!;
        }

        let transportConfig: SMTPTransport.Options;

        switch (config.provider) {
            case 'sendgrid':
                transportConfig = {
                    host: 'smtp.sendgrid.net',
                    port: 587,
                    secure: false,
                    auth: {
                        user: 'apikey',
                        pass: config.apiKey,
                    },
                };
                break;

            case 'mailgun':
                transportConfig = {
                    host: 'smtp.mailgun.org',
                    port: 587,
                    secure: false,
                    auth: {
                        user: config.smtpUsername || 'api',
                        pass: config.apiKey,
                    },
                };
                break;

            case 'aws_ses':
                transportConfig = {
                    host: config.smtpHost || 'email-smtp.us-east-1.amazonaws.com',
                    port: config.smtpPort || 587,
                    secure: false,
                    auth: {
                        user: config.smtpUsername || config.apiKey,
                        pass: config.smtpPassword,
                    },
                };
                break;

            case 'smtp':
            default:
                transportConfig = {
                    host: config.smtpHost || 'localhost',
                    port: config.smtpPort || 587,
                    secure: config.smtpUseTls ?? true,
                    auth: config.smtpUsername
                        ? {
                              user: config.smtpUsername,
                              pass: config.smtpPassword,
                          }
                        : undefined,
                };
                break;
        }

        const transporter = nodemailer.createTransport(transportConfig);
        this.transporterCache.set(cacheKey, transporter);
        return transporter;
    }

    // ──────────────────────────────────────────────
    // Message Persistence
    // ──────────────────────────────────────────────

    /**
     * Record a message in the messages table before sending.
     */
    private async recordMessage(
        options: SendEmailOptions,
        gateway: EmailGatewayConfig,
    ): Promise<string> {
        try {
            const recipients = Array.isArray(options.to) ? options.to : [options.to];

            const result = await this.db
                .insertInto('messages')
                .values({
                    member_id: options.memberId ?? null,
                    staff_id: options.staffId ?? null,
                    recipient_email: recipients[0],
                    channel: 'email',
                    subject: options.subject,
                    body: options.html,
                    status: 'queued',
                    template_id: options.templateId ?? null,
                    source_type: options.sourceType ?? null,
                    source_id: options.sourceId ?? null,
                    variables: null,
                } as any)
                .returning('id')
                .executeTakeFirstOrThrow();

            return result.id;
        } catch (error) {
            // Non-fatal: message tracking should not block sending
            appLogger.warn('Failed to record message in DB', {
                error: (error as Error).message,
            });
            return 'untracked';
        }
    }

    /**
     * Update a message's status after send attempt.
     */
    private async updateMessageStatus(
        messageId: string,
        status: 'sent' | 'delivered' | 'failed' | 'bounced',
        providerRef?: string,
        failedReason?: string,
    ): Promise<void> {
        if (messageId === 'untracked') return;

        try {
            await this.db
                .updateTable('messages')
                .set({
                    status: status as any,
                    sent_at: status === 'sent' ? new Date() as any : undefined,
                    failed_reason: failedReason ?? null,
                    updated_at: new Date() as any,
                })
                .where('id', '=', messageId)
                .execute();
        } catch (error) {
            appLogger.warn('Failed to update message status', {
                messageId,
                error: (error as Error).message,
            });
        }
    }

    /**
     * Log a delivery attempt in the message_delivery_log table.
     */
    private async logDelivery(
        messageId: string,
        data: {
            status: 'sent' | 'delivered' | 'failed' | 'bounced';
            provider: string;
            providerReference?: string;
            providerResponse?: Record<string, unknown>;
            errorCode?: string;
            errorMessage?: string;
        },
    ): Promise<void> {
        if (messageId === 'untracked') return;

        try {
            // Get current attempt number
            const existing = await this.db
                .selectFrom('message_delivery_log')
                .select((eb) => [eb.fn.count('id').as('count')])
                .where('message_id', '=', messageId)
                .executeTakeFirst();

            const attemptNumber = Number(existing?.count ?? 0) + 1;

            await this.db
                .insertInto('message_delivery_log')
                .values({
                    message_id: messageId,
                    attempt_number: attemptNumber,
                    status: data.status as any,
                    provider: data.provider,
                    provider_reference: data.providerReference ?? null,
                    provider_response: data.providerResponse
                        ? (JSON.stringify(data.providerResponse) as any)
                        : null,
                    provider_status: data.status,
                    error_code: data.errorCode ?? null,
                    error_message: data.errorMessage ?? null,
                } as any)
                .execute();
        } catch (error) {
            appLogger.warn('Failed to log delivery attempt', {
                messageId,
                error: (error as Error).message,
            });
        }
    }

    // ──────────────────────────────────────────────
    // Utilities
    // ──────────────────────────────────────────────

    /**
     * Strip HTML tags for plain-text fallback.
     */
    private stripHtml(html: string): string {
        return html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }
}
