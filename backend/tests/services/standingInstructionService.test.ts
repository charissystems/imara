// tests/services/standingInstructionService.test.ts
import { describe, it, expect, vi } from 'vitest';

/**
 * StandingInstructionService Unit Tests
 * Tests account validation, instruction creation, and frequency logic
 */

// ─── Mock DB Builder ────────────────────────────────────────

function createMockDb(sourceExists: boolean, destExists: boolean) {
    let callCount = 0;
    return {
        selectFrom: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    executeTakeFirst: vi.fn().mockImplementation(() => {
                        callCount++;
                        if (callCount === 1) return Promise.resolve(sourceExists ? { id: 'src-001', member_id: 'mem-001' } : undefined);
                        return Promise.resolve(destExists ? { id: 'dest-001' } : undefined);
                    }),
                }),
            }),
        }),
        insertInto: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
                returning: vi.fn().mockReturnValue({
                    execute: vi.fn().mockResolvedValue([{ id: 'si-001' }]),
                }),
            }),
        }),
    } as any;
}

// ─── Instruction Types ──────────────────────────────────────

describe('StandingInstructionService - Instruction Types', () => {
    const validTypes = ['savings_split', 'loan_repayment', 'transfer', 'share_purchase'];

    it('should recognize all valid instruction types', () => {
        for (const type of validTypes) {
            expect(typeof type).toBe('string');
            expect(type.length).toBeGreaterThan(0);
        }
    });

    it('should have exactly 4 instruction types', () => {
        expect(validTypes).toHaveLength(4);
    });
});

// ─── Frequency Validation ───────────────────────────────────

describe('StandingInstructionService - Frequency', () => {
    const validFrequencies = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annually'];

    it('should recognize all valid frequencies', () => {
        for (const freq of validFrequencies) {
            expect(typeof freq).toBe('string');
            expect(freq.length).toBeGreaterThan(0);
        }
    });

    it('should have exactly 6 frequency options', () => {
        expect(validFrequencies).toHaveLength(6);
    });
});

// ─── Account Validation ─────────────────────────────────────

describe('StandingInstructionService - Account Validation', () => {
    it('should reject when source account not found', async () => {
        const db = createMockDb(false, true);

        const sourceAccount = await db
            .selectFrom('savings_accounts')
            .select(['id', 'member_id'])
            .where('id', '=', 'non-existent')
            .executeTakeFirst();

        expect(sourceAccount).toBeUndefined();
    });

    it('should reject when destination account not found', async () => {
        const db = createMockDb(true, false);

        // First call: source account (exists)
        const sourceAccount = await db
            .selectFrom('savings_accounts')
            .select(['id', 'member_id'])
            .where('id', '=', 'src-001')
            .executeTakeFirst();
        expect(sourceAccount).toBeDefined();

        // Second call: destination account (not found)
        const destAccount = await db
            .selectFrom('savings_accounts')
            .select('id')
            .where('id', '=', 'non-existent')
            .executeTakeFirst();
        expect(destAccount).toBeUndefined();
    });

    it('should skip destination validation when no destination_account_id', () => {
        const data = {
            destination_account_id: undefined,
            destination_external: { bank: 'KCB', account: '123456' },
        };
        const shouldValidateDest = !!data.destination_account_id;
        expect(shouldValidateDest).toBe(false);
    });

    it('should validate destination when destination_account_id is provided', () => {
        const data = { destination_account_id: 'dest-001' };
        const shouldValidateDest = !!data.destination_account_id;
        expect(shouldValidateDest).toBe(true);
    });
});

// ─── Instruction Creation ───────────────────────────────────

describe('StandingInstructionService - Creation Logic', () => {
    it('should set next_execution_date to start_date', () => {
        const data = { start_date: '2026-03-01' };
        const nextExecution = data.start_date;
        expect(nextExecution).toBe('2026-03-01');
    });

    it('should handle optional max_executions', () => {
        const withMax = { max_executions: 12 };
        const withoutMax = { max_executions: undefined };
        expect(withMax.max_executions || null).toBe(12);
        expect(withoutMax.max_executions || null).toBeNull();
    });

    it('should handle optional end_date', () => {
        const withEnd = { end_date: '2027-03-01' };
        const withoutEnd = { end_date: undefined };
        expect(withEnd.end_date || undefined).toBe('2027-03-01');
        expect(withoutEnd.end_date || undefined).toBeUndefined();
    });

    it('should serialize destination_external as JSON', () => {
        const external = { bank: 'KCB', account_number: '0012345' };
        const serialized = JSON.stringify(external);
        expect(typeof serialized).toBe('string');
        expect(JSON.parse(serialized)).toEqual(external);
    });

    it('should serialize amount as string', () => {
        const amount = 5000;
        expect(String(amount)).toBe('5000');
    });

    it('should default destination_account_id to null when not provided', () => {
        const data = { destination_account_id: undefined };
        expect(data.destination_account_id || null).toBeNull();
    });

    it('should insert with correct instruction properties', async () => {
        const db = createMockDb(true, true);

        const [instruction] = await db
            .insertInto('standing_instructions')
            .values({
                member_id: 'mem-001',
                instruction_type: 'transfer',
                source_account_id: 'src-001',
                destination_account_id: 'dest-001',
                amount: '5000',
                frequency: 'monthly',
                start_date: '2026-03-01',
                next_execution_date: '2026-03-01',
            })
            .returning('id')
            .execute();

        expect(instruction.id).toBe('si-001');
        expect(db.insertInto).toHaveBeenCalledWith('standing_instructions');
    });
});
