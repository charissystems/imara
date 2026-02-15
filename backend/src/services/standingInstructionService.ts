import { Kysely } from 'kysely';
import { TenantDatabase } from '../database/types';

export class StandingInstructionService {
    constructor(private db: Kysely<TenantDatabase>) {}

    async create(data: {
        member_id: string;
        instruction_type: 'savings_split' | 'loan_repayment' | 'transfer' | 'share_purchase';
        source_account_id: string;
        destination_account_id?: string;
        destination_external?: Record<string, unknown>;
        amount: number;
        frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annually';
        start_date: string;
        end_date?: string;
        max_executions?: number;
        created_by?: string;
    }) {
        // Validate source account exists
        const sourceAccount = await this.db
            .selectFrom('savings_accounts')
            .select(['id', 'member_id'])
            .where('id', '=', data.source_account_id)
            .executeTakeFirst();

        if (!sourceAccount) {
            throw new Error('Source account not found');
        }

        // Validate destination if internal
        if (data.destination_account_id) {
            const destAccount = await this.db
                .selectFrom('savings_accounts')
                .select('id')
                .where('id', '=', data.destination_account_id)
                .executeTakeFirst();

            if (!destAccount) {
                throw new Error('Destination account not found');
            }
        }

        const [instruction] = await this.db
            .insertInto('standing_instructions')
            .values({
                member_id: data.member_id,
                instruction_type: data.instruction_type,
                source_account_id: data.source_account_id,
                destination_account_id: data.destination_account_id || null,
                destination_external: data.destination_external ? JSON.stringify(data.destination_external) as any : null,
                amount: String(data.amount) as any,
                frequency: data.frequency,
                start_date: data.start_date,
                end_date: data.end_date || undefined,
                next_execution_date: data.start_date,
                max_executions: data.max_executions || null,
                created_by: data.created_by || null,
            })
            .returning('id')
            .execute();

        return instruction;
    }
}
