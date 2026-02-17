// src/routes/loans.ts
import { Hono } from 'hono';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { Env } from '../middleware/types';
import { validate, getValidatedData, commonSchemas } from '../middleware/validation';
import { ValidationError, NotFoundError, UnauthorizedError } from '../middleware/errorHandler';
import { LoanRepository } from '../repositories/loanRepository';
import { ScheduleCalculator } from '../services/scheduleCalculator';
import { RepaymentService } from '../services/repaymentService';
import { LoanService } from '../services/loanService';
import { AccountRepository } from '../repositories/accountRepository';
import { MemberRepository } from '../repositories/memberRepository';
import { getTenantDb } from '../config/database';
import { hasPermission, enforcePermission } from '../middleware/rbac';
import { rateLimit } from '../middleware/rateLimiter';

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

const updateLoanProductSchema = z.object({
    name: z.string().min(2).optional(),
    description: z.string().nullable().optional(),
    default_interest_rate: z.number().min(0).max(100).optional(),
    fixed_interest_rate: z.number().min(0).max(100).nullable().optional(),
    minimum_amount: z.number().positive().optional(),
    maximum_amount: z.number().positive().optional(),
    minimum_tenure_months: z.number().int().positive().optional(),
    maximum_tenure_months: z.number().int().positive().optional(),
    late_payment_penalty: z.number().min(0).optional(),
    requires_collateral: z.boolean().optional(),
    requires_guarantors: z.boolean().optional(),
    minimum_guarantors: z.number().int().min(0).optional(),
    requires_appraisal: z.boolean().optional(),
    requires_insurance: z.boolean().optional(),
    is_active: z.boolean().optional(),
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

const disburseLoanSchema = z.object({
    disbursement_channel: z.enum(['cash', 'bank_transfer', 'mobile_money', 'member_savings']),
    disbursement_reference: z.string().optional(),
    disbursement_notes: z.string().optional(),
});

const rescheduleLoanSchema = z.object({
    new_tenure_months: z.number().int().positive('New tenure must be positive'),
    new_interest_rate: z.number().min(0).max(100).optional(),
    reason: z.string().min(5, 'Reason must be at least 5 characters'),
});

const writeOffLoanSchema = z.object({
    reason: z.string().min(5, 'Write-off reason must be at least 5 characters'),
});

const earlySettlementSchema = z.object({
    payment_method: z.enum(['cash', 'mobile_money', 'bank_transfer', 'cheque', 'internal']),
    payment_reference: z.string().optional(),
});

const eligibilityCheckSchema = z.object({
    member_id: commonSchemas.uuid,
    product_id: commonSchemas.uuid,
    requested_amount: z.number().positive().optional(),
});

const appraisalSchema = z.object({
    monthly_income: z.number().min(0).optional(),
    monthly_expenses: z.number().min(0).optional(),
    existing_loans_balance: z.number().min(0).optional(),
    collateral_description: z.string().optional(),
    collateral_estimated_value: z.number().min(0).optional(),
    collateral_type: z.string().optional(),
    recommended_amount: z.number().positive().optional(),
    recommended_tenure_months: z.number().int().positive().optional(),
    recommended_interest_rate: z.number().min(0).max(100).optional(),
    risk_rating: z.enum(['low', 'moderate', 'high']),
    risk_factors: z.string().optional(),
    notes: z.string().optional(),
});

const guarantorSchema = z.object({
    guarantor_id: commonSchemas.uuid,
    relationship: z.string().optional(),
    contact_phone: z.string().optional(),
    contact_email: z.string().email().optional(),
    guaranteed_amount: z.number().positive('Guaranteed amount must be positive'),
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

/**
 * PATCH /loans/products/:productId
 * Update an existing loan product
 */
loanRoutes.patch('/products/:productId', validate(updateLoanProductSchema), async (c) => {
    try {
        const { productId } = c.req.param();
        const data = getValidatedData<z.infer<typeof updateLoanProductSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');

        if (!user || !hasPermission(user.role || '', 'loan_products', 'update')) {
            throw new UnauthorizedError('Insufficient permissions to update loan products');
        }

        const loanRepo = new LoanRepository(schema_name);
        const existing = await loanRepo.findProductById(productId);
        if (!existing) {
            throw new NotFoundError('Loan Product', productId);
        }

        const updated = await loanRepo.updateProduct(productId, data as any);
        return c.json({ success: true, data: updated });
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
 * Creates a loan account + repayment schedule upon approval
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

        if (application.status !== 'draft' && application.status !== 'submitted' && application.status !== 'under_approval' && application.status !== 'appraisal_complete') {
            return c.json({
                success: false,
                error: { code: 'INVALID_STATUS', message: `Cannot approve application in '${application.status}' status` }
            }, 400);
        }

        // Update application with approved details
        const approvedApplication = await loanRepo.approveApplication(applicationId, {
            status: 'approved',
            decision_date: new Date(),
        } as any);

        // Create loan account with approved details
        const loanNumber = `LN${Date.now().toString(36).toUpperCase()}`;

        const product = await loanRepo.findProductById(application.product_id);

        const loanAccount = await loanRepo.createLoan({
            loan_number: loanNumber,
            application_id: applicationId,
            member_id: application.member_id,
            product_id: application.product_id,
            approved_amount: data.approved_amount as any,
            approved_tenure_months: data.approved_tenure_months,
            approved_interest_rate: data.approved_interest_rate as any,
            status: 'approved_pending_disbursement',
            principal_outstanding: data.approved_amount as any,
            interest_outstanding: 0 as any,
            penalties_outstanding: 0 as any,
            total_outstanding: data.approved_amount as any,
            created_by: user.id,
        } as any);

        // Generate repayment schedule using ScheduleCalculator
        const interestMethod = product?.interest_calculation_method === 'declining_balance'
            ? 'declining_emi'
            : product?.interest_calculation_method === 'compound'
                ? 'declining_emi'
                : 'flat';

        const schedule = ScheduleCalculator.generateSchedule({
            principal: data.approved_amount,
            annualInterestRate: data.approved_interest_rate,
            tenureInstallments: data.approved_tenure_months,
            interestMethod,
            frequency: (product?.repayment_frequency as any) || 'monthly',
            startDate: new Date(),
        });

        // Persist schedule entries
        const scheduleEntries = schedule.installments.map(inst => ({
            loan_account_id: loanAccount.id,
            installment_number: inst.installmentNumber,
            due_date: inst.dueDate,
            opening_balance: inst.openingBalance.toString(),
            principal_payment: inst.principalPayment.toString(),
            interest_payment: inst.interestPayment.toString(),
            penalty_payment: '0',
            total_payment: inst.totalPayment.toString(),
            closing_balance: inst.closingBalance.toString(),
            status: 'scheduled',
        }));

        if (scheduleEntries.length > 0) {
            await loanRepo.createScheduleEntries(scheduleEntries as any);
        }

        return c.json({
            success: true,
            data: {
                application: approvedApplication,
                loanAccount,
                scheduleCount: scheduleEntries.length,
            },
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
loanRoutes.post('/repayment', rateLimit({ maxRequests: 20, windowSeconds: 60, keyPrefix: 'rl:loan-repayment' }), validate(processRepaymentSchema), async (c) => {
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

// =============================================================================
// ELIGIBILITY CHECK (LON-011)
// =============================================================================

/**
 * POST /loans/eligibility
 * Run automated eligibility checks for a member against a loan product
 */
loanRoutes.post('/eligibility', validate(eligibilityCheckSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof eligibilityCheckSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');

        if (!user) {
            throw new UnauthorizedError('Authentication required');
        }

        const loanRepo = new LoanRepository(schema_name);
        const accountRepo = new AccountRepository(schema_name);
        const memberRepo = new MemberRepository(schema_name);

        const product = await loanRepo.findProductById(data.product_id);
        if (!product) {
            throw new NotFoundError('Loan Product', data.product_id);
        }

        const member = await memberRepo.findById(data.member_id);
        if (!member) {
            throw new NotFoundError('Member', data.member_id);
        }

        // Calculate savings balance
        const savingsAccounts = await accountRepo.findAccountsByMemberId(data.member_id);
        const totalSavings = savingsAccounts.reduce(
            (sum, acc) => sum + Number(acc.principal_balance || 0), 0
        );

        // Calculate membership months
        const joinedDate = new Date(member.joined_date as any);
        const now = new Date();
        const membershipMonths = (now.getFullYear() - joinedDate.getFullYear()) * 12
            + (now.getMonth() - joinedDate.getMonth());

        // Count active loans
        const activeLoans = await loanRepo.findLoansByMemberId(data.member_id);
        const activeLoanCount = activeLoans.filter(
            l => l.status === 'active' || l.status === 'approved_pending_disbursement'
        ).length;

        // Use LoanService for eligibility check
        const loanService = new LoanService();
        const maxLoanable = totalSavings * 3; // Default 3x multiplier
        const maxAmount = Math.min(maxLoanable, Number(product.maximum_amount));

        const reasons: string[] = [];

        // Check savings adequacy
        if (totalSavings <= 0) {
            reasons.push('No savings balance found. Savings are required to qualify for a loan.');
        }

        // Check minimum amount eligibility
        if (maxLoanable < Number(product.minimum_amount)) {
            reasons.push(
                `Insufficient savings. Need at least ${(Number(product.minimum_amount) / 3).toFixed(0)} in savings ` +
                `to qualify for minimum loan of ${product.minimum_amount} (you have ${totalSavings.toFixed(0)})`
            );
        }

        // Check membership duration
        const requiredMonths = Number(product.minimum_tenure_months) > 0 ? 6 : 0; // Default 6 months
        if (membershipMonths < requiredMonths) {
            reasons.push(
                `Membership too new. Must wait ${requiredMonths - membershipMonths} more months ` +
                `(requirement: ${requiredMonths} months, you have: ${membershipMonths} months)`
            );
        }

        // Check concurrent loans
        const maxConcurrent = 3; // Default max
        if (activeLoanCount >= maxConcurrent) {
            reasons.push(
                `Already at maximum concurrent loans (${maxConcurrent}). Complete or close existing loans first.`
            );
        }

        // Check requested amount against max
        if (data.requested_amount && data.requested_amount > maxAmount) {
            reasons.push(`Requested amount exceeds your eligibility. Maximum: ${maxAmount.toFixed(0)}`);
        }

        return c.json({
            success: true,
            data: {
                eligible: reasons.length === 0,
                reasons,
                memberDetails: {
                    savingsBalance: totalSavings,
                    membershipMonths,
                    activeLoanCount,
                },
                productLimits: {
                    minimumAmount: product.minimum_amount,
                    maximumAmount: product.maximum_amount,
                    maxLoanableForMember: maxAmount,
                },
            },
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// APPRAISAL WORKFLOW (LON-012)
// =============================================================================

/**
 * POST /loans/applications/:applicationId/appraisal
 * Submit a loan appraisal for an application
 */
loanRoutes.post('/applications/:applicationId/appraisal', validate(appraisalSchema), async (c) => {
    try {
        const { applicationId } = c.req.param();
        const data = getValidatedData<z.infer<typeof appraisalSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');

        if (!user || !hasPermission(user.role || '', 'loan_applications', 'update')) {
            throw new UnauthorizedError('Insufficient permissions to submit appraisals');
        }

        const db = getTenantDb(schema_name);
        const loanRepo = new LoanRepository(schema_name);

        const application = await loanRepo.findApplicationById(applicationId);
        if (!application) {
            throw new NotFoundError('Loan Application', applicationId);
        }

        // Calculate disposable income and debt-to-income ratio
        const monthlyIncome = data.monthly_income || 0;
        const monthlyExpenses = data.monthly_expenses || 0;
        const disposableIncome = monthlyIncome - monthlyExpenses;
        const existingLoansBalance = data.existing_loans_balance || 0;
        const dti = monthlyIncome > 0
            ? new Decimal(existingLoansBalance).div(monthlyIncome).mul(100).toDecimalPlaces(2).toNumber()
            : 0;

        // Insert appraisal record
        const appraisal = await db
            .insertInto('loan_appraisals')
            .values({
                application_id: applicationId,
                appraiser_id: user.id,
                appraisal_date: new Date() as any,
                monthly_income: data.monthly_income as any,
                monthly_expenses: data.monthly_expenses as any,
                disposable_income: disposableIncome as any,
                existing_loans_balance: data.existing_loans_balance as any,
                debt_to_income_ratio: dti as any,
                collateral_description: data.collateral_description || null,
                collateral_estimated_value: data.collateral_estimated_value as any || null,
                collateral_type: data.collateral_type || null,
                recommended_amount: data.recommended_amount as any || null,
                recommended_tenure_months: data.recommended_tenure_months || null,
                recommended_interest_rate: data.recommended_interest_rate as any || null,
                risk_rating: data.risk_rating as any,
                risk_factors: data.risk_factors || null,
                notes: data.notes || null,
                status: 'completed' as any,
            } as any)
            .returningAll()
            .executeTakeFirstOrThrow();

        // Update application status
        await loanRepo.updateApplication(applicationId, {
            status: 'appraisal_complete',
        } as any);

        return c.json({
            success: true,
            data: appraisal,
            meta: { created: true }
        }, 201);
    } catch (error) {
        throw error;
    }
});

/**
 * GET /loans/applications/:applicationId/appraisal
 * Get appraisal for an application
 */
loanRoutes.get('/applications/:applicationId/appraisal', async (c) => {
    try {
        const { applicationId } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const db = getTenantDb(schema_name);

        const appraisals = await db
            .selectFrom('loan_appraisals')
            .selectAll()
            .where('application_id', '=', applicationId)
            .orderBy('appraisal_date', 'desc')
            .execute();

        return c.json({
            success: true,
            data: appraisals,
            meta: { count: appraisals.length }
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// GUARANTORS (LON-009)
// =============================================================================

/**
 * POST /loans/applications/:applicationId/guarantors
 * Add a guarantor to a loan application
 */
loanRoutes.post('/applications/:applicationId/guarantors', validate(guarantorSchema), async (c) => {
    try {
        const { applicationId } = c.req.param();
        const data = getValidatedData<z.infer<typeof guarantorSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');
        const db = getTenantDb(schema_name);

        if (!user) {
            throw new UnauthorizedError('Authentication required');
        }

        const loanRepo = new LoanRepository(schema_name);
        const application = await loanRepo.findApplicationById(applicationId);
        if (!application) {
            throw new NotFoundError('Loan Application', applicationId);
        }

        // Get current guarantor count for numbering
        const existingGuarantors = await db
            .selectFrom('loan_guarantors')
            .selectAll()
            .where('application_id', '=', applicationId)
            .where('deleted_at', 'is', null)
            .execute();

        const guarantor = await db
            .insertInto('loan_guarantors')
            .values({
                application_id: applicationId,
                guarantor_id: data.guarantor_id,
                guarantor_number: existingGuarantors.length + 1,
                relationship: data.relationship || null,
                contact_phone: data.contact_phone || null,
                contact_email: data.contact_email || null,
                guaranteed_amount: data.guaranteed_amount as any,
                consent_obtained: false as any,
                created_by: user.id,
            } as any)
            .returningAll()
            .executeTakeFirstOrThrow();

        return c.json({
            success: true,
            data: guarantor,
            meta: { created: true }
        }, 201);
    } catch (error) {
        throw error;
    }
});

/**
 * GET /loans/applications/:applicationId/guarantors
 * List guarantors for a loan application
 */
loanRoutes.get('/applications/:applicationId/guarantors', async (c) => {
    try {
        const { applicationId } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const db = getTenantDb(schema_name);

        const guarantors = await db
            .selectFrom('loan_guarantors')
            .selectAll()
            .where('application_id', '=', applicationId)
            .where('deleted_at', 'is', null)
            .orderBy('guarantor_number', 'asc')
            .execute();

        return c.json({
            success: true,
            data: guarantors,
            meta: { count: guarantors.length }
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// DISBURSEMENT (LON-018)
// =============================================================================

/**
 * POST /loans/:loanId/disburse
 * Disburse an approved loan
 */
loanRoutes.post('/:loanId/disburse', validate(disburseLoanSchema), async (c) => {
    try {
        const { loanId } = c.req.param();
        const data = getValidatedData<z.infer<typeof disburseLoanSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');

        if (!user || !hasPermission(user.role || '', 'loans', 'update')) {
            throw new UnauthorizedError('Insufficient permissions to disburse loans');
        }

        const loanRepo = new LoanRepository(schema_name);
        const loan = await loanRepo.findLoanById(loanId);
        if (!loan) {
            throw new NotFoundError('Loan', loanId);
        }

        if (loan.status !== 'approved_pending_disbursement') {
            return c.json({
                success: false,
                error: { code: 'INVALID_STATUS', message: `Cannot disburse loan in '${loan.status}' status` }
            }, 400);
        }

        const now = new Date();
        const approvedAmount = Number(loan.approved_amount);

        // Update loan account with disbursement details
        const updated = await loanRepo.updateLoan(loanId, {
            status: 'active',
            disbursement_date: now,
            disbursement_amount: approvedAmount,
            loan_start_date: now,
            // Set end date based on tenure
            loan_end_date: (() => {
                const end = new Date(now);
                end.setMonth(end.getMonth() + (loan.approved_tenure_months as unknown as number));
                return end;
            })(),
            principal_outstanding: approvedAmount,
            total_outstanding: approvedAmount,
        } as any);

        return c.json({
            success: true,
            data: {
                loan: updated,
                disbursement: {
                    amount: approvedAmount,
                    channel: data.disbursement_channel,
                    reference: data.disbursement_reference,
                    date: now.toISOString(),
                },
            },
            meta: { disbursed: true }
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// LOAN SCHEDULE (LON-020)
// =============================================================================

/**
 * GET /loans/:loanId/schedule
 * Get the repayment schedule for a specific loan
 */
loanRoutes.get('/:loanId/schedule', async (c) => {
    try {
        const { loanId } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const currentUser = c.get('user');
        const loanRepo = new LoanRepository(schema_name);

        const loan = await loanRepo.findLoanById(loanId);
        if (!loan) {
            throw new NotFoundError('Loan', loanId);
        }

        if (currentUser?.role === 'member' && loan.member_id !== currentUser.id) {
            throw new UnauthorizedError('Cannot access other members\' loan schedules');
        }

        const schedule = await loanRepo.findSchedulesByLoanId(loanId);

        return c.json({
            success: true,
            data: schedule,
            meta: { count: schedule.length }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * GET /loans/:loanId/repayments
 * Get all repayment history for a loan
 */
loanRoutes.get('/:loanId/repayments', async (c) => {
    try {
        const { loanId } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const currentUser = c.get('user');
        const loanRepo = new LoanRepository(schema_name);

        const loan = await loanRepo.findLoanById(loanId);
        if (!loan) {
            throw new NotFoundError('Loan', loanId);
        }

        if (currentUser?.role === 'member' && loan.member_id !== currentUser.id) {
            throw new UnauthorizedError('Cannot access other members\' repayment history');
        }

        const repayments = await loanRepo.findRepaymentsByLoanId(loanId);

        return c.json({
            success: true,
            data: repayments,
            meta: { count: repayments.length }
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// RESCHEDULING (LON-025)
// =============================================================================

/**
 * POST /loans/:loanId/reschedule
 * Reschedule a loan with new terms
 */
loanRoutes.post('/:loanId/reschedule', validate(rescheduleLoanSchema), async (c) => {
    try {
        const { loanId } = c.req.param();
        const data = getValidatedData<z.infer<typeof rescheduleLoanSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');

        if (!user || !hasPermission(user.role || '', 'loans', 'update')) {
            throw new UnauthorizedError('Insufficient permissions to reschedule loans');
        }

        const loanRepo = new LoanRepository(schema_name);
        const db = getTenantDb(schema_name);
        const loan = await loanRepo.findLoanById(loanId);
        if (!loan) {
            throw new NotFoundError('Loan', loanId);
        }

        if (loan.status !== 'active') {
            return c.json({
                success: false,
                error: { code: 'INVALID_STATUS', message: 'Only active loans can be rescheduled' }
            }, 400);
        }

        const outstandingPrincipal = Number(loan.principal_outstanding || loan.approved_amount);
        const interestRate = data.new_interest_rate ?? Number(loan.approved_interest_rate);

        // Mark existing unpaid schedules as rescheduled (overdue/scheduled)
        await db
            .updateTable('loan_schedules')
            .set({ status: 'written_off' as any, updated_at: new Date() as any })
            .where('loan_account_id', '=', loanId)
            .where('status', 'in', ['scheduled', 'partial', 'overdue'])
            .execute();

        // Generate new schedule from outstanding balance
        const product = await loanRepo.findProductById(loan.product_id);
        const interestMethod = product?.interest_calculation_method === 'declining_balance'
            ? 'declining_emi'
            : product?.interest_calculation_method === 'compound'
                ? 'declining_emi'
                : 'flat';

        const newSchedule = ScheduleCalculator.generateSchedule({
            principal: outstandingPrincipal,
            annualInterestRate: interestRate,
            tenureInstallments: data.new_tenure_months,
            interestMethod,
            frequency: (product?.repayment_frequency as any) || 'monthly',
            startDate: new Date(),
        });

        // Persist new schedule
        const entries = newSchedule.installments.map(inst => ({
            loan_account_id: loanId,
            installment_number: inst.installmentNumber,
            due_date: inst.dueDate,
            opening_balance: inst.openingBalance.toString(),
            principal_payment: inst.principalPayment.toString(),
            interest_payment: inst.interestPayment.toString(),
            penalty_payment: '0',
            total_payment: inst.totalPayment.toString(),
            closing_balance: inst.closingBalance.toString(),
            status: 'scheduled',
        }));

        if (entries.length > 0) {
            await loanRepo.createScheduleEntries(entries as any);
        }

        // Update loan tenure
        await loanRepo.updateLoan(loanId, {
            approved_tenure_months: data.new_tenure_months,
            approved_interest_rate: interestRate,
            loan_end_date: (() => {
                const end = new Date();
                end.setMonth(end.getMonth() + data.new_tenure_months);
                return end;
            })(),
        } as any);

        // Record recovery action
        await db
            .insertInto('loan_recovery_actions')
            .values({
                loan_account_id: loanId,
                action_type: 'reminder' as any, // closest type for reschedule
                action_date: new Date() as any,
                description: `Loan rescheduled: ${data.reason}. New tenure: ${data.new_tenure_months} months, Rate: ${interestRate}%`,
                amount_recovered: 0 as any,
                status: 'completed' as any,
                created_by: user.id,
            } as any)
            .execute();

        return c.json({
            success: true,
            data: {
                loanId,
                newTenureMonths: data.new_tenure_months,
                newInterestRate: interestRate,
                outstandingPrincipal,
                newScheduleCount: entries.length,
                reason: data.reason,
            },
            meta: { rescheduled: true }
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// WRITE-OFF (LON-026)
// =============================================================================

/**
 * POST /loans/:loanId/write-off
 * Write off a non-performing loan
 */
loanRoutes.post('/:loanId/write-off', validate(writeOffLoanSchema), async (c) => {
    try {
        const { loanId } = c.req.param();
        const data = getValidatedData<z.infer<typeof writeOffLoanSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');

        if (!user || !hasPermission(user.role || '', 'loans', 'approve')) {
            throw new UnauthorizedError('Insufficient permissions to write off loans');
        }

        const loanRepo = new LoanRepository(schema_name);
        const loan = await loanRepo.findLoanById(loanId);
        if (!loan) {
            throw new NotFoundError('Loan', loanId);
        }

        if (loan.status !== 'active' && loan.status !== 'defaulted') {
            return c.json({
                success: false,
                error: { code: 'INVALID_STATUS', message: 'Only active or defaulted loans can be written off' }
            }, 400);
        }

        const db = getTenantDb(schema_name);
        const repaymentService = new RepaymentService(db);
        await repaymentService.writeOffLoan(loanId, data.reason, user.id);

        return c.json({
            success: true,
            data: {
                loanId,
                status: 'written_off',
                reason: data.reason,
                writtenOffBy: user.id,
                writtenOffAt: new Date().toISOString(),
                outstandingAtWriteOff: {
                    principal: loan.principal_outstanding,
                    interest: loan.interest_outstanding,
                    penalties: loan.penalties_outstanding,
                    total: loan.total_outstanding,
                },
            },
            meta: { written_off: true }
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// EARLY SETTLEMENT (LON-030)
// =============================================================================

/**
 * GET /loans/:loanId/early-settlement
 * Preview early settlement amount with interest rebate
 */
loanRoutes.get('/:loanId/early-settlement', async (c) => {
    try {
        const { loanId } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const currentUser = c.get('user');
        const loanRepo = new LoanRepository(schema_name);

        const loan = await loanRepo.findLoanById(loanId);
        if (!loan) {
            throw new NotFoundError('Loan', loanId);
        }

        if (currentUser?.role === 'member' && loan.member_id !== currentUser.id) {
            throw new UnauthorizedError('Cannot access other members\' loans');
        }

        if (loan.status !== 'active') {
            return c.json({
                success: false,
                error: { code: 'INVALID_STATUS', message: 'Only active loans can be settled early' }
            }, 400);
        }

        const schedule = await loanRepo.findSchedulesByLoanId(loanId);
        const unpaidSchedules = schedule.filter(
            s => s.status === 'scheduled' || s.status === 'partial' || s.status === 'overdue'
        );
        const paidSchedules = schedule.filter(
            s => s.status === 'paid'
        );

        // Calculate totals
        const outstandingPrincipal = new Decimal(loan.principal_outstanding?.toString() || '0');
        const outstandingInterest = new Decimal(loan.interest_outstanding?.toString() || '0');
        const outstandingPenalties = new Decimal(loan.penalties_outstanding?.toString() || '0');

        // Calculate future scheduled interest
        const totalScheduledInterest = schedule.reduce(
            (sum, s) => sum.plus(s.interest_payment?.toString() || '0'),
            new Decimal(0)
        );
        const paidInterest = paidSchedules.reduce(
            (sum, s) => sum.plus(s.interest_payment?.toString() || '0'),
            new Decimal(0)
        );
        const remainingScheduledInterest = totalScheduledInterest.minus(paidInterest);

        // Compute rebate using LoanService
        const loanService = new LoanService();
        const unpaidMonths = unpaidSchedules.length;
        const totalMonths = schedule.length;
        const rebate = new Decimal(
            loanService.computeEarlySettlementRebate(
                remainingScheduledInterest.toNumber(),
                unpaidMonths,
                totalMonths,
            )
        );

        const settlementAmount = outstandingPrincipal
            .plus(outstandingInterest)
            .plus(outstandingPenalties)
            .minus(rebate);

        return c.json({
            success: true,
            data: {
                loanId,
                loanNumber: loan.loan_number,
                outstandingPrincipal: outstandingPrincipal.toString(),
                outstandingInterest: outstandingInterest.toString(),
                outstandingPenalties: outstandingPenalties.toString(),
                interestRebate: rebate.toDecimalPlaces(2).toString(),
                settlementAmount: settlementAmount.toDecimalPlaces(2).toString(),
                installmentsRemaining: unpaidMonths,
                totalInstallments: totalMonths,
            },
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /loans/:loanId/early-settlement
 * Process early settlement of a loan
 */
loanRoutes.post('/:loanId/early-settlement', validate(earlySettlementSchema), async (c) => {
    try {
        const { loanId } = c.req.param();
        const data = getValidatedData<z.infer<typeof earlySettlementSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');

        if (!user) {
            throw new UnauthorizedError('Authentication required');
        }

        const loanRepo = new LoanRepository(schema_name);
        const db = getTenantDb(schema_name);
        const loan = await loanRepo.findLoanById(loanId);
        if (!loan) {
            throw new NotFoundError('Loan', loanId);
        }

        if (loan.status !== 'active') {
            return c.json({
                success: false,
                error: { code: 'INVALID_STATUS', message: 'Only active loans can be settled early' }
            }, 400);
        }

        // Calculate settlement amount (same logic as preview)
        const schedule = await loanRepo.findSchedulesByLoanId(loanId);
        const outstandingPrincipal = new Decimal(loan.principal_outstanding?.toString() || '0');
        const outstandingInterest = new Decimal(loan.interest_outstanding?.toString() || '0');
        const outstandingPenalties = new Decimal(loan.penalties_outstanding?.toString() || '0');

        const totalScheduledInterest = schedule.reduce(
            (sum, s) => sum.plus(s.interest_payment?.toString() || '0'),
            new Decimal(0)
        );
        const paidSchedules = schedule.filter(s => s.status === 'paid');
        const paidInterest = paidSchedules.reduce(
            (sum, s) => sum.plus(s.interest_payment?.toString() || '0'),
            new Decimal(0)
        );
        const remainingScheduledInterest = totalScheduledInterest.minus(paidInterest);
        const unpaidSchedules = schedule.filter(
            s => s.status === 'scheduled' || s.status === 'partial' || s.status === 'overdue'
        );

        const loanService = new LoanService();
        const rebate = new Decimal(
            loanService.computeEarlySettlementRebate(
                remainingScheduledInterest.toNumber(),
                unpaidSchedules.length,
                schedule.length,
            )
        );

        const settlementAmount = outstandingPrincipal
            .plus(outstandingInterest)
            .plus(outstandingPenalties)
            .minus(rebate);

        // Process as a full repayment
        const repaymentService = new RepaymentService(db);
        const result = await repaymentService.processRepayment({
            loanAccountId: loanId,
            amount: settlementAmount.toNumber(),
            paymentMethod: data.payment_method,
            paymentReference: data.payment_reference,
            recordedBy: user.id,
        });

        // Ensure loan is closed
        if (!result.loanFullyRepaid) {
            // Force close if settlement covers outstanding
            await loanRepo.updateLoan(loanId, {
                status: 'closed',
                principal_outstanding: 0,
                interest_outstanding: 0,
                penalties_outstanding: 0,
                total_outstanding: 0,
            } as any);

            // Mark remaining schedules as paid
            await db
                .updateTable('loan_schedules')
                .set({ status: 'paid' as any, paid_date: new Date() as any, updated_at: new Date() as any })
                .where('loan_account_id', '=', loanId)
                .where('status', 'in', ['scheduled', 'partial', 'overdue'])
                .execute();
        }

        return c.json({
            success: true,
            data: {
                loanId,
                settlementAmount: settlementAmount.toDecimalPlaces(2).toString(),
                interestRebate: rebate.toDecimalPlaces(2).toString(),
                repaymentId: result.repaymentId,
                loanClosed: true,
            },
            meta: { settled: true }
        }, 201);
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// ELIGIBILITY REPORT (LON-011b)
// =============================================================================

const eligibilityReportSchema = z.object({
    member_id: commonSchemas.uuid,
    product_id: commonSchemas.uuid,
});

/**
 * POST /loans/eligibility/report
 * Generate a detailed eligibility report for a member against a loan product
 */
loanRoutes.post('/eligibility/report', enforcePermission('loans', 'read'), validate(eligibilityReportSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof eligibilityReportSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const db = getTenantDb(schema_name);

        const loanRepo = new LoanRepository(schema_name);
        const accountRepo = new AccountRepository(schema_name);
        const memberRepo = new MemberRepository(schema_name);

        // Verify member and product exist
        const member = await memberRepo.findById(data.member_id);
        if (!member) {
            throw new NotFoundError('Member', data.member_id);
        }

        const product = await loanRepo.findProductById(data.product_id);
        if (!product) {
            throw new NotFoundError('Loan Product', data.product_id);
        }

        // Query member savings balance
        const savingsAccounts = await accountRepo.findAccountsByMemberId(data.member_id);
        const totalSavings = savingsAccounts.reduce(
            (sum, acc) => sum + Number(acc.principal_balance || 0), 0
        );

        // Query member share holdings
        const shareHoldings = await db
            .selectFrom('share_holdings')
            .select([
                'id',
                'share_class_id',
                'total_shares',
                'average_cost_per_share',
            ] as any[])
            .where('member_id', '=', data.member_id)
            .where('deleted_at', 'is', null)
            .execute();

        const totalShareValue = shareHoldings.reduce(
            (sum, h: any) => sum + (Number(h.total_shares || 0) * Number(h.average_cost_per_share || 0)), 0
        );

        // Query existing active loans
        const existingLoans = await loanRepo.findLoansByMemberId(data.member_id);
        const activeLoans = existingLoans.filter(
            l => l.status === 'active' || l.status === 'approved_pending_disbursement'
        );
        const outstandingLoanBalance = activeLoans.reduce(
            (sum, l) => sum + Number(l.total_outstanding || 0), 0
        );

        // Calculate savings multiplier eligibility
        const savingsMultiplier = 3; // Default 3x multiplier
        const maxBySavings = totalSavings * savingsMultiplier;
        const maxByProduct = Number(product.maximum_amount);
        const maxAmount = Math.min(maxBySavings, maxByProduct);

        // Calculate share-to-loan ratio
        const shareToLoanRatio = outstandingLoanBalance > 0
            ? new Decimal(totalShareValue).div(outstandingLoanBalance).toDecimalPlaces(4).toNumber()
            : totalShareValue > 0 ? Infinity : 0;

        // Membership duration
        const joinedDate = new Date(member.joined_date as any);
        const now = new Date();
        const membershipMonths = (now.getFullYear() - joinedDate.getFullYear()) * 12
            + (now.getMonth() - joinedDate.getMonth());

        // Build eligibility reasons and scores
        const reasons: string[] = [];
        let score = 100;

        if (totalSavings <= 0) {
            reasons.push('No savings balance found. Savings are required to qualify.');
            score -= 40;
        }

        if (maxBySavings < Number(product.minimum_amount)) {
            reasons.push(
                `Insufficient savings for minimum loan. Need at least ${(Number(product.minimum_amount) / savingsMultiplier).toFixed(0)} in savings.`
            );
            score -= 30;
        }

        if (membershipMonths < 6) {
            reasons.push(`Membership too recent: ${membershipMonths} months (minimum 6 required).`);
            score -= 15;
        }

        if (activeLoans.length >= 3) {
            reasons.push(`Maximum concurrent loans reached (${activeLoans.length}/3).`);
            score -= 25;
        }

        if (outstandingLoanBalance > totalSavings * 2) {
            reasons.push('Outstanding loan balance exceeds 2x savings — high debt exposure.');
            score -= 10;
        }

        score = Math.max(score, 0);

        return c.json({
            success: true,
            data: {
                eligible: reasons.length === 0,
                max_amount: maxAmount,
                reasons,
                scores: {
                    overall: score,
                    savings_adequacy: totalSavings > 0 ? Math.min(100, (totalSavings / (Number(product.minimum_amount) / savingsMultiplier)) * 100) : 0,
                    debt_exposure: outstandingLoanBalance === 0 ? 100 : Math.max(0, 100 - (outstandingLoanBalance / totalSavings) * 50),
                    membership_tenure: Math.min(100, (membershipMonths / 12) * 100),
                },
                member_details: {
                    member_id: data.member_id,
                    membership_months: membershipMonths,
                    total_savings: totalSavings,
                    total_share_value: totalShareValue,
                    active_loan_count: activeLoans.length,
                    outstanding_loan_balance: outstandingLoanBalance,
                    share_to_loan_ratio: shareToLoanRatio === Infinity ? 'N/A' : shareToLoanRatio,
                },
                product_limits: {
                    minimum_amount: product.minimum_amount,
                    maximum_amount: product.maximum_amount,
                    savings_multiplier: savingsMultiplier,
                    max_by_savings: maxBySavings,
                },
            },
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// LOAN AGREEMENT (LON-031)
// =============================================================================

/**
 * GET /loans/:loanId/agreement
 * Generate agreement document data for a loan
 */
loanRoutes.get('/:loanId/agreement', enforcePermission('loans', 'read'), async (c) => {
    try {
        const { loanId } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const db = getTenantDb(schema_name);

        // Get loan account with product and member details
        const loan = await db
            .selectFrom('loan_accounts as la')
            .innerJoin('loan_products as lp', 'lp.id', 'la.product_id')
            .innerJoin('members as m', 'm.id', 'la.member_id')
            .select([
                'la.id',
                'la.loan_number',
                'la.approved_amount',
                'la.approved_interest_rate',
                'la.approved_tenure_months',
                'la.status',
                'la.disbursement_date',
                'la.loan_start_date',
                'la.loan_end_date',
                'la.principal_outstanding',
                'la.application_id',
                'lp.name as product_name',
                'lp.code as product_code',
                'lp.interest_calculation_method',
                'lp.repayment_frequency',
                'lp.late_payment_penalty_type',
                'lp.late_payment_penalty',
                'lp.requires_guarantors',
                'm.first_name',
                'm.last_name',
                'm.member_number',
                'm.email',
                'm.phone',
            ] as any[])
            .where('la.id', '=', loanId)
            .where('la.deleted_at', 'is', null)
            .executeTakeFirst();

        if (!loan) {
            throw new NotFoundError('Loan', loanId);
        }

        // Get repayment schedule
        const schedule = await db
            .selectFrom('loan_schedules')
            .selectAll()
            .where('loan_account_id', '=', loanId)
            .where('status', '!=', 'written_off' as any)
            .orderBy('installment_number', 'asc')
            .execute();

        // Get guarantors if applicable
        let guarantors: any[] = [];
        if (loan.application_id) {
            guarantors = await db
                .selectFrom('loan_guarantors as lg')
                .innerJoin('members as gm', 'gm.id', 'lg.guarantor_id')
                .select([
                    'lg.id',
                    'lg.guarantor_id',
                    'lg.guaranteed_amount',
                    'lg.relationship',
                    'lg.consent_obtained',
                    'lg.contact_phone',
                    'lg.contact_email',
                    'gm.first_name as guarantor_first_name',
                    'gm.last_name as guarantor_last_name',
                    'gm.member_number as guarantor_member_number',
                ] as any[])
                .where('lg.application_id', '=', loan.application_id)
                .where('lg.deleted_at', 'is', null)
                .orderBy('lg.guarantor_number', 'asc')
                .execute();
        }

        // Get SACCO info for agreement header
        const saccoConfig = await db
            .selectFrom('sacco_configuration')
            .select(['organization_name'])
            .executeTakeFirst();

        return c.json({
            success: true,
            data: {
                organization: saccoConfig?.organization_name || 'SACCO',
                generated_at: new Date().toISOString(),
                parties: {
                    borrower: {
                        name: `${loan.first_name} ${loan.last_name}`,
                        member_number: loan.member_number,
                        id_number: loan.id_number,
                        email: loan.email,
                        phone: loan.phone_number,
                    },
                },
                terms: {
                    loan_number: loan.loan_number,
                    product: loan.product_name,
                    product_code: loan.product_code,
                    approved_amount: loan.approved_amount?.toString(),
                    interest_rate: loan.approved_interest_rate?.toString(),
                    interest_method: loan.interest_calculation_method,
                    tenure_months: loan.approved_tenure_months,
                    repayment_frequency: loan.repayment_frequency,
                    late_penalty_type: loan.late_payment_penalty_type,
                    late_penalty: loan.late_payment_penalty?.toString(),
                    disbursement_date: loan.disbursement_date,
                    start_date: loan.loan_start_date,
                    end_date: loan.loan_end_date,
                    status: loan.status,
                },
                schedule: schedule.map(s => ({
                    installment_number: s.installment_number,
                    due_date: s.due_date,
                    principal_payment: s.principal_payment?.toString(),
                    interest_payment: s.interest_payment?.toString(),
                    total_payment: s.total_payment?.toString(),
                    closing_balance: s.closing_balance?.toString(),
                    status: s.status,
                })),
                guarantors: guarantors.map(g => ({
                    name: `${g.guarantor_first_name} ${g.guarantor_last_name}`,
                    member_number: g.guarantor_member_number,
                    id_number: g.guarantor_id_number,
                    guaranteed_amount: g.guaranteed_amount?.toString(),
                    relationship: g.relationship,
                    consent_obtained: g.consent_obtained,
                    contact_phone: g.contact_phone,
                    contact_email: g.contact_email,
                })),
            },
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// AGREEMENT SIGNING (LON-032)
// =============================================================================

const agreementSignSchema = z.object({
    signed_by: z.string().min(1, 'Signer name is required'),
    signature_method: z.enum(['digital', 'physical', 'biometric']),
});

/**
 * POST /loans/:loanId/agreement/sign
 * Record agreement signing for a loan
 */
loanRoutes.post('/:loanId/agreement/sign', enforcePermission('loans', 'update'), validate(agreementSignSchema), async (c) => {
    try {
        const { loanId } = c.req.param();
        const data = getValidatedData<z.infer<typeof agreementSignSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');
        const db = getTenantDb(schema_name);

        const loanRepo = new LoanRepository(schema_name);
        const loan = await loanRepo.findLoanById(loanId);
        if (!loan) {
            throw new NotFoundError('Loan', loanId);
        }

        const signedAt = new Date();

        // Update loan account with signing metadata
        await db
            .updateTable('loan_accounts')
            .set({
                agreement_signed_at: signedAt as any,
                agreement_signed_by: data.signed_by,
                agreement_signature_method: data.signature_method as any,
                updated_at: signedAt as any,
            } as any)
            .where('id', '=', loanId)
            .execute();

        // Record in audit log
        await db
            .insertInto('audit_log')
            .values({
                user_id: user!.id,
                action: 'loan_agreement_signed' as any,
                entity_type: 'loan_accounts' as any,
                entity_id: loanId,
                details: JSON.stringify({
                    loan_number: loan.loan_number,
                    signed_by: data.signed_by,
                    signature_method: data.signature_method,
                    signed_at: signedAt.toISOString(),
                }) as any,
                created_at: signedAt as any,
            } as any)
            .execute();

        return c.json({
            success: true,
            data: {
                loan_id: loanId,
                loan_number: loan.loan_number,
                signed_by: data.signed_by,
                signature_method: data.signature_method,
                signed_at: signedAt.toISOString(),
            },
            meta: { signed: true },
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// GUARANTOR RECOVERY (LON-033)
// =============================================================================

const guarantorRecoverySchema = z.object({
    guarantor_id: commonSchemas.uuid,
    amount: z.number().positive('Recovery amount must be positive'),
    reason: z.string().min(5, 'Reason must be at least 5 characters'),
});

/**
 * POST /loans/:loanId/guarantor-recovery
 * Recover overdue loan amount from a guarantor's savings
 */
loanRoutes.post('/:loanId/guarantor-recovery', enforcePermission('loans', 'update'), validate(guarantorRecoverySchema), async (c) => {
    try {
        const { loanId } = c.req.param();
        const data = getValidatedData<z.infer<typeof guarantorRecoverySchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');
        const db = getTenantDb(schema_name);

        const loanRepo = new LoanRepository(schema_name);
        const accountRepo = new AccountRepository(schema_name);

        // Verify loan exists
        const loan = await loanRepo.findLoanById(loanId);
        if (!loan) {
            throw new NotFoundError('Loan', loanId);
        }

        // Verify guarantor exists for this loan
        const guarantor = await db
            .selectFrom('loan_guarantors')
            .selectAll()
            .where('application_id', '=', loan.application_id!)
            .where('guarantor_id', '=', data.guarantor_id)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

        if (!guarantor) {
            throw new NotFoundError('Guarantor for this loan', data.guarantor_id);
        }

        // Verify guarantor has sufficient savings
        const guarantorAccounts = await accountRepo.findAccountsByMemberId(data.guarantor_id);
        const guarantorSavings = guarantorAccounts.reduce(
            (sum, acc) => sum + Number(acc.principal_balance || 0), 0
        );

        if (guarantorSavings < data.amount) {
            throw new ValidationError(
                `Guarantor has insufficient savings balance. Available: ${guarantorSavings.toFixed(2)}, Requested: ${data.amount.toFixed(2)}`
            );
        }

        const now = new Date();
        const recoveryRef = `GR-${Date.now().toString(36).toUpperCase()}`;

        // Find guarantor's primary savings account (first with sufficient balance)
        const sourceAccount = guarantorAccounts.find(
            acc => Number(acc.principal_balance || 0) >= data.amount
        );

        if (!sourceAccount) {
            throw new ValidationError('No single savings account has sufficient balance for this recovery.');
        }

        // Execute guarantor recovery atomically in a database transaction
        const result = await db.transaction().execute(async (trx) => {
            // Create withdrawal from guarantor's savings
            await trx
                .updateTable('savings_accounts' as any)
                .set({
                    principal_balance: String(Number(sourceAccount.principal_balance) - data.amount) as any,
                    updated_at: now as any,
                } as any)
                .where('id', '=', sourceAccount.id)
                .execute();

            // Record the savings withdrawal
            await trx
                .insertInto('withdrawals')
                .values({
                    savings_account_id: sourceAccount.id,
                    member_id: guarantor.guarantor_id as string,
                    amount: String(data.amount) as any,
                    withdrawal_number: recoveryRef,
                    withdrawal_date: now as any,
                    payout_method: 'internal' as any,
                    description: `Guarantor recovery for loan ${loan.loan_number}: ${data.reason}`,
                    requested_by: user!.id,
                    status: 'completed' as any,
                } as any)
                .execute();

            // Record recovery action
            await trx
                .insertInto('loan_recovery_actions')
                .values({
                    loan_account_id: loanId,
                    action_type: 'guarantor_recovery' as any,
                    action_date: now as any,
                    description: `Recovered ${data.amount} from guarantor savings. Reason: ${data.reason}`,
                    amount_recovered: String(data.amount) as any,
                    status: 'completed' as any,
                    created_by: user!.id,
                } as any)
                .execute();

            return {
                sourceAccountId: sourceAccount.id,
                remainingBalance: Number(sourceAccount.principal_balance) - data.amount,
            };
        });

        // Process loan repayment (uses its own transaction internally)
        const repaymentService = new RepaymentService(db);
        const repaymentResult = await repaymentService.processRepayment({
            loanAccountId: loanId,
            amount: data.amount,
            paymentMethod: 'internal',
            paymentReference: recoveryRef,
            recordedBy: user!.id,
        });

        return c.json({
            success: true,
            data: {
                loan_id: loanId,
                loan_number: loan.loan_number,
                guarantor_id: data.guarantor_id,
                recovery_amount: data.amount,
                recovery_reference: recoveryRef,
                reason: data.reason,
                source_account_id: sourceAccount.id,
                guarantor_remaining_balance: Number(sourceAccount.principal_balance) - data.amount,
                repayment: {
                    repayment_id: repaymentResult.repaymentId,
                    allocated_principal: repaymentResult.allocatedPrincipal.toString(),
                    allocated_interest: repaymentResult.allocatedInterest.toString(),
                    allocated_penalty: repaymentResult.allocatedPenalty.toString(),
                    remaining_loan_balance: repaymentResult.remainingBalance.toString(),
                    loan_fully_repaid: repaymentResult.loanFullyRepaid,
                },
                recovered_at: now.toISOString(),
            },
            meta: { recovered: true },
        }, 201);
    } catch (error) {
        throw error;
    }
});

export default loanRoutes;
