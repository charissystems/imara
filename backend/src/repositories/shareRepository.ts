import {
    ShareClass, NewShareClass, ShareClassUpdate,
    ShareHolding, NewShareHolding, ShareHoldingUpdate,
    ShareTransaction, NewShareTransaction,
    DividendDeclaration, NewDividendDeclaration,
    ShareRegisterEntry,
} from '../database/types';
import { BaseRepository } from './baseRepository';

/**
 * Repository for share classes, holdings, transactions, dividends, and share register.
 */
export class ShareRepository extends BaseRepository {

    // ─── SHARE CLASSES ───────────────────────────────────────

    async findAllClasses(activeOnly = false): Promise<ShareClass[]> {
        return this.executeSafely(
            async () => {
                let query = this.db
                    .selectFrom('share_classes')
                    .selectAll()
                    .where('deleted_at', 'is', null);

                if (activeOnly) {
                    query = query.where('is_active', '=', true);
                }

                return query.orderBy('name', 'asc').execute();
            },
            'findAllClasses',
            { activeOnly }
        );
    }

    async findClassById(id: string): Promise<ShareClass | undefined> {
        return this.executeSafely(
            () => this.db
                .selectFrom('share_classes')
                .selectAll()
                .where('id', '=', id)
                .where('deleted_at', 'is', null)
                .executeTakeFirst(),
            'findClassById',
            { id }
        );
    }

    async createClass(shareClass: NewShareClass): Promise<ShareClass> {
        return this.executeSafely(
            () => this.db
                .insertInto('share_classes')
                .values(shareClass)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'createClass',
            { code: shareClass.code }
        );
    }

    async updateClass(id: string, updates: ShareClassUpdate): Promise<ShareClass> {
        return this.executeSafely(
            () => this.db
                .updateTable('share_classes')
                .set({ ...updates, updated_at: new Date() })
                .where('id', '=', id)
                .where('deleted_at', 'is', null)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'updateClass',
            { id }
        );
    }

    // ─── SHARE HOLDINGS ──────────────────────────────────────

    async findHoldingsByMemberId(memberId: string): Promise<ShareHolding[]> {
        return this.executeSafely(
            () => this.db
                .selectFrom('share_holdings')
                .selectAll()
                .where('member_id', '=', memberId)
                .where('deleted_at', 'is', null)
                .orderBy('purchase_date', 'desc')
                .execute(),
            'findHoldingsByMemberId',
            { memberId }
        );
    }

    async findHoldingById(id: string): Promise<ShareHolding | undefined> {
        return this.executeSafely(
            () => this.db
                .selectFrom('share_holdings')
                .selectAll()
                .where('id', '=', id)
                .where('deleted_at', 'is', null)
                .executeTakeFirst(),
            'findHoldingById',
            { id }
        );
    }

    async createHolding(holding: NewShareHolding): Promise<ShareHolding> {
        return this.executeSafely(
            () => this.db
                .insertInto('share_holdings')
                .values(holding)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'createHolding',
            { memberId: holding.member_id, classId: holding.share_class_id }
        );
    }

    async updateHolding(id: string, updates: ShareHoldingUpdate): Promise<ShareHolding> {
        return this.executeSafely(
            () => this.db
                .updateTable('share_holdings')
                .set({ ...updates, updated_at: new Date() })
                .where('id', '=', id)
                .where('deleted_at', 'is', null)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'updateHolding',
            { id }
        );
    }

    // ─── SHARE TRANSACTIONS ──────────────────────────────────

    async findTransactionsByHoldingId(holdingId: string): Promise<ShareTransaction[]> {
        return this.executeSafely(
            () => this.db
                .selectFrom('share_transactions')
                .selectAll()
                .where('share_holding_id', '=', holdingId)
                .where('deleted_at', 'is', null)
                .orderBy('transaction_date', 'desc')
                .execute(),
            'findTransactionsByHoldingId',
            { holdingId }
        );
    }

    async findTransactionsByMemberId(memberId: string): Promise<ShareTransaction[]> {
        return this.executeSafely(
            () => this.db
                .selectFrom('share_transactions')
                .selectAll()
                .where('member_id', '=', memberId)
                .where('deleted_at', 'is', null)
                .orderBy('transaction_date', 'desc')
                .execute(),
            'findTransactionsByMemberId',
            { memberId }
        );
    }

    async createTransaction(transaction: NewShareTransaction): Promise<ShareTransaction> {
        return this.executeSafely(
            () => this.db
                .insertInto('share_transactions')
                .values(transaction)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'createTransaction',
            { holdingId: transaction.share_holding_id, type: transaction.transaction_type }
        );
    }

    // ─── DIVIDENDS ───────────────────────────────────────────

    async findDividendsByClassId(shareClassId: string): Promise<DividendDeclaration[]> {
        return this.executeSafely(
            () => this.db
                .selectFrom('dividend_declarations')
                .selectAll()
                .where('share_class_id', '=', shareClassId)
                .where('deleted_at', 'is', null)
                .orderBy('record_date', 'desc')
                .execute(),
            'findDividendsByClassId',
            { shareClassId }
        );
    }

    async createDividend(dividend: NewDividendDeclaration): Promise<DividendDeclaration> {
        return this.executeSafely(
            () => this.db
                .insertInto('dividend_declarations')
                .values(dividend)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'createDividend',
            { shareClassId: dividend.share_class_id }
        );
    }

    // ─── SHARE REGISTER ─────────────────────────────────────

    async findRegisterByMemberId(memberId: string): Promise<ShareRegisterEntry[]> {
        return this.executeSafely(
            () => this.db
                .selectFrom('share_register')
                .selectAll()
                .where('member_id', '=', memberId)
                .orderBy('transaction_date', 'desc')
                .execute(),
            'findRegisterByMemberId',
            { memberId }
        );
    }
}
