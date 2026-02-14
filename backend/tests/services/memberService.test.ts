// tests/services/memberService.test.ts
import { describe, it, expect } from 'vitest';
import {
    MemberService,
    initMemberService,
    type MemberProfile,
    type NextOfKin,
    type Beneficiary,
} from '../../src/services/memberService';

/**
 * MemberService Unit Tests
 * Covers: member number generation, profile validation, next-of-kin,
 *         CSV import, status display, beneficiary, minimum balance,
 *         portal credentials, welcome message
 */

const service = new MemberService();

// ─── Fixture: valid member profile ───────────────────────────

const validProfile: Partial<MemberProfile> = {
    fullName: 'John Doe',
    dateOfBirth: new Date('1990-05-15'),
    gender: 'M',
    nationality: 'Uganda',
    nationalId: 'CF12345678901',
    idDocumentType: 'NIN',
    physicalAddress: '123 Main Street, Kampala',
    phone: '+256701234567',
    email: 'john.doe@example.com',
};

// ═══════════════════════════════════════════════════════════════
// generateMemberNumber
// ═══════════════════════════════════════════════════════════════

describe('MemberService.generateMemberNumber', () => {
    it('should generate number with default prefix', () => {
        const num = service.generateMemberNumber();
        expect(num).toMatch(/^MEM-/);
    });

    it('should generate number with custom prefix', () => {
        const num = service.generateMemberNumber('SAC');
        expect(num).toMatch(/^SAC-/);
    });

    it('should generate unique numbers', () => {
        const nums = new Set(Array.from({ length: 100 }, () => service.generateMemberNumber()));
        expect(nums.size).toBeGreaterThanOrEqual(98);
    });
});

// ═══════════════════════════════════════════════════════════════
// validateMemberProfile
// ═══════════════════════════════════════════════════════════════

describe('MemberService.validateMemberProfile', () => {
    it('should pass with valid profile', () => {
        const result = service.validateMemberProfile(validProfile);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should reject missing full name', () => {
        const result = service.validateMemberProfile({ ...validProfile, fullName: '' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Full name is required');
    });

    it('should reject missing date of birth', () => {
        const result = service.validateMemberProfile({ ...validProfile, dateOfBirth: undefined });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Date of birth is required');
    });

    it('should reject member under 18', () => {
        const today = new Date();
        const under18 = new Date(today.getFullYear() - 17, today.getMonth(), today.getDate());
        const result = service.validateMemberProfile({ ...validProfile, dateOfBirth: under18 });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Member must be at least 18 years old');
    });

    it('should reject invalid date of birth (age > 120)', () => {
        const result = service.validateMemberProfile({
            ...validProfile,
            dateOfBirth: new Date('1800-01-01'),
        });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Invalid date of birth');
    });

    it('should reject invalid gender', () => {
        const result = service.validateMemberProfile({ ...validProfile, gender: 'X' as any });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Valid gender is required');
    });

    it('should accept all valid genders', () => {
        for (const gender of ['M', 'F', 'Other'] as const) {
            const result = service.validateMemberProfile({ ...validProfile, gender });
            expect(result.valid).toBe(true);
        }
    });

    it('should reject missing nationality', () => {
        const result = service.validateMemberProfile({ ...validProfile, nationality: '' });
        expect(result.valid).toBe(false);
    });

    it('should reject missing national ID', () => {
        const result = service.validateMemberProfile({ ...validProfile, nationalId: '' });
        expect(result.valid).toBe(false);
    });

    it('should reject invalid ID document type', () => {
        const result = service.validateMemberProfile({ ...validProfile, idDocumentType: 'Invalid' as any });
        expect(result.valid).toBe(false);
    });

    it('should accept all valid ID types', () => {
        for (const type of ['NIN', 'Passport', 'DrivingPermit', 'RefugeeID'] as const) {
            const result = service.validateMemberProfile({ ...validProfile, idDocumentType: type });
            expect(result.valid).toBe(true);
        }
    });

    it('should reject invalid phone number', () => {
        const result = service.validateMemberProfile({ ...validProfile, phone: 'not-a-phone' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Valid phone number is required');
    });

    it('should reject invalid email', () => {
        const result = service.validateMemberProfile({ ...validProfile, email: 'not-email' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Valid email is required');
    });

    it('should reject empty object (all fields missing)', () => {
        const result = service.validateMemberProfile({});
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(8);
    });
});

// ═══════════════════════════════════════════════════════════════
// validateNextOfKin
// ═══════════════════════════════════════════════════════════════

describe('MemberService.validateNextOfKin', () => {
    const validKin: Partial<NextOfKin> = {
        fullName: 'Jane Doe',
        relationship: 'Spouse',
        phone: '+256712345678',
        benefitSharePercentage: 50,
    };

    it('should pass with valid data', () => {
        const result = service.validateNextOfKin(validKin);
        expect(result.valid).toBe(true);
    });

    it('should reject missing name', () => {
        const result = service.validateNextOfKin({ ...validKin, fullName: '' });
        expect(result.valid).toBe(false);
    });

    it('should reject missing relationship', () => {
        const result = service.validateNextOfKin({ ...validKin, relationship: '' });
        expect(result.valid).toBe(false);
    });

    it('should reject invalid phone', () => {
        const result = service.validateNextOfKin({ ...validKin, phone: 'abc' });
        expect(result.valid).toBe(false);
    });

    it('should reject percentage above 100', () => {
        const result = service.validateNextOfKin({ ...validKin, benefitSharePercentage: 150 });
        expect(result.valid).toBe(false);
    });

    it('should reject negative percentage', () => {
        const result = service.validateNextOfKin({ ...validKin, benefitSharePercentage: -10 });
        expect(result.valid).toBe(false);
    });

    it('should accept 0 percentage', () => {
        const result = service.validateNextOfKin({ ...validKin, benefitSharePercentage: 0 });
        expect(result.valid).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════
// parseBulkMemberCSV
// ═══════════════════════════════════════════════════════════════

describe('MemberService.parseBulkMemberCSV', () => {
    const header = 'fullname,dateofbirth,gender,nationalid,phone,email,physicaladdress,nationality';

    it('should parse valid CSV rows', () => {
        const csv = `${header}\nJohn Doe,1990-01-01,M,NID123,+256701234567,john@test.com,Kampala,Uganda`;
        const result = service.parseBulkMemberCSV(csv);
        expect(result.members).toHaveLength(1);
        expect(result.errors).toHaveLength(0);
        expect(result.members[0].fullName).toBe('John Doe');
    });

    it('should reject CSV with missing required headers', () => {
        const csv = 'name,age\nJohn,25';
        const result = service.parseBulkMemberCSV(csv);
        expect(result.members).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].error).toContain('Missing required columns');
    });

    it('should reject CSV with only header', () => {
        const csv = header;
        const result = service.parseBulkMemberCSV(csv);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].error).toContain('at least one member row');
    });

    it('should report row-level validation errors', () => {
        const csv = `${header}\n,1990-01-01,M,NID123,+256701234567,john@test.com,Kampala,Uganda`;
        const result = service.parseBulkMemberCSV(csv);
        // Empty fullName should fail validation
        expect(result.errors.length).toBeGreaterThanOrEqual(1);
        expect(result.errors[0].row).toBe(1);
    });

    it('should handle multiple rows with mixed valid/invalid', () => {
        const csv = [
            header,
            'Alice,1985-06-15,F,NID001,+256701111111,alice@test.com,Kampala,Uganda',
            ',bad-date,X,,,notanemail,,', // invalid row
        ].join('\n');
        const result = service.parseBulkMemberCSV(csv);
        expect(result.members).toHaveLength(1);
        expect(result.errors.length).toBeGreaterThanOrEqual(1);
    });
});

// ═══════════════════════════════════════════════════════════════
// getMemberStatusDisplay
// ═══════════════════════════════════════════════════════════════

describe('MemberService.getMemberStatusDisplay', () => {
    it('should map known statuses', () => {
        expect(service.getMemberStatusDisplay('Pending')).toBe('Pending Registration');
        expect(service.getMemberStatusDisplay('Active')).toBe('Active Member');
        expect(service.getMemberStatusDisplay('Suspended')).toBe('Membership Suspended');
        expect(service.getMemberStatusDisplay('Dormant')).toBe('Dormant Account');
        expect(service.getMemberStatusDisplay('Deceased')).toBe('Deceased');
        expect(service.getMemberStatusDisplay('Exited')).toBe('Exited SACCO');
    });

    it('should return raw status for unknown values', () => {
        expect(service.getMemberStatusDisplay('Unknown')).toBe('Unknown');
    });
});

// ═══════════════════════════════════════════════════════════════
// validateBeneficiary
// ═══════════════════════════════════════════════════════════════

describe('MemberService.validateBeneficiary', () => {
    const validBen: Partial<Beneficiary> = {
        fullName: 'Jane Doe',
        relationship: 'Spouse',
        benefitPercentage: 100,
    };

    it('should pass with valid data', () => {
        const result = service.validateBeneficiary(validBen);
        expect(result.valid).toBe(true);
    });

    it('should reject missing name', () => {
        const result = service.validateBeneficiary({ ...validBen, fullName: '' });
        expect(result.valid).toBe(false);
    });

    it('should reject missing relationship', () => {
        const result = service.validateBeneficiary({ ...validBen, relationship: '' });
        expect(result.valid).toBe(false);
    });

    it('should reject negative percentage', () => {
        const result = service.validateBeneficiary({ ...validBen, benefitPercentage: -5 });
        expect(result.valid).toBe(false);
    });

    it('should reject percentage above 100', () => {
        const result = service.validateBeneficiary({ ...validBen, benefitPercentage: 101 });
        expect(result.valid).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════
// checkMinimumBalance
// ═══════════════════════════════════════════════════════════════

describe('MemberService.checkMinimumBalance', () => {
    it('should be sufficient when balance >= minimum', () => {
        const result = service.checkMinimumBalance(5000, 2000);
        expect(result.sufficient).toBe(true);
        expect(result.shortfall).toBe(0);
    });

    it('should be sufficient when exactly at minimum', () => {
        const result = service.checkMinimumBalance(2000, 2000);
        expect(result.sufficient).toBe(true);
        expect(result.shortfall).toBe(0);
    });

    it('should be insufficient when below minimum', () => {
        const result = service.checkMinimumBalance(500, 2000);
        expect(result.sufficient).toBe(false);
        expect(result.shortfall).toBe(1500);
    });

    it('should handle zero balance', () => {
        const result = service.checkMinimumBalance(0, 1000);
        expect(result.sufficient).toBe(false);
        expect(result.shortfall).toBe(1000);
    });

    it('should handle zero minimum', () => {
        const result = service.checkMinimumBalance(0, 0);
        expect(result.sufficient).toBe(true);
        expect(result.shortfall).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════════
// generatePortalCredentials
// ═══════════════════════════════════════════════════════════════

describe('MemberService.generatePortalCredentials', () => {
    it('should use email prefix as username', () => {
        const creds = service.generatePortalCredentials('mem-1', 'john.doe@example.com');
        expect(creds.username).toBe('john.doe');
    });

    it('should generate 12-character temp password', () => {
        const creds = service.generatePortalCredentials('mem-1', 'jane@test.com');
        expect(creds.tempPassword).toHaveLength(12);
    });

    it('should generate unique passwords', () => {
        const passwords = new Set(
            Array.from({ length: 50 }, () =>
                service.generatePortalCredentials('mem-1', 'x@test.com').tempPassword,
            ),
        );
        expect(passwords.size).toBeGreaterThan(1);
    });
});

// ═══════════════════════════════════════════════════════════════
// createDefaultSavingsAccount
// ═══════════════════════════════════════════════════════════════

describe('MemberService.createDefaultSavingsAccount', () => {
    it('should return account with correct properties', async () => {
        const account = await service.createDefaultSavingsAccount('mem-1', 't-1');
        expect(account.memberId).toBe('mem-1');
        expect(account.tenantId).toBe('t-1');
        expect(account.accountType).toBe('savings');
        expect(account.accountName).toBe('Default Savings Account');
        expect(account.balance).toBe(0);
        expect(account.status).toBe('active');
    });

    it('should generate an account number starting with SAV-', async () => {
        const account = await service.createDefaultSavingsAccount('mem-1', 't-1');
        expect(account.accountNumber).toMatch(/^SAV-/);
    });
});

// ═══════════════════════════════════════════════════════════════
// generateWelcomeMessage
// ═══════════════════════════════════════════════════════════════

describe('MemberService.generateWelcomeMessage', () => {
    const member: MemberProfile = {
        ...validProfile,
        id: 'mem-1',
        tenantId: 'Test SACCO',
        memberNumber: 'MEM-000001',
        postalAddress: 'P.O. Box 123',
        occupation: 'Engineer',
        status: 'Active',
        joinDate: new Date(),
        registrationDate: new Date(),
        createdBy: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
    } as MemberProfile;

    it('should include member number in SMS', () => {
        const msg = service.generateWelcomeMessage(member, 'https://portal.sacco.com');
        expect(msg.sms).toContain('MEM-000001');
    });

    it('should include portal URL in email', () => {
        const msg = service.generateWelcomeMessage(member, 'https://portal.sacco.com');
        expect(msg.email).toContain('https://portal.sacco.com');
    });

    it('should include member full name in email', () => {
        const msg = service.generateWelcomeMessage(member, 'https://portal.sacco.com');
        expect(msg.email).toContain('John Doe');
    });

    it('should have a subject line', () => {
        const msg = service.generateWelcomeMessage(member, 'https://portal.sacco.com');
        expect(msg.subject).toBeTruthy();
    });
});

// ═══════════════════════════════════════════════════════════════
// initMemberService
// ═══════════════════════════════════════════════════════════════

describe('initMemberService', () => {
    it('should return a MemberService instance', () => {
        expect(initMemberService()).toBeInstanceOf(MemberService);
    });
});
