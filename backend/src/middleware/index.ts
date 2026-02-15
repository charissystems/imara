// src/middleware/index.ts

// Types
export type { Env, Variables, Bindings, AppContext } from './types';
export { createApp } from './types';

// Core Middleware
export { errorHandler, AppError, DatabaseError, ValidationError, NotFoundError, UnauthorizedError, ForbiddenError } from './errorHandler';
export { logger, appLogger } from './logger';
export { requestContext, schemaContext } from './context';
export { tenantResolver, clearTenantCache } from './tenantResolver';

// Authentication Middleware
export { authMiddleware, requireAuth, requireRole } from './auth';

// Role-Based Access Control
export { rbacMiddleware, enforcePermission, enforceAnyPermission, enforceAllPermissions, UserRole, RoleUtils } from './rbac';
export type { Permission } from './rbac';
export { auditMiddleware, AuditLogger } from './audit';
export type { AuditLog } from './audit';

// Tenant Isolation & Security Middleware
export { 
    tenantIsolationCheck, 
    crossTenantAccessCheck, 
    requireTenantFilter 
} from './tenantIsolation';

export { 
    validateSubscription, 
    validateUserLimit, 
    validateMemberLimit, 
    validateFeatureAccess,
    isFeatureAvailable,
    getAvailableFeatures 
} from './subscriptionValidation';

// Optional Middleware
export { corsMiddleware } from './cors';
export { validate, getValidatedData, commonSchemas } from './validation';
export { cacheInvalidation } from './cacheInvalidation';