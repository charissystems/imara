/**
 * Centralized Redis Configuration
 *
 * Single connection factory used by:
 *  - Application cache (CacheService)
 *  - Job scheduler (BullMQ)
 *  - Password reset token store
 *
 * All consumers share connections where possible to reduce socket overhead.
 * The module is fault-tolerant — the app starts even if Redis is unavailable.
 */

import IORedis from 'ioredis';
import { appLogger } from '../middleware/logger';

// ────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────

export interface RedisConfig {
    host: string;
    port: number;
    password?: string;
    db: number;
    keyPrefix?: string;
    /** BullMQ requires `maxRetriesPerRequest: null` */
    maxRetriesPerRequest?: number | null;
    enableReadyCheck?: boolean;
    /** TLS configuration for encrypted connections */
    tls?: Record<string, unknown>;
}

function loadRedisConfig(): RedisConfig {
    return {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB ?? '0', 10),
        tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
    };
}

// ────────────────────────────────────────────────────────────
// Shared Connections
// ────────────────────────────────────────────────────────────

let _cacheClient: IORedis | null = null;
let _bullClient: IORedis | null = null;
let _available = true;

/**
 * Get the shared cache Redis client (lazy-initialized).
 * Used for application caching and token storage.
 */
export function getCacheRedis(): IORedis {
    if (!_cacheClient) {
        const cfg = loadRedisConfig();
        _cacheClient = new IORedis({
            ...cfg,
            keyPrefix: 'imara:',
            lazyConnect: true,
            retryStrategy: (times) => {
                if (times > 5) {
                    appLogger.warn('Redis cache: giving up reconnecting after 5 attempts');
                    _available = false;
                    return null;
                }
                return Math.min(times * 200, 3000);
            },
        });

        _cacheClient.on('error', (err) => {
            appLogger.error('Redis cache connection error', err);
        });
        _cacheClient.on('connect', () => {
            _available = true;
            appLogger.info('Redis cache connected');
        });

        // Non-blocking connect — failures are handled gracefully
        _cacheClient.connect().catch(() => {
            _available = false;
            appLogger.warn('Redis cache unavailable; caching disabled');
        });
    }

    return _cacheClient;
}

/**
 * Create a Redis client configured for BullMQ (requires `maxRetriesPerRequest: null`).
 * BullMQ needs its own connections (it opens subscriber + client internally).
 */
export function createBullRedisConnection(): IORedis {
    if (!_bullClient) {
        const cfg = loadRedisConfig();
        _bullClient = new IORedis({
            ...cfg,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
        });

        _bullClient.on('error', (err) => {
            appLogger.error('Redis BullMQ connection error', err);
        });
    }
    return _bullClient;
}

/**
 * Whether the cache Redis client is connected and operational.
 * Services should check this before blocking on cache operations.
 */
export function isRedisAvailable(): boolean {
    if (!_cacheClient) return false;
    return _available && _cacheClient.status === 'ready';
}

/**
 * Gracefully disconnect all Redis connections.
 * Called during server shutdown.
 */
export async function disconnectRedis(): Promise<void> {
    const tasks: Promise<void>[] = [];

    if (_cacheClient) {
        tasks.push(
            _cacheClient.quit().then(() => {
                _cacheClient = null;
            }).catch(() => {
                _cacheClient?.disconnect();
                _cacheClient = null;
            }),
        );
    }

    if (_bullClient) {
        tasks.push(
            _bullClient.quit().then(() => {
                _bullClient = null;
            }).catch(() => {
                _bullClient?.disconnect();
                _bullClient = null;
            }),
        );
    }

    await Promise.allSettled(tasks);
    appLogger.info('Redis connections closed');
}
