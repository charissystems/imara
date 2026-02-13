// backend/tests/middleware/validation.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Context, Next } from 'hono';
import { z } from 'zod';
import { validate, getValidatedData, commonSchemas } from '../../src/middleware/validation';
import { ValidationError } from '../../src/middleware/errorHandler';

describe('Validation Middleware', () => {
    let mockContext: Partial<Context>;
    let mockNext: Next;

    beforeEach(() => {
        mockNext = vi.fn().mockResolvedValue(undefined);
        mockContext = {
            req: {
                json: vi.fn(),
                query: vi.fn(),
                param: vi.fn(),
                raw: {
                    headers: new Map(),
                },
            } as any,
            set: vi.fn(),
            get: vi.fn(),
        };
    });

    describe('validate middleware - JSON target', () => {
        it('should validate JSON body successfully', async () => {
            const schema = z.object({
                name: z.string(),
                age: z.number(),
            });

            const data = { name: 'John', age: 30 };
            (mockContext.req!.json as any).mockResolvedValue(data);

            const middleware = validate(schema, 'json');
            await middleware(mockContext as Context, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(mockContext.set).toHaveBeenCalledWith('validatedData', data);
        });

        it('should throw ValidationError for invalid JSON body', async () => {
            const schema = z.object({
                name: z.string(),
                age: z.number(),
            });

            const data = { name: 'John', age: 'not-a-number' };
            (mockContext.req!.json as any).mockResolvedValue(data);

            const middleware = validate(schema, 'json');

            try {
                await middleware(mockContext as Context, mockNext);
                expect.fail('Should have thrown ValidationError');
            } catch (error) {
                expect(error).toBeInstanceOf(ValidationError);
                expect((error as any).statusCode).toBe(400);
            }
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should handle missing required fields', async () => {
            const schema = z.object({
                email: z.string().email(),
                password: z.string().min(8),
            });

            const data = { email: 'test@example.com' };
            (mockContext.req!.json as any).mockResolvedValue(data);

            const middleware = validate(schema, 'json');

            try {
                await middleware(mockContext as Context, mockNext);
                expect.fail('Should have thrown ValidationError');
            } catch (error) {
                expect(error).toBeInstanceOf(ValidationError);
            }
        });

        it('should validate nested objects', async () => {
            const schema = z.object({
                user: z.object({
                    name: z.string(),
                    address: z.object({
                        city: z.string(),
                        zip: z.string(),
                    }),
                }),
            });

            const data = {
                user: {
                    name: 'John',
                    address: {
                        city: 'NYC',
                        zip: '10001',
                    },
                },
            };
            (mockContext.req!.json as any).mockResolvedValue(data);

            const middleware = validate(schema, 'json');
            await middleware(mockContext as Context, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });
    });

    describe('validate middleware - Query target', () => {
        it('should validate query parameters', async () => {
            const schema = z.object({
                page: z.coerce.number().int().positive(),
                limit: z.coerce.number().int().positive(),
            });

            const queryData = { page: '1', limit: '20' };
            (mockContext.req!.query as any).mockReturnValue(queryData);

            const middleware = validate(schema, 'query');
            await middleware(mockContext as Context, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });

        it('should reject invalid query parameters', async () => {
            const schema = z.object({
                page: z.coerce.number().int().positive(),
            });

            (mockContext.req!.query as any).mockReturnValue({ page: 'not-a-number' });

            const middleware = validate(schema, 'query');

            try {
                await middleware(mockContext as Context, mockNext);
                expect.fail('Should have thrown ValidationError');
            } catch (error) {
                expect(error).toBeInstanceOf(ValidationError);
            }
        });
    });

    describe('validate middleware - Param target', () => {
        it('should validate URL parameters', async () => {
            const schema = z.object({
                id: z.string().uuid(),
            });

            const paramData = { id: '550e8400-e29b-41d4-a716-446655440000' };
            (mockContext.req!.param as any).mockReturnValue(paramData);

            const middleware = validate(schema, 'param');
            await middleware(mockContext as Context, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });

        it('should reject invalid URL parameters', async () => {
            const schema = z.object({
                id: z.string().uuid(),
            });

            (mockContext.req!.param as any).mockReturnValue({ id: 'not-a-uuid' });

            const middleware = validate(schema, 'param');

            try {
                await middleware(mockContext as Context, mockNext);
                expect.fail('Should have thrown ValidationError');
            } catch (error) {
                expect(error).toBeInstanceOf(ValidationError);
            }
        });
    });

    describe('validate middleware - Header target', () => {
        it('should validate headers', async () => {
            const schema = z.object({
                authorization: z.string().optional(),
            });

            const headers = new Map([['authorization', 'Bearer token123']]);
            (mockContext.req!.raw as any) = { headers };

            const middleware = validate(schema, 'header');
            await middleware(mockContext as Context, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });
    });

    describe('getValidatedData helper', () => {
        it('should retrieve validated data from context', () => {
            const testData = { name: 'John', age: 30 };
            (mockContext.get as any).mockReturnValue(testData);

            const result = getValidatedData(mockContext as Context);

            expect(result).toEqual(testData);
            expect(mockContext.get).toHaveBeenCalledWith('validatedData');
        });

        it('should support type narrowing', () => {
            const testData = { email: 'test@example.com' };
            (mockContext.get as any).mockReturnValue(testData);

            const result = getValidatedData<typeof testData>(mockContext as Context);

            expect(result.email).toBe('test@example.com');
        });
    });

    describe('commonSchemas - UUID', () => {
        it('should validate UUID', () => {
            const result = commonSchemas.uuid.safeParse('550e8400-e29b-41d4-a716-446655440000');
            expect(result.success).toBe(true);
        });

        it('should reject invalid UUID', () => {
            const result = commonSchemas.uuid.safeParse('not-a-uuid');
            expect(result.success).toBe(false);
        });
    });

    describe('commonSchemas - Email', () => {
        it('should validate email', () => {
            const result = commonSchemas.email.safeParse('test@example.com');
            expect(result.success).toBe(true);
        });

        it('should reject invalid email', () => {
            const result = commonSchemas.email.safeParse('invalid-email');
            expect(result.success).toBe(false);
        });

        it('should normalize email to lowercase', () => {
            const result = commonSchemas.email.safeParse('Test@EXAMPLE.COM');
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toBe('test@example.com');
            }
        });

        it('should reject email longer than 200 chars', () => {
            const longEmail = `${'a'.repeat(200)}@example.com`;
            const result = commonSchemas.email.safeParse(longEmail);
            expect(result.success).toBe(false);
        });
    });

    describe('commonSchemas - Phone', () => {
        it('should validate phone number', () => {
            const result = commonSchemas.phone.safeParse('+1234567890');
            expect(result.success).toBe(true);
        });

        it('should validate phone without +', () => {
            const result = commonSchemas.phone.safeParse('1234567890');
            expect(result.success).toBe(true);
        });

        it('should reject invalid phone', () => {
            const result = commonSchemas.phone.safeParse('abc123');
            expect(result.success).toBe(false);
        });
    });

    describe('commonSchemas - Date', () => {
        it('should validate ISO date string', () => {
            const result = commonSchemas.date.safeParse('2024-01-15');
            expect(result.success).toBe(true);
        });

        it('should validate date with time', () => {
            const result = commonSchemas.date.safeParse('2024-01-15T10:30:00Z');
            expect(result.success).toBe(true);
        });

        it('should reject invalid date', () => {
            const result = commonSchemas.date.safeParse('not-a-date');
            expect(result.success).toBe(false);
        });
    });

    describe('commonSchemas - Pagination', () => {
        it('should validate pagination with defaults', () => {
            const result = commonSchemas.pagination.safeParse({});
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.page).toBe(1);
                expect(result.data.limit).toBe(20);
            }
        });

        it('should validate pagination with values', () => {
            const result = commonSchemas.pagination.safeParse({ page: 2, limit: 50 });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.page).toBe(2);
                expect(result.data.limit).toBe(50);
            }
        });

        it('should reject page less than 1', () => {
            const result = commonSchemas.pagination.safeParse({ page: 0 });
            expect(result.success).toBe(false);
        });

        it('should reject limit greater than 100', () => {
            const result = commonSchemas.pagination.safeParse({ limit: 101 });
            expect(result.success).toBe(false);
        });

        it('should coerce string to number', () => {
            const result = commonSchemas.pagination.safeParse({ page: '1', limit: '20' });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.page).toBe(1);
                expect(result.data.limit).toBe(20);
            }
        });
    });

    describe('commonSchemas - Search', () => {
        it('should validate search query', () => {
            const result = commonSchemas.search.safeParse({ q: 'test' });
            expect(result.success).toBe(true);
        });

        it('should reject empty search', () => {
            const result = commonSchemas.search.safeParse({ q: '' });
            expect(result.success).toBe(false);
        });

        it('should reject search longer than 200 chars', () => {
            const longSearch = 'a'.repeat(201);
            const result = commonSchemas.search.safeParse({ q: longSearch });
            expect(result.success).toBe(false);
        });

        it('should accept search at max length', () => {
            const maxSearch = 'a'.repeat(200);
            const result = commonSchemas.search.safeParse({ q: maxSearch });
            expect(result.success).toBe(true);
        });
    });

    describe('Error reporting', () => {
        it('should include field paths in error details', async () => {
            const schema = z.object({
                user: z.object({
                    address: z.object({
                        zip: z.number(),
                    }),
                }),
            });

            const data = { user: { address: { zip: 'not-a-number' } } };
            (mockContext.req!.json as any).mockResolvedValue(data);

            const middleware = validate(schema, 'json');

            try {
                await middleware(mockContext as Context, mockNext);
            } catch (error) {
                expect((error as any).details.errors).toBeDefined();
            }
        });
    });
});
