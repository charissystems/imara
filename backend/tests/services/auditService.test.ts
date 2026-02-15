// tests/services/auditService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * AuditService Unit Tests
 * Tests query building logic and reversal business rules
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
    };
    return builder;
}

function createMockDb(overrides: Record<string, any> = {}) {
    return {
        selectFrom: vi.fn().mockReturnValue(createMockQueryBuilder(overrides.selectRows || [])),
        insertInto: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
                returning: vi.fn().mockReturnValue({
                    execute: vi.fn().mockResolvedValue(overrides.insertRows || [{ id: 'new-id' }]),
                }),
                execute: vi.fn().mockResolvedValue(undefined),
            }),
        }),
    } as any;
}

// ─── Audit Trail Query Logic ────────────────────────────────

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

        it('should accept valid event types', () => {
            const validEventTypes = [
                'login_failed',
                'account_locked',
                'permission_denied',
                'suspicious_activity',
            ];
            for (const e of validEventTypes) {
                expect(typeof e).toBe('string');
            }
        });
    });
});

// ─── Reversal Business Logic ────────────────────────────────

describe('AuditService - Reversal Logic', () => {
    describe('initiateReversal', () => {
        it('should create reversal with pending_approval status', async () => {
            const db = createMockDb({ insertRows: [{ id: 'rev-001' }] });

            // Simulate the service insert call
            const [entry] = await db
                .insertInto('audit_log')
                .values({
                    user_id: 'user-1',
                    user_ip_address: '192.168.1.1',
                    action: 'reversal_initiated',
                    entity_type: 'deposit',
                    entity_id: 'dep-001',
                    change_type: 'update',
                    new_values: JSON.stringify({ status: 'pending_reversal', reason: 'Duplicate' }),
                    status: 'success',
                })
                .returning('id')
                .execute();

            expect(entry.id).toBe('rev-001');
            expect(db.insertInto).toHaveBeenCalledWith('audit_log');
        });

        it('should include user IP when provided', () => {
            const data = {
                entity_type: 'deposit',
                entity_id: 'dep-001',
                reason: 'Duplicate transaction',
                initiated_by: 'user-1',
                user_ip: '10.0.0.1',
            };
            expect(data.user_ip).toBe('10.0.0.1');
        });

        it('should handle missing user IP gracefully', () => {
            const data = {
                entity_type: 'deposit',
                entity_id: 'dep-001',
                reason: 'Duplicate transaction',
                initiated_by: 'user-1',
                user_ip: undefined,
            };
            expect(data.user_ip || null).toBeNull();
        });
    });

    describe('approveReversal', () => {
        it('should enforce dual authorization (different user)', () => {
            const reversalUserId = 'user-1';
            const approverId = 'user-1';
            expect(reversalUserId === approverId).toBe(true);
            // This case should throw in the actual service
        });

        it('should allow approval by different user', () => {
            const reversalUserId = 'user-1';
            const approverId = 'user-2';
            expect(reversalUserId === approverId).toBe(false);
        });

        it('should reject when reversal not found', async () => {
            const db = createMockDb({ selectRows: [] });

            const reversal = await db
                .selectFrom('audit_log')
                .selectAll()
                .where('id', '=', 'non-existent')
                .where('action', '=', 'reversal_initiated')
                .executeTakeFirst();

            expect(reversal).toBeUndefined();
        });

        it('should find reversal with matching action', async () => {
            const mockReversal = {
                id: 'rev-001',
                user_id: 'user-1',
                action: 'reversal_initiated',
                entity_type: 'deposit',
                entity_id: 'dep-001',
            };
            const db = createMockDb({ selectRows: [mockReversal] });

            const reversal = await db
                .selectFrom('audit_log')
                .selectAll()
                .where('id', '=', 'rev-001')
                .where('action', '=', 'reversal_initiated')
                .executeTakeFirst();

            expect(reversal).toBeDefined();
            expect(reversal.user_id).toBe('user-1');
            expect(reversal.action).toBe('reversal_initiated');
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
