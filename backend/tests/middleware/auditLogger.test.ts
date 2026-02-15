// tests/middleware/auditLogger.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLogger, auditMiddleware } from '../../src/middleware/audit';

// ────────────────────────────────────────────────────────────
// Mock logger
// ────────────────────────────────────────────────────────────

vi.mock('../../src/middleware/logger', () => ({
    appLogger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import { appLogger } from '../../src/middleware/logger';

// ────────────────────────────────────────────────────────────
// Mock DB Builder
// ────────────────────────────────────────────────────────────

function createMockDb(overrides: Record<string, any> = {}) {
    const insertBuilder = {
        values: vi.fn().mockReturnValue({
            execute: vi.fn().mockResolvedValue(overrides.insertResult ?? []),
        }),
    };

    const selectBuilder = {
        selectAll: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(overrides.selectRows ?? []),
    };

    return {
        insertInto: vi.fn().mockReturnValue(insertBuilder),
        selectFrom: vi.fn().mockReturnValue(selectBuilder),
    } as any;
}

// ════════════════════════════════════════════════════════════
// AuditLogger Class
// ════════════════════════════════════════════════════════════

describe('AuditLogger', () => {
    let mockDb: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockDb = createMockDb();
    });

    // ─── log() ───────────────────────────────────────────────

    describe('log', () => {
        it('should log audit event to application logger', async () => {
            const logger = new AuditLogger(
                'tenant_sacco_1', 'tenant-1', 'user-1', 'admin@sacco.com',
            );

            await logger.log({
                tableName: 'members',
                recordId: 'member-123',
                operation: 'CREATE',
            });

            expect(appLogger.info).toHaveBeenCalledWith(
                'Audit event',
                expect.objectContaining({
                    schema: 'tenant_sacco_1',
                    tenant: 'tenant-1',
                    table: 'members',
                    operation: 'CREATE',
                    recordId: 'member-123',
                    userId: 'user-1',
                    userEmail: 'admin@sacco.com',
                }),
            );
        });

        it('should enrich with schema, tenant, and user context', async () => {
            const logger = new AuditLogger(
                'schema_test', 'tenant-99', 'user-5', 'test@example.com',
            );

            await logger.log({
                tableName: 'accounts',
                recordId: 'acc-1',
                operation: 'UPDATE',
                changes: { balance: { old: '100', new: '200' } },
            });

            expect(appLogger.info).toHaveBeenCalledWith(
                'Audit event',
                expect.objectContaining({
                    schema: 'schema_test',
                    tenant: 'tenant-99',
                    userId: 'user-5',
                    changes: { balance: { old: '100', new: '200' } },
                }),
            );
        });

        it('should include request context (IP, user agent)', async () => {
            const logger = new AuditLogger(
                'schema', 'tenant-1', 'user-1', 'a@b.com', undefined,
                { ip: '192.168.1.1', userAgent: 'Mozilla/5.0' },
            );

            await logger.log({
                tableName: 'loans',
                recordId: 'loan-1',
                operation: 'READ',
            });

            expect(appLogger.info).toHaveBeenCalled();
        });

        it('should persist to database when db is provided', async () => {
            const logger = new AuditLogger(
                'schema', 'tenant-1', 'user-1', 'a@b.com', mockDb,
            );

            await logger.log({
                tableName: 'members',
                recordId: 'member-1',
                operation: 'CREATE',
            });

            expect(mockDb.insertInto).toHaveBeenCalledWith('audit_logs');
        });

        it('should not persist when db is not provided', async () => {
            const logger = new AuditLogger(
                'schema', 'tenant-1', 'user-1', 'a@b.com',
            );

            await logger.log({
                tableName: 'members',
                recordId: 'member-1',
                operation: 'CREATE',
            });

            // No DB, so insertInto should not have been called
            expect(appLogger.info).toHaveBeenCalled();
        });

        it('should not throw on logging failure', async () => {
            const badDb = {
                insertInto: vi.fn().mockImplementation(() => {
                    throw new Error('DB crashed');
                }),
            } as any;

            const logger = new AuditLogger(
                'schema', 'tenant-1', 'user-1', 'a@b.com', badDb,
            );

            // Should not throw despite DB error
            await expect(
                logger.log({
                    tableName: 'loans',
                    recordId: 'loan-1',
                    operation: 'DELETE',
                })
            ).resolves.toBeUndefined();
        });

        it('should use provided userId/email over constructor defaults', async () => {
            const logger = new AuditLogger(
                'schema', 'tenant-1', 'default-user', 'default@email.com',
            );

            await logger.log({
                tableName: 'staff',
                recordId: 'staff-1',
                operation: 'UPDATE',
                userId: 'override-user',
                userEmail: 'override@email.com',
            });

            expect(appLogger.info).toHaveBeenCalledWith(
                'Audit event',
                expect.objectContaining({
                    userId: 'override-user',
                    userEmail: 'override@email.com',
                }),
            );
        });
    });

    // ─── logCreateRecord() ───────────────────────────────────

    describe('logCreateRecord', () => {
        it('should log CREATE operation with metadata', async () => {
            const logger = new AuditLogger(
                'schema', 'tenant-1', 'user-1', 'a@b.com',
            );

            await logger.logCreateRecord('members', 'member-1', {
                first_name: 'John',
                last_name: 'Doe',
            });

            expect(appLogger.info).toHaveBeenCalledWith(
                'Audit event',
                expect.objectContaining({
                    table: 'members',
                    operation: 'CREATE',
                    recordId: 'member-1',
                }),
            );
        });
    });

    // ─── logUpdateRecord() ───────────────────────────────────

    describe('logUpdateRecord', () => {
        it('should track only changed fields', async () => {
            const logger = new AuditLogger(
                'schema', 'tenant-1', 'user-1', 'a@b.com',
            );

            await logger.logUpdateRecord(
                'members',
                'member-1',
                { first_name: 'John', last_name: 'Doe', email: 'old@x.com' },
                { first_name: 'John', last_name: 'Doe', email: 'new@x.com' },
            );

            expect(appLogger.info).toHaveBeenCalledWith(
                'Audit event',
                expect.objectContaining({
                    operation: 'UPDATE',
                    changes: {
                        email: { old: 'old@x.com', new: 'new@x.com' },
                    },
                }),
            );
        });

        it('should skip logging when nothing changed', async () => {
            const logger = new AuditLogger(
                'schema', 'tenant-1', 'user-1', 'a@b.com',
            );

            await logger.logUpdateRecord(
                'members',
                'member-1',
                { name: 'John' },
                { name: 'John' },
            );

            // log() should not have been called since no changes
            expect(appLogger.info).not.toHaveBeenCalled();
        });

        it('should detect multiple changed fields', async () => {
            const logger = new AuditLogger(
                'schema', 'tenant-1', 'user-1', 'a@b.com',
            );

            await logger.logUpdateRecord(
                'accounts',
                'acc-1',
                { balance: '1000', status: 'active', name: 'Savings' },
                { balance: '2000', status: 'frozen', name: 'Savings' },
            );

            expect(appLogger.info).toHaveBeenCalledWith(
                'Audit event',
                expect.objectContaining({
                    changes: {
                        balance: { old: '1000', new: '2000' },
                        status: { old: 'active', new: 'frozen' },
                    },
                }),
            );
        });
    });

    // ─── logDeleteRecord() ───────────────────────────────────

    describe('logDeleteRecord', () => {
        it('should log DELETE operation', async () => {
            const logger = new AuditLogger(
                'schema', 'tenant-1', 'user-1', 'a@b.com',
            );

            await logger.logDeleteRecord('members', 'member-1', { reason: 'Requested by member' });

            expect(appLogger.info).toHaveBeenCalledWith(
                'Audit event',
                expect.objectContaining({
                    operation: 'DELETE',
                    recordId: 'member-1',
                }),
            );
        });
    });

    // ─── logReadRecord() ─────────────────────────────────────

    describe('logReadRecord', () => {
        it('should log READ operation for sensitive reads', async () => {
            const logger = new AuditLogger(
                'schema', 'tenant-1', 'user-1', 'a@b.com',
            );

            await logger.logReadRecord('members', 'member-1', { reason: 'KYC review' });

            expect(appLogger.info).toHaveBeenCalledWith(
                'Audit event',
                expect.objectContaining({
                    operation: 'READ',
                    recordId: 'member-1',
                }),
            );
        });
    });

    // ─── getRecordAuditHistory() ─────────────────────────────

    describe('getRecordAuditHistory', () => {
        it('should return empty array when no db', async () => {
            const logger = new AuditLogger(
                'schema', 'tenant-1', 'user-1', 'a@b.com',
            );

            const result = await logger.getRecordAuditHistory('members', 'member-1');
            expect(result).toEqual([]);
        });

        it('should query and parse audit logs', async () => {
            const dbRows = [
                {
                    schema_name: 'schema',
                    table_name: 'members',
                    record_id: 'member-1',
                    operation: 'CREATE',
                    user_id: 'user-1',
                    user_email: 'a@b.com',
                    changes: null,
                    metadata: JSON.stringify({ source: 'api' }),
                    created_at: '2026-01-15T10:00:00Z',
                },
                {
                    schema_name: 'schema',
                    table_name: 'members',
                    record_id: 'member-1',
                    operation: 'UPDATE',
                    user_id: 'user-2',
                    user_email: 'admin@b.com',
                    changes: JSON.stringify({ email: { old: 'a@b.com', new: 'c@d.com' } }),
                    metadata: null,
                    created_at: '2026-01-16T10:00:00Z',
                },
            ];

            const db = createMockDb({ selectRows: dbRows });
            const logger = new AuditLogger(
                'schema', 'tenant-1', 'user-1', 'a@b.com', db,
            );

            const result = await logger.getRecordAuditHistory('members', 'member-1');

            expect(result).toHaveLength(2);
            expect(result[0].operation).toBe('CREATE');
            expect(result[0].metadata).toEqual({ source: 'api' });
            expect(result[1].operation).toBe('UPDATE');
            expect(result[1].changes).toEqual({ email: { old: 'a@b.com', new: 'c@d.com' } });
        });

        it('should return empty array on query error', async () => {
            const db = {
                selectFrom: vi.fn().mockImplementation(() => {
                    throw new Error('Query failed');
                }),
            } as any;

            const logger = new AuditLogger(
                'schema', 'tenant-1', 'user-1', 'a@b.com', db,
            );

            const result = await logger.getRecordAuditHistory('members', 'member-1');
            expect(result).toEqual([]);
        });
    });

    // ─── getUserAuditLog() ───────────────────────────────────

    describe('getUserAuditLog', () => {
        it('should return empty array when no db', async () => {
            const logger = new AuditLogger(
                'schema', 'tenant-1', 'user-1', 'a@b.com',
            );

            const result = await logger.getUserAuditLog('user-1');
            expect(result).toEqual([]);
        });

        it('should query logs by user ID', async () => {
            const dbRows = [
                {
                    schema_name: 'schema',
                    table_name: 'loans',
                    record_id: 'loan-1',
                    operation: 'CREATE',
                    user_id: 'user-5',
                    changes: null,
                    created_at: '2026-02-01T10:00:00Z',
                },
            ];

            const db = createMockDb({ selectRows: dbRows });
            const logger = new AuditLogger(
                'schema', 'tenant-1', 'user-5', 'u5@b.com', db,
            );

            const result = await logger.getUserAuditLog('user-5', 50);
            expect(result).toHaveLength(1);
            expect(result[0].tableName).toBe('loans');
        });
    });

    // ─── getRecentAuditLogs() ────────────────────────────────

    describe('getRecentAuditLogs', () => {
        it('should return empty array when no db', async () => {
            const logger = new AuditLogger(
                'schema', 'tenant-1', 'user-1', 'a@b.com',
            );

            const result = await logger.getRecentAuditLogs(
                new Date('2026-01-01'),
                new Date('2026-02-01'),
            );
            expect(result).toEqual([]);
        });

        it('should query logs within date range', async () => {
            const dbRows = [
                {
                    schema_name: 'schema',
                    table_name: 'shares',
                    record_id: 'share-1',
                    operation: 'CREATE',
                    user_id: 'user-1',
                    changes: null,
                    created_at: '2026-01-15T10:00:00Z',
                },
            ];

            const db = createMockDb({ selectRows: dbRows });
            const logger = new AuditLogger(
                'schema', 'tenant-1', 'user-1', 'a@b.com', db,
            );

            const result = await logger.getRecentAuditLogs(
                new Date('2026-01-01'),
                new Date('2026-02-01'),
                100,
            );
            expect(result).toHaveLength(1);
            expect(result[0].operation).toBe('CREATE');
        });

        it('should return empty array on query error', async () => {
            const db = {
                selectFrom: vi.fn().mockImplementation(() => {
                    throw new Error('Timeout');
                }),
            } as any;

            const logger = new AuditLogger(
                'schema', 'tenant-1', 'user-1', 'a@b.com', db,
            );

            const result = await logger.getRecentAuditLogs(
                new Date('2026-01-01'),
                new Date('2026-02-01'),
            );
            expect(result).toEqual([]);
        });
    });
});

// ════════════════════════════════════════════════════════════
// auditMiddleware
// ════════════════════════════════════════════════════════════

describe('auditMiddleware', () => {
    it('should inject AuditLogger into context and call next', async () => {
        const store: Record<string, any> = {};
        const ctx = {
            get: vi.fn((key: string) => {
                if (key === 'tenant') return { id: 'tenant-1', schema_name: 'schema_test' };
                if (key === 'user') return { id: 'user-1', email: 'admin@test.com' };
                if (key === 'db') return {};
                return store[key];
            }),
            set: vi.fn((key: string, value: any) => { store[key] = value; }),
            req: {
                header: vi.fn((name: string) => {
                    if (name === 'x-forwarded-for') return '10.0.0.1';
                    if (name === 'user-agent') return 'TestAgent/1.0';
                    return undefined;
                }),
            },
        } as any;

        const next = vi.fn().mockResolvedValue(undefined);

        await auditMiddleware(ctx, next);

        expect(ctx.set).toHaveBeenCalledWith('auditLogger', expect.any(AuditLogger));
        expect(next).toHaveBeenCalled();
    });

    it('should use defaults when no tenant or user', async () => {
        const store: Record<string, any> = {};
        const ctx = {
            get: vi.fn(() => undefined),
            set: vi.fn((key: string, value: any) => { store[key] = value; }),
            req: {
                header: vi.fn(() => undefined),
            },
        } as any;

        const next = vi.fn().mockResolvedValue(undefined);

        await auditMiddleware(ctx, next);

        expect(ctx.set).toHaveBeenCalledWith('auditLogger', expect.any(AuditLogger));
        expect(next).toHaveBeenCalled();
    });
});
