import {
    SavingsAccount, NewSavingsAccount, SavingsAccountUpdate,
    Deposit, NewDeposit, DepositUpdate,
    Withdrawal, NewWithdrawal, WithdrawalUpdate,
    InternalTransfer, NewInternalTransfer,
} from '../database/types';
import { BaseRepository } from './baseRepository';

/**
 * Repository for savings accounts, deposits, withdrawals, and transfers.
 * Replaces the old stub-based AccountRepository + TransactionRepository.
 */
export class AccountRepository extends BaseRepository {

    // ─── SAVINGS ACCOUNTS ────────────────────────────────────

    async findById(id: string): Promise<SavingsAccount | undefined> {
        return this.executeSafely(
            () => this.db
                .selectFrom('savings_accounts')
                .selectAll()
                .where('id', '=', id)
                .where('deleted_at', 'is', null)
                .executeTakeFirst(),
            'findById',
            { id }
        );
    }

    async findAccountsByMemberId(memberId: string): Promise<SavingsAccount[]> {
        return this.executeSafely(
            () => this.db
                .selectFrom('savings_accounts')
                .selectAll()
                .where('member_id', '=', memberId)
                .where('deleted_at', 'is', null)
                .orderBy('created_at', 'desc')
                .execute(),
            'findAccountsByMemberId',
            { memberId }
        );
    }

    async findAllAccounts(status?: SavingsAccount['status']): Promise<SavingsAccount[]> {
        return this.executeSafely(
            async () => {
                let query = this.db
                    .selectFrom('savings_accounts')
                    .selectAll()
                    .where('deleted_at', 'is', null);

                if (status) {
                    query = query.where('status', '=', status);
                }

                return query.orderBy('created_at', 'desc').execute();
            },
            'findAllAccounts',
            { status }
        );
    }

    async create(account: NewSavingsAccount): Promise<SavingsAccount> {
        return this.executeSafely(
            () => this.db
                .insertInto('savings_accounts')
                .values(account)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'create',
            { memberId: account.member_id }
        );
    }

    async update(id: string, updates: SavingsAccountUpdate): Promise<SavingsAccount> {
        return this.executeSafely(
            () => this.db
                .updateTable('savings_accounts')
                .set({ ...updates, updated_at: new Date() })
                .where('id', '=', id)
                .where('deleted_at', 'is', null)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'update',
            { id }
        );
    }

    // ─── DEPOSITS ────────────────────────────────────────────

    async findDepositById(id: string): Promise<Deposit | undefined> {
        return this.executeSafely(
            () => this.db
                .selectFrom('deposits')
                .selectAll()
                .where('id', '=', id)
                .where('deleted_at', 'is', null)
                .executeTakeFirst(),
            'findDepositById',
            { id }
        );
    }

    async findDepositsByAccountId(accountId: string): Promise<Deposit[]> {
        return this.executeSafely(
            () => this.db
                .selectFrom('deposits')
                .selectAll()
                .where('savings_account_id', '=', accountId)
                .where('deleted_at', 'is', null)
                .orderBy('deposit_date', 'desc')
                .execute(),
            'findDepositsByAccountId',
            { accountId }
        );
    }

    async createDeposit(deposit: NewDeposit): Promise<Deposit> {
        return this.executeSafely(
            () => this.db
                .insertInto('deposits')
                .values(deposit)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'createDeposit',
            { accountId: deposit.savings_account_id }
        );
    }

    async updateDeposit(id: string, updates: DepositUpdate): Promise<Deposit> {
        return this.executeSafely(
            () => this.db
                .updateTable('deposits')
                .set({ ...updates, updated_at: new Date() })
                .where('id', '=', id)
                .where('deleted_at', 'is', null)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'updateDeposit',
            { id }
        );
    }

    // ─── WITHDRAWALS ─────────────────────────────────────────

    async findWithdrawalById(id: string): Promise<Withdrawal | undefined> {
        return this.executeSafely(
            () => this.db
                .selectFrom('withdrawals')
                .selectAll()
                .where('id', '=', id)
                .where('deleted_at', 'is', null)
                .executeTakeFirst(),
            'findWithdrawalById',
            { id }
        );
    }

    async findWithdrawalsByAccountId(accountId: string): Promise<Withdrawal[]> {
        return this.executeSafely(
            () => this.db
                .selectFrom('withdrawals')
                .selectAll()
                .where('savings_account_id', '=', accountId)
                .where('deleted_at', 'is', null)
                .orderBy('withdrawal_date', 'desc')
                .execute(),
            'findWithdrawalsByAccountId',
            { accountId }
        );
    }

    async createWithdrawal(withdrawal: NewWithdrawal): Promise<Withdrawal> {
        return this.executeSafely(
            () => this.db
                .insertInto('withdrawals')
                .values(withdrawal)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'createWithdrawal',
            { accountId: withdrawal.savings_account_id }
        );
    }

    async updateWithdrawal(id: string, updates: WithdrawalUpdate): Promise<Withdrawal> {
        return this.executeSafely(
            () => this.db
                .updateTable('withdrawals')
                .set({ ...updates, updated_at: new Date() })
                .where('id', '=', id)
                .where('deleted_at', 'is', null)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'updateWithdrawal',
            { id }
        );
    }

    // ─── INTERNAL TRANSFERS ──────────────────────────────────

    async createTransfer(transfer: NewInternalTransfer): Promise<InternalTransfer> {
        return this.executeSafely(
            () => this.db
                .insertInto('internal_transfers')
                .values(transfer)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'createTransfer',
            { from: transfer.from_account_id, to: transfer.to_account_id }
        );
    }

    async findTransfersByAccountId(accountId: string): Promise<InternalTransfer[]> {
        return this.executeSafely(
            () => this.db
                .selectFrom('internal_transfers')
                .selectAll()
                .where((eb) =>
                    eb.or([
                        eb('from_account_id', '=', accountId),
                        eb('to_account_id', '=', accountId),
                    ])
                )
                .where('deleted_at', 'is', null)
                .orderBy('transfer_date', 'desc')
                .execute(),
            'findTransfersByAccountId',
            { accountId }
        );
    }
}
