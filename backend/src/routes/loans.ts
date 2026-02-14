// src/routes/loans.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '../middleware/types';
import { validate, getValidatedData, commonSchemas } from '../middleware/validation';
import { ValidationError, NotFoundError, UnauthorizedError } from '../middleware/errorHandler';
import { LoanRepository } from '../repositories/loanRepository';
import { ScheduleCalculator } from '../services/scheduleCalculator';
import { RepaymentService } from '../services/repaymentService';
import { getTenantDb } from '../config/database';
import { hasPermission } from '../middleware/rbac';

export const loanRoutes = new Hono<Env>();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createLoanProductSchema = z.object({
    code: z.string().max(20, 'Product code must be at most 20 characters'),
    name: z.string().min(2, 'Product name required'),
    description: z.string().nullable().optional(),
    interest_rate_type: z.enum(['fixed', 'variable']),
    interest_calculation_method: z.enum(['simple', 'compound', 'declining_balance']),
    default_interest_rate: z.number().min(0).max(100).optional(),
    fixed_interest_rate: z.number().min(0).max(100).nullable().optional(),
    minimum_amount: z.number().positive('Minimum amount must be positive'),
    maximum_amount: z.number().positive('Maximum amount must be positive'),
    minimum_tenure_months: z.number().int().positive().default(1),
    maximum_tenure_months: z.number().int().positive(),
    repayment_frequency: z.enum(['weekly', 'bi_weekly', 'monthly', 'quarterly']),
    late_payment_penalty_type: z.enum(['fixed_amount', 'percentage_of_payment']).default('percentage_of_payment'),
    late_payment_penalty: z.number().min(0).default(0),
    requires_collateral: z.boolean().default(false),
    requires_guarantors: z.boolean().default(false),
    minimum_guarantors: z.number().int().min(0).default(0),
    requires_appraisal: z.boolean().default(false),
    requires_insurance: z.boolean().default(false),
    is_active: z.boolean().default(true),
});

const createLoanApplicationSchema = z.object({
    member_id: commonSchemas.uuid,
    product_id: commonSchemas.uuid,
    requested_amount: z.number().positive('Requested amount must be positive'),
    requested_tenure_months: z.number().int().positive('Tenure must be positive'),
    loan_purpose: z.string().min(1, 'Loan purpose required'),
    purpose_description: z.string().nullable().optional(),
});

const approveLoanApplicationSchema = z.object({
    approved_amount: z.number().positive('Approved amount must be positive'),
    approved_interest_rate: z.number().min(0).max(100),
    approved_tenure_months: z.number().int().positive(),
});

const rejectLoanApplicationSchema = z.object({
    rejection_reason: z.string().min(5, 'Rejection reason must be at least 5 characters'),
});

const processRepaymentSchema = z.object({
    loan_account_id: commonSchemas.uuid,
    amount: z.number().positive('Amount must be positive'),
    payment_method: z.enum(['cash', 'mobile_money', 'bank_transfer', 'cheque', 'internal']),
    payment_reference: z.string().optional(),
});

const generateScheduleSchema = z.object({
    principal: z.number().positive('Principal must be positive'),
    annual_interest_rate: z.number().min(0).max(100),
    tenure_installments: z.number().int().positive('Tenure must be a positive integer'),
    interest_method: z.enum(['flat', 'declining_emi', 'declining_principal']),
    frequency: z.enum(['weekly', 'bi_weekly', 'monthly', 'quarterly']),
    start_date: commonSchemas.date,
    currency_code: z.string().length(3).optional(),
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
        const { schema_name } = c.get('tenant')!;
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
        const { schema_name } = c.get('tenant')!;
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
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');

        // Check permission: only admins can create products
        if (!user || !hasPermission(user.role || '', 'loan_products', 'create')) {
            throw new UnauthorizedError('Insufficient permissions to create loan products');
        }

        const loanRepo = new LoanRepository(schema_name);

        // Validate amount ranges
        if (data.minimum_amount > data.maximum_amount) {
            return c.json({
                success: false,
                error: { code: 'INVALID_AMOUNTS', message: 'Amount range invalid: min ≤ max' }
            }, 400);
        }

        if (data.minimum_tenure_months > data.maximum_tenure_months) {
            return c.json({
                success: false,
                error: { code: 'INVALID_TENURE', message: 'Tenure range invalid: min ≤ max' }
            }, 400);
        }

        const product = await loanRepo.createProduct(data as any);

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
        const { schema_name } = c.get('tenant')!;
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
        const { schema_name } = c.get('tenant')!;
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
        const { schema_name } = c.get('tenant')!;
        const currentUser = c.get('user');
        const loanRepo = new LoanRepository(schema_name);

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
        const minAmount = Number(product.minimum_amount);
        const maxAmount = Number(product.maximum_amount);
        if (data.requested_amount < minAmount || data.requested_amount > maxAmount) {
            return c.json({
                success: false,
                error: {
                    code: 'INVALID_AMOUNT',
                    message: `Amount must be between ${minAmount} and ${maxAmount}`
                }
            }, 400);
        }

        const application = await loanRepo.createApplication({
            ...data,
            application_number: `LA-${Date.now()}`,
            application_date: new Date(),
            status: 'draft',
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
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');

        if (!user || !hasPermission(user.role || '', 'loan_applications', 'approve')) {
            throw new UnauthorizedError('Insufficient permissions to approve loan applications');
        }

        const loanRepo = new LoanRepository(schema_name);
        const application = await loanRepo.findApplicationById(applicationId);
        if (!application) {
            throw new NotFoundError('Loan Application', applicationId);
        }

        const approvedApplication = await loanRepo.approveApplication(applicationId, {
            status: 'approved',
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
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');

        if (!user || !hasPermission(user.role || '', 'loan_applications', 'approve')) {
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
        const { schema_name } = c.get('tenant')!;
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
        const { schema_name } = c.get('tenant')!;
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
 * Process a loan repayment with Decimal-precision auto-allocation.
 * Allocates: penalties → interest → principal.
 */
loanRoutes.post('/repayment', validate(processRepaymentSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof processRepaymentSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');

        if (!user) {
            throw new UnauthorizedError('Authentication required');
        }

        const db = getTenantDb(schema_name);
        const repaymentService = new RepaymentService(db);

        const result = await repaymentService.processRepayment({
            loanAccountId: data.loan_account_id,
            amount: data.amount,
            paymentMethod: data.payment_method,
            paymentReference: data.payment_reference,
            recordedBy: user.id,
        });

        return c.json({
            success: true,
            data: {
                repaymentId: result.repaymentId,
                loanAccountId: result.loanAccountId,
                totalPaid: result.totalPaid.toString(),
                allocatedPenalty: result.allocatedPenalty.toString(),
                allocatedInterest: result.allocatedInterest.toString(),
                allocatedPrincipal: result.allocatedPrincipal.toString(),
                overpayment: result.overpayment.toString(),
                installmentsFullyPaid: result.installmentsFullyPaid,
                installmentsPartiallyPaid: result.installmentsPartiallyPaid,
                remainingBalance: result.remainingBalance.toString(),
                loanFullyRepaid: result.loanFullyRepaid,
            },
            meta: { created: true },
        }, 201);
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// SCHEDULE PREVIEW (LON-020)
// =============================================================================

/**
 * POST /loans/schedule/preview
 * Generate a loan repayment schedule preview without persisting anything.
 * Uses the Decimal.js-powered ScheduleCalculator.
 */
loanRoutes.post('/schedule/preview', validate(generateScheduleSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof generateScheduleSchema>>(c);

        const schedule = ScheduleCalculator.generateSchedule({
            principal: data.principal,
            annualInterestRate: data.annual_interest_rate,
            tenureInstallments: data.tenure_installments,
            interestMethod: data.interest_method,
            frequency: data.frequency,
            startDate: new Date(data.start_date),
            currencyCode: data.currency_code,
        });

        // Serialize Decimal values for JSON response
        return c.json({
            success: true,
            data: {
                principal: schedule.principal.toString(),
                annualInterestRate: schedule.annualInterestRate.toString(),
                interestMethod: schedule.interestMethod,
                frequency: schedule.frequency,
                tenureInstallments: schedule.tenureInstallments,
                totalInterest: schedule.totalInterest.toString(),
                totalPayment: schedule.totalPayment.toString(),
                currencyCode: schedule.currencyCode,
                installments: schedule.installments.map(inst => ({
                    installmentNumber: inst.installmentNumber,
                    dueDate: inst.dueDate.toISOString(),
                    openingBalance: inst.openingBalance.toString(),
                    principalPayment: inst.principalPayment.toString(),
                    interestPayment: inst.interestPayment.toString(),
                    totalPayment: inst.totalPayment.toString(),
                    closingBalance: inst.closingBalance.toString(),
                })),
            },
        });
    } catch (error) {
        throw error;
    }
});

export default loanRoutes;
