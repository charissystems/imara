/**
 * Route Utilities
 *
 * Centralises repetitive patterns found in every route handler:
 *  - Tenant context extraction
 *  - Pagination parsing
 *  - Pagination meta construction
 *  - Typed success/error response helpers
 */

import { Context } from 'hono';
import { Env } from '../middleware/types';
import { getTenantDb } from '../config/database';

// ─────────────────────────────────────────────────────────────────────────────
// Tenant context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the tenant schema name and a Kysely DB handle from the Hono context.
 * Replaces the two-liner that appeared ~100 times across all route files:
 *
 *   const { schema_name } = c.get('tenant')!;
 *   const db = getTenantDb(schema_name);
 */
export function getTenantContext(c: Context<Env>) {
    const tenant = c.get('tenant')!;
    const schema_name = tenant.schema_name;
    const db = getTenantDb(schema_name);
    return { schema_name, db, tenant };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────────────────────────────────────

export interface PaginationOptions {
    /** Default page number (default: 1) */
    defaultPage?: number;
    /** Default page size (default: 50) */
    defaultLimit?: number;
    /** Hard cap on page size (default: 200) */
    maxLimit?: number;
}

export interface ParsedPagination {
    page: number;
    limit: number;
    offset: number;
}

/**
 * Parse `page` and `limit` query parameters into a consistent pagination object.
 * Applies sensible defaults, enforces a maximum page size, and computes `offset`.
 */
export function parsePagination(
    c: Context<Env>,
    opts: PaginationOptions = {},
): ParsedPagination {
    const { defaultPage = 1, defaultLimit = 50, maxLimit = 200 } = opts;
    const page  = Math.max(parseInt(c.req.query('page')  || String(defaultPage),  10), 1);
    const limit = Math.min(parseInt(c.req.query('limit') || String(defaultLimit), 10), maxLimit);
    return { page, limit, offset: (page - 1) * limit };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagination meta
// ─────────────────────────────────────────────────────────────────────────────

export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    count: number;
}

/**
 * Build a stable pagination meta object for list responses.
 * Guarantees camelCase field names and consistent shape across all endpoints.
 */
export function buildPaginationMeta(
    page: number,
    limit: number,
    total: number,
    count: number,
): PaginationMeta {
    return {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        count,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Response helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a standard success payload.
 *
 * Usage:
 *   return c.json(ok(data));
 *   return c.json(ok(data, { count: data.length }));
 */
export function ok<T>(
    data: T,
    meta?: Record<string, unknown>,
): { success: true; data: T; meta?: Record<string, unknown> } {
    return meta !== undefined
        ? { success: true, data, meta }
        : { success: true, data };
}

/**
 * Build a 201-created success payload.
 *
 * Usage:
 *   return c.json(created(record), 201);
 */
export function created<T>(
    data: T,
): { success: true; data: T; meta: { created: true } } {
    return { success: true, data, meta: { created: true } };
}

/**
 * Build an updated success payload.
 *
 * Usage:
 *   return c.json(updated(record));
 */
export function updated<T>(
    data: T,
): { success: true; data: T; meta: { updated: true } } {
    return { success: true, data, meta: { updated: true } };
}
