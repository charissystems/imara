// src/middleware/context.ts
import { Context, Next } from 'hono';
import { nanoid } from 'nanoid';
import { Env } from './types';
import { dbManager } from '../config/database';
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
 * Creates and attaches tenant-specific database connection to context
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

    try {
        // Create tenant-specific database connection
        const tenantDb = dbManager.getTenantDb(tenant.schema_name);
        
        // Attach to context
        c.set('db', tenantDb);
        
        appLogger.debug('Schema context attached', {
            schema: tenant.schema_name,
            tenantId: tenant.id,
        });

        await next();
    } catch (error) {
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
    }
}