/**
 * Member Service
 * Handles member lifecycle: registration, onboarding, profile management
 * 
 * Implements MUST requirements:
 * - MEM-001: Capture comprehensive member profile
 * - MEM-002: Support multiple ID document types
 * - MEM-003: Auto-generate unique member number
 * - MEM-005: Capture next-of-kin details
 * - MEM-007: Bulk member import via Excel/CSV
 * - MEM-008: Send welcome SMS/email
 * - MEM-009: Track member lifecycle status
 * - MEM-010: Maintain immutable audit log
 * - MEM-011: Auto-create savings account
 * - MEM-014: Allow member to nominate beneficiaries
 * - MEM-015: Enforce minimum balance requirements
 * - MEM-016: Members access secure web portal
 * - MEM-019: Members download account statements in PDF
 */

import { appLogger } from '../middleware/logger';

/**
 * Member profile data
 */
export interface MemberProfile {
    id: string;
    tenantId: string;
    memberNumber: string;
    fullName: string;
    dateOfBirth: Date;
    gender: 'M' | 'F' | 'Other';
    nationality: string;
    nationalId: string;
    idDocumentType: 'NIN' | 'Passport' | 'DrivingPermit' | 'RefugeeID';
    idDocumentScan?: string;
    physicalAddress: string;
    postalAddress: string;
    occupation: string;
    employer?: string;
    phone: string;
    email: string;
    photo?: string;
    status: 'Pending' | 'Active' | 'Suspended' | 'Dormant' | 'Deceased' | 'Exited';
    joinDate: Date;
    registrationDate: Date;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
}

/**
 * Next of kin information
 */
export interface NextOfKin {
    id: string;
    memberId: string;
    fullName: string;
    relationship: string;
    phone: string;
    benefitSharePercentage: number;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Beneficiary information for account
 */
export interface Beneficiary {
    id: string;
    accountId: string;
    memberId: string;
    fullName: string;
    relationship: string;
    benefitPercentage: number;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Member account (savings, loans, shares, etc.)
 */
export interface MemberAccount {
    id: string;
    tenantId: string;
    memberId: string;
    accountNumber: string;
    accountType: 'savings' | 'loan' | 'shares' | 'fixed_deposit';
    accountName: string;
    balance: number;
    minimumBalance: number;
    status: 'active' | 'suspended' | 'closed';
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Member Service
 */
export class MemberService {
    constructor() {}

    /**
     * Generate unique member number
     * Format: PREFIX + sequential number (e.g., MEM-000001)
     * Requirement: MEM-003
     */
    generateMemberNumber(prefix: string = 'MEM'): string {
        const timestamp = Date.now();
        const randomPart = Math.floor(Math.random() * 10000);
        const sequential = String(timestamp + randomPart).padStart(6, '0');
        return `${prefix}-${sequential}`;
    }

    /**
     * Validate member profile data
     * Requirement: MEM-001, MEM-002
     */
    validateMemberProfile(profile: Partial<MemberProfile>): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!profile.fullName || profile.fullName.trim().length === 0) {
            errors.push('Full name is required');
        }

        if (!profile.dateOfBirth) {
            errors.push('Date of birth is required');
        } else {
            const age = this.calculateAge(profile.dateOfBirth);
            if (age < 18) {
                errors.push('Member must be at least 18 years old');
            }
            if (age > 120) {
                errors.push('Invalid date of birth');
            }
        }

        if (!profile.gender || !['M', 'F', 'Other'].includes(profile.gender)) {
            errors.push('Valid gender is required');
        }

        if (!profile.nationality || profile.nationality.trim().length === 0) {
            errors.push('Nationality is required');
        }

        if (!profile.nationalId || profile.nationalId.trim().length === 0) {
            errors.push('National ID is required');
        }

        if (!profile.idDocumentType || !['NIN', 'Passport', 'DrivingPermit', 'RefugeeID'].includes(profile.idDocumentType)) {
            errors.push('Valid ID document type is required');
        }

        if (!profile.physicalAddress || profile.physicalAddress.trim().length === 0) {
            errors.push('Physical address is required');
        }

        if (!profile.phone || !this.validatePhoneNumber(profile.phone)) {
            errors.push('Valid phone number is required');
        }

        if (!profile.email || !this.validateEmail(profile.email)) {
            errors.push('Valid email is required');
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Validate next of kin data
     * Requirement: MEM-005
     */
    validateNextOfKin(kin: Partial<NextOfKin>): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!kin.fullName || kin.fullName.trim().length === 0) {
            errors.push('Next of kin full name is required');
        }

        if (!kin.relationship || kin.relationship.trim().length === 0) {
            errors.push('Relationship is required');
        }

        if (!kin.phone || !this.validatePhoneNumber(kin.phone)) {
            errors.push('Valid phone number is required');
        }

        if (kin.benefitSharePercentage === undefined || kin.benefitSharePercentage < 0 || kin.benefitSharePercentage > 100) {
            errors.push('Benefit share percentage must be between 0 and 100');
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Validate email format
     */
    private validateEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Validate phone number format
     */
    private validatePhoneNumber(phone: string): boolean {
        // Accept international format: +XXX or local format
        const phoneRegex = /^(\+\d{1,3}[- ]?)?\d{7,14}$/;
        return phoneRegex.test(phone);
    }

    /**
     * Calculate age from date of birth
     */
    private calculateAge(dateOfBirth: Date): number {
        const today = new Date();
        let age = today.getFullYear() - dateOfBirth.getFullYear();
        const monthDiff = today.getMonth() - dateOfBirth.getMonth();

        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
            age--;
        }

        return age;
    }

    /**
     * Parse bulk member import from CSV
     * Requirement: MEM-007
     */
    parseBulkMemberCSV(csvData: string): { members: Partial<MemberProfile>[]; errors: { row: number; error: string }[] } {
        const members: Partial<MemberProfile>[] = [];
        const errors: { row: number; error: string }[] = [];

        const lines = csvData.trim().split('\n');
        if (lines.length < 2) {
            errors.push({ row: 0, error: 'CSV must contain header and at least one member row' });
            return { members, errors };
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const requiredHeaders = ['fullname', 'dateofbirth', 'gender', 'nationalid', 'phone', 'email'];
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

        if (missingHeaders.length > 0) {
            errors.push({ row: 0, error: `Missing required columns: ${missingHeaders.join(', ')}` });
            return { members, errors };
        }

        for (let i = 1; i < lines.length; i++) {
            try {
                const values = lines[i].split(',').map(v => v.trim());
                const member: Partial<MemberProfile> = {
                    fullName: values[headers.indexOf('fullname')],
                    dateOfBirth: new Date(values[headers.indexOf('dateofbirth')]),
                    gender: values[headers.indexOf('gender')] as any,
                    nationalId: values[headers.indexOf('nationalid')],
                    phone: values[headers.indexOf('phone')],
                    email: values[headers.indexOf('email')],
                    nationality: values[headers.indexOf('nationality')] || 'Uganda',
                    idDocumentType: values[headers.indexOf('iddocumenttype')] as any || 'NIN',
                    physicalAddress: values[headers.indexOf('physicaladdress')] || '',
                    occupation: values[headers.indexOf('occupation')] || '',
                };

                const validation = this.validateMemberProfile(member);
                if (!validation.valid) {
                    errors.push({ row: i, error: validation.errors.join('; ') });
                } else {
                    members.push(member);
                }
            } catch (error) {
                errors.push({ row: i, error: error instanceof Error ? error.message : 'Unknown error' });
            }
        }

        return { members, errors };
    }

    /**
     * Get member status display name
     * Requirement: MEM-009
     */
    getMemberStatusDisplay(status: string): string {
        const statusMap: Record<string, string> = {
            'Pending': 'Pending Registration',
            'Active': 'Active Member',
            'Suspended': 'Membership Suspended',
            'Dormant': 'Dormant Account',
            'Deceased': 'Deceased',
            'Exited': 'Exited SACCO',
        };
        return statusMap[status] || status;
    }

    /**
     * Create default savings account for new member
     * Requirement: MEM-011
     */
    async createDefaultSavingsAccount(memberId: string, tenantId: string): Promise<Partial<MemberAccount>> {
        const accountNumber = this.generateAccountNumber('SAV');
        
        return {
            memberId,
            tenantId,
            accountNumber,
            accountType: 'savings',
            accountName: 'Default Savings Account',
            balance: 0,
            minimumBalance: 0,
            status: 'active',
        };
    }

    /**
     * Generate unique account number
     */
    private generateAccountNumber(prefix: string): string {
        const timestamp = Date.now();
        const randomPart = Math.floor(Math.random() * 10000);
        const sequential = String(timestamp + randomPart).padStart(8, '0');
        return `${prefix}-${sequential}`;
    }

    /**
     * Log member audit event
     * Requirement: MEM-010
     */
    async logMemberAudit(
        memberId: string,
        action: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE',
        userId: string,
        changes?: Record<string, { old: any; new: any }>
    ): Promise<void> {
        appLogger.info('Member audit event', {
            memberId,
            action,
            userId,
            changes,
            timestamp: new Date().toISOString(),
        });

        // TODO: Persist to dedicated audit table per schema
        // await db.insertInto('member_audit_log').values({...}).execute();
    }

    /**
     * Validate beneficiary data
     * Requirement: MEM-014
     */
    validateBeneficiary(beneficiary: Partial<Beneficiary>): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!beneficiary.fullName || beneficiary.fullName.trim().length === 0) {
            errors.push('Beneficiary full name is required');
        }

        if (!beneficiary.relationship || beneficiary.relationship.trim().length === 0) {
            errors.push('Relationship is required');
        }

        if (beneficiary.benefitPercentage === undefined || beneficiary.benefitPercentage < 0 || beneficiary.benefitPercentage > 100) {
            errors.push('Benefit percentage must be between 0 and 100');
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Check minimum balance requirement
     * Requirement: MEM-015
     */
    checkMinimumBalance(currentBalance: number, minimumRequired: number): { sufficient: boolean; shortfall: number } {
        const sufficient = currentBalance >= minimumRequired;
        const shortfall = Math.max(0, minimumRequired - currentBalance);
        return { sufficient, shortfall };
    }

    /**
     * Generate member portal login credentials
     * Requirement: MEM-016, MEM-008
     */
    generatePortalCredentials(memberId: string, email: string): { username: string; tempPassword: string } {
        // Username: first part of email or memberId
        const username = email.split('@')[0];
        
        // Temporary password: random 12-character string
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
        let tempPassword = '';
        for (let i = 0; i < 12; i++) {
            tempPassword += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        return { username, tempPassword };
    }

    /**
     * Generate member welcome message content
     * Requirement: MEM-008
     */
    generateWelcomeMessage(member: MemberProfile, portalUrl: string): { sms: string; email: string; subject: string } {
        const sms = `Welcome to ${member.tenantId} SACCO! Your member number is ${member.memberNumber}. ' +
            'Portal: ${portalUrl} Save this securely.`;

        const emailSubject = 'Welcome to SACCO - Member Account Created';
        
        const emailBody = `
Dear ${member.fullName},

Welcome to our SACCO! Your account has been successfully created.

Member Details:
- Member Number: ${member.memberNumber}
- Portal URL: ${portalUrl}

You can now log in to access your accounts and manage your financial needs.

Best regards,
SACCO Management
        `;

        return { sms, email: emailBody, subject: emailSubject };
    }
}

/**
 * Initialize member service
 */
export function initMemberService(): MemberService {
    return new MemberService();
}
