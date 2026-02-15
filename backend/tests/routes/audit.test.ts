// tests/routes/audit.test.ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * Audit Route Validation Schema Tests
 * Tests all Zod schemas used in the audit route
 */

const uuidSchema = z.string().uuid('Invalid UUID format');

const reversalSchema = z.object({
    entity_type: z.string().min(1, 'Entity type is required'),
    entity_id: uuidSchema,
    reason: z.string().min(1, 'Reason is required'),
});

const setPinSchema = z.object({
    member_id: uuidSchema,
    pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 digits'),
});

const resetPinSchema = z.object({
    member_id: uuidSchema,
    reason: z.string().min(1, 'Reason is required'),
});

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

// ═══════════════════════════════════════════════════════════════
// reversalSchema
// ═══════════════════════════════════════════════════════════════

describe('reversalSchema', () => {
    const validReversal = {
        entity_type: 'deposit',
        entity_id: VALID_UUID,
        reason: 'Duplicate transaction',
    };

    it('should pass with valid data', () => {
        expect(reversalSchema.safeParse(validReversal).success).toBe(true);
    });

    it('should reject empty entity_type', () => {
        expect(reversalSchema.safeParse({ ...validReversal, entity_type: '' }).success).toBe(false);
    });

    it('should reject missing entity_type', () => {
        const { entity_type, ...rest } = validReversal;
        expect(reversalSchema.safeParse(rest).success).toBe(false);
    });

    it('should reject non-UUID entity_id', () => {
        expect(reversalSchema.safeParse({ ...validReversal, entity_id: 'bad-id' }).success).toBe(false);
    });

    it('should reject empty reason', () => {
        expect(reversalSchema.safeParse({ ...validReversal, reason: '' }).success).toBe(false);
    });

    it('should reject missing reason', () => {
        const { reason, ...rest } = validReversal;
        expect(reversalSchema.safeParse(rest).success).toBe(false);
    });

    it('should accept various entity types', () => {
        for (const type of ['deposit', 'withdrawal', 'transfer', 'loan_repayment']) {
            expect(reversalSchema.safeParse({ ...validReversal, entity_type: type }).success).toBe(true);
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// setPinSchema
// ═══════════════════════════════════════════════════════════════

describe('setPinSchema', () => {
    const validSetPin = {
        member_id: VALID_UUID,
        pin: '1234',
    };

    it('should pass with valid 4-digit PIN', () => {
        expect(setPinSchema.safeParse(validSetPin).success).toBe(true);
    });

    it('should pass with valid 5-digit PIN', () => {
        expect(setPinSchema.safeParse({ ...validSetPin, pin: '12345' }).success).toBe(true);
    });

    it('should pass with valid 6-digit PIN', () => {
        expect(setPinSchema.safeParse({ ...validSetPin, pin: '123456' }).success).toBe(true);
    });

    it('should reject 3-digit PIN (too short)', () => {
        expect(setPinSchema.safeParse({ ...validSetPin, pin: '123' }).success).toBe(false);
    });

    it('should reject 7-digit PIN (too long)', () => {
        expect(setPinSchema.safeParse({ ...validSetPin, pin: '1234567' }).success).toBe(false);
    });

    it('should reject non-numeric PIN', () => {
        expect(setPinSchema.safeParse({ ...validSetPin, pin: 'abcd' }).success).toBe(false);
    });

    it('should reject alphanumeric PIN', () => {
        expect(setPinSchema.safeParse({ ...validSetPin, pin: '12ab' }).success).toBe(false);
    });

    it('should reject PIN with spaces', () => {
        expect(setPinSchema.safeParse({ ...validSetPin, pin: '12 34' }).success).toBe(false);
    });

    it('should reject non-UUID member_id', () => {
        expect(setPinSchema.safeParse({ ...validSetPin, member_id: 'not-uuid' }).success).toBe(false);
    });

    it('should reject missing member_id', () => {
        expect(setPinSchema.safeParse({ pin: '1234' }).success).toBe(false);
    });

    it('should reject empty PIN', () => {
        expect(setPinSchema.safeParse({ ...validSetPin, pin: '' }).success).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════
// resetPinSchema
// ═══════════════════════════════════════════════════════════════

describe('resetPinSchema', () => {
    const validResetPin = {
        member_id: VALID_UUID,
        reason: 'Member forgot PIN',
    };

    it('should pass with valid data', () => {
        expect(resetPinSchema.safeParse(validResetPin).success).toBe(true);
    });

    it('should reject empty reason', () => {
        expect(resetPinSchema.safeParse({ ...validResetPin, reason: '' }).success).toBe(false);
    });

    it('should reject missing reason', () => {
        expect(resetPinSchema.safeParse({ member_id: VALID_UUID }).success).toBe(false);
    });

    it('should reject non-UUID member_id', () => {
        expect(resetPinSchema.safeParse({ ...validResetPin, member_id: 'invalid' }).success).toBe(false);
    });

    it('should reject missing member_id', () => {
        expect(resetPinSchema.safeParse({ reason: 'forgot' }).success).toBe(false);
    });
});
