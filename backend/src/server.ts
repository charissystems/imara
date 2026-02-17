import { serve } from '@hono/node-server';
import 'dotenv/config';
import app from './index';
import { MigrationRunner } from './utils/migrationRunner';
import { startJobScheduler, stopJobScheduler } from './jobs/scheduler';
import { getCacheRedis, disconnectRedis } from './config/redis';

const port = Number(process.env.PORT) || 3000;
const enableScheduler = process.env.ENABLE_JOB_SCHEDULER !== 'false';

async function startServer() {
    try {
        // Run public migrations on startup to ensure registry and tenant engine are set up
        console.log('🔵 [INFO] Initializing database...');
        const migrationRunner = new MigrationRunner();
        await migrationRunner.runPublicMigrations();
        console.log('🔵 [INFO] Database initialization complete.\n');
    } catch (error) {
        console.error('🔴 [ERROR] Failed to initialize database:', error);
        console.error('DATABASE MUST BE SET UP BEFORE SERVER CAN RUN');
        process.exit(1);
    }

    // Start job scheduler if enabled and Redis is available
    if (enableScheduler) {
        try {
            await startJobScheduler();
            console.log('🔵 [INFO] Job scheduler started');
        } catch (error) {
            console.warn('🟡 [WARN]  Job scheduler failed to start (Redis may be unavailable):', (error as Error).message);
            console.warn('   Jobs can be triggered manually via the admin API.');
        }
    }

    // Eagerly initialize cache Redis connection (non-blocking)
    try {
        getCacheRedis();
        console.log('🔵 [INFO]  Redis cache initializing...');
    } catch {
        console.warn('🟡 [WARN]  Redis cache unavailable; application caching disabled');
    }

    console.log(`🔵 [INFO] Server starting on http://localhost:${port}`);

    serve({
        fetch: app.fetch,
        port
    });
}

startServer().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});

// Graceful shutdown
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
        console.log(`\n${signal} received. Shutting down gracefully...`);
        try {
            await stopJobScheduler();
        } catch {
            // Ignore shutdown errors
        }
        try {
            await disconnectRedis();
        } catch {
            // Ignore shutdown errors
        }
        process.exit(0);
    });
}
