// src/middleware/types.ts
import { Hono, Context } from 'hono';
import { Kysely } from 'kysely';
import { TenantDatabase, Tenant } from '../database/types';

/**
 * Context variables available across all routes
 */
export type Variables = {
    // Tenant information
    tenant?: Tenant;
    
    // Tenant-specific database connection
    db?: Kysely<TenantDatabase>;
    
    // Request tracking
    requestId: string;
    requestStartTime: number;
    
    // Validated data from validation middleware
    validatedData?: any;
    
    // Current user (when auth is implemented)
    currentUser?: {
        id: string;
        email: string;
        staffNumber: string;
        role?: string;
        memberId?: string;
        staffId?: string;
    };
};

/**
 * Environment bindings (for workers, etc.)
 */
export type Bindings = {
    // Add environment-specific bindings here
    // Example: DATABASE_URL: string;
};

/**
 * Complete environment type
 */
export type Env = {
    Variables: Variables;
    Bindings: Bindings;
};

/**
 * Factory function to create typed Hono app
 */
export const createApp = () => new Hono<Env>();

/**
 * Type-safe context helper
 * Use this to infer the Context type in your route handlers
 */
export type AppContext = Context<Env>;