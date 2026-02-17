import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { Kysely, PostgresDialect, LogEvent } from 'kysely';
import { Database, TenantDatabase } from '../database/types';

let _pool: Pool | null = null;

/**
 * Calculate optimal pool size based on environment
 * Default formula: min(50, floor(activeTenants / 2) + 10)
 */
function calculatePoolSize(): number {
    const envMax = process.env.DB_POOL_MAX
        ? parseInt(process.env.DB_POOL_MAX, 10)
        : undefined;

    if (envMax) {
        return Math.min(100, Math.max(5, envMax));
    }

    // Dynamic sizing: estimate based on environment
    const environment = process.env.NODE_ENV || 'development';
    const baseSize = environment === 'production' ? 30 : 20;

    // Allow override for testing or special scenarios
    const activeTenants = parseInt(process.env.ACTIVE_TENANTS || '1', 10);
    const calculatedSize = Math.min(50, Math.floor(activeTenants / 2) + baseSize);

    return calculatedSize;
}

export class DatabaseManager {
    private pool: Pool;
    public publicDb: Kysely<Database>;
    private tenantDbCache: Map<string, Kysely<TenantDatabase>> = new Map();

    constructor(config: {
        host: string;
        port: number;
        database: string;
        user: string;
        password: string;
    }) {
        if (!config.host || !config.database || !config.user) {
            throw new Error('Missing required database configuration');
        }

        const poolMax = calculatePoolSize();
        const idleTimeout = parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10);
        const connectionTimeout = parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '2000', 10);

        this.pool = new Pool({
            host: config.host,
            port: config.port,
            database: config.database,
            user: config.user,
            password: config.password,
            max: poolMax,
            idleTimeoutMillis: idleTimeout,
            connectionTimeoutMillis: connectionTimeout,
            // Enable connection statement timeout for safety
            statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10),
        });

        // LOGGING: Pool Errors (Network issues, idle timeouts)
        this.pool.on('error', (err) => {
            console.error('❌ [PG POOL ERROR]: Unexpected error on idle client', err);
        });

        // LOGGING: Client Notices (RAISE NOTICE, etc.)
        this.pool.on('connect', (client) => {
            client.on('notice', (msg) => {
                console.log(`ℹ️  [PG NOTICE]: [${msg.code}] ${msg.severity} - ${msg.message}`);
            });
        });

        // Log pool info on connect
        console.log(`📊 [DB POOL INITIALIZED]: max=${poolMax}, idle=${idleTimeout}ms, connection=${connectionTimeout}ms`);

        const kyselyLogger = (event: LogEvent) => {
            if (event.level === 'query') {
                console.log(`🔍 [KYSELY QUERY]: ${event.query.sql.replace(/\s+/g, ' ').trim()}`);
            }
        };

        const dialect = new PostgresDialect({ 
            pool: this.pool
        });

        this.publicDb = new Kysely<Database>({ dialect, log: kyselyLogger }).withSchema('public');
        _pool = this.pool;
    }

    /**
     * Get tenant database with caching
     * Reuses connections for the same schema
     */
    getTenantDb(schemaName: string): Kysely<TenantDatabase> {
        // Check cache first
        if (this.tenantDbCache.has(schemaName)) {
            return this.tenantDbCache.get(schemaName)!;
        }

        // Create new db instance for this schema
        const dialect = new PostgresDialect({ pool: this.pool });
        const db = new Kysely<TenantDatabase>({ dialect }).withSchema(schemaName);
        
        // Cache it
        this.tenantDbCache.set(schemaName, db);
        return db;
    }

    /**
     * Clear tenant database cache
     */
    clearTenantDbCache(schemaName?: string): void {
        if (schemaName) {
            this.tenantDbCache.delete(schemaName);
        } else {
            this.tenantDbCache.clear();
        }
    }

    /**
     * Execute raw SQL query with proper search_path isolation.
     * Resets search_path before releasing the connection back to the pool.
     */
    async executeRaw<T extends QueryResultRow = any>(
        schemaName: string | 'public',
        queryText: string,
        parameters?: any[]
    ): Promise<QueryResult<T>> {
        const client = await this.pool.connect();
        try {
            if (schemaName !== 'public') {
                // SET does not support parameterised values; validate the
                // identifier to prevent SQL injection then interpolate it.
                const safeName = schemaName.replace(/[^a-zA-Z0-9_]/g, '');
                await client.query(`SET search_path TO "${safeName}", public`);
            }
            const result = await client.query(queryText, parameters);
            console.log(`📄 [RAW SQL]: ${result.rowCount} rows affected`);
            return result;
        } finally {
            // Always reset search_path before releasing to prevent cross-tenant leakage
            try {
                await client.query('RESET search_path');
                await client.query('RESET ROLE');
            } catch {
                // Swallow reset errors — connection may be broken
            }
            client.release();
        }
    }

    /**
     * Borrow a pool connection with tenant role + search_path activated.
     *
     * Sets:
     *  - `SET ROLE <schema>_role`  (PG enforces permissions for that role)
     *  - `SET search_path TO "<schema>", public`
     *  - `SET app.current_tenant = '<schema>'`  (visible to RLS policies)
     *
     * The callback receives the `PoolClient`; on return (or throw) the session
     * is reset (`RESET ROLE; RESET search_path; RESET app.current_tenant`) and
     * the connection is released back to the pool.
     */
    async withSecureTenantConnection<T>(
        schemaName: string,
        callback: (client: PoolClient) => Promise<T>,
    ): Promise<T> {
        const safeName = schemaName.replace(/[^a-zA-Z0-9_]/g, '');
        const roleName = `${safeName}_role`;
        const client = await this.pool.connect();

        try {
            // Set tenant role (DB-level permission guard)
            await client.query(`SET ROLE "${roleName}"`);
            // Pin search_path so unqualified table names resolve to this tenant
            await client.query(`SET search_path TO "${safeName}", public`);
            // Application-level variable readable by RLS policies via current_setting()
            await client.query(`SET app.current_tenant = '${safeName}'`);

            return await callback(client);
        } finally {
            try {
                await client.query('RESET ROLE');
                await client.query('RESET search_path');
                await client.query("SET app.current_tenant = ''");
            } catch {
                // Connection may be broken; nothing more we can do
            }
            client.release();
        }
    }

    /**
     * Get connection pool statistics for monitoring
     */
    getPoolStats() {
        return {
            totalConnections: this.pool.totalCount,
            idleConnections: this.pool.idleCount,
            activeConnections: this.pool.totalCount - this.pool.idleCount,
            waitingRequests: this.pool.waitingCount || 0,
            cachedTenantDbs: this.tenantDbCache.size,
        };
    }

    /**
     * Monitor pool health
     */
    async healthCheck(): Promise<boolean> {
        try {
            await this.pool.query('SELECT 1');
            return true;
        } catch (e) {
            console.error('❌ [DB HEALTH CHECK] Failed', e);
            return false;
        }
    }

    /**
     * Close all connections
     */
    async disconnect(): Promise<void> {
        // Clear cache
        this.tenantDbCache.clear();
        
        // Close pool
        if (this.pool) {
            await this.pool.end();
            console.log('🔌 [DB POOL]: Disconnected');
        }
    }
}

export const dbManager = new DatabaseManager({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || (() => { throw new Error('DB_NAME environment variable is required'); })(),
    user: process.env.DB_USER || (() => { throw new Error('DB_USER environment variable is required'); })(),
    password: process.env.DB_PASSWORD || (() => { throw new Error('DB_PASSWORD environment variable is required'); })(),
});

export const publicDb = dbManager.publicDb;

/**
 * Get raw pool for direct SQL execution (e.g., migrations, functions)
 */
export function getPool() {
    return (dbManager as any).pool;
}

/**
 * Get tenant database connection
 */
export const getTenantDb = (schemaName: string) => dbManager.getTenantDb(schemaName);

/**
 * Clear tenant database cache
 */
export const clearTenantDbCache = (schemaName?: string) => dbManager.clearTenantDbCache(schemaName);
