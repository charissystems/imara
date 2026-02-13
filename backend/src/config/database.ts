import { Pool, QueryResult } from 'pg';
import { Kysely, PostgresDialect, LogEvent } from 'kysely';
import { Database, TenantDatabase } from '../database/types';

let _pool: Pool | null = null;

export class DatabaseManager {
    private pool: Pool;
    public publicDb: Kysely<Database>;

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

        this.pool = new Pool({
            host: config.host,
            port: config.port,
            database: config.database,
            user: config.user,
            password: config.password,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
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

    getTenantDb(schemaName: string): Kysely<TenantDatabase> {
        const dialect = new PostgresDialect({ pool: this.pool });
        return new Kysely<TenantDatabase>({ dialect }).withSchema(schemaName);
    }

    async executeRaw<T = any>(
        schemaName: string | 'public',
        queryText: string,
        parameters?: any[]
    ): Promise<QueryResult<T>> {
        const client = await this.pool.connect();
        try {
            await client.query('SET search_path TO $1, public', [schemaName]);
            const result = await client.query(queryText, parameters);
            console.log(`📄 [RAW SQL RESULT]: ${result.rowCount} rows affected`);
            return result;
        } finally {
            client.release();
        }
    }

    async disconnect(): Promise<void> {
        if (_pool) {
            await _pool.end();
            _pool = null;
            console.log('🔌 [DB POOL]: Disconnected');
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            await this.pool.query('SELECT 1');
            return true;
        } catch (e) {
            console.error('❌ [DB HEALTH CHECK] Failed', e);
            return false;
        }
    }
}

export const dbManager = new DatabaseManager({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
});

export const publicDb = dbManager.publicDb;

// Get raw pool for direct SQL execution (e.g., migrations, functions)
export function getPool() {
    return dbManager['pool'];
}

// Shorthand for common usage
export const pool = getPool();

export const getTenantDb = (schemaName: string) => dbManager.getTenantDb(schemaName);
