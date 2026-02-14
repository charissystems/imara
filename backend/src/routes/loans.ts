// src/routes/loans.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '../middleware/types';
import { validate, getValidatedData, commonSchemas } from '../middleware/validation';
import { ValidationError, NotFoundError, UnauthorizedError } from '../middleware/errorHandler';
import { LoanRepository } from '../repositories/loanRepository';
import { LoanService } from '../services/loanService';
import { hasPermission } from '../middleware/rbac';

export const loanRoutes = new Hono<Env>();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createLoanProductSchema = z.object({
    product_name: z.string().min(2, 'Product name required'),
    product_code: z.string().max(20, 'Product code must be at most 20 characters'),
    interest_rate_type: z.enum(['flat', 'declining_balance', 'reducing_balance']),
    minimum_rate: z.number().min(0).max(100, 'Rate must be between 0 and 100'),
    maximum_rate: z.number().min(0).max(100, 'Rate must be between 0 and 100'),
    default_rate: z.number().min(0).max(100, 'Rate must be between 0 and 100'),
    minimum_amount: z.number().positive('Minimum amount must be positive'),
    maximum_amount: z.number().positive('Maximum amount must be positive'),
    maximum_duration: z.number().positive('Maximum duration (months) must be positive'),
    repayment_frequency: z.enum(['weekly', 'biweekly', 'monthly', 'quarterly', 'annual']),
    is_active: z.boolean().default(true),
});

const createLoanApplicationSchema = z.object({
    member_id: commonSchemas.uuid,
    product_id: commonSchemas.uuid,
    requested_amount: z.number().positive('Requested amount must be positive'),
    tenure_months: z.number().int().positive('Tenure must be positive'),
    purpose: z.string().optional(),
    collateral_description: z.string().optional(),
});

const approveLoanApplicationSchema = z.object({
    approved_amount: z.number().positive('Approved amount must be positive'),
    approved_interest_rate: z.number().min(0).max(100),
    approved_tenure_months: z.number().int().positive(),
    approval_notes: z.string().optional(),
});

const rejectLoanApplicationSchema = z.object({
    rejection_reason: z.string().min(5, 'Rejection reason must be at least 5 characters'),
});

const recordRepaymentSchema = z.object({
    loan_id: commonSchemas.uuid,
    amount_paid: z.number().positive('Amount must be positive'),
    payment_method: z.enum(['cash', 'bank_transfer', 'mobile_money']),
    notes: z.string().optional(),
});

const requestEarlySettlementSchema = z.object({
    settlement_date: commonSchemas.date.optional(),
});

// =============================================================================
// LOAN PRODUCTS
// =============================================================================

/**
 * GET /loans/products
 * List all active loan products for current tenant
 */
loanRoutes.get('/products', async (c) => {
    try {
        const { schema_name } = c.get('tenant');
        const loanRepo = new LoanRepository(schema_name);

        const products = await loanRepo.findAllProducts(true); // true = active only

        return c.json({
            success: true,
            data: products,
            meta: { count: products.length }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * GET /loans/products/:productId
 * Get a specific loan product
 */
loanRoutes.get('/products/:productId', async (c) => {
    try {
        const { productId } = c.req.param();
        const { schema_name } = c.get('tenant');
        const loanRepo = new LoanRepository(schema_name);

        const product = await loanRepo.findProductById(productId);
        if (!product) {
            throw new NotFoundError('Loan Product', productId);
        }

        return c.json({
            success: true,
            data: product
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /loans/products
 * Create a new loan product (Admin only)
 */
loanRoutes.post('/products', validate(createLoanProductSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof createLoanProductSchema>>(c);
        const { schema_name } = c.get('tenant');
        const user = c.get('user');

        // Check permission: only admins can create products
        if (!user || !hasPermission(user.role, 'loan_products', 'create')) {
            throw new UnauthorizedError('Insufficient permissions to create loan products');
        }

        const loanRepo = new LoanRepository(schema_name);

        // Validate rate ranges
        if (data.minimum_rate > data.default_rate || data.default_rate > data.maximum_rate) {
            return c.json({
                success: false,
                error: { code: 'INVALID_RATES', message: 'Rate range invalid: min ≤ default ≤ max' }
            }, 400);
        }

        // Validate amount ranges
        if (data.minimum_amount > data.maximum_amount) {
            return c.json({
                success: false,
                error: { code: 'INVALID_AMOUNTS', message: 'Amount range invalid: min ≤ max' }
            }, 400);
        }

        const product = await loanRepo.createProduct({
            ...data,
            created_at: new Date(),
            updated_at: new Date(),
        } as any);

        return c.json({
            success: true,
            data: product,
            meta: { created: true }
        }, 201);
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// LOAN APPLICATIONS
// =============================================================================

/**
 * GET /loans/applications
 * List loan applications (filtered by member if not admin)
 */
loanRoutes.get('/applications', async (c) => {
    try {
        const { schema_name } = c.get('tenant');
        const currentUser = c.get('user');
        const loanRepo = new LoanRepository(schema_name);

        let applications;
        if (currentUser?.role === 'member') {
            // Members can only see their own applications
            applications = await loanRepo.findApplicationsByMemberId(currentUser.id);
        } else {
            // Admins see all
            applications = await loanRepo.findAllApplications();
        }

        return c.json({
            success: true,
            data: applications,
            meta: { count: applications.length }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * GET /loans/applications/:applicationId
 * Get a specific loan application
 */
loanRoutes.get('/applications/:applicationId', async (c) => {
    try {
        const { applicationId } = c.req.param();
        const { schema_name } = c.get('tenant');
        const currentUser = c.get('user');
        const loanRepo = new LoanRepository(schema_name);

        const application = await loanRepo.findApplicationById(applicationId);
        if (!application) {
            throw new NotFoundError('Loan Application', applicationId);
        }

        // Authorization: member can only see own app, admins see all
        if (currentUser?.role === 'member' && application.member_id !== currentUser.id) {
            throw new UnauthorizedError('Cannot access other members\' loan applications');
        }

        return c.json({
            success: true,
            data: application
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /loans/applications
 * Submit a new loan application
 */
loanRoutes.post('/applications', validate(createLoanApplicationSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof createLoanApplicationSchema>>(c);
        const { schema_name } = c.get('tenant');
        const currentUser = c.get('user');
        const loanRepo = new LoanRepository(schema_name);
        const loanService = new LoanService();

        // Authorization: member applies for themselves, admins apply on behalf
        if (currentUser?.role === 'member' && data.member_id !== currentUser.id) {
            throw new UnauthorizedError('Members can only apply for themselves');
        }

        // Verify product exists
        const product = await loanRepo.findProductById(data.product_id);
        if (!product) {
            throw new NotFoundError('Loan Product', data.product_id);
        }

        // Validate requested amount
        if (data.requested_amount < product.minimum_amount || data.requested_amount > product.maximum_amount) {
            return c.json({
                success: false,
                error: {
                    code: 'INVALID_AMOUNT',
                    message: `Amount must be between ${product.minimum_amount} and ${product.maximum_amount}`
                }
            }, 400);
        }

        const application = await loanRepo.createApplication({
            ...data,
            status: 'pending',
            created_at: new Date(),
            updated_at: new Date(),
        } as any);

        return c.json({
            success: true,
            data: application,
            meta: { created: true }
        }, 201);
    } catch (error) {
        throw error;
    }
});

/**
 * PATCH /loans/applications/:applicationId/approve
 * Approve a loan application (Loan Officer only)
 */
loanRoutes.patch('/applications/:applicationId/approve', validate(approveLoanApplicationSchema), async (c) => {
    try {
        const { applicationId } = c.req.param();
        const data = getValidatedData<z.infer<typeof approveLoanApplicationSchema>>(c);
        const { schema_name } = c.get('tenant');
        const user = c.get('user');

        if (!user || !hasPermission(user.role, 'loan_applications', 'approve')) {
            throw new UnauthorizedError('Insufficient permissions to approve loan applications');
        }

        const loanRepo = new LoanRepository(schema_name);
        const application = await loanRepo.findApplicationById(applicationId);
        if (!application) {
            throw new NotFoundError('Loan Application', applicationId);
        }

        // Generate repayment schedule
        const loanService = new LoanService();
        const schedule = loanService.generateRepaymentSchedule(
            data.approved_amount,
            data.approved_tenure_months,
            data.approved_interest_rate,
            application.interest_rate_type || 'declining_emi'
        );

        const approvedApplication = await loanRepo.approveApplication(applicationId, {
            status: 'approved',
            approved_amount: data.approved_amount,
            approved_interest_rate: data.approved_interest_rate,
            approved_tenure_months: data.approved_tenure_months,
            approval_date: new Date(),
            approval_notes: data.approval_notes,
            repayment_schedule: schedule,
        } as any);

        return c.json({
            success: true,
            data: approvedApplication,
            meta: { approved: true }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * PATCH /loans/applications/:applicationId/reject
 * Reject a loan application
 */
loanRoutes.patch('/applications/:applicationId/reject', validate(rejectLoanApplicationSchema), async (c) => {
    try {
        const { applicationId } = c.req.param();
        const data = getValidatedData<z.infer<typeof rejectLoanApplicationSchema>>(c);
        const { schema_name } = c.get('tenant');
        const user = c.get('user');

        if (!user || !hasPermission(user.role, 'loan_applications', 'approve')) {
            throw new UnauthorizedError('Insufficient permissions to reject loan applications');
        }

        const loanRepo = new LoanRepository(schema_name);
        const application = await loanRepo.findApplicationById(applicationId);
        if (!application) {
            throw new NotFoundError('Loan Application', applicationId);
        }

        const rejectedApplication = await loanRepo.rejectApplication(applicationId, {
            status: 'rejected',
            rejection_reason: data.rejection_reason,
            rejection_date: new Date(),
        } as any);

        return c.json({
            success: true,
            data: rejectedApplication,
            meta: { rejected: true }
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// ACTIVE LOANS
// =============================================================================

/**
 * GET /loans
 * List active loans for current tenant (or current member)
 */
loanRoutes.get('/', async (c) => {
    try {
        const { schema_name } = c.get('tenant');
        const currentUser = c.get('user');
        const loanRepo = new LoanRepository(schema_name);

        let loans;
        if (currentUser?.role === 'member') {
            loans = await loanRepo.findLoansByMemberId(currentUser.id);
        } else {
            loans = await loanRepo.findAllLoans();
        }

        return c.json({
            success: true,
            data: loans,
            meta: { count: loans.length }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * GET /loans/:loanId
 * Get a specific loan with full details
 */
loanRoutes.get('/:loanId', async (c) => {
    try {
        const { loanId } = c.req.param();
        const { schema_name } = c.get('tenant');
        const currentUser = c.get('user');
        const loanRepo = new LoanRepository(schema_name);

        const loan = await loanRepo.findLoanById(loanId);
        if (!loan) {
            throw new NotFoundError('Loan', loanId);
        }

        // Authorization
        if (currentUser?.role === 'member' && loan.member_id !== currentUser.id) {
            throw new UnauthorizedError('Cannot access other members\' loans');
        }

        return c.json({
            success: true,
            data: loan
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /loans/repayment
 * Record a loan repayment
 */
loanRoutes.post('/repayment', validate(recordRepaymentSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof recordRepaymentSchema>>(c);
        const { schema_name } = c.get('tenant');
        const loanRepo = new LoanRepository(schema_name);

        const loan = await loanRepo.findLoanById(data.loan_id);
        if (!loan) {
            throw new NotFoundError('Loan', data.loan_id);
        }

        // Validate amount
        if (data.amount_paid > loan.outstanding_balance) {
            return c.json({
                success: false,
                error: { code: 'OVERPAYMENT', message: `Maximum payable is ${loan.outstanding_balance}` }
            }, 400);
        }

        // Record repayment
        const repayment = await loanRepo.recordRepayment({
            loan_id: data.loan_id,
            amount_paid: data.amount_paid,
            payment_method: data.payment_method,
            payment_date: new Date(),
            notes: data.notes,
        } as any);

        return c.json({
            success: true,
            data: repayment,
            meta: { created: true }
        }, 201);
    } catch (error) {
        throw error;
    }
});

/**
 * PATCH /loans/:loanId/early-settlement
 * Request early settlement of a loan
 */
loanRoutes.patch('/:loanId/early-settlement', validate(requestEarlySettlementSchema), async (c) => {
    try {
        const { loanId } = c.req.param();
        const data = getValidatedData<z.infer<typeof requestEarlySettlementSchema>>(c);
        const { schema_name } = c.get('tenant');
        const currentUser = c.get('user');
        const loanRepo = new LoanRepository(schema_name);

        const loan = await loanRepo.findLoanById(loanId);
        if (!loan) {
            throw new NotFoundError('Loan', loanId);
        }

        // Authorization
        if (currentUser?.role === 'member' && loan.member_id !== currentUser.id) {
            throw new UnauthorizedError('Cannot request early settlement for other members\' loans');
        }

        const loanService = new LoanService();
        const earlySettlementAmount = loanService.computeEarlySettlementRebate(
            loan.outstanding_balance,
            loan.remaining_term_months,
            loan.interest_rate
        );

        const updatedLoan = await loanRepo.updateLoan(loanId, {
            status: 'early_settlement_pending',
            settlement_request_date: new Date(),
            settlement_amount: earlySettlementAmount,
        } as any);

        return c.json({
            success: true,
            data: updatedLoan,
            meta: { settlementAmount: earlySettlementAmount }
        });
    } catch (error) {
        throw error;
    }
});

export default loanRoutes;
