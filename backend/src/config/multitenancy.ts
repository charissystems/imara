/**
 * Multitenancy Configuration
 * Handles tenant isolation, schema management, and tenant-specific settings
 * 
 * Implements requirements:
 * - Tenant isolation at database schema level
 * - Configurable per-tenant settings (products, workflows, limits)
 * - Tenant onboarding workflow
 * - Resource usage tracking
 */

/**
 * Tenant tier/subscription level
 */
export type TenantTier = 'free' | 'starter' | 'professional' | 'enterprise';

/**
 * Tenant status
 */
export type TenantStatus = 'trial' | 'active' | 'suspended' | 'inactive' | 'archived';

/**
 * Subscription configuration per tenant tier
 */
export interface SubscriptionConfig {
    tier: TenantTier;
    maxMembers: number;
    maxUsers: number;
    maxMonthlyTransactions: number;
    maxStorageGB: number;
    maxConcurrentLoans: number;
    features: {
        digitalKYC: boolean;
        mobileMoneyIntegration: boolean;
        bulkImport: boolean;
        advancedReporting: boolean;
        apiAccess: boolean;
        customBranding: boolean;
        sso: boolean;
        auditLog: boolean;
    };
    pricePerMonth: number;
    smsCreditsPerMonth: number;
    emailsPerMonth: number;
    supportLevel: 'community' | 'standard' | 'premium' | 'enterprise';
}

/**
 * Tenant-specific configuration
 */
export interface TenantConfig {
    tenantId: string;
    code: string;
    name: string;
    status: TenantStatus;
    tier: TenantTier;
    
    // Schema
    schemaName: string;
    schemaCreatedAt: Date;
    
    // Subscription
    subscriptionStartDate: Date;
    subscriptionEndDate?: Date;
    subscriptionAutoRenew: boolean;
    
    // Branding
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
    currency: string;
    timezone: string;
    locale: string;
    
    // Limits
    memberLimit: number;
    userLimit: number;
    storageGB: number;
    
    // Notifications
    smsEnabled: boolean;
    emailEnabled: boolean;
    pushEnabled: boolean;
    
    // Features
    enabledFeatures: string[];
    
    // Compliance
    dataResidency?: 'local' | 'regional' | 'global';
    complianceFramework?: 'gdpr' | 'ccpa' | 'local' | 'none';
    regulatoryBody?: string;
}

/**
 * Default subscription configurations
 */
export const DEFAULT_SUBSCRIPTIONS: Record<TenantTier, SubscriptionConfig> = {
    free: {
        tier: 'free',
        maxMembers: 100,
        maxUsers: 1,
        maxMonthlyTransactions: 1000,
        maxStorageGB: 1,
        maxConcurrentLoans: 5,
        features: {
            digitalKYC: false,
            mobileMoneyIntegration: false,
            bulkImport: false,
            advancedReporting: false,
            apiAccess: false,
            customBranding: false,
            sso: false,
            auditLog: false,
        },
        pricePerMonth: 0,
        smsCreditsPerMonth: 0,
        emailsPerMonth: 100,
        supportLevel: 'community',
    },
    starter: {
        tier: 'starter',
        maxMembers: 5000,
        maxUsers: 5,
        maxMonthlyTransactions: 100000,
        maxStorageGB: 50,
        maxConcurrentLoans: 100,
        features: {
            digitalKYC: false,
            mobileMoneyIntegration: true,
            bulkImport: true,
            advancedReporting: false,
            apiAccess: false,
            customBranding: false,
            sso: false,
            auditLog: true,
        },
        pricePerMonth: 299,
        smsCreditsPerMonth: 1000,
        emailsPerMonth: 10000,
        supportLevel: 'standard',
    },
    professional: {
        tier: 'professional',
        maxMembers: 50000,
        maxUsers: 20,
        maxMonthlyTransactions: 1000000,
        maxStorageGB: 500,
        maxConcurrentLoans: 1000,
        features: {
            digitalKYC: true,
            mobileMoneyIntegration: true,
            bulkImport: true,
            advancedReporting: true,
            apiAccess: true,
            customBranding: true,
            sso: false,
            auditLog: true,
        },
        pricePerMonth: 999,
        smsCreditsPerMonth: 10000,
        emailsPerMonth: 100000,
        supportLevel: 'premium',
    },
    enterprise: {
        tier: 'enterprise',
        maxMembers: 1000000,
        maxUsers: 500,
        maxMonthlyTransactions: 100000000,
        maxStorageGB: 10000,
        maxConcurrentLoans: 100000,
        features: {
            digitalKYC: true,
            mobileMoneyIntegration: true,
            bulkImport: true,
            advancedReporting: true,
            apiAccess: true,
            customBranding: true,
            sso: true,
            auditLog: true,
        },
        pricePerMonth: 9999,
        smsCreditsPerMonth: 100000,
        emailsPerMonth: 1000000,
        supportLevel: 'enterprise',
    },
};

/**
 * Get subscription config for tier
 */
export function getSubscriptionConfig(tier: TenantTier): SubscriptionConfig {
    return DEFAULT_SUBSCRIPTIONS[tier];
}

/**
 * Validate tenant tier
 */
export function isValidTier(tier: string): tier is TenantTier {
    return ['free', 'starter', 'professional', 'enterprise'].includes(tier);
}

/**
 * Validate tenant status
 */
export function isValidStatus(status: string): status is TenantStatus {
    return ['trial', 'active', 'suspended', 'inactive', 'archived'].includes(status);
}

/**
 * Check if tenant is active and not suspended
 */
export function isTenantActive(status: TenantStatus): boolean {
    return status === 'active' || status === 'trial';
}

/**
 * Multitenancy configuration class
 */
export class MultitenancyConfig {
    /**
     * Generate schema name from tenant code
     */
    static generateSchemaName(tenantCode: string): string {
        // Sanitize tenant code: lowercase, alphanumeric + underscore only
        const sanitized = tenantCode
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/^_+|_+$/g, '');
        
        return `tenant_${sanitized}`;
    }

    /**
     * Validate tenant code format
     */
    static validateTenantCode(code: string): boolean {
        // 3-20 alphanumeric + hyphen
        return /^[a-zA-Z0-9-]{3,20}$/.test(code);
    }

    /**
     * Validate tenant name
     */
    static validateTenantName(name: string): boolean {
        return name.length >= 2 && name.length <= 200;
    }

    /**
     * Get default tenant config
     */
    static getDefaults(tenantId: string, code: string, name: string, tier: TenantTier = 'starter'): TenantConfig {
        const schemaName = this.generateSchemaName(code);
        const subscription = getSubscriptionConfig(tier);

        return {
            tenantId,
            code,
            name,
            status: 'trial',
            tier,
            schemaName,
            schemaCreatedAt: new Date(),
            subscriptionStartDate: new Date(),
            subscriptionAutoRenew: false,
            currency: 'UGX',
            timezone: 'Africa/Kampala',
            locale: 'en-UG',
            memberLimit: subscription.maxMembers,
            userLimit: subscription.maxUsers,
            storageGB: subscription.maxStorageGB,
            smsEnabled: true,
            emailEnabled: true,
            pushEnabled: false,
            enabledFeatures: Object.entries(subscription.features)
                .filter(([_, enabled]) => enabled)
                .map(([feature]) => feature),
            dataResidency: 'local',
            complianceFramework: 'local',
        };
    }
}

/**
 * Per-tenant feature flags
 */
export interface FeatureFlags {
    [featureName: string]: boolean;
}

/**
 * Per-tenant product configuration
 */
export interface TenantProductConfig {
    loanProducts: string[]; // Product IDs
    savingsProducts: string[];
    shareClasses: string[];
    fixedDepositProducts: string[];
}

/**
 * Per-tenant workflow configuration
 */
export interface TenantWorkflowConfig {
    loanApprovalLevels: number; // 1, 2, or 3
    withdrawalApprovalThreshold: number; // Amount
    allowBulkOperations: boolean;
    requireDualApproval: boolean;
}

/**
 * Export public API
 */
export const MultitenancyConfigAPI = {
    generateSchemaName: MultitenancyConfig.generateSchemaName,
    validateTenantCode: MultitenancyConfig.validateTenantCode,
    validateTenantName: MultitenancyConfig.validateTenantName,
    getDefaults: MultitenancyConfig.getDefaults,
    getSubscriptionConfig,
    isValidTier,
    isValidStatus,
    isTenantActive,
};
