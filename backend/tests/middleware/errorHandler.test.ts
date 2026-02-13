// tests/middleware/errorHandler.test.ts
import { describe, it, expect } from 'vitest';
import {
    AppError,
    DatabaseError,
    ValidationError,
    NotFoundError,
    UnauthorizedError,
    ForbiddenError,
} from '../../src/middleware/errorHandler';

describe('Error Handler Classes', () => {
    describe('AppError', () => {
        it('should create an AppError with status code, message, and code', () => {
            const error = new AppError(400, 'Test error', 'TEST_ERROR');
            expect(error.statusCode).toBe(400);
            expect(error.message).toBe('Test error');
            expect(error.code).toBe('TEST_ERROR');
            expect(error.details).toBeUndefined();
        });

        it('should create an AppError with additional details', () => {
            const details = { field: 'email', value: 'invalid' };
            const error = new AppError(400, 'Test error', 'TEST_ERROR', details);
            expect(error.statusCode).toBe(400);
            expect(error.details).toEqual(details);
        });

        it('should inherit from Error', () => {
            const error = new AppError(500, 'Server error', 'SERVER_ERROR');
            expect(error instanceof Error).toBe(true);
        });

        it('should have proper error name', () => {
            const error = new AppError(500, 'Server error', 'SERVER_ERROR');
            expect(error.name).toBe('AppError');
        });
    });

    describe('DatabaseError', () => {
        it('should create a DatabaseError with 500 status code', () => {
            const error = new DatabaseError('Connection failed');
            expect(error.statusCode).toBe(500);
            expect(error.message).toBe('Connection failed');
            expect(error.code).toBe('DATABASE_ERROR');
        });

        it('should accept optional details', () => {
            const details = { query: 'SELECT * FROM users', operation: 'select' };
            const error = new DatabaseError('Query failed', details);
            expect(error.details).toEqual(details);
        });

        it('should be instanceof AppError', () => {
            const error = new DatabaseError('Test error');
            expect(error instanceof AppError).toBe(true);
        });
    });

    describe('ValidationError', () => {
        it('should create a ValidationError with 400 status code', () => {
            const error = new ValidationError('Invalid input');
            expect(error.statusCode).toBe(400);
            expect(error.message).toBe('Invalid input');
            expect(error.code).toBe('VALIDATION_ERROR');
        });

        it('should include validation details', () => {
            const details = {
                fields: [
                    { field: 'email', message: 'Invalid email format' },
                    { field: 'age', message: 'Must be number' },
                ],
            };
            const error = new ValidationError('Multiple validation errors', details);
            expect(error.details).toEqual(details);
        });

        it('should be instanceof AppError', () => {
            const error = new ValidationError('Invalid');
            expect(error instanceof AppError).toBe(true);
        });
    });

    describe('NotFoundError', () => {
        it('should create a NotFoundError with 404 status code', () => {
            const error = new NotFoundError('Resource');
            expect(error.statusCode).toBe(404);
            expect(error.code).toBe('NOT_FOUND');
        });

        it('should include resource in message', () => {
            const error = new NotFoundError('User', '123');
            expect(error.message).toContain('User');
            expect(error.message).toContain('123');
        });

        it('should be instanceof AppError', () => {
            const error = new NotFoundError('Resource');
            expect(error instanceof AppError).toBe(true);
        });

        it('should handle resource-only error', () => {
            const error = new NotFoundError('Resource');
            expect(error.message).toContain('Resource');
            expect(error.message).toContain('not found');
        });
    });

    describe('UnauthorizedError', () => {
        it('should create an UnauthorizedError with 401 status code', () => {
            const error = new UnauthorizedError('Missing authentication');
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe('Missing authentication');
            expect(error.code).toBe('UNAUTHORIZED');
        });

        it('should use default message', () => {
            const error = new UnauthorizedError();
            expect(error.message).toBe('Unauthorized');
        });

        it('should be instanceof AppError', () => {
            const error = new UnauthorizedError('Unauthorized');
            expect(error instanceof AppError).toBe(true);
        });
    });

    describe('ForbiddenError', () => {
        it('should create a ForbiddenError with 403 status code', () => {
            const error = new ForbiddenError('Access denied');
            expect(error.statusCode).toBe(403);
            expect(error.message).toBe('Access denied');
            expect(error.code).toBe('FORBIDDEN');
        });

        it('should use default message', () => {
            const error = new ForbiddenError();
            expect(error.message).toBe('Forbidden');
        });

        it('should be instanceof AppError', () => {
            const error = new ForbiddenError('Forbidden');
            expect(error instanceof AppError).toBe(true);
        });

        it('should not accept details parameter', () => {
            const error = new ForbiddenError('Access denied');
            expect(error.details).toBeUndefined();
        });
    });

    describe('Error Status Codes', () => {
        it('should have correct HTTP status codes', () => {
            expect(new AppError(200, 'msg', 'code').statusCode).toBe(200);
            expect(new DatabaseError('msg').statusCode).toBe(500);
            expect(new ValidationError('msg').statusCode).toBe(400);
            expect(new NotFoundError('Resource').statusCode).toBe(404);
            expect(new UnauthorizedError('msg').statusCode).toBe(401);
            expect(new ForbiddenError('msg').statusCode).toBe(403);
        });
    });

    describe('Error Details', () => {
        it('should preserve details through error chain', () => {
            const originalDetails = { key: 'value', nested: { data: 'test' } };
            const error = new AppError(500, 'Test', 'CODE', originalDetails);
            expect(error.details).toEqual(originalDetails);
            expect(error.details!.key).toBe('value');
            expect(error.details!.nested.data).toBe('test');
        });

        it('should have undefined details by default for AppError', () => {
            const error = new AppError(500, 'Test', 'CODE');
            expect(error.details).toBeUndefined();
        });

        it('should support error codes', () => {
            const error = new AppError(500, 'Test', 'CUSTOM_CODE');
            expect(error.code).toBe('CUSTOM_CODE');
        });

        it('should support error names', () => {
            const error = new DatabaseError('Test');
            expect(error.name).toBe('DatabaseError');
        });
    });

    describe('Error Hierarchy', () => {
        it('DatabaseError should extend AppError', () => {
            const error = new DatabaseError('Test');
            expect(error instanceof AppError).toBe(true);
            expect(error instanceof Error).toBe(true);
        });

        it('ValidationError should extend AppError', () => {
            const error = new ValidationError('Test');
            expect(error instanceof AppError).toBe(true);
        });

        it('NotFoundError should extend AppError', () => {
            const error = new NotFoundError('Resource');
            expect(error instanceof AppError).toBe(true);
        });

        it('UnauthorizedError should extend AppError', () => {
            const error = new UnauthorizedError('Test');
            expect(error instanceof AppError).toBe(true);
        });

        it('ForbiddenError should extend AppError', () => {
            const error = new ForbiddenError('Test');
            expect(error instanceof AppError).toBe(true);
        });
    });

    describe('Stack Traces', () => {
        it('should capture stack traces', () => {
            const error = new AppError(500, 'Test', 'CODE');
            expect(error.stack).toBeDefined();
            expect(error.stack).toContain('AppError');
        });
    });
});
