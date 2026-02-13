// src/middleware/validation.ts
import { Context, Next } from 'hono';
import { z, ZodSchema } from 'zod';
import { ValidationError } from './errorHandler';

/**
 * Validation target types
 */
type ValidationTarget = 'json' | 'query' | 'param' | 'header';

/**
 * Create validation middleware for different request parts
 */
export function validate<T extends ZodSchema>(
    schema: T,
    target: ValidationTarget = 'json'
) {
    return async (c: Context, next: Next) => {
        let data: any;

        // Extract data based on target
        switch (target) {
            case 'json':
                try {
                    data = await c.req.json();
                } catch (e) {
                    data = {};
                }
                break;
            case 'query':
                data = c.req.query();
                break;
            case 'param':
                data = c.req.param();
                break;
            case 'header':
                data = Object.fromEntries(Object.entries(c.req.raw.headers));
                break;
        }

        // Validate with Zod
        const result = schema.safeParse(data);

        if (!result.success) {
            const errors = result.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
                code: err.code,
            }));

            throw new ValidationError('Validation failed', { errors });
        }

        // Store validated data in context
        c.set('validatedData', result.data);

        await next();
    };
}

/**
 * Helper to get validated data from context
 */
export function getValidatedData<T>(c: Context): T {
    return c.get('validatedData') as T;
}

/**
 * Common validation schemas
 */
export const commonSchemas = {
    uuid: z.string().uuid('Invalid UUID format'),
    
    email: z
        .string()
        .email('Invalid email format')
        .max(200, 'Email too long')
        .transform((email) => email.toLowerCase().trim()),
    
    phone: z
        .string()
        .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format')
        .transform((phone) => phone.trim()),
    
    date: z.string().refine(
        (val) => !isNaN(Date.parse(val)),
        'Invalid date format'
    ),
    
    pagination: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
    }),
    
    search: z.object({
        q: z.string().min(1).max(200),
    }),
};
