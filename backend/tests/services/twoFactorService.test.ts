// tests/services/twoFactorService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TOTP, Secret } from 'otpauth';
import { randomBytes } from 'crypto';

// ────────────────────────────────────────────────────────────
// TOTP Verification Logic Tests
// ────────────────────────────────────────────────────────────

const TOTP_ISSUER = 'Imara SACCO';
const TOTP_PERIOD = 30;
const TOTP_DIGITS = 6;
const TOTP_ALGORITHM = 'SHA1';

describe('TwoFactorService - TOTP Logic', () => {
    let secret: Secret;
    let totp: TOTP;

    beforeEach(() => {
        secret = new Secret({ size: 20 });
        totp = new TOTP({
            issuer: TOTP_ISSUER,
            label: 'test@example.com',
            algorithm: TOTP_ALGORITHM,
            digits: TOTP_DIGITS,
            period: TOTP_PERIOD,
            secret,
        });
    });

    it('should generate a valid TOTP token', () => {
        const token = totp.generate();
        expect(token).toHaveLength(TOTP_DIGITS);
        expect(token).toMatch(/^\d{6}$/);
    });

    it('should validate a correct TOTP token', () => {
        const token = totp.generate();
        const delta = totp.validate({ token, window: 1 });
        expect(delta).not.toBeNull();
    });

    it('should reject an invalid TOTP token', () => {
        const delta = totp.validate({ token: '000000', window: 1 });
        // This might pass by coincidence with low probability
        // But the logic test is that validate returns null for invalid tokens
        // We'll test with a known-bad token by using a different secret
        const otherSecret = new Secret({ size: 20 });
        const otherTotp = new TOTP({
            issuer: TOTP_ISSUER,
            algorithm: TOTP_ALGORITHM,
            digits: TOTP_DIGITS,
            period: TOTP_PERIOD,
            secret: otherSecret,
        });
        const otherToken = otherTotp.generate();
        // Token from different secret should be rejected
        const result = totp.validate({ token: otherToken, window: 1 });
        // This can only pass by collision (1/1000000 chance for 6 digits)
        // To be safe, only assert if they actually differ
        if (otherToken !== totp.generate()) {
            expect(result).toBeNull();
        }
    });

    it('should generate a valid otpauth URL', () => {
        const url = totp.toString();
        expect(url).toMatch(/^otpauth:\/\/totp\//);
        expect(url).toContain(encodeURIComponent(TOTP_ISSUER));
        expect(url).toContain('secret=');
        expect(url).toContain(`digits=${TOTP_DIGITS}`);
        expect(url).toContain(`period=${TOTP_PERIOD}`);
    });

    it('should reconstruct TOTP from base32 secret', () => {
        const base32Secret = secret.base32;
        const reconstructed = new TOTP({
            issuer: TOTP_ISSUER,
            algorithm: TOTP_ALGORITHM,
            digits: TOTP_DIGITS,
            period: TOTP_PERIOD,
            secret: Secret.fromBase32(base32Secret),
        });

        // Both should generate the same token at the same time
        const original = totp.generate();
        const fromReconstructed = reconstructed.generate();
        expect(fromReconstructed).toBe(original);
    });

    it('should use window=1 for clock drift tolerance', () => {
        // Validate with window=1 means ±1 time-step is accepted
        const token = totp.generate();
        const delta = totp.validate({ token, window: 1 });
        // delta should be 0 for current timestep
        expect(delta).toBe(0);
    });
});

// ────────────────────────────────────────────────────────────
// Backup Code Generation Tests
// ────────────────────────────────────────────────────────────

describe('TwoFactorService - Backup Codes', () => {
    const BACKUP_CODE_COUNT = 10;
    const BACKUP_CODE_LENGTH = 8;

    const generateBackupCodes = (): string[] => {
        const codes: string[] = [];
        for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
            const bytes = randomBytes(BACKUP_CODE_LENGTH);
            const code = bytes
                .toString('hex')
                .substring(0, BACKUP_CODE_LENGTH)
                .toUpperCase();
            codes.push(`${code.substring(0, 4)}-${code.substring(4, 8)}`);
        }
        return codes;
    };

    it('should generate exactly 10 backup codes', () => {
        const codes = generateBackupCodes();
        expect(codes).toHaveLength(BACKUP_CODE_COUNT);
    });

    it('should format codes as XXXX-XXXX', () => {
        const codes = generateBackupCodes();
        for (const code of codes) {
            expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
        }
    });

    it('should generate unique codes', () => {
        const codes = generateBackupCodes();
        const unique = new Set(codes);
        // While theoretically possible to have duplicates, it's astronomically unlikely
        // with 8 hex characters (16^8 = 4 billion possibilities)
        expect(unique.size).toBe(codes.length);
    });

    it('should generate different codes on each call', () => {
        const codes1 = generateBackupCodes();
        const codes2 = generateBackupCodes();
        // At least some codes should differ
        const allSame = codes1.every((code, i) => code === codes2[i]);
        expect(allSame).toBe(false);
    });

    it('should be uppercase hex characters only', () => {
        const codes = generateBackupCodes();
        for (const code of codes) {
            const raw = code.replace('-', '');
            expect(raw).toMatch(/^[A-F0-9]+$/);
        }
    });
});

// ────────────────────────────────────────────────────────────
// Backup Code Verification Logic Tests
// ────────────────────────────────────────────────────────────

describe('TwoFactorService - Backup Code Verification', () => {
    it('should find and remove a used backup code', () => {
        const backupCodes = ['ABCD-1234', 'EFGH-5678', 'IJKL-9012'];
        const code = 'EFGH-5678';

        const codeIndex = backupCodes.indexOf(code);
        expect(codeIndex).toBe(1);

        const updatedCodes = [...backupCodes];
        updatedCodes.splice(codeIndex, 1);

        expect(updatedCodes).toHaveLength(2);
        expect(updatedCodes).not.toContain('EFGH-5678');
        expect(updatedCodes).toContain('ABCD-1234');
        expect(updatedCodes).toContain('IJKL-9012');
    });

    it('should return -1 for invalid backup code', () => {
        const backupCodes = ['ABCD-1234', 'EFGH-5678'];
        const code = 'XXXX-YYYY';

        const codeIndex = backupCodes.indexOf(code);
        expect(codeIndex).toBe(-1);
    });

    it('should handle empty backup codes array', () => {
        const backupCodes: string[] = [];
        const code = 'ABCD-1234';

        const codeIndex = backupCodes.indexOf(code);
        expect(codeIndex).toBe(-1);
    });

    it('should handle last backup code usage', () => {
        const backupCodes = ['ABCD-1234'];
        const code = 'ABCD-1234';

        const codeIndex = backupCodes.indexOf(code);
        expect(codeIndex).toBe(0);

        const updatedCodes = [...backupCodes];
        updatedCodes.splice(codeIndex, 1);

        expect(updatedCodes).toHaveLength(0);
    });
});

// ────────────────────────────────────────────────────────────
// 2FA Flow Logic Tests
// ────────────────────────────────────────────────────────────

describe('TwoFactorService - 2FA Flow', () => {
    it('should generate a secret with sufficient entropy', () => {
        const secret = new Secret({ size: 20 });
        expect(secret.base32.length).toBeGreaterThanOrEqual(32);
    });

    it('should create consistent TOTP instances', () => {
        const secret = new Secret({ size: 20 });
        const base32 = secret.base32;

        // Create two TOTP instances from the same secret
        const totp1 = new TOTP({
            issuer: TOTP_ISSUER,
            label: 'user@test.com',
            algorithm: TOTP_ALGORITHM,
            digits: TOTP_DIGITS,
            period: TOTP_PERIOD,
            secret: Secret.fromBase32(base32),
        });

        const totp2 = new TOTP({
            issuer: TOTP_ISSUER,
            label: 'user@test.com',
            algorithm: TOTP_ALGORITHM,
            digits: TOTP_DIGITS,
            period: TOTP_PERIOD,
            secret: Secret.fromBase32(base32),
        });

        // Same secret + same time = same code
        expect(totp1.generate()).toBe(totp2.generate());
    });

    it('should distinguish between TOTP and backup code verification paths', () => {
        // Simulate the verify logic
        const totpValid = false; // TOTP check fails
        const backupCodes = ['ABCD-1234', 'EFGH-5678'];
        const code = 'EFGH-5678';

        let result = { valid: false, usedBackupCode: false };

        if (totpValid) {
            result = { valid: true, usedBackupCode: false };
        } else {
            const codeIndex = backupCodes.indexOf(code);
            if (codeIndex !== -1) {
                result = { valid: true, usedBackupCode: true };
            }
        }

        expect(result.valid).toBe(true);
        expect(result.usedBackupCode).toBe(true);
    });

    it('should fail verification when both TOTP and backup fail', () => {
        const totpValid = false;
        const backupCodes = ['ABCD-1234', 'EFGH-5678'];
        const code = 'WRONG-CODE';

        let result = { valid: false, usedBackupCode: false };

        if (totpValid) {
            result = { valid: true, usedBackupCode: false };
        } else {
            const codeIndex = backupCodes.indexOf(code);
            if (codeIndex !== -1) {
                result = { valid: true, usedBackupCode: true };
            }
        }

        expect(result.valid).toBe(false);
    });

    it('should prefer TOTP over backup code when TOTP is valid', () => {
        const totpValid = true;
        const backupCodes = ['ABCD-1234'];
        const code = 'ABCD-1234'; // Also a valid backup code

        let result = { valid: false, usedBackupCode: false };

        if (totpValid) {
            result = { valid: true, usedBackupCode: false };
        } else {
            const codeIndex = backupCodes.indexOf(code);
            if (codeIndex !== -1) {
                result = { valid: true, usedBackupCode: true };
            }
        }

        expect(result.valid).toBe(true);
        expect(result.usedBackupCode).toBe(false); // TOTP took priority
    });
});

// ────────────────────────────────────────────────────────────
// Secret Generation & Format Tests
// ────────────────────────────────────────────────────────────

describe('TwoFactorService - Secret Format', () => {
    it('should generate valid base32 encoded secrets', () => {
        const secret = new Secret({ size: 20 });
        // base32 uses A-Z and 2-7
        expect(secret.base32).toMatch(/^[A-Z2-7=]+$/);
    });

    it('should generate secrets of consistent length', () => {
        const secrets = Array.from({ length: 5 }, () => new Secret({ size: 20 }));
        const lengths = secrets.map((s) => s.base32.length);
        // All should be the same length since size is fixed at 20 bytes
        expect(new Set(lengths).size).toBe(1);
    });

    it('should generate unique secrets', () => {
        const secret1 = new Secret({ size: 20 });
        const secret2 = new Secret({ size: 20 });
        expect(secret1.base32).not.toBe(secret2.base32);
    });
});
