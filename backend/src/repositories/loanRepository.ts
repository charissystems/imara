import {
    LoanProduct, NewLoanProduct, LoanProductUpdate,
    LoanApplication, NewLoanApplication, LoanApplicationUpdate,
    LoanAccount, NewLoanAccount, LoanAccountUpdate,
    LoanRepayment, NewLoanRepayment,
    LoanSchedule, NewLoanSchedule, LoanScheduleUpdate,
} from '../database/types';
import { BaseRepository } from './baseRepository';

/**
 * Repository for loan products, applications, accounts, schedules, and repayments.
 * All queries target the tenant-scoped Kysely instance.
 */
export class LoanRepository extends BaseRepository {

    // ─── LOAN PRODUCTS ───────────────────────────────────────

    async findAllProducts(activeOnly = false): Promise<LoanProduct[]> {
        return this.executeSafely(
            async () => {
                let query = this.db
                    .selectFrom('loan_products')
                    .selectAll()
                    .where('deleted_at', 'is', null);

                if (activeOnly) {
                    query = query.where('is_active', '=', true);
                }

                return query.orderBy('name', 'asc').execute();
            },
            'findAllProducts',
            { activeOnly }
        );
    }

    async findProductById(id: string): Promise<LoanProduct | undefined> {
        return this.executeSafely(
            () => this.db
                .selectFrom('loan_products')
                .selectAll()
                .where('id', '=', id)
                .where('deleted_at', 'is', null)
                .executeTakeFirst(),
            'findProductById',
            { id }
        );
    }

    async createProduct(product: NewLoanProduct): Promise<LoanProduct> {
        return this.executeSafely(
            () => this.db
                .insertInto('loan_products')
                .values(product)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'createProduct',
            { code: product.code }
        );
    }

    async updateProduct(id: string, updates: LoanProductUpdate): Promise<LoanProduct> {
        return this.executeSafely(
            () => this.db
                .updateTable('loan_products')
                .set({ ...updates, updated_at: new Date() })
                .where('id', '=', id)
                .where('deleted_at', 'is', null)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'updateProduct',
            { id }
        );
    }

    // ─── LOAN APPLICATIONS ───────────────────────────────────

    async findAllApplications(status?: LoanApplication['status']): Promise<LoanApplication[]> {
        return this.executeSafely(
            async () => {
                let query = this.db
                    .selectFrom('loan_applications')
                    .selectAll()
                    .where('deleted_at', 'is', null);

                if (status) {
                    query = query.where('status', '=', status);
                }

                return query.orderBy('created_at', 'desc').execute();
            },
            'findAllApplications',
            { status }
        );
    }

    async findApplicationsByMemberId(memberId: string): Promise<LoanApplication[]> {
        return this.executeSafely(
            () => this.db
                .selectFrom('loan_applications')
                .selectAll()
                .where('member_id', '=', memberId)
                .where('deleted_at', 'is', null)
                .orderBy('created_at', 'desc')
                .execute(),
            'findApplicationsByMemberId',
            { memberId }
        );
    }

    async findApplicationById(id: string): Promise<LoanApplication | undefined> {
        return this.executeSafely(
            () => this.db
                .selectFrom('loan_applications')
                .selectAll()
                .where('id', '=', id)
                .where('deleted_at', 'is', null)
                .executeTakeFirst(),
            'findApplicationById',
            { id }
        );
    }

    async createApplication(application: NewLoanApplication): Promise<LoanApplication> {
        return this.executeSafely(
            () => this.db
                .insertInto('loan_applications')
                .values(application)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'createApplication',
            { memberId: application.member_id, productId: application.product_id }
        );
    }

    async updateApplication(id: string, updates: LoanApplicationUpdate): Promise<LoanApplication> {
        return this.executeSafely(
            () => this.db
                .updateTable('loan_applications')
                .set({ ...updates, updated_at: new Date() })
                .where('id', '=', id)
                .where('deleted_at', 'is', null)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'updateApplication',
            { id }
        );
    }

    async approveApplication(id: string, updates: LoanApplicationUpdate): Promise<LoanApplication> {
        return this.updateApplication(id, {
            ...updates,
            status: 'approved',
            decision_date: new Date(),
        });
    }

    async rejectApplication(id: string, updates: LoanApplicationUpdate): Promise<LoanApplication> {
        return this.updateApplication(id, {
            ...updates,
            status: 'rejected',
            decision_date: new Date(),
        });
    }

    // ─── LOAN ACCOUNTS (Active Loans) ────────────────────────

    async findAllLoans(status?: LoanAccount['status']): Promise<LoanAccount[]> {
        return this.executeSafely(
            async () => {
                let query = this.db
                    .selectFrom('loan_accounts')
                    .selectAll()
                    .where('deleted_at', 'is', null);

                if (status) {
                    query = query.where('status', '=', status);
                }

                return query.orderBy('created_at', 'desc').execute();
            },
            'findAllLoans',
            { status }
        );
    }

    async findLoansByMemberId(memberId: string): Promise<LoanAccount[]> {
        return this.executeSafely(
            () => this.db
                .selectFrom('loan_accounts')
                .selectAll()
                .where('member_id', '=', memberId)
                .where('deleted_at', 'is', null)
                .orderBy('created_at', 'desc')
                .execute(),
            'findLoansByMemberId',
            { memberId }
        );
    }

    async findLoanById(id: string): Promise<LoanAccount | undefined> {
        return this.executeSafely(
            () => this.db
                .selectFrom('loan_accounts')
                .selectAll()
                .where('id', '=', id)
                .where('deleted_at', 'is', null)
                .executeTakeFirst(),
            'findLoanById',
            { id }
        );
    }

    async createLoan(loan: NewLoanAccount): Promise<LoanAccount> {
        return this.executeSafely(
            () => this.db
                .insertInto('loan_accounts')
                .values(loan)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'createLoan',
            { applicationId: loan.application_id, memberId: loan.member_id }
        );
    }

    async updateLoan(id: string, updates: LoanAccountUpdate): Promise<LoanAccount> {
        return this.executeSafely(
            () => this.db
                .updateTable('loan_accounts')
                .set({ ...updates, updated_at: new Date() })
                .where('id', '=', id)
                .where('deleted_at', 'is', null)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'updateLoan',
            { id }
        );
    }

    // ─── LOAN SCHEDULES ──────────────────────────────────────

    async findSchedulesByLoanId(loanAccountId: string): Promise<LoanSchedule[]> {
        return this.executeSafely(
            () => this.db
                .selectFrom('loan_schedules')
                .selectAll()
                .where('loan_account_id', '=', loanAccountId)
                .orderBy('installment_number', 'asc')
                .execute(),
            'findSchedulesByLoanId',
            { loanAccountId }
        );
    }

    async createScheduleEntries(entries: NewLoanSchedule[]): Promise<LoanSchedule[]> {
        return this.executeSafely(
            () => this.db
                .insertInto('loan_schedules')
                .values(entries)
                .returningAll()
                .execute(),
            'createScheduleEntries',
            { count: entries.length }
        );
    }

    async updateScheduleEntry(id: string, updates: LoanScheduleUpdate): Promise<LoanSchedule> {
        return this.executeSafely(
            () => this.db
                .updateTable('loan_schedules')
                .set({ ...updates, updated_at: new Date() })
                .where('id', '=', id)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'updateScheduleEntry',
            { id }
        );
    }

    // ─── LOAN REPAYMENTS ─────────────────────────────────────

    async findRepaymentsByLoanId(loanAccountId: string): Promise<LoanRepayment[]> {
        return this.executeSafely(
            () => this.db
                .selectFrom('loan_repayments')
                .selectAll()
                .where('loan_account_id', '=', loanAccountId)
                .where('deleted_at', 'is', null)
                .orderBy('repayment_date', 'desc')
                .execute(),
            'findRepaymentsByLoanId',
            { loanAccountId }
        );
    }

    async recordRepayment(repayment: NewLoanRepayment): Promise<LoanRepayment> {
        return this.executeSafely(
            () => this.db
                .insertInto('loan_repayments')
                .values(repayment)
                .returningAll()
                .executeTakeFirstOrThrow(),
            'recordRepayment',
            { loanAccountId: repayment.loan_account_id }
        );
    }
}
