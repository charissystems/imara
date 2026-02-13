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
export { authMiddleware, requireAuth } from './auth';

// Audit Middleware
export { auditMiddleware, AuditLogger } from './audit';
export type { AuditLog } from './audit';

// Optional Middleware
export { corsMiddleware } from './cors';
export { validate, getValidatedData, commonSchemas } from './validation';