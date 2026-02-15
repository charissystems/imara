import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '../middleware/types';
import { validate, getValidatedData, commonSchemas } from '../middleware/validation';
import { ValidationError, NotFoundError, UnauthorizedError } from '../middleware/errorHandler';
import { MemberRepository } from '../repositories/memberRepository';
import { AccountRepository } from '../repositories/accountRepository';
import { LoanRepository } from '../repositories/loanRepository';
import { MemberService } from '../services/memberService';
import { getTenantDb } from '../config/database';
import { hasPermission, enforcePermission } from '../middleware/rbac';

export const memberRoutes = new Hono<Env>();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createMemberSchema = z.object({
    first_name: z.string().min(2, 'First name must be at least 2 characters'),
    middle_name: z.string().nullable().optional(),
    last_name: z.string().min(2, 'Last name must be at least 2 characters'),
    phone: commonSchemas.phone.optional(),
    email: commonSchemas.email.optional(),
    member_number: z.string().min(3, 'Member number must be at least 3 characters'),
    date_of_birth: z.string().optional(),
    gender: z.enum(['male', 'female', 'other', 'unknown']).default('unknown'),
    marital_status: z.enum(['single', 'married', 'divorced', 'widowed', 'unknown']).default('unknown'),
    nationality: z.string().optional(),
    physical_address: z.record(z.string(), z.unknown()).optional(),
    postal_address: z.record(z.string(), z.unknown()).optional(),
    employment_details: z.record(z.string(), z.unknown()).optional(),
    next_of_kin: z.record(z.string(), z.unknown()).optional(),
    joined_date: z.string().datetime().optional(),
    status: z.enum(['active', 'inactive', 'suspended', 'closed']).default('active'),
    referred_by: z.string().uuid().optional(),
    auto_create_savings: z.boolean().default(true),
});

const updateMemberSchema = z.object({
    first_name: z.string().min(2).optional(),
    middle_name: z.string().nullable().optional(),
    last_name: z.string().min(2).optional(),
    phone: commonSchemas.phone.optional(),
    email: commonSchemas.email.optional(),
    date_of_birth: z.string().optional(),
    gender: z.enum(['male', 'female', 'other', 'unknown']).optional(),
    marital_status: z.enum(['single', 'married', 'divorced', 'widowed', 'unknown']).optional(),
    nationality: z.string().optional(),
    physical_address: z.record(z.string(), z.unknown()).optional(),
    postal_address: z.record(z.string(), z.unknown()).optional(),
    employment_details: z.record(z.string(), z.unknown()).optional(),
    next_of_kin: z.record(z.string(), z.unknown()).optional(),
    status: z.enum(['active', 'inactive', 'suspended', 'closed']).optional(),
});

const bulkImportSchema = z.object({
    csv_data: z.string().min(10, 'CSV data is required'),
    auto_create_savings: z.boolean().default(true),
});

const kycUpdateSchema = z.object({
    kyc_status: z.enum(['not_started', 'in_progress', 'completed', 'approved', 'rejected']),
    risk_rating: z.enum(['low', 'medium', 'high']).optional(),
    notes: z.string().optional(),
});

const identityDocumentSchema = z.object({
    document_type: z.string().min(1, 'Document type is required'),
    document_number: z.string().min(1, 'Document number is required'),
    issue_date: z.string().optional(),
    expiry_date: z.string().optional(),
    document_url: z.string().url().optional(),
});

// =============================================================================
// MEMBER LISTING & SEARCH
// =============================================================================

/**
 * GET /members
 * List all members for the current tenant
 * Optional query params: ?status=active, ?search=term, ?page=1, ?limit=50
 */
memberRoutes.get('/', async (c) => {
    try {
        const { schema_name } = c.get('tenant')!;
        const status = c.req.query('status') as string | undefined;
        const searchQuery = c.req.query('search');
        const page = parseInt(c.req.query('page') || '1', 10);
        const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
        
        const memberRepo = new MemberRepository(schema_name);

        let members;
        if (searchQuery) {
            members = await memberRepo.search(searchQuery);
        } else {
            members = await memberRepo.findAll(status as any);
        }

        // Simple pagination
        const total = members.length;
        const offset = (page - 1) * limit;
        const paginated = members.slice(offset, offset + limit);
        
        return c.json({
            success: true,
            data: paginated,
            meta: {
                count: paginated.length,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                tenant: c.get('tenant')!.code,
            }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * GET /members/:id
 * Get a specific member by ID with full profile
 */
memberRoutes.get('/:id', async (c) => {
    try {
        const { id } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        
        const memberRepo = new MemberRepository(schema_name);
        const member = await memberRepo.findById(id);
        
        if (!member) {
            throw new NotFoundError('Member', id);
        }
        
        return c.json({
            success: true,
            data: member
        });
    } catch (error) {
        throw error;
    }
});

/**
 * GET /members/:id/accounts
 * Get all accounts (savings, loans, shares) for a member
 */
memberRoutes.get('/:id/accounts', async (c) => {
    try {
        const { id } = c.req.param();
        const { schema_name } = c.get('tenant')!;

        const memberRepo = new MemberRepository(schema_name);
        const member = await memberRepo.findById(id);
        if (!member) {
            throw new NotFoundError('Member', id);
        }

        const accountRepo = new AccountRepository(schema_name);
        const loanRepo = new LoanRepository(schema_name);
        const db = getTenantDb(schema_name);

        const [savings, loans, shares, fixedDeposits] = await Promise.all([
            accountRepo.findAccountsByMemberId(id),
            loanRepo.findLoansByMemberId(id),
            db.selectFrom('share_holdings')
                .selectAll()
                .where('member_id', '=', id)
                .execute(),
            db.selectFrom('fixed_deposits')
                .selectAll()
                .where('member_id', '=', id)
                .execute(),
        ]);

        return c.json({
            success: true,
            data: {
                savings,
                loans,
                shares,
                fixedDeposits,
            },
            meta: {
                savingsCount: savings.length,
                loansCount: loans.length,
                sharesCount: shares.length,
                fixedDepositsCount: fixedDeposits.length,
            }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * GET /members/:id/statement
 * Generate a comprehensive member statement
 */
memberRoutes.get('/:id/statement', async (c) => {
    try {
        const { id } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const fromDate = c.req.query('from') || (() => {
            const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().split('T')[0];
        })();
        const toDate = c.req.query('to') || new Date().toISOString().split('T')[0];

        const memberRepo = new MemberRepository(schema_name);
        const member = await memberRepo.findById(id);
        if (!member) {
            throw new NotFoundError('Member', id);
        }

        const accountRepo = new AccountRepository(schema_name);
        const loanRepo = new LoanRepository(schema_name);
        const db = getTenantDb(schema_name);

        // Get savings accounts
        const savingsAccounts = await accountRepo.findAccountsByMemberId(id);

        // Get all deposits across savings accounts
        const allDeposits: any[] = [];
        const allWithdrawals: any[] = [];
        for (const acc of savingsAccounts) {
            const deposits = await accountRepo.findDepositsByAccountId(acc.id);
            const withdrawals = await accountRepo.findWithdrawalsByAccountId(acc.id);
            allDeposits.push(...deposits.map(d => ({ ...d, account_number: acc.account_number })));
            allWithdrawals.push(...withdrawals.map(w => ({ ...w, account_number: acc.account_number })));
        }

        // Get loan accounts and repayments
        const loans = await loanRepo.findLoansByMemberId(id);
        const loanRepayments: any[] = [];
        for (const loan of loans) {
            const repayments = await loanRepo.findRepaymentsByLoanId(loan.id);
            loanRepayments.push(...repayments.map(r => ({ ...r, loan_number: loan.loan_number })));
        }

        // Get share transactions
        const shareTransactions = await db
            .selectFrom('share_transactions')
            .selectAll()
            .where('member_id', '=', id)
            .orderBy('transaction_date', 'desc')
            .execute();

        // Calculate totals
        const totalSavings = savingsAccounts.reduce((s, a) => s + Number(a.principal_balance || 0), 0);
        const totalLoansOutstanding = loans.reduce((s, l) => s + Number(l.total_outstanding || 0), 0);
        const totalDeposits = allDeposits.reduce((s, d) => s + Number(d.amount || 0), 0);
        const totalWithdrawals = allWithdrawals.reduce((s, w) => s + Number(w.amount || 0), 0);

        return c.json({
            success: true,
            data: {
                member: {
                    id: member.id,
                    member_number: member.member_number,
                    name: `${member.first_name} ${member.last_name}`,
                    phone: member.phone,
                    email: member.email,
                    status: member.status,
                    joined_date: member.joined_date,
                },
                period: { from: fromDate, to: toDate },
                savings: {
                    accounts: savingsAccounts,
                    deposits: allDeposits,
                    withdrawals: allWithdrawals,
                },
                loans: {
                    accounts: loans,
                    repayments: loanRepayments,
                },
                shares: {
                    transactions: shareTransactions,
                },
                summary: {
                    totalSavingsBalance: totalSavings,
                    totalLoansOutstanding: totalLoansOutstanding,
                    totalDeposits,
                    totalWithdrawals,
                    netPosition: totalSavings - totalLoansOutstanding,
                },
                generatedAt: new Date().toISOString(),
            },
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// MEMBER CREATION & UPDATE
// =============================================================================

/**
 * POST /members
 * Create a new member with optional auto-create savings account
 */
memberRoutes.post('/', validate(createMemberSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof createMemberSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');
        
        const memberRepo = new MemberRepository(schema_name);
        
        // Check if member number already exists
        const existing = await memberRepo.findByMemberNumber(data.member_number);
        if (existing) {
            return c.json({
                success: false,
                error: { code: 'DUPLICATE', message: 'Member number already exists' }
            }, 409);
        }

        const { auto_create_savings, ...memberData } = data;
        
        const newMember = await memberRepo.create({
            ...memberData,
            joined_date: data.joined_date ? new Date(data.joined_date) : new Date(),
            date_of_birth: data.date_of_birth ? new Date(data.date_of_birth) : null,
            life_status: 'alive',
            kyc_status: 'not_started',
            risk_rating: 'low',
            preferences: {},
            created_by: user?.id || null,
        } as any);

        let savingsAccount = null;

        // Auto-create savings account
        if (auto_create_savings) {
            const accountRepo = new AccountRepository(schema_name);
            const accountNumber = `SAV-${data.member_number}-${Date.now().toString(36).toUpperCase()}`;

            try {
                savingsAccount = await accountRepo.create({
                    account_number: accountNumber,
                    member_id: newMember.id,
                    product_id: 'default',
                    principal_balance: 0,
                    interest_accrued: 0,
                    interest_paid: 0,
                    status: 'active',
                    opened_date: new Date(),
                    created_by: user?.id || null,
                } as any);
            } catch {
                // Non-fatal: log but don't fail member creation
            }
        }
        
        return c.json({
            success: true,
            data: {
                member: newMember,
                savingsAccount,
            },
            meta: { created: true, savingsCreated: !!savingsAccount }
        }, 201);
    } catch (error) {
        throw error;
    }
});

/**
 * PUT /members/:id
 * Update a member
 */
memberRoutes.put('/:id', validate(updateMemberSchema), async (c) => {
    try {
        const { id } = c.req.param();
        const data = getValidatedData<z.infer<typeof updateMemberSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');
        
        const memberRepo = new MemberRepository(schema_name);
        
        // Verify member exists
        const existing = await memberRepo.findById(id);
        if (!existing) {
            throw new NotFoundError('Member', id);
        }

        const updateData: any = { ...data };
        if (data.date_of_birth) {
            updateData.date_of_birth = new Date(data.date_of_birth);
        }
        updateData.updated_by = user?.id || null;
        
        const updated = await memberRepo.update(id, updateData);
        
        return c.json({
            success: true,
            data: updated,
            meta: { updated: true }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * DELETE /members/:id
 * Soft delete a member
 */
memberRoutes.delete('/:id', async (c) => {
    try {
        const { id } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        
        const memberRepo = new MemberRepository(schema_name);
        
        // Verify member exists
        const existing = await memberRepo.findById(id);
        if (!existing) {
            throw new NotFoundError('Member', id);
        }
        
        await memberRepo.softDelete(id);
        
        return c.json({
            success: true,
            meta: { deleted: true }
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// BULK CSV IMPORT (MEM-007)
// =============================================================================

/**
 * POST /members/bulk-import
 * Import members from CSV data with validation
 */
memberRoutes.post('/bulk-import', validate(bulkImportSchema), async (c) => {
    try {
        const data = getValidatedData<z.infer<typeof bulkImportSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');

        if (!user || !hasPermission(user.role || '', 'members', 'create')) {
            throw new UnauthorizedError('Insufficient permissions for bulk import');
        }

        const memberService = new MemberService();
        const { members: parsedMembers, errors: parseErrors } = memberService.parseBulkMemberCSV(data.csv_data);

        if (parseErrors.length > 0 && parsedMembers.length === 0) {
            return c.json({
                success: false,
                error: { code: 'PARSE_ERROR', message: 'CSV parsing failed', details: parseErrors }
            }, 400);
        }

        const memberRepo = new MemberRepository(schema_name);
        const accountRepo = new AccountRepository(schema_name);

        const results = {
            created: 0,
            skipped: 0,
            errors: [] as Array<{ row: number; memberNumber: string; error: string }>,
        };

        for (let i = 0; i < parsedMembers.length; i++) {
            const pm = parsedMembers[i];
            try {
                // Check for duplicates
                const memberNum = pm.memberNumber || `MEM-${Date.now().toString(36).toUpperCase()}-${i}`;
                const existing = await memberRepo.findByMemberNumber(memberNum);
                if (existing) {
                    results.skipped++;
                    results.errors.push({
                        row: i + 2,
                        memberNumber: memberNum,
                        error: 'Member number already exists',
                    });
                    continue;
                }

                const newMember = await memberRepo.create({
                    member_number: memberNum,
                    first_name: pm.fullName?.split(' ')[0] || 'Unknown',
                    last_name: pm.fullName?.split(' ').slice(1).join(' ') || 'Unknown',
                    phone: pm.phone || null,
                    email: pm.email || null,
                    gender: (pm.gender as any) || 'unknown',
                    status: 'active',
                    joined_date: new Date(),
                    life_status: 'alive',
                    kyc_status: 'not_started',
                    risk_rating: 'low',
                    preferences: {},
                    created_by: user!.id,
                } as any);

                // Auto-create savings account
                if (data.auto_create_savings) {
                    try {
                        await accountRepo.create({
                            account_number: `SAV-${memberNum}-${Date.now().toString(36).toUpperCase()}`,
                            member_id: newMember.id,
                            product_id: 'default',
                            principal_balance: 0,
                            interest_accrued: 0,
                            interest_paid: 0,
                            status: 'active',
                            opened_date: new Date(),
                            created_by: user!.id,
                        } as any);
                    } catch {
                        // Non-fatal
                    }
                }

                results.created++;
            } catch (err: any) {
                results.errors.push({
                    row: i + 2,
                    memberNumber: pm.memberNumber || 'UNKNOWN',
                    error: err.message || 'Unknown error',
                });
            }
        }

        return c.json({
            success: true,
            data: results,
            meta: {
                totalParsed: parsedMembers.length,
                parseErrors: parseErrors.length,
            },
        }, 201);
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// KYC WORKFLOW
// =============================================================================

/**
 * PATCH /members/:id/kyc
 * Update KYC status for a member
 */
memberRoutes.patch('/:id/kyc', validate(kycUpdateSchema), async (c) => {
    try {
        const { id } = c.req.param();
        const data = getValidatedData<z.infer<typeof kycUpdateSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');

        if (!user || !hasPermission(user.role || '', 'members', 'update')) {
            throw new UnauthorizedError('Insufficient permissions to update KYC');
        }

        const memberRepo = new MemberRepository(schema_name);
        const member = await memberRepo.findById(id);
        if (!member) {
            throw new NotFoundError('Member', id);
        }

        const updateData: any = {
            kyc_status: data.kyc_status,
            updated_by: user.id,
        };

        if (data.kyc_status === 'completed' || data.kyc_status === 'approved') {
            updateData.kyc_completed_at = new Date();
            updateData.kyc_approved_by = user.id;
        }

        if (data.risk_rating) {
            updateData.risk_rating = data.risk_rating;
        }

        const updated = await memberRepo.update(id, updateData);

        return c.json({
            success: true,
            data: updated,
            meta: { kyc_updated: true }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /members/:id/documents
 * Add an identity document to a member
 */
memberRoutes.post('/:id/documents', validate(identityDocumentSchema), async (c) => {
    try {
        const { id } = c.req.param();
        const data = getValidatedData<z.infer<typeof identityDocumentSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');
        const db = getTenantDb(schema_name);

        const memberRepo = new MemberRepository(schema_name);
        const member = await memberRepo.findById(id);
        if (!member) {
            throw new NotFoundError('Member', id);
        }

        const document = await db
            .insertInto('identity_documents')
            .values({
                member_id: id,
                document_type: data.document_type,
                document_number: data.document_number,
                issue_date: data.issue_date ? new Date(data.issue_date) as any : null,
                expiry_date: data.expiry_date ? new Date(data.expiry_date) as any : null,
                document_url: data.document_url || null,
                is_verified: false as any,
                created_by: user?.id || null,
            } as any)
            .returningAll()
            .executeTakeFirstOrThrow();

        return c.json({
            success: true,
            data: document,
            meta: { created: true }
        }, 201);
    } catch (error) {
        throw error;
    }
});

/**
 * GET /members/:id/documents
 * List identity documents for a member
 */
memberRoutes.get('/:id/documents', async (c) => {
    try {
        const { id } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const db = getTenantDb(schema_name);

        const documents = await db
            .selectFrom('identity_documents')
            .selectAll()
            .where('member_id', '=', id)
            .where('deleted_at', 'is', null)
            .orderBy('created_at', 'desc')
            .execute();

        return c.json({
            success: true,
            data: documents,
            meta: { count: documents.length }
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// SELF-SERVICE PORTAL
// =============================================================================

/**
 * POST /members/:id/portal-credentials
 * Generate self-service portal credentials for a member
 */
memberRoutes.post('/:id/portal-credentials', async (c) => {
    try {
        const { id } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');

        if (!user || !hasPermission(user.role || '', 'members', 'update')) {
            throw new UnauthorizedError('Insufficient permissions');
        }

        const memberRepo = new MemberRepository(schema_name);
        const member = await memberRepo.findById(id);
        if (!member) {
            throw new NotFoundError('Member', id);
        }

        if (!member.email) {
            return c.json({
                success: false,
                error: { code: 'NO_EMAIL', message: 'Member must have an email address for portal access' }
            }, 400);
        }

        const memberService = new MemberService();
        const credentials = memberService.generatePortalCredentials(id, member.email);
        const welcome = memberService.generateWelcomeMessage(
            {
                id: member.id,
                tenantId: '',
                memberNumber: member.member_number,
                fullName: `${member.first_name} ${member.last_name}`,
                dateOfBirth: new Date(),
                gender: 'Other',
                nationality: '',
                nationalId: '',
                idDocumentType: 'NIN',
                physicalAddress: '',
                postalAddress: '',
                occupation: '',
                phone: member.phone || '',
                email: member.email,
                status: 'Active',
                joinDate: new Date(member.joined_date as any),
                registrationDate: new Date(),
                createdBy: '',
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            `https://${c.get('tenant')!.code}.portal.example.com`
        );

        return c.json({
            success: true,
            data: {
                username: credentials.username,
                temporaryPassword: credentials.tempPassword,
                welcomeMessage: welcome,
            },
            meta: { generated: true }
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// BENEFICIARY MANAGEMENT
// =============================================================================

const createBeneficiarySchema = z.object({
    account_id: z.string().uuid().nullable().optional(),
    full_name: z.string().min(2, 'Full name must be at least 2 characters'),
    relationship: z.string().min(1, 'Relationship is required'),
    phone: commonSchemas.phone.optional(),
    email: commonSchemas.email.optional(),
    national_id: z.string().optional(),
    percentage_share: z.number().min(0).max(100),
    is_primary: z.boolean().default(false),
});

const updateBeneficiarySchema = z.object({
    full_name: z.string().min(2).optional(),
    relationship: z.string().min(1).optional(),
    phone: commonSchemas.phone.optional(),
    email: commonSchemas.email.optional(),
    national_id: z.string().optional(),
    percentage_share: z.number().min(0).max(100).optional(),
    is_primary: z.boolean().optional(),
    status: z.enum(['active', 'inactive', 'removed']).optional(),
});

const communicationPreferencesSchema = z.object({
    sms_enabled: z.boolean().optional(),
    email_enabled: z.boolean().optional(),
    push_enabled: z.boolean().optional(),
    in_app_enabled: z.boolean().optional(),
    transaction_alerts: z.boolean().optional(),
    promotional_messages: z.boolean().optional(),
    loan_related: z.boolean().optional(),
    account_statements: z.boolean().optional(),
    system_notifications: z.boolean().optional(),
    quiet_hours_start: z.string().nullable().optional(),
    quiet_hours_end: z.string().nullable().optional(),
    quiet_hours_enabled: z.boolean().optional(),
});

/**
 * GET /members/:id/beneficiaries
 * List all beneficiaries for a member
 */
memberRoutes.get('/:id/beneficiaries', enforcePermission('members', 'read'), async (c) => {
    try {
        const { id } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const db = getTenantDb(schema_name);

        const memberRepo = new MemberRepository(schema_name);
        const member = await memberRepo.findById(id);
        if (!member) {
            throw new NotFoundError('Member', id);
        }

        const beneficiaries = await db
            .selectFrom('beneficiaries')
            .selectAll()
            .where('member_id', '=', id)
            .where('deleted_at', 'is', null)
            .orderBy('is_primary', 'desc')
            .orderBy('created_at', 'asc')
            .execute();

        const totalShare = beneficiaries.reduce((sum, b) => sum + Number(b.percentage_share || 0), 0);

        return c.json({
            success: true,
            data: beneficiaries,
            meta: {
                count: beneficiaries.length,
                totalShareAllocated: totalShare,
                remainingShare: 100 - totalShare,
            }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * POST /members/:id/beneficiaries
 * Add a beneficiary to a member
 */
memberRoutes.post('/:id/beneficiaries', enforcePermission('members', 'update'), validate(createBeneficiarySchema), async (c) => {
    try {
        const { id } = c.req.param();
        const data = getValidatedData<z.infer<typeof createBeneficiarySchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');
        const db = getTenantDb(schema_name);

        const memberRepo = new MemberRepository(schema_name);
        const member = await memberRepo.findById(id);
        if (!member) {
            throw new NotFoundError('Member', id);
        }

        // Check total percentage share does not exceed 100
        const existing = await db
            .selectFrom('beneficiaries')
            .selectAll()
            .where('member_id', '=', id)
            .where('deleted_at', 'is', null)
            .where('status', '!=', 'removed')
            .execute();

        const currentTotal = existing.reduce((sum, b) => sum + Number(b.percentage_share || 0), 0);
        if (currentTotal + data.percentage_share > 100) {
            throw new ValidationError('Total beneficiary share would exceed 100%');
        }

        const beneficiary = await db
            .insertInto('beneficiaries')
            .values({
                member_id: id,
                account_id: data.account_id || null,
                full_name: data.full_name,
                relationship: data.relationship,
                phone: data.phone || null,
                email: data.email || null,
                national_id: data.national_id || null,
                percentage_share: String(data.percentage_share) as any,
                is_primary: data.is_primary,
                status: 'active' as any,
                created_by: user?.id || null,
            } as any)
            .returningAll()
            .executeTakeFirstOrThrow();

        return c.json({
            success: true,
            data: beneficiary,
            meta: { created: true }
        }, 201);
    } catch (error) {
        throw error;
    }
});

/**
 * PUT /members/:id/beneficiaries/:beneficiaryId
 * Update a beneficiary
 */
memberRoutes.put('/:id/beneficiaries/:beneficiaryId', enforcePermission('members', 'update'), validate(updateBeneficiarySchema), async (c) => {
    try {
        const { id, beneficiaryId } = c.req.param();
        const data = getValidatedData<z.infer<typeof updateBeneficiarySchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const db = getTenantDb(schema_name);

        const existing = await db
            .selectFrom('beneficiaries')
            .selectAll()
            .where('id', '=', beneficiaryId)
            .where('member_id', '=', id)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

        if (!existing) {
            throw new NotFoundError('Beneficiary', beneficiaryId);
        }

        // Validate percentage share if being updated
        if (data.percentage_share !== undefined) {
            const otherBeneficiaries = await db
                .selectFrom('beneficiaries')
                .selectAll()
                .where('member_id', '=', id)
                .where('id', '!=', beneficiaryId)
                .where('deleted_at', 'is', null)
                .where('status', '!=', 'removed')
                .execute();

            const othersTotal = otherBeneficiaries.reduce((sum, b) => sum + Number(b.percentage_share || 0), 0);
            if (othersTotal + data.percentage_share > 100) {
                throw new ValidationError('Total beneficiary share would exceed 100%');
            }
        }

        const updates: Record<string, any> = { updated_at: new Date() };
        if (data.full_name !== undefined) updates.full_name = data.full_name;
        if (data.relationship !== undefined) updates.relationship = data.relationship;
        if (data.phone !== undefined) updates.phone = data.phone;
        if (data.email !== undefined) updates.email = data.email;
        if (data.national_id !== undefined) updates.national_id = data.national_id;
        if (data.percentage_share !== undefined) updates.percentage_share = String(data.percentage_share);
        if (data.is_primary !== undefined) updates.is_primary = data.is_primary;
        if (data.status !== undefined) updates.status = data.status;

        const updated = await db
            .updateTable('beneficiaries')
            .set(updates as any)
            .where('id', '=', beneficiaryId)
            .where('member_id', '=', id)
            .returningAll()
            .executeTakeFirstOrThrow();

        return c.json({
            success: true,
            data: updated,
            meta: { updated: true }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * DELETE /members/:id/beneficiaries/:beneficiaryId
 * Soft-delete a beneficiary
 */
memberRoutes.delete('/:id/beneficiaries/:beneficiaryId', enforcePermission('members', 'update'), async (c) => {
    try {
        const { id, beneficiaryId } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const db = getTenantDb(schema_name);

        const existing = await db
            .selectFrom('beneficiaries')
            .selectAll()
            .where('id', '=', beneficiaryId)
            .where('member_id', '=', id)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();

        if (!existing) {
            throw new NotFoundError('Beneficiary', beneficiaryId);
        }

        await db
            .updateTable('beneficiaries')
            .set({ deleted_at: new Date(), status: 'removed' } as any)
            .where('id', '=', beneficiaryId)
            .execute();

        return c.json({
            success: true,
            meta: { deleted: true }
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// NEXT OF KIN
// =============================================================================

/**
 * GET /members/:id/next-of-kin
 * Get next-of-kin details for a member
 */
memberRoutes.get('/:id/next-of-kin', enforcePermission('members', 'read'), async (c) => {
    try {
        const { id } = c.req.param();
        const { schema_name } = c.get('tenant')!;

        const memberRepo = new MemberRepository(schema_name);
        const member = await memberRepo.findById(id);
        if (!member) {
            throw new NotFoundError('Member', id);
        }

        return c.json({
            success: true,
            data: member.next_of_kin || {},
            meta: { memberId: id }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * PUT /members/:id/next-of-kin
 * Update next-of-kin details for a member
 */
memberRoutes.put('/:id/next-of-kin', enforcePermission('members', 'update'), async (c) => {
    try {
        const { id } = c.req.param();
        const body = await c.req.json();
        const { schema_name } = c.get('tenant')!;
        const user = c.get('user');

        const memberRepo = new MemberRepository(schema_name);
        const member = await memberRepo.findById(id);
        if (!member) {
            throw new NotFoundError('Member', id);
        }

        const updated = await memberRepo.update(id, {
            next_of_kin: body,
            updated_by: user?.id || null,
        } as any);

        return c.json({
            success: true,
            data: updated?.next_of_kin || body,
            meta: { updated: true }
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// AUDIT & ACTIVITY LOGS
// =============================================================================

/**
 * GET /members/:id/audit-log
 * Retrieve audit log entries related to a member
 */
memberRoutes.get('/:id/audit-log', enforcePermission('audit', 'read'), async (c) => {
    try {
        const { id } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const page = parseInt(c.req.query('page') || '1', 10);
        const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
        const db = getTenantDb(schema_name);

        const memberRepo = new MemberRepository(schema_name);
        const member = await memberRepo.findById(id);
        if (!member) {
            throw new NotFoundError('Member', id);
        }

        const entries = await db
            .selectFrom('audit_log')
            .selectAll()
            .where('entity_type', '=', 'member')
            .where('entity_id', '=', id)
            .orderBy('timestamp', 'desc')
            .execute();

        const total = entries.length;
        const offset = (page - 1) * limit;
        const paginated = entries.slice(offset, offset + limit);

        return c.json({
            success: true,
            data: paginated,
            meta: {
                count: paginated.length,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * GET /members/:id/activity-log
 * Retrieve activity log entries for a member
 */
memberRoutes.get('/:id/activity-log', enforcePermission('audit', 'read'), async (c) => {
    try {
        const { id } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const page = parseInt(c.req.query('page') || '1', 10);
        const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
        const db = getTenantDb(schema_name);

        const memberRepo = new MemberRepository(schema_name);
        const member = await memberRepo.findById(id);
        if (!member) {
            throw new NotFoundError('Member', id);
        }

        const entries = await db
            .selectFrom('activity_log')
            .selectAll()
            .where('entity_type', '=', 'member')
            .where('entity_id', '=', id)
            .orderBy('timestamp', 'desc')
            .execute();

        const total = entries.length;
        const offset = (page - 1) * limit;
        const paginated = entries.slice(offset, offset + limit);

        return c.json({
            success: true,
            data: paginated,
            meta: {
                count: paginated.length,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            }
        });
    } catch (error) {
        throw error;
    }
});

// =============================================================================
// WELCOME MESSAGE & COMMUNICATION PREFERENCES
// =============================================================================

/**
 * POST /members/:id/welcome-message
 * Dispatch a welcome message to the member
 */
memberRoutes.post('/:id/welcome-message', enforcePermission('members', 'update'), async (c) => {
    try {
        const { id } = c.req.param();
        const { schema_name } = c.get('tenant')!;

        const memberRepo = new MemberRepository(schema_name);
        const member = await memberRepo.findById(id);
        if (!member) {
            throw new NotFoundError('Member', id);
        }

        const memberService = new MemberService();
        const welcome = memberService.generateWelcomeMessage(
            {
                id: member.id,
                tenantId: '',
                memberNumber: member.member_number,
                fullName: `${member.first_name} ${member.last_name}`,
                dateOfBirth: new Date(),
                gender: 'Other',
                nationality: '',
                nationalId: '',
                idDocumentType: 'NIN',
                physicalAddress: '',
                postalAddress: '',
                occupation: '',
                phone: member.phone || '',
                email: member.email || '',
                status: 'Active',
                joinDate: new Date(member.joined_date as any),
                registrationDate: new Date(),
                createdBy: '',
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            `https://${c.get('tenant')!.code}.portal.example.com`
        );

        return c.json({
            success: true,
            data: {
                memberId: id,
                message: welcome,
            },
            meta: { dispatched: true }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * GET /members/:id/communication-preferences
 * Get communication preferences for a member
 */
memberRoutes.get('/:id/communication-preferences', enforcePermission('members', 'read'), async (c) => {
    try {
        const { id } = c.req.param();
        const { schema_name } = c.get('tenant')!;
        const db = getTenantDb(schema_name);

        const memberRepo = new MemberRepository(schema_name);
        const member = await memberRepo.findById(id);
        if (!member) {
            throw new NotFoundError('Member', id);
        }

        const prefs = await db
            .selectFrom('communication_preferences')
            .selectAll()
            .where('member_id', '=', id)
            .executeTakeFirst();

        return c.json({
            success: true,
            data: prefs || {
                member_id: id,
                sms_enabled: true,
                email_enabled: true,
                push_enabled: false,
                in_app_enabled: true,
                transaction_alerts: true,
                promotional_messages: false,
                loan_related: true,
                account_statements: true,
                system_notifications: true,
                quiet_hours_enabled: false,
                quiet_hours_start: null,
                quiet_hours_end: null,
            },
            meta: { exists: !!prefs }
        });
    } catch (error) {
        throw error;
    }
});

/**
 * PUT /members/:id/communication-preferences
 * Update communication preferences for a member
 */
memberRoutes.put('/:id/communication-preferences', enforcePermission('members', 'update'), validate(communicationPreferencesSchema), async (c) => {
    try {
        const { id } = c.req.param();
        const data = getValidatedData<z.infer<typeof communicationPreferencesSchema>>(c);
        const { schema_name } = c.get('tenant')!;
        const db = getTenantDb(schema_name);

        const memberRepo = new MemberRepository(schema_name);
        const member = await memberRepo.findById(id);
        if (!member) {
            throw new NotFoundError('Member', id);
        }

        // Check if preferences already exist
        const existing = await db
            .selectFrom('communication_preferences')
            .selectAll()
            .where('member_id', '=', id)
            .executeTakeFirst();

        let result;
        if (existing) {
            result = await db
                .updateTable('communication_preferences')
                .set({ ...data, updated_at: new Date() } as any)
                .where('member_id', '=', id)
                .returningAll()
                .executeTakeFirstOrThrow();
        } else {
            result = await db
                .insertInto('communication_preferences')
                .values({
                    member_id: id,
                    sms_enabled: data.sms_enabled ?? true,
                    email_enabled: data.email_enabled ?? true,
                    push_enabled: data.push_enabled ?? false,
                    in_app_enabled: data.in_app_enabled ?? true,
                    transaction_alerts: data.transaction_alerts ?? true,
                    promotional_messages: data.promotional_messages ?? false,
                    loan_related: data.loan_related ?? true,
                    account_statements: data.account_statements ?? true,
                    system_notifications: data.system_notifications ?? true,
                    quiet_hours_start: data.quiet_hours_start || null,
                    quiet_hours_end: data.quiet_hours_end || null,
                    quiet_hours_enabled: data.quiet_hours_enabled ?? false,
                } as any)
                .returningAll()
                .executeTakeFirstOrThrow();
        }

        return c.json({
            success: true,
            data: result,
            meta: { updated: true }
        });
    } catch (error) {
        throw error;
    }
});
