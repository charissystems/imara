// src/index.ts
import { 
    createApp, errorHandler, logger, 
    tenantResolver, schemaContext, corsMiddleware, 
    authMiddleware, requestContext, auditMiddleware,
} from './middleware';
import { dbManager } from './config/database';
import superAdminRoutes from './routes/superAdmin'; // Platform Admin
import tenantAdminRoutes from './routes/admin';      // Tenant Admin
import { memberRoutes } from './routes/members';
import { authRoutes } from './routes/auth';
import { accountRoutes } from './routes/accounts';   // Savings accounts & transactions
import { loanRoutes } from './routes/loans';         // Loan management
import { reportRoutes } from './routes/reports';     // Reports & Dashboard
import { shareRoutes } from './routes/shares';       // Share classes, holdings, dividends
import { fixedDepositRoutes } from './routes/fixedDeposits'; // Fixed deposit products & accounts
import { accountingRoutes } from './routes/accounting';    // Chart of accounts, journals, statements

const app = createApp();

// Global Middleware
app.onError(errorHandler);
app.use('*', logger);
app.use('*', requestContext);

if (process.env.ENABLE_CORS === 'true') {
    app.use('*', corsMiddleware);
}

// Health Check (no tenant required)
app.get('/health', async (c) => {
    const isHealthy = await dbManager.healthCheck();
    return c.json({ status: isHealthy ? 'ok' : 'unhealthy' });
});

// ============================================================================
// 1. PLATFORM ADMIN (Super Admin)
// ============================================================================
// Accessible via: https://api.mysaas.com/super-admin/tenants
// Does NOT use tenantResolver. Connects to 'public' schema.
app.route('/super-admin', superAdminRoutes);

// ============================================================================
// 2. TENANT MIDDLEWARE
// ============================================================================
// Everything below this line requires a valid Tenant Subdomain (e.g., sacco1.mysaas.com)
// Or a tenant path in development (e.g., /sacco1/admin)
app.use('*', tenantResolver);
app.use('*', schemaContext);
app.use('*', auditMiddleware);
app.use('*', authMiddleware);

// Now 'c.get("db")' is connected to the specific tenant schema (e.g., tenant_sacco_1)
// And 'c.get("auditLogger")' is ready for logging operations

// ============================================================================
// 3. AUTHENTICATION ROUTES
// ============================================================================
// Accessible via: https://sacco1.mysaas.com/auth/login
app.route('/auth', authRoutes);

// ============================================================================
// 4. TENANT ADMIN (SACCO Internal Admin)
// ============================================================================
// Accessible via: https://sacco1.mysaas.com/admin/staff
// Connects to 'tenant_sacco_1' schema.
app.route('/admin', tenantAdminRoutes);

// ============================================================================
// 5. MEMBER MANAGEMENT
// ============================================================================
// Member registration, profiles, KYC
app.route('/members', memberRoutes);

// ============================================================================
// 6. SAVINGS & ACCOUNTS
// ============================================================================
// Savings accounts, deposits, withdrawals, transfers, interest calculations
app.route('/accounts', accountRoutes);

// ============================================================================
// 7. SHARES
// ============================================================================
// Share classes, holdings, purchase, transfer, dividends
app.route('/shares', shareRoutes);

// ============================================================================
// 8. FIXED DEPOSITS
// ============================================================================
// FD products, opening, certificates, maturity, premature withdrawal
app.route('/fixed-deposits', fixedDepositRoutes);

// ============================================================================
// 9. LOAN MANAGEMENT
// ============================================================================
// Loan products, applications, approvals, repayments, early settlements
app.route('/loans', loanRoutes);

// ============================================================================
// 10. REPORTS & DASHBOARD
// ============================================================================
// Financial statements, operational reports, dashboard KPIs, exports
app.route('/reports', reportRoutes);

// ============================================================================
// 11. ACCOUNTING
// ============================================================================
// Chart of accounts, journal entries, financial periods, year-end closing
app.route('/accounting', accountingRoutes);

// 404 Handler
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

export default app;