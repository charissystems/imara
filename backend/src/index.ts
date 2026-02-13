// src/index.ts
import { 
    createApp, errorHandler, logger, 
    tenantResolver, schemaContext, corsMiddleware, 
    authMiddleware, requestContext,
} from './middleware';
import { dbManager } from './config/database';
import superAdminRoutes from './routes/superAdmin'; // Platform Admin
import tenantAdminRoutes from './routes/admin';      // Tenant Admin
import { memberRoutes } from './routes/members';
import { authRoutes } from './routes/auth';

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
app.use('*', authMiddleware);

// Now 'c.get("db")' is connected to the specific tenant schema (e.g., tenant_sacco_1)

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

// Other Tenant Routes
app.route('/members', memberRoutes);

// 404 Handler
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

export default app;