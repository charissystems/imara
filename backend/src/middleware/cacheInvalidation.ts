/**
 * Cache Invalidation Middleware
 *
 * Automatically invalidates relevant Redis cache domains after successful
 * write operations (POST, PUT, PATCH, DELETE).
 *
 * Route-to-domain mapping determines which cache domains are flushed
 * when a write operation completes on a given route prefix.
 * This avoids needing to add manual invalidation calls in every route handler.
 */

import { Context, Next } from 'hono';
import { Env } from './types';
import { CacheService, CacheDomain } from '../services/cacheService';
import { appLogger } from './logger';

// ────────────────────────────────────────────────────────────
// Route → Cache Domain Mapping
// ────────────────────────────────────────────────────────────

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Maps route path prefixes to the cache domains that should be invalidated
 * when a write operation succeeds on that route.
 */
const ROUTE_INVALIDATION_MAP: Array<{
    pathPrefix: string;
    domains: CacheDomain[];
}> = [
    // Savings account mutations invalidate reports + accounts + dashboard
    { pathPrefix: '/accounts', domains: ['accounts', 'reports', 'dashboard'] },
    // Loan mutations invalidate reports + loans + dashboard
    { pathPrefix: '/loans', domains: ['loans', 'reports', 'dashboard'] },
    // Member mutations invalidate members + dashboard
    { pathPrefix: '/members', domains: ['members', 'dashboard'] },
    // Share mutations invalidate shares + reports + dashboard
    { pathPrefix: '/shares', domains: ['shares', 'reports', 'dashboard'] },
    // Accounting mutations invalidate accounting + reports + dashboard
    { pathPrefix: '/accounting', domains: ['accounting', 'reports', 'dashboard'] },
    // Fixed deposit mutations invalidate accounts + reports + dashboard
    { pathPrefix: '/fixed-deposits', domains: ['accounts', 'reports', 'dashboard'] },
    // Admin tenant config changes invalidate config + tenant
    { pathPrefix: '/admin', domains: ['config', 'tenant'] },
];

/**
 * Middleware that invalidates cache domains after successful write operations.
 * Must be applied after tenant resolution (needs `c.get('tenant')`).
 */
export async function cacheInvalidation(c: Context<Env>, next: Next) {
    // Only intercept write methods
    if (!WRITE_METHODS.has(c.req.method)) {
        return next();
    }

    // Execute the route handler first
    await next();

    // Only invalidate on successful responses (2xx)
    const status = c.res.status;
    if (status < 200 || status >= 300) {
        return;
    }

    // Get tenant schema for cache scoping
    const tenant = c.get('tenant');
    if (!tenant?.schema_name) {
        return;
    }

    const path = new URL(c.req.url).pathname;
    const cache = new CacheService(tenant.schema_name);

    // Find matching route prefix and invalidate the mapped domains
    for (const mapping of ROUTE_INVALIDATION_MAP) {
        if (path.startsWith(mapping.pathPrefix)) {
            // Fire-and-forget — don't block the response
            Promise.all(
                mapping.domains.map((domain) => cache.invalidateDomain(domain)),
            ).catch((err) => {
                appLogger.warn('Cache invalidation error after write', {
                    path,
                    error: (err as Error).message,
                });
            });

            appLogger.debug('Cache invalidation triggered', {
                path,
                method: c.req.method,
                domains: mapping.domains,
                tenant: tenant.schema_name,
            });
            break;
        }
    }
}
