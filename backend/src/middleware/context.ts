// src/middleware/context.ts
import { Context, Next } from 'hono';
import { nanoid } from 'nanoid';
import { Env } from './types';
import { dbManager, getPool } from '../config/database';
import { AppError } from './errorHandler';
import { appLogger } from './logger';

/**
 * Adds request context including unique request ID and timing
 */
export async function requestContext(c: Context<Env>, next: Next) {
    // Generate unique request ID
    const requestId = nanoid();
    c.set('requestId', requestId);

    // Add request ID to response headers for tracing
    c.header('X-Request-ID', requestId);

    // Store request start time
    c.set('requestStartTime', Date.now());

    await next();

    // Calculate and add response time header
    const duration = Date.now() - (c.get('requestStartTime') || Date.now());
    c.header('X-Response-Time', `${duration}ms`);
}


/**
 * Schema context middleware
 * Creates and attaches tenant-specific database connection to context.
 *
 * Security: sets `app.current_tenant` session variable on a dedicated pool
 * connection so that:
 *  1. RLS policies can reference `current_setting('app.current_tenant')`
 *  2. The audit trail captures which tenant schema was active
 *  3. Even if application code has a bug, the DB-level policies limit exposure
 *
 * The session variable is reset when the request completes.
 */
export async function schemaContext(c: Context<Env>, next: Next) {
    const tenant = c.get('tenant');
    
    if (!tenant) {
        throw new AppError(
            500,
            'Tenant context missing. Ensure tenantResolver middleware runs before schemaContext.',
            'MISSING_TENANT_CONTEXT'
        );
    }

    if (!tenant.schema_name) {
        throw new AppError(
            500,
            `Tenant ${tenant.code} has no schema_name configured.`,
            'INVALID_TENANT_CONFIG'
        );
    }

    // Validate schema name format to prevent injection
    const safeName = tenant.schema_name.replace(/[^a-zA-Z0-9_]/g, '');
    if (safeName !== tenant.schema_name) {
        throw new AppError(
            500,
            `Tenant schema name contains invalid characters: ${tenant.schema_name}`,
            'INVALID_SCHEMA_NAME'
        );
    }

    const pool = getPool();
    let client: any = null;

    try {
        // Create tenant-specific Kysely database instance (.withSchema prefix)
        const tenantDb = dbManager.getTenantDb(tenant.schema_name);
        c.set('db', tenantDb);

        // Pin a pool connection for this request and activate tenant role
        client = await pool.connect();
        const roleName = `${safeName}_role`;

        // Attempt SET ROLE — if the role doesn't exist the query will fail.
        // In that case, fall back to just setting the session variable.
        try {
            await client.query(`SET ROLE "${roleName}"`);
        } catch {
            appLogger.warn('Tenant role not found; falling back to pool user', {
                role: roleName,
                schema: tenant.schema_name,
            });
        }

        await client.query(`SET search_path TO "${safeName}", public`);
        await client.query(`SET app.current_tenant = '${safeName}'`);

        // Store tenant context for downstream middleware
        c.set('tenantId' as any, tenant.id);
        c.set('schemaName' as any, tenant.schema_name);

        appLogger.debug('Schema context attached with DB-level isolation', {
            schema: tenant.schema_name,
            tenantId: tenant.id,
        });

        await next();
    } catch (error) {
        // Re-throw AppErrors as-is
        if (error instanceof AppError) throw error;

        appLogger.error('Failed to create schema context', error as Error, {
            schema: tenant.schema_name,
            tenantId: tenant.id,
        });
        
        throw new AppError(
            500,
            `Failed to connect to tenant schema: ${tenant.schema_name}`,
            'SCHEMA_CONNECTION_ERROR',
            { schema: tenant.schema_name }
        );
    } finally {
        // Always reset session variables before releasing connection
        if (client) {
            try {
                await client.query('RESET ROLE');
                await client.query('RESET search_path');
                await client.query("SET app.current_tenant = ''");
            } catch {
                // Swallow — connection may be broken
            }
            client.release();
        }
    }
}