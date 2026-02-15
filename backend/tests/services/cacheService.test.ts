// tests/services/cacheService.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ────────────────────────────────────────────────────────────
// Mock Redis & Logger before imports
// ────────────────────────────────────────────────────────────

const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    scan: vi.fn(),
};

let redisAvailable = true;

vi.mock('../../src/config/redis', () => ({
    getCacheRedis: () => mockRedis,
    isRedisAvailable: () => redisAvailable,
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
    CacheService,
    globalCacheGet,
    globalCacheSet,
    globalCacheInvalidate,
} from '../../src/services/cacheService';

// ────────────────────────────────────────────────────────────
// Setup
// ────────────────────────────────────────────────────────────

describe('CacheService', () => {
    let cache: CacheService;

    beforeEach(() => {
        vi.clearAllMocks();
        redisAvailable = true;
        cache = new CacheService('tenant_sacco_1');
    });

    // ═══════════════════════════════════════════════════════════
    // get()
    // ═══════════════════════════════════════════════════════════

    describe('get', () => {
        it('should return null when Redis is unavailable', async () => {
            redisAvailable = false;
            const result = await cache.get('reports', 'dashboard');
            expect(result).toBeNull();
            expect(mockRedis.get).not.toHaveBeenCalled();
        });

        it('should return null on cache miss', async () => {
            mockRedis.get.mockResolvedValue(null);
            const result = await cache.get('reports', 'dashboard');
            expect(result).toBeNull();
            expect(mockRedis.get).toHaveBeenCalledWith('tenant_sacco_1:reports:dashboard');
        });

        it('should return parsed JSON on cache hit', async () => {
            const data = { total: 42, items: ['a', 'b'] };
            mockRedis.get.mockResolvedValue(JSON.stringify(data));

            const result = await cache.get('reports', 'dashboard');
            expect(result).toEqual(data);
        });

        it('should return null and log warning on JSON parse error', async () => {
            mockRedis.get.mockResolvedValue('not valid json {{{');
            const result = await cache.get('reports', 'dashboard');
            // JSON.parse will throw, handled gracefully
            expect(result).toBeNull();
        });

        it('should return null and log warning on Redis error', async () => {
            mockRedis.get.mockRejectedValue(new Error('Connection refused'));
            const result = await cache.get('reports', 'dashboard');
            expect(result).toBeNull();
        });
    });

    // ═══════════════════════════════════════════════════════════
    // set()
    // ═══════════════════════════════════════════════════════════

    describe('set', () => {
        it('should be a no-op when Redis is unavailable', async () => {
            redisAvailable = false;
            await cache.set('reports', 'dashboard', { data: 1 });
            expect(mockRedis.set).not.toHaveBeenCalled();
        });

        it('should set with default domain TTL', async () => {
            mockRedis.set.mockResolvedValue('OK');
            await cache.set('reports', 'dashboard', { data: 1 });
            expect(mockRedis.set).toHaveBeenCalledWith(
                'tenant_sacco_1:reports:dashboard',
                JSON.stringify({ data: 1 }),
                'EX',
                600, // reports domain default TTL
            );
        });

        it('should set with custom TTL', async () => {
            mockRedis.set.mockResolvedValue('OK');
            await cache.set('members', 'list', [1, 2, 3], 120);
            expect(mockRedis.set).toHaveBeenCalledWith(
                'tenant_sacco_1:members:list',
                JSON.stringify([1, 2, 3]),
                'EX',
                120,
            );
        });

        it('should use correct default TTLs per domain', async () => {
            mockRedis.set.mockResolvedValue('OK');

            await cache.set('tenant', 'meta', {});
            expect(mockRedis.set).toHaveBeenCalledWith(
                expect.any(String), expect.any(String), 'EX', 300,
            );

            await cache.set('dashboard', 'kpis', {});
            expect(mockRedis.set).toHaveBeenCalledWith(
                expect.any(String), expect.any(String), 'EX', 120,
            );

            await cache.set('config', 'settings', {});
            expect(mockRedis.set).toHaveBeenCalledWith(
                expect.any(String), expect.any(String), 'EX', 900,
            );
        });

        it('should silently handle Redis errors', async () => {
            mockRedis.set.mockRejectedValue(new Error('Write failed'));
            // Should not throw
            await expect(cache.set('reports', 'key', 'val')).resolves.toBeUndefined();
        });
    });

    // ═══════════════════════════════════════════════════════════
    // getOrSet()
    // ═══════════════════════════════════════════════════════════

    describe('getOrSet', () => {
        it('should return cached value on cache hit', async () => {
            const cached = { total: 100 };
            mockRedis.get.mockResolvedValue(JSON.stringify(cached));

            const fetchFn = vi.fn().mockResolvedValue({ total: 200 });
            const result = await cache.getOrSet('reports', 'dashboard', fetchFn);

            expect(result).toEqual(cached);
            expect(fetchFn).not.toHaveBeenCalled();
        });

        it('should call fetchFn and cache result on cache miss', async () => {
            mockRedis.get.mockResolvedValue(null);
            mockRedis.set.mockResolvedValue('OK');

            const freshData = { total: 200 };
            const fetchFn = vi.fn().mockResolvedValue(freshData);

            const result = await cache.getOrSet('reports', 'dashboard', fetchFn, 300);

            expect(result).toEqual(freshData);
            expect(fetchFn).toHaveBeenCalledOnce();
        });

        it('should return fresh data even if cache write fails', async () => {
            mockRedis.get.mockResolvedValue(null);
            mockRedis.set.mockRejectedValue(new Error('Write failed'));

            const freshData = { total: 300 };
            const fetchFn = vi.fn().mockResolvedValue(freshData);

            const result = await cache.getOrSet('reports', 'dashboard', fetchFn);
            expect(result).toEqual(freshData);
        });

        it('should work when Redis is unavailable (always calls fetchFn)', async () => {
            redisAvailable = false;
            const freshData = { items: [1] };
            const fetchFn = vi.fn().mockResolvedValue(freshData);

            const result = await cache.getOrSet('members', 'list', fetchFn);
            expect(result).toEqual(freshData);
            expect(fetchFn).toHaveBeenCalledOnce();
        });
    });

    // ═══════════════════════════════════════════════════════════
    // invalidate()
    // ═══════════════════════════════════════════════════════════

    describe('invalidate', () => {
        it('should be a no-op when Redis is unavailable', async () => {
            redisAvailable = false;
            await cache.invalidate('reports', 'dashboard');
            expect(mockRedis.del).not.toHaveBeenCalled();
        });

        it('should delete the specific key', async () => {
            mockRedis.del.mockResolvedValue(1);
            await cache.invalidate('reports', 'dashboard');
            expect(mockRedis.del).toHaveBeenCalledWith('tenant_sacco_1:reports:dashboard');
        });

        it('should handle Redis errors gracefully', async () => {
            mockRedis.del.mockRejectedValue(new Error('Del failed'));
            await expect(cache.invalidate('reports', 'key')).resolves.toBeUndefined();
        });
    });

    // ═══════════════════════════════════════════════════════════
    // invalidateDomain()
    // ═══════════════════════════════════════════════════════════

    describe('invalidateDomain', () => {
        it('should return 0 when Redis is unavailable', async () => {
            redisAvailable = false;
            const result = await cache.invalidateDomain('reports');
            expect(result).toBe(0);
        });

        it('should scan and delete all keys in the domain', async () => {
            // First scan returns 2 keys and a non-zero cursor
            mockRedis.scan.mockResolvedValueOnce([
                '5', // next cursor
                ['imara:tenant_sacco_1:reports:dash', 'imara:tenant_sacco_1:reports:kpis'],
            ]);
            // Second scan returns 1 key and cursor '0' (done)
            mockRedis.scan.mockResolvedValueOnce([
                '0',
                ['imara:tenant_sacco_1:reports:summary'],
            ]);
            mockRedis.del.mockResolvedValue(2);

            const result = await cache.invalidateDomain('reports');

            expect(result).toBe(3);
            expect(mockRedis.scan).toHaveBeenCalledTimes(2);
            // Should strip the `imara:` prefix before del
            expect(mockRedis.del).toHaveBeenCalledWith(
                'tenant_sacco_1:reports:dash',
                'tenant_sacco_1:reports:kpis',
            );
            expect(mockRedis.del).toHaveBeenCalledWith(
                'tenant_sacco_1:reports:summary',
            );
        });

        it('should handle empty scan results', async () => {
            mockRedis.scan.mockResolvedValueOnce(['0', []]);
            const result = await cache.invalidateDomain('members');
            expect(result).toBe(0);
            expect(mockRedis.del).not.toHaveBeenCalled();
        });

        it('should return 0 on Redis error', async () => {
            mockRedis.scan.mockRejectedValue(new Error('SCAN failed'));
            const result = await cache.invalidateDomain('reports');
            expect(result).toBe(0);
        });
    });

    // ═══════════════════════════════════════════════════════════
    // invalidateTenant()
    // ═══════════════════════════════════════════════════════════

    describe('invalidateTenant', () => {
        it('should return 0 when Redis is unavailable', async () => {
            redisAvailable = false;
            const result = await cache.invalidateTenant();
            expect(result).toBe(0);
        });

        it('should scan and delete all tenant keys across domains', async () => {
            mockRedis.scan.mockResolvedValueOnce([
                '0',
                [
                    'imara:tenant_sacco_1:reports:dash',
                    'imara:tenant_sacco_1:members:list',
                    'imara:tenant_sacco_1:config:settings',
                ],
            ]);
            mockRedis.del.mockResolvedValue(3);

            const result = await cache.invalidateTenant();
            expect(result).toBe(3);
            expect(mockRedis.scan).toHaveBeenCalledWith(
                '0', 'MATCH', 'imara:tenant_sacco_1:*', 'COUNT', 100,
            );
        });

        it('should return 0 on Redis error', async () => {
            mockRedis.scan.mockRejectedValue(new Error('Connection lost'));
            const result = await cache.invalidateTenant();
            expect(result).toBe(0);
        });
    });
});

// ═══════════════════════════════════════════════════════════════
// Global Cache Helpers
// ═══════════════════════════════════════════════════════════════

describe('Global Cache Helpers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        redisAvailable = true;
    });

    describe('globalCacheGet', () => {
        it('should return null when Redis is unavailable', async () => {
            redisAvailable = false;
            const result = await globalCacheGet('tenants:all');
            expect(result).toBeNull();
        });

        it('should return null on cache miss', async () => {
            mockRedis.get.mockResolvedValue(null);
            const result = await globalCacheGet('tenants:all');
            expect(result).toBeNull();
            expect(mockRedis.get).toHaveBeenCalledWith('global:tenants:all');
        });

        it('should return parsed data on cache hit', async () => {
            const data = [{ id: '1', name: 'Test' }];
            mockRedis.get.mockResolvedValue(JSON.stringify(data));
            const result = await globalCacheGet('tenants:all');
            expect(result).toEqual(data);
        });

        it('should return null on error', async () => {
            mockRedis.get.mockRejectedValue(new Error('fail'));
            const result = await globalCacheGet('key');
            expect(result).toBeNull();
        });
    });

    describe('globalCacheSet', () => {
        it('should be a no-op when Redis is unavailable', async () => {
            redisAvailable = false;
            await globalCacheSet('key', 'value');
            expect(mockRedis.set).not.toHaveBeenCalled();
        });

        it('should set with default 300s TTL', async () => {
            mockRedis.set.mockResolvedValue('OK');
            await globalCacheSet('tenants:all', [1, 2]);
            expect(mockRedis.set).toHaveBeenCalledWith(
                'global:tenants:all',
                JSON.stringify([1, 2]),
                'EX',
                300,
            );
        });

        it('should set with custom TTL', async () => {
            mockRedis.set.mockResolvedValue('OK');
            await globalCacheSet('key', 'val', 60);
            expect(mockRedis.set).toHaveBeenCalledWith('global:key', '"val"', 'EX', 60);
        });

        it('should silently handle errors', async () => {
            mockRedis.set.mockRejectedValue(new Error('fail'));
            await expect(globalCacheSet('k', 'v')).resolves.toBeUndefined();
        });
    });

    describe('globalCacheInvalidate', () => {
        it('should be a no-op when Redis is unavailable', async () => {
            redisAvailable = false;
            await globalCacheInvalidate('key');
            expect(mockRedis.del).not.toHaveBeenCalled();
        });

        it('should delete the global key', async () => {
            mockRedis.del.mockResolvedValue(1);
            await globalCacheInvalidate('tenants:all');
            expect(mockRedis.del).toHaveBeenCalledWith('global:tenants:all');
        });

        it('should silently handle errors', async () => {
            mockRedis.del.mockRejectedValue(new Error('fail'));
            await expect(globalCacheInvalidate('k')).resolves.toBeUndefined();
        });
    });
});
