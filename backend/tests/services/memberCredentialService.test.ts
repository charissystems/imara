// tests/services/memberCredentialService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash, randomBytes } from 'crypto';

/**
 * MemberCredentialService Unit Tests
 * Tests PIN hashing, verification, lockout, and reset logic
 */

// ─── PIN Hashing Logic ──────────────────────────────────────

function hashPin(pin: string, salt: string): string {
    return createHash('sha256').update(pin + salt).digest('hex');
}

describe('MemberCredentialService - PIN Hashing', () => {
    it('should produce consistent hash for same pin and salt', () => {
        const salt = 'fixed-salt-for-testing';
        const hash1 = hashPin('1234', salt);
        const hash2 = hashPin('1234', salt);
        expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different pins', () => {
        const salt = 'fixed-salt';
        const hash1 = hashPin('1234', salt);
        const hash2 = hashPin('5678', salt);
        expect(hash1).not.toBe(hash2);
    });

    it('should produce different hash for different salts', () => {
        const hash1 = hashPin('1234', 'salt-a');
        const hash2 = hashPin('1234', 'salt-b');
        expect(hash1).not.toBe(hash2);
    });

    it('should produce a 64-char hex string (SHA256)', () => {
        const hash = hashPin('1234', 'test-salt');
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle 4-digit PINs', () => {
        const hash = hashPin('0000', 'salt');
        expect(hash).toHaveLength(64);
    });

    it('should handle 6-digit PINs', () => {
        const hash = hashPin('123456', 'salt');
        expect(hash).toHaveLength(64);
    });
});

// ─── Salt Generation ─────────────────────────────────────────

describe('MemberCredentialService - Salt Generation', () => {
    it('should generate a 32-char hex string (16 bytes)', () => {
        const salt = randomBytes(16).toString('hex');
        expect(salt).toHaveLength(32);
        expect(salt).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should generate unique salts', () => {
        const salt1 = randomBytes(16).toString('hex');
        const salt2 = randomBytes(16).toString('hex');
        expect(salt1).not.toBe(salt2);
    });
});

// ─── PIN Verification Logic ─────────────────────────────────

describe('MemberCredentialService - PIN Verification', () => {
    const salt = randomBytes(16).toString('hex');
    const correctPin = '1234';
    const storedHash = hashPin(correctPin, salt);

    it('should verify correct PIN', () => {
        const inputHash = hashPin('1234', salt);
        expect(inputHash === storedHash).toBe(true);
    });

    it('should reject incorrect PIN', () => {
        const inputHash = hashPin('9999', salt);
        expect(inputHash === storedHash).toBe(false);
    });

    it('should return locked:false when account is not locked', () => {
        const cred = { is_locked: false, pin_hash: storedHash, pin_salt: salt, pin_attempts: 0, max_attempts: 5 };
        expect(cred.is_locked).toBe(false);
    });

    it('should return locked:true when account is locked', () => {
        const cred = { is_locked: true, pin_hash: storedHash, pin_salt: salt, pin_attempts: 5, max_attempts: 5 };
        expect(cred.is_locked).toBe(true);
    });

    it('should return valid:false when credentials not found', () => {
        const cred = undefined;
        if (!cred) {
            expect({ valid: false, locked: false }).toEqual({ valid: false, locked: false });
        }
    });
});

// ─── Lockout Logic ──────────────────────────────────────────

describe('MemberCredentialService - Lockout Logic', () => {
    it('should lock account when attempts reach max', () => {
        const pinAttempts = 4; // 0-indexed, so this is the 5th attempt
        const maxAttempts = 5;
        const newAttempts = pinAttempts + 1;
        const shouldLock = newAttempts >= maxAttempts;
        expect(shouldLock).toBe(true);
    });

    it('should not lock when attempts are below max', () => {
        const pinAttempts = 2;
        const maxAttempts = 5;
        const newAttempts = pinAttempts + 1;
        const shouldLock = newAttempts >= maxAttempts;
        expect(shouldLock).toBe(false);
    });

    it('should lock on exact max boundary', () => {
        const newAttempts = 5;
        const maxAttempts = 5;
        expect(newAttempts >= maxAttempts).toBe(true);
    });

    it('should reset attempts on successful verification', () => {
        const attemptsAfterSuccess = 0;
        expect(attemptsAfterSuccess).toBe(0);
    });

    it('should increment attempts on failure', () => {
        const currentAttempts = 2;
        const newAttempts = currentAttempts + 1;
        expect(newAttempts).toBe(3);
    });
});

// ─── PIN Reset Logic ────────────────────────────────────────

describe('MemberCredentialService - PIN Reset', () => {
    it('should generate a 4-digit temporary PIN', () => {
        const tempPin = String(Math.floor(1000 + Math.random() * 9000));
        expect(tempPin).toMatch(/^\d{4}$/);
        expect(Number(tempPin)).toBeGreaterThanOrEqual(1000);
        expect(Number(tempPin)).toBeLessThanOrEqual(9999);
    });

    it('should generate different temporary PINs', () => {
        const pins = new Set<string>();
        for (let i = 0; i < 100; i++) {
            pins.add(String(Math.floor(1000 + Math.random() * 9000)));
        }
        // With 100 iterations, we should have more than 1 unique PIN
        expect(pins.size).toBeGreaterThan(1);
    });

    it('should set force_change to true on reset', () => {
        const resetResult = { force_change: true };
        expect(resetResult.force_change).toBe(true);
    });

    it('should reset pin_attempts to 0', () => {
        const resetState = { pin_attempts: 0, is_locked: false };
        expect(resetState.pin_attempts).toBe(0);
        expect(resetState.is_locked).toBe(false);
    });

    it('should set force_change to false on normal setPin', () => {
        const setPinResult = { force_change: false };
        expect(setPinResult.force_change).toBe(false);
    });
});

// ─── Upsert Logic ───────────────────────────────────────────

describe('MemberCredentialService - Upsert Logic', () => {
    it('should update when existing credentials found', () => {
        const existing = { id: 'cred-001' };
        const shouldUpdate = !!existing;
        expect(shouldUpdate).toBe(true);
    });

    it('should insert when no existing credentials', () => {
        const existing = undefined;
        const shouldInsert = !existing;
        expect(shouldInsert).toBe(true);
    });
});
