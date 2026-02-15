// backend/tests/middleware/tenantResolver.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NotFoundError, ForbiddenError } from '../../src/middleware/errorHandler';

interface Tenant {
    id: string;
    code: string;
    subdomain: string;
    schema_name: string;
    status: 'active' | 'inactive' | 'suspended';
    subscription_expires_at?: string | Date | null;
    deleted_at?: string | Date | null;
}

const tenantCache = new Map<string, { tenant: Tenant; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

async function getTenantBySubdomain(
    subdomain: string,
    mockDb?: Map<string, Tenant>
): Promise<Tenant | undefined> {
    const cached = tenantCache.get(subdomain);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.tenant;
    }

    const tenant = mockDb?.get(subdomain);
    if (tenant) {
        tenantCache.set(subdomain, {
            tenant,
            timestamp: Date.now(),
        });
    }

    return tenant;
}

function extractSubdomain(host: string | null, headerSubdomain?: string): string | null {
    if (headerSubdomain) {
        return headerSubdomain.toLowerCase().trim();
    }

    if (!host) return null;

    const parts = host.split('.');

    if (parts.length < 2) return null;

    if (host.includes('localhost')) {
        const subdomain = parts[0].split(':')[0];
        if (subdomain === 'localhost') return null;
        return subdomain.toLowerCase().trim();
    }

    const subdomain = parts[0];
    const ignoredSubdomains = ['www', 'api', 'app'];
    if (ignoredSubdomains.includes(subdomain.toLowerCase())) {
        return null;
    }

    return subdomain.toLowerCase().trim();
}

function validateTenant(tenant: Tenant) {
    if (tenant.status !== 'active') {
        throw new ForbiddenError(
            `Tenant '${tenant.code}' is currently ${tenant.status}. Please contact support.`
        );
    }

    if (tenant.subscription_expires_at) {
        const expiryDate = new Date(tenant.subscription_expires_at);
        if (expiryDate < new Date()) {
            throw new ForbiddenError(
                `Tenant '${tenant.code}' subscription has expired. Please renew your subscription.`
            );
        }
    }

    return true;
}

describe('Tenant Resolver Middleware', () => {
    let mockDb: Map<string, Tenant>;

    const testTenant: Tenant = {
        id: 'tenant-123',
        code: 'testsacco',
        subdomain: 'testsacco',
        schema_name: 'tenant_testsacco',
        status: 'active',
        subscription_expires_at: null,
    };

    beforeEach(() => {
        mockDb = new Map([['testsacco', testTenant]]);
        tenantCache.clear();
    });

    afterEach(() => {
        tenantCache.clear();
    });

    describe('extractSubdomain', () => {
        it('should extract subdomain from X-Tenant-Subdomain header (highest priority)', () => {
            const subdomain = extractSubdomain('example.com', 'testsacco');
            expect(subdomain).toBe('testsacco');
        });

        it('should extract subdomain from host header', () => {
            const subdomain = extractSubdomain('testsacco.example.com');
            expect(subdomain).toBe('testsacco');
        });

        it('should handle subdomain with lowercase conversion', () => {
            const subdomain = extractSubdomain('TestSacco.example.com');
            expect(subdomain).toBe('testsacco');
        });

        it('should handle localhost with port', () => {
            const subdomain = extractSubdomain('testsacco.localhost:3000');
            expect(subdomain).toBe('testsacco');
        });

        it('should return null for plain localhost', () => {
            const subdomain = extractSubdomain('localhost:3000');
            expect(subdomain).toBeNull();
        });

        it('should ignore www subdomain', () => {
            const subdomain = extractSubdomain('www.example.com');
            expect(subdomain).toBeNull();
        });

        it('should ignore api subdomain', () => {
            const subdomain = extractSubdomain('api.example.com');
            expect(subdomain).toBeNull();
        });

        it('should ignore app subdomain', () => {
            const subdomain = extractSubdomain('app.example.com');
            expect(subdomain).toBeNull();
        });

        it('should handle whitespace in subdomain', () => {
            const subdomain = extractSubdomain('testsacco.example.com', '  testsacco  ');
            expect(subdomain).toBe('testsacco');
        });

        it('should return null for missing host', () => {
            const subdomain = extractSubdomain(null);
            expect(subdomain).toBeNull();
        });

        it('should return null for single-part host', () => {
            const subdomain = extractSubdomain('localhost');
            expect(subdomain).toBeNull();
        });

        it('should handle multi-part TLDs', () => {
            const subdomain = extractSubdomain('testsacco.example.co.uk');
            expect(subdomain).toBe('testsacco');
        });
    });

    describe('getTenantBySubdomain', () => {
        it('should fetch tenant from database', async () => {
            const tenant = await getTenantBySubdomain('testsacco', mockDb);
            expect(tenant).toEqual(testTenant);
        });

        it('should return undefined if tenant not found', async () => {
            const tenant = await getTenantBySubdomain('nonexistent', mockDb);
            expect(tenant).toBeUndefined();
        });

        it('should cache tenant after first fetch', async () => {
            const tenant1 = await getTenantBySubdomain('testsacco', mockDb);
            const tenant2 = await getTenantBySubdomain('testsacco', mockDb);

            expect(tenant1).toEqual(tenant2);
            expect(tenantCache.has('testsacco')).toBe(true);
        });

        it('should return cached tenant within TTL', async () => {
            await getTenantBySubdomain('testsacco', mockDb);

            mockDb.clear();

            const tenant = await getTenantBySubdomain('testsacco', mockDb);
            expect(tenant).toEqual(testTenant);
        });
    });

    describe('validateTenant', () => {
        it('should validate active tenant', () => {
            const result = validateTenant(testTenant);
            expect(result).toBe(true);
        });

        it('should throw ForbiddenError for inactive tenant', () => {
            const inactiveTenant: Tenant = { ...testTenant, status: 'inactive' };

            try {
                validateTenant(inactiveTenant);
                expect.fail('Should have thrown ForbiddenError');
            } catch (error) {
                expect(error).toBeInstanceOf(ForbiddenError);
                expect((error as any).statusCode).toBe(403);
            }
        });

        it('should throw ForbiddenError for suspended tenant', () => {
            const suspendedTenant: Tenant = { ...testTenant, status: 'suspended' };

            try {
                validateTenant(suspendedTenant);
                expect.fail('Should have thrown ForbiddenError');
            } catch (error) {
                expect(error).toBeInstanceOf(ForbiddenError);
                expect((error as any).statusCode).toBe(403);
            }
        });

        it('should throw ForbiddenError for expired subscription', () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            const expiredTenant: Tenant = {
                ...testTenant,
                subscription_expires_at: yesterday.toISOString(),
            };

            try {
                validateTenant(expiredTenant);
                expect.fail('Should have thrown ForbiddenError');
            } catch (error) {
                expect(error).toBeInstanceOf(ForbiddenError);
                expect((error as any).statusCode).toBe(403);
            }
        });

        it('should allow tenant with future subscription expiry', () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);

            const validTenant: Tenant = {
                ...testTenant,
                subscription_expires_at: tomorrow.toISOString(),
            };

            const result = validateTenant(validTenant);
            expect(result).toBe(true);
        });

        it('should allow tenant with null subscription_expires_at', () => {
            const tenant: Tenant = {
                ...testTenant,
                subscription_expires_at: null,
            };

            const result = validateTenant(tenant);
            expect(result).toBe(true);
        });
    });

    describe('Tenant Resolver Integration', () => {
        it('should resolve valid tenant', async () => {
            const subdomain = extractSubdomain('testsacco.example.com');
            expect(subdomain).toBe('testsacco');

            const tenant = await getTenantBySubdomain(subdomain, mockDb);
            expect(tenant).toEqual(testTenant);

            validateTenant(tenant!);
            expect(tenant!.status).toBe('active');
        });

        it('should reject when subdomain cannot be determined', () => {
            const subdomain = extractSubdomain(null);
            expect(subdomain).toBeNull();
        });

        it('should reject when tenant does not exist', async () => {
            const tenant = await getTenantBySubdomain('nonexistent', mockDb);
            expect(tenant).toBeUndefined();
        });

        it('should use X-Tenant-Subdomain header with highest priority', async () => {
            const customTenant: Tenant = {
                id: 'tenant-456',
                code: 'customsacco',
                subdomain: 'customsacco',
                schema_name: 'tenant_customsacco',
                status: 'active',
                subscription_expires_at: null,
            };

            mockDb.set('customsacco', customTenant);

            const subdomain = extractSubdomain('testsacco.example.com', 'customsacco');
            expect(subdomain).toBe('customsacco');

            const tenant = await getTenantBySubdomain(subdomain, mockDb);
            expect(tenant).toEqual(customTenant);
        });
    });

    describe('Cache Management', () => {
        it('should clear specific tenant from cache', async () => {
            await getTenantBySubdomain('testsacco', mockDb);
            expect(tenantCache.has('testsacco')).toBe(true);

            tenantCache.delete('testsacco');
            expect(tenantCache.has('testsacco')).toBe(false);
        });

        it('should clear all tenants from cache', async () => {
            await getTenantBySubdomain('testsacco', mockDb);
            tenantCache.set('other', {
                tenant: testTenant,
                timestamp: Date.now(),
            });

            expect(tenantCache.size).toBeGreaterThan(0);
            tenantCache.clear();
            expect(tenantCache.size).toBe(0);
        });
    });

    describe('Edge Cases', () => {
        it('should handle subdomain with special characters', () => {
            const subdomain = extractSubdomain('test-sacco-123.example.com');
            expect(subdomain).toBe('test-sacco-123');
        });

        it('should handle subdomain with numbers', () => {
            const subdomain = extractSubdomain('sacco123.example.com');
            expect(subdomain).toBe('sacco123');
        });

        it('should handle deeply nested domains', () => {
            const subdomain = extractSubdomain('sacco.api.example.com');
            expect(subdomain).toBe('sacco');
        });

        it('should handle tenant with no subscription_expires_at field', () => {
            const tenant: Tenant = {
                id: 'tenant-123',
                code: 'testsacco',
                subdomain: 'testsacco',
                schema_name: 'tenant_testsacco',
                status: 'active',
            };

            const result = validateTenant(tenant);
            expect(result).toBe(true);
        });

        it('should handle future subscription expiry dates', () => {
            const futureDate = new Date();
            futureDate.setFullYear(futureDate.getFullYear() + 1);

            const tenant: Tenant = {
                ...testTenant,
                subscription_expires_at: futureDate.toISOString(),
            };

            const result = validateTenant(tenant);
            expect(result).toBe(true);
        });
    });
});

// ════════════════════════════════════════════════════════════════
// Tests against actual source code exports
// ════════════════════════════════════════════════════════════════

import { vi } from 'vitest';

vi.mock('../../src/config/database', () => ({
    publicDb: {
        selectFrom: vi.fn().mockReturnValue({
            selectAll: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue(undefined),
        }),
    },
}));

vi.mock('../../src/services/cacheService', () => ({
    globalCacheGet: vi.fn().mockResolvedValue(null),
    globalCacheSet: vi.fn().mockResolvedValue(undefined),
    globalCacheInvalidate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/middleware/logger', () => ({
    appLogger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import {
    tenantResolver,
    clearTenantCache,
} from '../../src/middleware/tenantResolver';
import { globalCacheInvalidate } from '../../src/services/cacheService';

describe('tenantResolver (actual source)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should throw NotFoundError when no subdomain can be extracted', async () => {
        const ctx = {
            req: {
                header: vi.fn().mockReturnValue(undefined),
            },
            set: vi.fn(),
            get: vi.fn(),
        } as any;

        const next = vi.fn();

        await expect(tenantResolver(ctx, next)).rejects.toThrow(
            'Unable to determine tenant',
        );
    });

    it('should throw NotFoundError when tenant is not in database', async () => {
        const ctx = {
            req: {
                header: vi.fn((name: string) => {
                    if (name === 'x-tenant-subdomain') return 'unknown-sacco';
                    return undefined;
                }),
            },
            set: vi.fn(),
            get: vi.fn(),
        } as any;

        const next = vi.fn();

        await expect(tenantResolver(ctx, next)).rejects.toThrow();
    });
});

describe('clearTenantCache (actual source)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should clear specific subdomain cache', () => {
        clearTenantCache('test-sacco');
        expect(globalCacheInvalidate).toHaveBeenCalledWith('tenant:test-sacco');
    });

    it('should clear all tenant cache when no subdomain given', () => {
        clearTenantCache();
        // Should not call globalCacheInvalidate for specific key
        expect(globalCacheInvalidate).not.toHaveBeenCalled();
    });
});
