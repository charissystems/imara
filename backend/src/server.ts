import { serve } from '@hono/node-server';
import 'dotenv/config';
import app from './index';
import { MigrationRunner } from './utils/migrationRunner';

const port = Number(process.env.PORT) || 3000;

async function startServer() {
    try {
        // Run public migrations on startup to ensure registry and tenant engine are set up
        console.log('🔧 Initializing database...');
        const migrationRunner = new MigrationRunner();
        await migrationRunner.runPublicMigrations();
        console.log('✅ Database initialization complete.\n');
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        console.error('DATABASE MUST BE SET UP BEFORE SERVER CAN RUN');
        process.exit(1);
    }

    console.log(`🚀 Server starting on http://localhost:${port}`);

    serve({
        fetch: app.fetch,
        port
    });
}

startServer().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
