/**
 * Global test setup – runs before every test file.
 *
 * Responsibilities:
 *   1. Ensure .env is loaded (vitest.config.ts handles this via dotenv).
 *   2. Suppress noisy console output from DatabaseManager and Kysely during tests.
 */

// Suppress pool / Kysely query logs during test runs
const originalLog = console.log;
const originalError = console.error;

console.log = (...args: unknown[]) => {
    const first = typeof args[0] === 'string' ? args[0] : '';
    if (
        first.includes('[PG POOL') ||
        first.includes('[KYSELY') ||
        first.includes('[DB POOL') ||
        first.includes('[RAW SQL') ||
        first.includes('[PG NOTICE')
    ) {
        return; // swallow pool / query chatter
    }
    originalLog(...args);
};

console.error = (...args: unknown[]) => {
    const first = typeof args[0] === 'string' ? args[0] : '';
    if (first.includes('[PG POOL ERROR]')) {
        return; // swallow idle-client errors during teardown
    }
    originalError(...args);
};
