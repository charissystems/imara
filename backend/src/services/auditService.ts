import { Kysely } from 'kysely';
import { TenantDatabase } from '../database/types';

export class AuditService {
    constructor(private db: Kysely<TenantDatabase>) {}

    async queryAuditTrail(filters: {
        entity_type?: string;
        entity_id?: string;
        change_type?: string;
        user_id?: string;
        date_from?: string;
        date_to?: string;
        page: number;
        limit: number;
    }) {
        let query = this.db.selectFrom('audit_log').selectAll();

        if (filters.entity_type) query = query.where('entity_type', '=', filters.entity_type);
        if (filters.entity_id) query = query.where('entity_id', '=', filters.entity_id);
        if (filters.change_type) query = query.where('change_type', '=', filters.change_type as any);
        if (filters.user_id) query = query.where('user_id', '=', filters.user_id);
        if (filters.date_from) query = query.where('timestamp', '>=', filters.date_from as any);
        if (filters.date_to) query = query.where('timestamp', '<=', filters.date_to as any);

        const offset = (filters.page - 1) * filters.limit;
        return query.orderBy('timestamp', 'desc').limit(filters.limit).offset(offset).execute();
    }

    async queryActivityLog(filters: {
        entity_type?: string;
        entity_id?: string;
        user_id?: string;
        date_from?: string;
        date_to?: string;
        page: number;
        limit: number;
    }) {
        let query = this.db.selectFrom('activity_log').selectAll();

        if (filters.entity_type) query = query.where('entity_type', '=', filters.entity_type);
        if (filters.entity_id) query = query.where('entity_id', '=', filters.entity_id);
        if (filters.user_id) query = query.where('user_id', '=', filters.user_id);
        if (filters.date_from) query = query.where('timestamp', '>=', filters.date_from as any);
        if (filters.date_to) query = query.where('timestamp', '<=', filters.date_to as any);

        const offset = (filters.page - 1) * filters.limit;
        return query.orderBy('timestamp', 'desc').limit(filters.limit).offset(offset).execute();
    }

    async querySecurityEvents(filters: {
        severity?: string;
        event_type?: string;
        user_id?: string;
        date_from?: string;
        date_to?: string;
        page: number;
        limit: number;
    }) {
        let query = this.db.selectFrom('security_events').selectAll();

        if (filters.severity) query = query.where('severity', '=', filters.severity as any);
        if (filters.event_type) query = query.where('event_type', '=', filters.event_type as any);
        if (filters.user_id) query = query.where('user_id', '=', filters.user_id);
        if (filters.date_from) query = query.where('created_at', '>=', filters.date_from as any);
        if (filters.date_to) query = query.where('created_at', '<=', filters.date_to as any);

        const offset = (filters.page - 1) * filters.limit;
        return query.orderBy('created_at', 'desc').limit(filters.limit).offset(offset).execute();
    }

    async initiateReversal(data: {
        entity_type: string;
        entity_id: string;
        reason: string;
        initiated_by: string;
        user_ip?: string;
    }) {
        const [entry] = await this.db
            .insertInto('audit_log')
            .values({
                user_id: data.initiated_by,
                user_ip_address: data.user_ip || null,
                action: 'reversal_initiated',
                entity_type: data.entity_type,
                entity_id: data.entity_id,
                change_type: 'update',
                new_values: JSON.stringify({ status: 'pending_reversal', reason: data.reason }) as any,
                status: 'success',
            })
            .returning('id')
            .execute();

        return { reversal_id: entry.id, status: 'pending_approval' };
    }

    async approveReversal(reversalId: string, approverId: string) {
        const reversal = await this.db
            .selectFrom('audit_log')
            .selectAll()
            .where('id', '=', reversalId)
            .where('action', '=', 'reversal_initiated')
            .executeTakeFirst();

        if (!reversal) {
            throw new Error('Reversal request not found');
        }

        if (reversal.user_id === approverId) {
            throw new Error('Reversal must be approved by a different user (dual authorization)');
        }

        // Record approval
        await this.db
            .insertInto('audit_log')
            .values({
                user_id: approverId,
                action: 'reversal_approved',
                entity_type: reversal.entity_type,
                entity_id: reversal.entity_id,
                change_type: 'update',
                old_values: JSON.stringify({ reversal_id: reversalId }) as any,
                new_values: JSON.stringify({ status: 'reversed', approved_by: approverId }) as any,
                status: 'success',
            })
            .execute();

        return { reversal_id: reversalId, status: 'approved' };
    }
}
