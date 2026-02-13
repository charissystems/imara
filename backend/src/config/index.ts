import { Hono } from 'hono';
import { createApp } from './middleware/types';
import { logger, tenantResolver, schemaContext, errorHandler } from './middleware';
import { dbManager } from './config/database';
import { adminRoutes } from './routes/admin';
import { memberRoutes } from './routes/members';

// Create the app with our Types
const app = createApp();

// 1. Global Error Handler (Must be first)
app.onError(errorHandler);

// 2. Global Logger
app.use('*', logger);

// 3. PUBLIC ROUTES (No Tenant Required)
// These run BEFORE tenantResolver
app.get('/health', async (c) => {
    const isHealthy = await dbManager.healthCheck();
    return c.json({ status: isHealthy ? 'ok' : 'unhealthy' });
});

// 4. TENANT STACK (Tenant Required)
// All routes defined after these middlewares require a valid tenant.
app.use('*', tenantResolver);
app.use('*', schemaContext);

// 5. Routes
app.route('/admin', adminRoutes);
app.route('/members', memberRoutes);

// Fallback
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

export default app;
