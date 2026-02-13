// src/middleware/tenantResolver.ts
import { Context, Next } from 'hono';
import { Env } from './types';
import { publicDb } from '../config/database';
import { NotFoundError, ForbiddenError } from './errorHandler';
import { appLogger } from './logger';
import { Tenant } from '../database/types';

/**
 * Cache for tenant lookups to reduce database queries
 */
const tenantCache = new Map<string, { tenant: Tenant; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get tenant from cache or database
 */
async function getTenantBySubdomain(subdomain: string): Promise<Tenant | undefined> {
    // Check cache first
    const cached = tenantCache.get(subdomain);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        appLogger.debug('Tenant cache hit', { subdomain });
        return cached.tenant;
    }

    // Fetch from database
    const tenant = await publicDb
        .selectFrom('tenants')
        .selectAll()
        .where('subdomain', '=', subdomain)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

    // Update cache if found
    if (tenant) {
        tenantCache.set(subdomain, {
            tenant,
            timestamp: Date.now(),
        });
    }

    return tenant;
}

/**
 * Extract subdomain from various sources
 * Priority: header > subdomain
 */
function extractSubdomain(c: Context): string | null {
    // 1. Check custom header (highest priority - for testing/development)
    const headerSubdomain = c.req.header('x-tenant-subdomain');
    if (headerSubdomain) {
        appLogger.debug('Subdomain from header', { subdomain: headerSubdomain });
        return headerSubdomain.toLowerCase().trim();
    }

    // 2. Extract from host header
    const hostHeader = c.req.header('host');
    if (!hostHeader) return null;

    // Normalize host (strip port)
    const host = hostHeader.split(':')[0].toLowerCase();

    // If running on localhost, support subdomain.localhost patterns
    if (host.includes('localhost')) {
        const parts = host.split('.');
        const sub = parts[0];
        if (!sub || sub === 'localhost') return null;
        appLogger.debug('Subdomain from localhost host', { host, subdomain: sub });
        return sub.toLowerCase().trim();
    }

    // If BASE_DOMAIN is set, extract subdomain relative to it
    const baseDomain = (process.env.BASE_DOMAIN || '').toLowerCase();
    if (baseDomain && host.endsWith(baseDomain)) {
        // Remove base domain suffix and trailing dot
        const prefix = host.slice(0, host.length - baseDomain.length).replace(/\.$/, '');
        if (!prefix) return null;
        const subdomain = prefix.split('.')[0]; // left-most label as subdomain
        const ignoredSubdomains = ['www', 'api', 'app'];
        if (ignoredSubdomains.includes(subdomain)) return null;
        appLogger.debug('Subdomain from BASE_DOMAIN host', { host, subdomain });
        return subdomain.toLowerCase().trim();
    }

    // Fallback: take left-most label
    const parts = host.split('.');
    if (parts.length < 2) return null; // need at least a domain + tld

    const subdomain = parts[0];
    const ignoredSubdomains = ['www', 'api', 'app'];
    if (ignoredSubdomains.includes(subdomain)) return null;

    appLogger.debug('Subdomain from host', { host, subdomain });
    return subdomain.toLowerCase().trim();
}

/**
 * Validate tenant is active and subscription is valid
 */
function validateTenant(tenant: Tenant) {
    // Check if tenant is active
    if (tenant.status !== 'active') {
        throw new ForbiddenError(
            `Tenant '${tenant.code}' is currently ${tenant.status}. Please contact support.`
        );
    }

    // Check subscription expiry (safely check if property exists)
    if ('subscription_expires_at' in tenant && tenant.subscription_expires_at) {
        const expiryDate = new Date(tenant.subscription_expires_at as string | Date);
        if (expiryDate < new Date()) {
            throw new ForbiddenError(
                `Tenant '${tenant.code}' subscription has expired. Please renew your subscription.`
            );
        }
    }

    return true;
}

/**
 * Tenant resolution middleware
 * Extracts tenant from subdomain or header and validates access
 */
export async function tenantResolver(c: Context<Env>, next: Next) {
    const subdomain = extractSubdomain(c);

    if (!subdomain) {
        throw new NotFoundError(
            'Tenant',
            'Unable to determine tenant from request. Please use a valid subdomain or set X-Tenant-Subdomain header.'
        );
    }

    // Fetch tenant
    const tenant = await getTenantBySubdomain(subdomain);

    if (!tenant) {
        appLogger.warn('Tenant not found', { subdomain });
        throw new NotFoundError('Tenant', subdomain);
    }

    // Validate tenant status and subscription
    validateTenant(tenant);

    // Store tenant in context
    c.set('tenant', tenant);
    
    appLogger.debug('Tenant resolved', {
        subdomain,
        tenantId: tenant.id,
        schema: tenant.schema_name,
    });

    await next();
}

/**
 * Clear tenant cache (useful for testing or after tenant updates)
 */
export function clearTenantCache(subdomain?: string) {
    if (subdomain) {
        tenantCache.delete(subdomain);
        appLogger.info('Tenant cache cleared', { subdomain });
    } else {
        tenantCache.clear();
        appLogger.info('All tenant cache cleared');
    }
}