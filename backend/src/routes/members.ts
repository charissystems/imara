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
import { hasPermission } from '../middleware/rbac';

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
