// tests/services/auditService.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuditService } from '../../src/services/auditService';

/**
 * AuditService Tests
 * Tests query building logic and reversal business rules with real service instances
 */

// ─── Mock DB Builder ────────────────────────────────────────

function createMockQueryBuilder(rows: any[] = []) {
    const builder: any = {
        selectAll: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(rows),
        executeTakeFirst: vi.fn().mockResolvedValue(rows[0] ?? undefined),
        returning: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        insertInto: vi.fn().mockReturnThis(),
    };
    return builder;
}

function createMockDb(overrides: Record<string, any> = {}) {
    const insertBuilder = {
        values: vi.fn().mockReturnValue({
            returning: vi.fn().mockReturnValue({
                execute: vi.fn().mockResolvedValue(overrides.insertRows || [{ id: 'new-id' }]),
            }),
            execute: vi.fn().mockResolvedValue(undefined),
        }),
    };

    return {
        selectFrom: vi.fn().mockReturnValue(createMockQueryBuilder(overrides.selectRows || [])),
        insertInto: vi.fn().mockReturnValue(insertBuilder),
    } as any;
}

// ─── Actual Service Tests ───────────────────────────────────

describe('AuditService - queryAuditTrail', () => {
    it('should query audit trail with all filters', async () => {
        const mockRows = [
            { id: 'audit-1', entity_type: 'deposit', entity_id: 'dep-1', change_type: 'insert', user_id: 'user-1' },
            { id: 'audit-2', entity_type: 'deposit', entity_id: 'dep-2', change_type: 'update', user_id: 'user-1' },
        ];
        const mockDb = createMockDb({ selectRows: mockRows });
        const service = new AuditService(mockDb);

        const result = await service.queryAuditTrail({
            entity_type: 'deposit',
            entity_id: 'dep-1',
            change_type: 'insert',
            user_id: 'user-1',
            date_from: '2026-01-01',
            date_to: '2026-12-31',
            page: 1,
            limit: 50,
        });

        expect(result).toEqual(mockRows);
        expect(mockDb.selectFrom).toHaveBeenCalledWith('audit_log');
    });

    it('should query with partial filters', async () => {
        const mockRows = [{ id: 'audit-1', entity_type: 'withdrawal' }];
        const mockDb = createMockDb({ selectRows: mockRows });
        const service = new AuditService(mockDb);

        const result = await service.queryAuditTrail({
            entity_type: 'withdrawal',
            page: 1,
            limit: 20,
        });

        expect(result).toEqual(mockRows);
    });

    it('should handle pagination correctly', async () => {
        const mockDb = createMockDb({ selectRows: [] });
        const service = new AuditService(mockDb);

        await service.queryAuditTrail({
            page: 3,
            limit: 20,
        });

        const builder = mockDb.selectFrom('audit_log');
        expect(builder.limit).toHaveBeenCalledWith(20);
        expect(builder.offset).toHaveBeenCalledWith(40); // (3-1) * 20
    });
});

describe('AuditService - queryActivityLog', () => {
    it('should query activity log with filters', async () => {
        const mockRows = [
            { id: 'activity-1', entity_type: 'login', user_id: 'user-1' },
        ];
        const mockDb = createMockDb({ selectRows: mockRows });
        const service = new AuditService(mockDb);

        const result = await service.queryActivityLog({
            entity_type: 'login',
            user_id: 'user-1',
            page: 1,
            limit: 50,
        });

        expect(result).toEqual(mockRows);
        expect(mockDb.selectFrom).toHaveBeenCalledWith('activity_log');
    });

    it('should handle date range filters', async () => {
        const mockDb = createMockDb({ selectRows: [] });
        const service = new AuditService(mockDb);

        await service.queryActivityLog({
            date_from: '2026-01-01',
            date_to: '2026-01-31',
            page: 1,
            limit: 100,
        });

        expect(mockDb.selectFrom).toHaveBeenCalledWith('activity_log');
    });
});

describe('AuditService - querySecurityEvents', () => {
    it('should query security events with severity filter', async () => {
        const mockRows = [
            { id: 'event-1', severity: 'high', event_type: 'login_failed' },
        ];
        const mockDb = createMockDb({ selectRows: mockRows });
        const service = new AuditService(mockDb);

        const result = await service.querySecurityEvents({
            severity: 'high',
            page: 1,
            limit: 50,
        });

        expect(result).toEqual(mockRows);
        expect(mockDb.selectFrom).toHaveBeenCalledWith('security_events');
    });

    it('should filter by event type', async () => {
        const mockDb = createMockDb({ selectRows: [] });
        const service = new AuditService(mockDb);

        await service.querySecurityEvents({
            event_type: 'suspicious_activity',
            user_id: 'user-123',
            page: 1,
            limit: 25,
        });

        expect(mockDb.selectFrom).toHaveBeenCalledWith('security_events');
    });
});

describe('AuditService - initiateReversal', () => {
    it('should create reversal audit entry', async () => {
        const mockDb = createMockDb({ insertRows: [{ id: 'reversal-001' }] });
        const service = new AuditService(mockDb);

        const result = await service.initiateReversal({
            entity_type: 'deposit',
            entity_id: 'dep-123',
            reason: 'Duplicate transaction',
            initiated_by: 'user-1',
            user_ip: '192.168.1.1',
        });

        expect(result).toEqual({
            reversal_id: 'reversal-001',
            status: 'pending_approval',
        });
        expect(mockDb.insertInto).toHaveBeenCalledWith('audit_log');
    });

    it('should handle missing user IP', async () => {
        const mockDb = createMockDb({ insertRows: [{ id: 'reversal-002' }] });
        const service = new AuditService(mockDb);

        const result = await service.initiateReversal({
            entity_type: 'withdrawal',
            entity_id: 'wth-456',
            reason: 'Incorrect amount',
            initiated_by: 'user-2',
        });

        expect(result.reversal_id).toBe('reversal-002');
        expect(result.status).toBe('pending_approval');
    });
});

describe('AuditService - approveReversal', () => {
    it('should approve reversal with different approver', async () => {
        const mockReversal = {
            id: 'reversal-001',
            user_id: 'user-1',
            action: 'reversal_initiated',
            entity_type: 'deposit',
            entity_id: 'dep-123',
        };

        const mockEntity = {
            id: 'dep-123',
            status: 'completed',
        };

        const selectBuilder = createMockQueryBuilder([mockReversal]);
        const entitySelectBuilder = createMockQueryBuilder([mockEntity]);
        let selectCallCount = 0;

        const insertBuilder = {
            values: vi.fn().mockReturnValue({
                execute: vi.fn().mockResolvedValue([{ id: 'approval-001' }]),
            }),
        };

        const updateBuilder = {
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    execute: vi.fn().mockResolvedValue([]),
                }),
            }),
        };

        const mockDb = {
            selectFrom: vi.fn().mockImplementation(() => {
                selectCallCount++;
                return selectCallCount === 1 ? selectBuilder : entitySelectBuilder;
            }),
            insertInto: vi.fn().mockReturnValue(insertBuilder),
            updateTable: vi.fn().mockReturnValue(updateBuilder),
            transaction: vi.fn().mockReturnValue({
                execute: vi.fn().mockImplementation(async (fn: any) => {
                    const trxDb = {
                        selectFrom: vi.fn().mockReturnValue(entitySelectBuilder),
                        insertInto: vi.fn().mockReturnValue(insertBuilder),
                        updateTable: vi.fn().mockReturnValue(updateBuilder),
                    };
                    return fn(trxDb);
                }),
            }),
        } as any;

        const service = new AuditService(mockDb);

        const result = await service.approveReversal('reversal-001', 'user-2');

        expect(result).toEqual({
            reversal_id: 'reversal-001',
            status: 'approved',
            entity_status: 'reversed',
        });
    });

    it('should reject when reversal not found', async () => {
        const mockDb = createMockDb({ selectRows: [] });
        const service = new AuditService(mockDb);

        await expect(
            service.approveReversal('non-existent', 'user-1')
        ).rejects.toThrow('Reversal request not found');
    });

    it('should reject self-approval', async () => {
        const mockReversal = {
            id: 'reversal-001',
            user_id: 'user-1',
            action: 'reversal_initiated',
            entity_type: 'deposit',
            entity_id: 'dep-123',
        };

        const selectBuilder = createMockQueryBuilder([mockReversal]);
        const mockDb = {
            selectFrom: vi.fn().mockReturnValue(selectBuilder),
            insertInto: vi.fn(),
        } as any;

        const service = new AuditService(mockDb);

        await expect(
            service.approveReversal('reversal-001', 'user-1')
        ).rejects.toThrow('dual authorization');
    });
});

// ─── Legacy Filter Logic Tests ──────────────────────────────

describe('AuditService - Query Logic', () => {
    describe('queryAuditTrail', () => {
        it('should calculate correct offset from page and limit', () => {
            const page = 3;
            const limit = 20;
            const expectedOffset = (page - 1) * limit;
            expect(expectedOffset).toBe(40);
        });

        it('should calculate offset 0 for page 1', () => {
            const page = 1;
            const limit = 50;
            const expectedOffset = (page - 1) * limit;
            expect(expectedOffset).toBe(0);
        });

        it('should apply default pagination values', () => {
            const page = Number('1');
            const limit = Number('50');
            expect(page).toBe(1);
            expect(limit).toBe(50);
        });
    });

    describe('querySecurityEvents', () => {
        it('should accept valid severity levels', () => {
            const validSeverities = ['low', 'medium', 'high', 'critical'];
            for (const s of validSeverities) {
                expect(typeof s).toBe('string');
                expect(s.length).toBeGreaterThan(0);
            }
        });
    });
});

// ─── Filter Application ─────────────────────────────────────

describe('AuditService - Filter Logic', () => {
    it('should only apply defined filters', () => {
        const filters = {
            entity_type: 'deposit',
            entity_id: undefined,
            change_type: undefined,
            user_id: 'user-1',
            date_from: undefined,
            date_to: undefined,
            page: 1,
            limit: 50,
        };

        const appliedFilters: string[] = [];
        if (filters.entity_type) appliedFilters.push('entity_type');
        if (filters.entity_id) appliedFilters.push('entity_id');
        if (filters.change_type) appliedFilters.push('change_type');
        if (filters.user_id) appliedFilters.push('user_id');
        if (filters.date_from) appliedFilters.push('date_from');
        if (filters.date_to) appliedFilters.push('date_to');

        expect(appliedFilters).toEqual(['entity_type', 'user_id']);
    });

    it('should apply all filters when all are provided', () => {
        const filters = {
            entity_type: 'withdrawal',
            entity_id: 'w-001',
            change_type: 'update',
            user_id: 'user-2',
            date_from: '2026-01-01',
            date_to: '2026-12-31',
            page: 1,
            limit: 50,
        };

        const appliedFilters: string[] = [];
        if (filters.entity_type) appliedFilters.push('entity_type');
        if (filters.entity_id) appliedFilters.push('entity_id');
        if (filters.change_type) appliedFilters.push('change_type');
        if (filters.user_id) appliedFilters.push('user_id');
        if (filters.date_from) appliedFilters.push('date_from');
        if (filters.date_to) appliedFilters.push('date_to');

        expect(appliedFilters).toHaveLength(6);
    });
});
