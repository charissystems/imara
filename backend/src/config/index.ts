/**
 * Configuration layer for the SACCO backend
 * Exports database manager, multitenancy config, and app initialization utilities
 */

export { dbManager, publicDb, getTenantDb, clearTenantDbCache, getPool } from './database';
export { getCacheRedis, createBullRedisConnection, isRedisAvailable, disconnectRedis } from './redis';
export type { RedisConfig } from './redis';
export * from './multitenancy';

/**
 * Application initialization context
 * Validates all required environment variables and initializes managers
 */
export async function initializeApp() {
    const missingEnvs: string[] = [];

    const requiredEnvs = [
        'DB_HOST',
        'DB_PORT',
        'DB_USER',
        'DB_PASSWORD',
        'DB_NAME',
        'JWT_SECRET',
        'REFRESH_TOKEN_SECRET',
    ];

    for (const env of requiredEnvs) {
        if (!process.env[env]) {
            missingEnvs.push(env);
        }
    }

    if (missingEnvs.length > 0) {
        throw new Error(`Missing required environment variables: ${missingEnvs.join(', ')}`);
    }

    console.log('🟢 [INFO] [CONFIG] All required environment variables present');

    // Validate JWT secrets have minimum length
    if ((process.env.JWT_SECRET || '').length < 32) {
        console.warn('🟡 [WARN] JWT_SECRET is less than 32 characters; should be longer for security');
    }

    if ((process.env.REFRESH_TOKEN_SECRET || '').length < 32) {
        console.warn('🟡 [WARN] REFRESH_TOKEN_SECRET is less than 32 characters; should be longer for security');
    }

    // Validate ADMIN_SECRET_KEY if set
    const adminSecretKey = process.env.ADMIN_SECRET_KEY || '';
    if (adminSecretKey && adminSecretKey.length < 32) {
        console.warn('🟡 [WARN] ADMIN_SECRET_KEY is less than 32 characters; should be longer for security');
    }
    if (!adminSecretKey) {
        console.warn('🟡 [WARN] ADMIN_SECRET_KEY is not set; super-admin endpoints will be inaccessible');
    }

    // Warn about CORS in production
    if ((process.env.NODE_ENV || '') === 'production' && !process.env.ALLOWED_ORIGINS) {
        console.warn('🟡 [WARN] ALLOWED_ORIGINS is not set in production; all browser CORS requests will be rejected');
    }

    return {
        environment: process.env.NODE_ENV || 'development',
        port: parseInt(process.env.PORT || '3000', 10),
        jwtSecret: process.env.JWT_SECRET!,
        refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET!,
    };
}

/**
 * Get multitenancy configuration
 * Call this to access subscription tiers, validate tenant configs, etc.
 */
export { MultitenancyConfig, type TenantTier, type TenantStatus, type MultitenancyConfigAPI } from './multitenancy';
