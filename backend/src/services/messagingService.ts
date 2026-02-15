import { Kysely } from 'kysely';
import { TenantDatabase } from '../database/types';
import { appLogger } from '../middleware/logger';

export class MessagingService {
    constructor(private db: Kysely<TenantDatabase>) {}

    async sendMessage(opts: {
        channel: 'sms' | 'email' | 'push' | 'in_app';
        member_id?: string;
        staff_id?: string;
        recipient_phone?: string;
        recipient_email?: string;
        template_id?: string;
        subject?: string;
        body: string;
        variables?: Record<string, unknown>;
        scheduled_for?: string;
        created_by?: string;
        source_type?: string;
        source_id?: string;
    }) {
        // If template_id provided, fetch template and merge variables
        let finalBody = opts.body;
        let finalSubject = opts.subject;

        if (opts.template_id) {
            const template = await this.db
                .selectFrom('message_templates')
                .selectAll()
                .where('id', '=', opts.template_id)
                .where('is_active', '=', true)
                .executeTakeFirst();

            if (template) {
                finalBody = this.mergeVariables(template.body, opts.variables || {});
                finalSubject = template.subject ? this.mergeVariables(template.subject, opts.variables || {}) : finalSubject;
            }
        }

        const [message] = await this.db
            .insertInto('messages')
            .values({
                member_id: opts.member_id || null,
                staff_id: opts.staff_id || null,
                recipient_phone: opts.recipient_phone || null,
                recipient_email: opts.recipient_email || null,
                template_id: opts.template_id || null,
                channel: opts.channel,
                subject: finalSubject || null,
                body: finalBody,
                variables: opts.variables ? JSON.stringify(opts.variables) as any : null,
                status: opts.scheduled_for ? 'draft' : 'queued',
                scheduled_for: opts.scheduled_for || undefined,
                source_type: opts.source_type || null,
                source_id: opts.source_id || null,
                created_by: opts.created_by || null,
            })
            .returning('id')
            .execute();

        return message;
    }

    async createBulkCampaign(opts: {
        name: string;
        channel: 'sms' | 'email' | 'push' | 'multi_channel';
        template_id?: string;
        subject?: string;
        body: string;
        recipient_filter?: Record<string, unknown>;
        scheduled_send_date?: string;
        immediate_send?: boolean;
        created_by?: string;
    }) {
        const campaignNumber = `CAMP-${Date.now()}`;

        const [campaign] = await this.db
            .insertInto('bulk_campaigns')
            .values({
                campaign_number: campaignNumber,
                name: opts.name,
                channel: opts.channel,
                template_id: opts.template_id || null,
                subject: opts.subject || null,
                body: opts.body,
                recipient_filter: opts.recipient_filter ? JSON.stringify(opts.recipient_filter) as any : null,
                scheduled_send_date: opts.scheduled_send_date || undefined,
                immediate_send: opts.immediate_send || false,
                status: opts.immediate_send ? 'sending' : (opts.scheduled_send_date ? 'scheduled' : 'draft'),
                created_by: opts.created_by || null,
            })
            .returning('id')
            .execute();

        return { id: campaign.id, campaign_number: campaignNumber };
    }

    async getDeliveryLog(filters: {
        message_id?: string;
        status?: string;
        date_from?: string;
        date_to?: string;
        page: number;
        limit: number;
    }) {
        let query = this.db
            .selectFrom('message_delivery_log')
            .selectAll();

        if (filters.message_id) {
            query = query.where('message_id', '=', filters.message_id);
        }
        if (filters.status) {
            query = query.where('status', '=', filters.status as any);
        }
        if (filters.date_from) {
            query = query.where('created_at', '>=', filters.date_from as any);
        }
        if (filters.date_to) {
            query = query.where('created_at', '<=', filters.date_to as any);
        }

        const offset = (filters.page - 1) * filters.limit;
        const results = await query
            .orderBy('created_at', 'desc')
            .limit(filters.limit)
            .offset(offset)
            .execute();

        return results;
    }

    private mergeVariables(template: string, variables: Record<string, unknown>): string {
        let result = template;
        for (const [key, value] of Object.entries(variables)) {
            result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
        }
        return result;
    }
}
