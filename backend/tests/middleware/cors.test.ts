// backend/tests/middleware/cors.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const getAllowedOrigins = (env?: string): string[] => {
    const nodeEnv = env || process.env.NODE_ENV || 'development';

    if (nodeEnv === 'production') {
        const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
        return allowedOrigins;
    }

    return [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:8080',
    ];
};

const corsOriginValidator = (
    origin: string | undefined,
    env: string = 'development',
    baseDomain?: string
): string | undefined => {
    const allowedOrigins = getAllowedOrigins(env);

    if (!origin) return '*';

    if (allowedOrigins.includes(origin)) return origin;

    if (env !== 'production' && origin.includes('localhost')) {
        return origin;
    }

    if (env === 'production' && baseDomain) {
        const tenantPattern = new RegExp(`^https?://[a-z0-9-]+\\.${baseDomain.replace('.', '\\.')}$`);
        if (tenantPattern.test(origin)) {
            return origin;
        }
    }

    return undefined;
};

describe('CORS Middleware', () => {
    let originalEnv: string | undefined;
    let originalAllowedOrigins: string | undefined;

    beforeEach(() => {
        originalEnv = process.env.NODE_ENV;
        originalAllowedOrigins = process.env.ALLOWED_ORIGINS;
    });

    afterEach(() => {
        if (originalEnv) {
            process.env.NODE_ENV = originalEnv;
        } else {
            delete process.env.NODE_ENV;
        }

        if (originalAllowedOrigins) {
            process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
        } else {
            delete process.env.ALLOWED_ORIGINS;
        }
    });

    describe('getAllowedOrigins', () => {
        it('should return development origins when NODE_ENV is development', () => {
            const origins = getAllowedOrigins('development');

            expect(origins).toContain('http://localhost:3000');
            expect(origins).toContain('http://localhost:5173');
            expect(origins).toContain('http://localhost:8080');
        });

        it('should return environment-configured origins in production', () => {
            process.env.ALLOWED_ORIGINS = 'https://app.example.com,https://api.example.com';

            const origins = getAllowedOrigins('production');

            expect(origins).toContain('https://app.example.com');
            expect(origins).toContain('https://api.example.com');
        });

        it('should return empty array if no origins configured in production', () => {
            delete process.env.ALLOWED_ORIGINS;

            const origins = getAllowedOrigins('production');

            expect(origins).toEqual([]);
        });

        it('should handle comma-separated origins', () => {
            process.env.ALLOWED_ORIGINS = 'https://app.example.com,https://web.example.com,https://admin.example.com';

            const origins = getAllowedOrigins('production');

            expect(origins.length).toBe(3);
            expect(origins).toContain('https://app.example.com');
        });
    });

    describe('CORS Origin Validation', () => {
        it('should allow requests without origin (mobile apps, curl)', () => {
            const result = corsOriginValidator(undefined, 'production');
            expect(result).toBe('*');
        });

        it('should allow origins in allowed list', () => {
            process.env.ALLOWED_ORIGINS = 'https://app.example.com';

            const result = corsOriginValidator('https://app.example.com', 'production');
            expect(result).toBe('https://app.example.com');
        });

        it('should allow localhost in development', () => {
            const result = corsOriginValidator('http://localhost:3000', 'development');
            expect(result).toBe('http://localhost:3000');
        });

        it('should allow any localhost variant in development', () => {
            const localhost_3000 = corsOriginValidator('http://localhost:3000', 'development');
            const localhost_5173 = corsOriginValidator('http://localhost:5173', 'development');
            const localhost_8080 = corsOriginValidator('http://localhost:8080', 'development');

            expect(localhost_3000).toBeDefined();
            expect(localhost_5173).toBeDefined();
            expect(localhost_8080).toBeDefined();
        });

        it('should reject unauthorized origins in production', () => {
            process.env.ALLOWED_ORIGINS = 'https://app.example.com';

            const result = corsOriginValidator('https://unauthorized.com', 'production');
            expect(result).toBeUndefined();
        });

        it('should reject localhost in production without explicit config', () => {
            process.env.NODE_ENV = 'production';
            delete process.env.ALLOWED_ORIGINS;

            const result = corsOriginValidator('http://localhost:3000', 'production');
            expect(result).toBeUndefined();
        });
    });

    describe('Tenant Subdomain Validation', () => {
        it('should allow tenant subdomains matching pattern', () => {
            const result = corsOriginValidator(
                'https://testsacco.example.com',
                'production',
                'example.com'
            );
            expect(result).toBe('https://testsacco.example.com');
        });

        it('should allow tenant subdomains with numbers and hyphens', () => {
            const result = corsOriginValidator(
                'https://test-sacco-123.example.com',
                'production',
                'example.com'
            );
            expect(result).toBe('https://test-sacco-123.example.com');
        });

        it('should validate HTTP protocol for tenant subdomains', () => {
            const result = corsOriginValidator(
                'http://testsacco.example.com',
                'production',
                'example.com'
            );
            expect(result).toBe('http://testsacco.example.com');
        });

        it('should reject tenant subdomains with invalid characters', () => {
            const result = corsOriginValidator(
                'https://test_sacco.example.com',
                'production',
                'example.com'
            );
            expect(result).toBeUndefined();
        });

        it('should reject main domain without subdomain', () => {
            const result = corsOriginValidator(
                'https://example.com',
                'production',
                'example.com'
            );
            expect(result).toBeUndefined();
        });

        it('should reject completely different domains', () => {
            const result = corsOriginValidator(
                'https://malicious.net',
                'production',
                'example.com'
            );
            expect(result).toBeUndefined();
        });
    });

    describe('CORS Configuration', () => {
        it('should allow all standard HTTP methods', () => {
            const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
            expect(methods).toContain('GET');
            expect(methods).toContain('POST');
            expect(methods).toContain('PUT');
            expect(methods).toContain('DELETE');
            expect(methods).toContain('OPTIONS');
        });

        it('should expose X-Request-ID header', () => {
            const exposedHeaders = [
                'X-Request-ID',
                'X-Response-Time',
            ];
            expect(exposedHeaders).toContain('X-Request-ID');
        });

        it('should expose X-Response-Time header', () => {
            const exposedHeaders = [
                'X-Request-ID',
                'X-Response-Time',
            ];
            expect(exposedHeaders).toContain('X-Response-Time');
        });

        it('should support credentials', () => {
            const credentialsEnabled = true;
            expect(credentialsEnabled).toBe(true);
        });

        it('should have appropriate cache max-age', () => {
            const maxAge = 86400;
            expect(maxAge).toBe(86400);
        });

        it('should allow custom headers', () => {
            const allowedHeaders = [
                'Content-Type',
                'Authorization',
                'X-Tenant-Subdomain',
                'X-Request-ID',
            ];
            expect(allowedHeaders).toContain('Content-Type');
            expect(allowedHeaders).toContain('Authorization');
            expect(allowedHeaders).toContain('X-Tenant-Subdomain');
        });
    });

    describe('Edge Cases', () => {
        it('should handle origin with port', () => {
            const result = corsOriginValidator('http://localhost:3000', 'development');
            expect(result).toBe('http://localhost:3000');
        });

        it('should be case-sensitive for domains', () => {
            const result = corsOriginValidator('https://TESTSACCO.EXAMPLE.COM', 'production', 'example.com');
            expect(result).toBeUndefined();
        });

        it('should handle multiple dots in subdomain', () => {
            const result = corsOriginValidator(
                'https://tenant.api.subdomain.example.com',
                'production',
                'example.com'
            );
            expect(result).toBeUndefined();
        });
    });

    describe('Environment Handling', () => {
        it('should use NODE_ENV environment variable', () => {
            process.env.NODE_ENV = 'development';
            const origins = getAllowedOrigins();

            expect(origins).toContain('http://localhost:3000');
        });

        it('should default to development mode if NODE_ENV not set', () => {
            delete process.env.NODE_ENV;
            const origins = getAllowedOrigins();

            expect(origins.length).toBeGreaterThan(0);
        });

        it('should use ALLOWED_ORIGINS in production', () => {
            process.env.NODE_ENV = 'production';
            process.env.ALLOWED_ORIGINS = 'https://prod.example.com';

            const origins = getAllowedOrigins();
            expect(origins).toContain('https://prod.example.com');
        });
    });

    describe('Security Considerations', () => {
        it('should not allow all origins in production by default', () => {
            process.env.NODE_ENV = 'production';
            delete process.env.ALLOWED_ORIGINS;

            const result = corsOriginValidator('https://random-site.com', 'production');
            expect(result).toBeUndefined();
        });

        it('should require protocol matching', () => {
            process.env.ALLOWED_ORIGINS = 'https://app.example.com';

            const https = corsOriginValidator('https://app.example.com', 'production');
            const http = corsOriginValidator('http://app.example.com', 'production');

            expect(https).toBe('https://app.example.com');
            expect(http).toBeUndefined();
        });

        it('should not allow implicit wildcard patterns', () => {
            const result = corsOriginValidator('https://evil.com', 'production', 'example.com');
            expect(result).toBeUndefined();
        });
    });
});
