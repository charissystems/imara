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

        const entityType = reversal.entity_type;
        const entityId = reversal.entity_id;

        // Map entity types to their database tables
        const REVERSIBLE_TABLES: Record<string, string> = {
            transactions: 'transactions',
            deposit: 'transactions',
            withdrawal: 'transactions',
            journal_entries: 'journal_entries',
            loan_accounts: 'loan_accounts',
            share_transactions: 'share_transactions',
        };

        const tableName = REVERSIBLE_TABLES[entityType as string];
        if (!tableName) {
            throw new Error(`Reversal not supported for entity type: ${entityType}`);
        }

        // Perform the reversal and audit log within a single transaction
        await this.db.transaction().execute(async (trx) => {
            // Verify entity exists and is not already reversed
            const entity = await trx
                .selectFrom(tableName as any)
                .selectAll()
                .where('id', '=', entityId)
                .executeTakeFirst();

            if (!entity) {
                throw new Error(`Entity ${entityType}/${entityId} not found`);
            }

            if ((entity as any).status === 'reversed') {
                throw new Error(`Entity ${entityType}/${entityId} is already reversed`);
            }

            // Update entity status to reversed
            await trx
                .updateTable(tableName as any)
                .set({
                    status: 'reversed' as any,
                    updated_at: new Date() as any,
                })
                .where('id', '=', entityId)
                .execute();

            // Record approval audit entry
            await trx
                .insertInto('audit_log')
                .values({
                    user_id: approverId,
                    action: 'reversal_approved',
                    entity_type: reversal.entity_type,
                    entity_id: reversal.entity_id,
                    change_type: 'update',
                    old_values: JSON.stringify({
                        reversal_id: reversalId,
                        previous_status: (entity as any).status,
                    }) as any,
                    new_values: JSON.stringify({
                        status: 'reversed',
                        approved_by: approverId,
                    }) as any,
                    status: 'success',
                })
                .execute();
        });

        return { reversal_id: reversalId, status: 'approved', entity_status: 'reversed' };
    }
}
