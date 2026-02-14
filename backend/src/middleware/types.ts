// src/middleware/types.ts
import { Hono, Context } from 'hono';
import { Kysely } from 'kysely';
import { TenantDatabase, Tenant } from '../database/types';
import { AuditLogger } from './audit';
import { Permission } from './rbac';

/**
 * Context variables available across all routes
 */
export type Variables = {
    // Tenant information
    tenant?: Tenant;
    tenantId?: string;     // Tenant UUID
    tenantCode?: string;   // Tenant code/subdomain
    schemaName?: string;   // Tenant schema name
    
    // Tenant-specific database connection
    db?: Kysely<TenantDatabase>;
    
    // Request tracking
    requestId: string;
    requestStartTime: number;
    
    // Validated data from validation middleware
    validatedData?: any;
    
    // Current user (when auth is implemented)
    user?: {
        id: string;
        email: string;
        staffNumber: string;
        role?: string;
        memberId?: string;
        staffId?: string;
        tenant_id?: string;
        deleted_at?: string | null;
    };
    
    // User permissions from RBAC
    userPermissions?: Permission[];
    subscriptionWarning?: {
        type: 'EXPIRING_SOON' | 'EXPIRED' | 'NONE';
        message: string;
        tenant_id?: string;
    };
    
    userLimitInfo?: {
        current_count: number;
        limit: number;
        percentage_used: number;
        tenant_id?: string;
    };
    
    memberLimitWarning?: {
        type: 'CRITICAL' | 'WARNING' | 'NONE';
        current_count: number;
        limit: number;
        tenant_id?: string;
    };
    
    // Audit logger for tracking changes
    auditLogger?: AuditLogger;
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