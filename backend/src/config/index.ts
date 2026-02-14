/**
 * Configuration layer for the SACCO backend
 * Exports database manager, multitenancy config, and app initialization utilities
 */

export { dbManager, publicDb, getTenantDb, clearTenantDbCache, getPool } from './database';
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

    console.log('✅ [CONFIG] All required environment variables present');

    // Validate JWT secrets have minimum length
    if ((process.env.JWT_SECRET || '').length < 32) {
        console.warn('⚠️  JWT_SECRET is less than 32 characters; should be longer for security');
    }

    if ((process.env.REFRESH_TOKEN_SECRET || '').length < 32) {
        console.warn('⚠️  REFRESH_TOKEN_SECRET is less than 32 characters; should be longer for security');
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
export { MultitenancyConfig, TenantTier, TenantStatus, type MultitenancyConfigAPI } from './multitenancy';
