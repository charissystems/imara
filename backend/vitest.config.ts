import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env before tests run so DatabaseManager picks up real credentials
config({ path: resolve(__dirname, '.env') });

export default defineConfig({
    test: {
        globals: false,
        environment: 'node',
        testTimeout: 15_000,
        hookTimeout: 15_000,
        pool: 'forks',
        // Run files sequentially to avoid DB conflicts between integration tests
        fileParallelism: false,
        // Setup files run before each test file
        setupFiles: ['./tests/setup.ts'],
    },
});
