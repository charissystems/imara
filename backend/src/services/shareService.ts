/**
 * Share Service
 *
 * Business logic for share purchase, transfer, dividend calculation,
 * dividend distribution, and holding limits enforcement.
 *
 * Implements:
 *  - Share purchase with limit enforcement
 *  - Share transfer between members
 *  - Dividend declaration and distribution
 *  - Share register maintenance
 *  - Certificate generation data
 */

import Decimal from 'decimal.js';
import { Kysely } from 'kysely';
import { TenantDatabase } from '../database/types';
import { appLogger } from '../middleware/logger';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface SharePurchaseInput {
    memberId: string;
    shareClassId: string;
    quantity: number;
    unitPrice?: string; // If not provided, uses current_price from share class
    paymentMethod: 'cash' | 'mobile_money' | 'bank_transfer' | 'savings_deduction';
    paymentReference?: string;
    recordedBy: string;
}

export interface SharePurchaseResult {
    holding: {
        id: string;
        totalShares: number;
        totalInvested: string;
        certificateNumber: string;
    };
    transaction: {
        id: string;
        quantity: number;
        unitPrice: string;
        totalAmount: string;
    };
}

export interface ShareTransferInput {
    fromMemberId: string;
    toMemberId: string;
    shareClassId: string;
    quantity: number;
    transferPrice?: string;
    initiatedBy: string;
    approvedBy?: string;
}

export interface ShareTransferResult {
    fromTransaction: { id: string };
    toTransaction: { id: string };
    quantity: number;
    totalAmount: string;
}

export interface DividendCalculationInput {
    shareClassId: string;
    dividendPerShare: string;
    recordDate: Date;
    paymentDate: Date;
    withholdingTaxRate?: string;
    declaredBy: string;
}

export interface DividendDistributionResult {
    declarationId: string;
    totalDividendAmount: string;
    totalWithholdingTax: string;
    totalNetDividend: string;
    holdersProcessed: number;
    errors: Array<{ memberId: string; error: string }>;
}

export interface ShareCertificateData {
    certificateNumber: string;
    memberName: string;
    memberId: string;
    shareClassName: string;
    shareClassCode: string;
    totalShares: number;
    parValue: string;
    totalInvested: string;
    purchaseDate: string;
    saccoName: string;
    generatedAt: string;
}

// ────────────────────────────────────────────────────────────
// Share Service
// ────────────────────────────────────────────────────────────

export class ShareService {
    private db: Kysely<TenantDatabase>;

    constructor(db: Kysely<TenantDatabase>) {
        this.db = db;
    }

    /**
     * Purchase shares for a member.
     * Validates limits, creates/updates holding, records transaction, updates register.
     */
    async purchaseShares(input: SharePurchaseInput): Promise<SharePurchaseResult> {
        const shareClass = await this.db
            .selectFrom('share_classes')
            .selectAll()
            .where('id', '=', input.shareClassId)
            .where('deleted_at', 'is', null)
            .where('is_active', '=', true)
            .executeTakeFirst();

        if (!shareClass) {
            throw new Error('Share class not found or inactive');
        }

        const unitPrice = input.unitPrice
            ? new Decimal(input.unitPrice)
            : new Decimal(shareClass.current_price?.toString() ?? '0');

        if (unitPrice.lte(0)) {
            throw new Error('Unit price must be greater than zero');
        }

        if (input.quantity <= 0) {
            throw new Error('Quantity must be greater than zero');
        }

        const totalAmount = unitPrice.mul(input.quantity);

        // Check member's existing holding
        let holding = await this.db
            .selectFrom('share_holdings')
            .selectAll()
            .where('member_id', '=', input.memberId)
            .where('share_class_id', '=', input.shareClassId)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

        const currentShares = holding ? Number(holding.total_shares) : 0;
        const newTotal = currentShares + input.quantity;

        // Enforce holding limits
        if (shareClass.minimum_shares != null && input.quantity < Number(shareClass.minimum_shares)) {
            throw new Error(
                `Minimum purchase is ${shareClass.minimum_shares} shares for ${shareClass.name}`
            );
        }

        if (shareClass.maximum_shares != null && newTotal > Number(shareClass.maximum_shares)) {
            throw new Error(
                `Maximum holding is ${shareClass.maximum_shares} shares. ` +
                `Current: ${currentShares}, requested: ${input.quantity}`
            );
        }

        const existingInvested = holding
            ? new Decimal(holding.total_invested?.toString() ?? '0')
            : new Decimal(0);

        const newTotalInvested = existingInvested.plus(totalAmount);
        const newAvgCost = newTotalInvested.div(newTotal);

        if (holding) {
            // Update existing holding
            const updated = await this.db
                .updateTable('share_holdings')
                .set({
                    total_shares: newTotal as any,
                    total_invested: newTotalInvested.toString() as any,
                    average_cost_per_share: newAvgCost.toString() as any,
                    updated_at: new Date() as any,
                })
                .where('id', '=', holding.id)
                .returningAll()
                .executeTakeFirstOrThrow();
            holding = updated;
        } else {
            // Create new holding
            const certNumber = `SH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
            holding = await this.db
                .insertInto('share_holdings')
                .values({
                    member_id: input.memberId,
                    share_class_id: input.shareClassId,
                    total_shares: input.quantity as any,
                    average_cost_per_share: unitPrice.toString() as any,
                    total_invested: totalAmount.toString() as any,
                    certificate_number: certNumber,
                    purchase_date: new Date() as any,
                    is_locked: false as any,
                    created_by: input.recordedBy,
                })
                .returningAll()
                .executeTakeFirstOrThrow();
        }

        // Record transaction
        const transaction = await this.db
            .insertInto('share_transactions')
            .values({
                share_holding_id: holding.id,
                member_id: input.memberId,
                transaction_type: 'purchase' as any,
                quantity: input.quantity as any,
                unit_price: unitPrice.toString() as any,
                total_amount: totalAmount.toString() as any,
                transaction_date: new Date() as any,
                status: 'completed' as any,
                description: `Purchase of ${input.quantity} ${shareClass.name} shares`,
                recorded_by: input.recordedBy,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        // Update share register
        await this.db
            .insertInto('share_register')
            .values({
                member_id: input.memberId,
                share_class_id: input.shareClassId,
                opening_balance: currentShares as any,
                transaction_quantity: input.quantity,
                closing_balance: newTotal,
                transaction_date: new Date() as any,
                reference_type: 'purchase',
                reference_id: transaction.id,
            })
            .execute();

        appLogger.info('Shares purchased', {
            memberId: input.memberId,
            shareClass: shareClass.code,
            quantity: input.quantity,
            totalAmount: totalAmount.toString(),
        });

        return {
            holding: {
                id: holding.id,
                totalShares: newTotal,
                totalInvested: newTotalInvested.toFixed(2),
                certificateNumber: holding.certificate_number,
            },
            transaction: {
                id: transaction.id,
                quantity: input.quantity,
                unitPrice: unitPrice.toFixed(2),
                totalAmount: totalAmount.toFixed(2),
            },
        };
    }

    /**
     * Transfer shares between members.
     * Validates balances and limits, creates paired transactions, updates register.
     */
    async transferShares(input: ShareTransferInput): Promise<ShareTransferResult> {
        if (input.fromMemberId === input.toMemberId) {
            throw new Error('Cannot transfer shares to yourself');
        }

        if (input.quantity <= 0) {
            throw new Error('Transfer quantity must be greater than zero');
        }

        const shareClass = await this.db
            .selectFrom('share_classes')
            .selectAll()
            .where('id', '=', input.shareClassId)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

        if (!shareClass) {
            throw new Error('Share class not found');
        }

        // Get sender's holding
        const fromHolding = await this.db
            .selectFrom('share_holdings')
            .selectAll()
            .where('member_id', '=', input.fromMemberId)
            .where('share_class_id', '=', input.shareClassId)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

        if (!fromHolding) {
            throw new Error('Sender has no shares in this class');
        }

        if (fromHolding.is_locked) {
            throw new Error('Sender\'s shares are locked and cannot be transferred');
        }

        const senderShares = Number(fromHolding.total_shares);
        if (senderShares < input.quantity) {
            throw new Error(
                `Insufficient shares. Available: ${senderShares}, requested: ${input.quantity}`
            );
        }

        // Check receiver's limits
        let toHolding = await this.db
            .selectFrom('share_holdings')
            .selectAll()
            .where('member_id', '=', input.toMemberId)
            .where('share_class_id', '=', input.shareClassId)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

        const receiverCurrentShares = toHolding ? Number(toHolding.total_shares) : 0;
        const receiverNewTotal = receiverCurrentShares + input.quantity;

        if (shareClass.maximum_shares != null && receiverNewTotal > Number(shareClass.maximum_shares)) {
            throw new Error(
                `Transfer would exceed maximum holding limit (${shareClass.maximum_shares}) for receiver`
            );
        }

        const price = input.transferPrice
            ? new Decimal(input.transferPrice)
            : new Decimal(shareClass.current_price?.toString() ?? '0');
        const totalAmount = price.mul(input.quantity);

        // Update sender holding
        const senderNewTotal = senderShares - input.quantity;
        const senderNewInvested = new Decimal(fromHolding.total_invested?.toString() ?? '0')
            .minus(totalAmount);

        await this.db
            .updateTable('share_holdings')
            .set({
                total_shares: senderNewTotal as any,
                total_invested: Decimal.max(0, senderNewInvested).toString() as any,
                last_transfer_date: new Date() as any,
                updated_at: new Date() as any,
            })
            .where('id', '=', fromHolding.id)
            .execute();

        // Update or create receiver holding
        if (toHolding) {
            const receiverNewInvested = new Decimal(toHolding.total_invested?.toString() ?? '0')
                .plus(totalAmount);
            const receiverAvgCost = receiverNewInvested.div(receiverNewTotal);

            await this.db
                .updateTable('share_holdings')
                .set({
                    total_shares: receiverNewTotal as any,
                    total_invested: receiverNewInvested.toString() as any,
                    average_cost_per_share: receiverAvgCost.toString() as any,
                    last_transfer_date: new Date() as any,
                    updated_at: new Date() as any,
                })
                .where('id', '=', toHolding.id)
                .execute();
        } else {
            const certNumber = `SH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
            toHolding = await this.db
                .insertInto('share_holdings')
                .values({
                    member_id: input.toMemberId,
                    share_class_id: input.shareClassId,
                    total_shares: input.quantity as any,
                    average_cost_per_share: price.toString() as any,
                    total_invested: totalAmount.toString() as any,
                    certificate_number: certNumber,
                    purchase_date: new Date() as any,
                    is_locked: false as any,
                    created_by: input.initiatedBy,
                })
                .returningAll()
                .executeTakeFirstOrThrow();
        }

        // Record sender transaction (transfer_out)
        const fromTx = await this.db
            .insertInto('share_transactions')
            .values({
                share_holding_id: fromHolding.id,
                member_id: input.fromMemberId,
                transaction_type: 'transfer_out' as any,
                quantity: input.quantity as any,
                unit_price: price.toString() as any,
                total_amount: totalAmount.toString() as any,
                counterparty_member_id: input.toMemberId,
                transaction_date: new Date() as any,
                status: 'completed' as any,
                description: `Transfer of ${input.quantity} shares to member`,
                recorded_by: input.initiatedBy,
                approved_by: input.approvedBy || null,
                approved_at: input.approvedBy ? new Date() as any : null,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        // Record receiver transaction (transfer_in)
        const toTx = await this.db
            .insertInto('share_transactions')
            .values({
                share_holding_id: toHolding!.id,
                member_id: input.toMemberId,
                transaction_type: 'transfer_in' as any,
                quantity: input.quantity as any,
                unit_price: price.toString() as any,
                total_amount: totalAmount.toString() as any,
                counterparty_member_id: input.fromMemberId,
                related_transaction_id: fromTx.id,
                transaction_date: new Date() as any,
                status: 'completed' as any,
                description: `Transfer of ${input.quantity} shares from member`,
                recorded_by: input.initiatedBy,
                approved_by: input.approvedBy || null,
                approved_at: input.approvedBy ? new Date() as any : null,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        // Update share register for both members
        await this.db.insertInto('share_register').values([
            {
                member_id: input.fromMemberId,
                share_class_id: input.shareClassId,
                opening_balance: senderShares as any,
                transaction_quantity: -input.quantity,
                closing_balance: senderNewTotal,
                transaction_date: new Date() as any,
                reference_type: 'transfer_out',
                reference_id: fromTx.id,
            },
            {
                member_id: input.toMemberId,
                share_class_id: input.shareClassId,
                opening_balance: receiverCurrentShares as any,
                transaction_quantity: input.quantity,
                closing_balance: receiverNewTotal,
                transaction_date: new Date() as any,
                reference_type: 'transfer_in',
                reference_id: toTx.id,
            },
        ]).execute();

        appLogger.info('Shares transferred', {
            from: input.fromMemberId,
            to: input.toMemberId,
            quantity: input.quantity,
            shareClass: shareClass.code,
        });

        return {
            fromTransaction: { id: fromTx.id },
            toTransaction: { id: toTx.id },
            quantity: input.quantity,
            totalAmount: totalAmount.toFixed(2),
        };
    }

    /**
     * Declare a dividend for a share class.
     */
    async declareDividend(input: DividendCalculationInput): Promise<{ declarationId: string }> {
        const shareClass = await this.db
            .selectFrom('share_classes')
            .selectAll()
            .where('id', '=', input.shareClassId)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

        if (!shareClass) {
            throw new Error('Share class not found');
        }

        if (!shareClass.dividend_eligible) {
            throw new Error('This share class is not eligible for dividends');
        }

        const dividendNumber = `DIV-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
        const whtRate = input.withholdingTaxRate ?? '0';

        const declaration = await this.db
            .insertInto('dividend_declarations')
            .values({
                share_class_id: input.shareClassId,
                dividend_number: dividendNumber,
                dividend_per_share: new Decimal(input.dividendPerShare).toString() as any,
                withholding_tax_rate: new Decimal(whtRate).toString() as any,
                record_date: input.recordDate as any,
                payment_date: input.paymentDate as any,
                status: 'draft' as any,
                created_by: input.declaredBy,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        appLogger.info('Dividend declared', {
            declarationId: declaration.id,
            shareClass: shareClass.code,
            dividendPerShare: input.dividendPerShare,
        });

        return { declarationId: declaration.id };
    }

    /**
     * Distribute an approved dividend to all eligible holders.
     */
    async distributeDividend(declarationId: string, processedBy: string): Promise<DividendDistributionResult> {
        const declaration = await this.db
            .selectFrom('dividend_declarations')
            .selectAll()
            .where('id', '=', declarationId)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

        if (!declaration) {
            throw new Error('Dividend declaration not found');
        }

        if (declaration.status !== 'approved') {
            throw new Error(`Cannot distribute dividend in '${declaration.status}' status. Must be 'approved'.`);
        }

        // Update status to processing
        await this.db
            .updateTable('dividend_declarations')
            .set({ status: 'processing' as any, updated_at: new Date() as any })
            .where('id', '=', declarationId)
            .execute();

        const dividendPerShare = new Decimal(declaration.dividend_per_share?.toString() ?? '0');
        const whtRate = new Decimal(declaration.withholding_tax_rate?.toString() ?? '0');

        // Get all eligible holders as of record date
        const holdings = await this.db
            .selectFrom('share_holdings')
            .selectAll()
            .where('share_class_id', '=', declaration.share_class_id)
            .where('deleted_at', 'is', null)
            .where('total_shares', '>', 0 as any)
            .execute();

        let totalDividend = new Decimal(0);
        let totalWht = new Decimal(0);
        let totalNet = new Decimal(0);
        const errors: Array<{ memberId: string; error: string }> = [];
        let holdersProcessed = 0;

        for (const holding of holdings) {
            try {
                const shares = Number(holding.total_shares);
                const grossDividend = dividendPerShare.mul(shares);
                const wht = grossDividend.mul(whtRate).div(100);
                const netDividend = grossDividend.minus(wht);

                // Record dividend transaction
                await this.db
                    .insertInto('share_transactions')
                    .values({
                        share_holding_id: holding.id,
                        member_id: holding.member_id,
                        transaction_type: 'dividend' as any,
                        quantity: shares as any,
                        unit_price: dividendPerShare.toString() as any,
                        total_amount: netDividend.toString() as any,
                        transaction_date: new Date() as any,
                        status: 'completed' as any,
                        description: `Dividend payment: ${declaration.dividend_number}`,
                        recorded_by: processedBy,
                    })
                    .execute();

                totalDividend = totalDividend.plus(grossDividend);
                totalWht = totalWht.plus(wht);
                totalNet = totalNet.plus(netDividend);
                holdersProcessed++;
            } catch (error) {
                const errMsg = error instanceof Error ? error.message : 'Unknown error';
                errors.push({ memberId: holding.member_id, error: errMsg });
            }
        }

        // Update declaration with totals
        await this.db
            .updateTable('dividend_declarations')
            .set({
                total_dividend_amount: totalDividend.toString() as any,
                status: 'completed' as any,
                updated_at: new Date() as any,
            })
            .where('id', '=', declarationId)
            .execute();

        appLogger.info('Dividend distributed', {
            declarationId,
            holdersProcessed,
            totalDividend: totalDividend.toString(),
            totalWht: totalWht.toString(),
            errors: errors.length,
        });

        return {
            declarationId,
            totalDividendAmount: totalDividend.toFixed(2),
            totalWithholdingTax: totalWht.toFixed(2),
            totalNetDividend: totalNet.toFixed(2),
            holdersProcessed,
            errors,
        };
    }

    /**
     * Get share certificate data for PDF generation.
     */
    async getShareCertificateData(holdingId: string): Promise<ShareCertificateData> {
        const row = await this.db
            .selectFrom('share_holdings as sh')
            .innerJoin('share_classes as sc', 'sc.id', 'sh.share_class_id')
            .innerJoin('members as m', 'm.id', 'sh.member_id')
            .select([
                'sh.certificate_number',
                'sh.total_shares',
                'sh.total_invested',
                'sh.purchase_date',
                'sh.member_id',
                'sc.name as class_name',
                'sc.code as class_code',
                'sc.par_value',
                'm.first_name',
                'm.last_name',
            ])
            .where('sh.id', '=', holdingId)
            .where('sh.deleted_at', 'is', null)
            .executeTakeFirst();

        if (!row) {
            throw new Error('Share holding not found');
        }

        const saccoConfig = await this.db
            .selectFrom('sacco_configuration')
            .select(['organization_name'])
            .executeTakeFirst();

        return {
            certificateNumber: row.certificate_number,
            memberName: `${row.first_name} ${row.last_name}`,
            memberId: row.member_id,
            shareClassName: row.class_name,
            shareClassCode: row.class_code,
            totalShares: Number(row.total_shares),
            parValue: new Decimal(row.par_value?.toString() ?? '0').toFixed(2),
            totalInvested: new Decimal(row.total_invested?.toString() ?? '0').toFixed(2),
            purchaseDate: new Date(row.purchase_date as any).toISOString().split('T')[0],
            saccoName: saccoConfig?.organization_name || 'SACCO',
            generatedAt: new Date().toISOString(),
        };
    }

    /**
     * Generate a share register report for a given share class.
     */
    async getShareRegister(shareClassId?: string): Promise<Array<{
        memberId: string;
        memberName: string;
        shareClassName: string;
        totalShares: number;
        totalInvested: string;
        certificateNumber: string;
    }>> {
        let query = this.db
            .selectFrom('share_holdings as sh')
            .innerJoin('share_classes as sc', 'sc.id', 'sh.share_class_id')
            .innerJoin('members as m', 'm.id', 'sh.member_id')
            .select([
                'sh.member_id',
                'm.first_name',
                'm.last_name',
                'sc.name as class_name',
                'sh.total_shares',
                'sh.total_invested',
                'sh.certificate_number',
            ])
            .where('sh.deleted_at', 'is', null)
            .where('sh.total_shares', '>', 0 as any);

        if (shareClassId) {
            query = query.where('sh.share_class_id', '=', shareClassId);
        }

        const rows = await query.orderBy('m.last_name', 'asc').execute();

        return rows.map(r => ({
            memberId: r.member_id,
            memberName: `${r.first_name} ${r.last_name}`,
            shareClassName: r.class_name,
            totalShares: Number(r.total_shares),
            totalInvested: new Decimal(r.total_invested?.toString() ?? '0').toFixed(2),
            certificateNumber: r.certificate_number,
        }));
    }
}
