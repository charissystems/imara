/**
 * Tenant Subscription Validation Middleware
 * Enforces subscription limits and feature access restrictions
 * 
 * Validates:
 * - Subscription status (active, suspended, expired)
 * - User limits (max_users)
 * - Member limits (max_members)
 * - Feature availability based on tier
 */

import { Context, Next } from 'hono';
import { Env } from './types';
import { ForbiddenError } from './errorHandler';
import { appLogger } from './logger';
import { publicDb } from '../config/database';
import { dbManager } from '../config/database';

/**
 * Subscription tier feature matrix
 * Defines which features are available in each tier
 */
const SUBSCRIPTION_FEATURES: Record<string, string[]> = {
    trial: [
        'members',
        'savings',
        'basic_reports',
    ],
    basic: [
        'members',
        'savings',
        'shares',
        'loans',
        'accounting',
        'messaging',
        'standard_reports',
        'api_access',
    ],
    pro: [
        'members',
        'savings',
        'shares',
        'loans',
        'fixed_deposits',
        'accounting',
        'messaging',
        'advanced_analytics',
        'mobile_app',
        'ussd_integration',
        'api_access',
        'custom_reports',
        'sso',
    ],
};

/**
 * Checks tenant subscription status and enforces limits
 */
export async function validateSubscription(c: Context<Env>, next: Next) {
    const tenant = c.get('tenant');

    // Skip for unauthenticated requests or public routes
    if (!tenant) {
        await next();
        return;
    }

    // Check subscription status
    if (tenant.status === 'suspended') {
        appLogger.warn('Access denied: tenant suspended', {
            tenant_id: tenant.id,
            code: tenant.code,
        });

        throw new ForbiddenError(
            'Your account has been suspended. Please contact support.'
        );
    }

    // Check subscription expiration
    if (tenant.subscription_expires_at) {
        const now = new Date();
        const expiresAt = new Date(tenant.subscription_expires_at);

        if (expiresAt < now) {
            appLogger.warn('Access denied: subscription expired', {
                tenant_id: tenant.id,
                expired_at: tenant.subscription_expires_at,
            });

            throw new ForbiddenError(
                'Your subscription has expired. Please renew to continue.'
            );
        }

        // Warn if expiring soon (within 7 days)
        const daysUntilExpiry = Math.floor(
            (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysUntilExpiry <= 7 && daysUntilExpiry > 0) {
            (c.set as any)('subscriptionWarning', {
                type: 'EXPIRING_SOON' as const,
                message: `Your subscription expires in ${daysUntilExpiry} days`,
                tenant_id: tenant.id,
            });
        }
    }

    appLogger.debug('Subscription validation passed', {
        tenant_id: tenant.id,
        tier: tenant.subscription_tier,
    });

    await next();
}

/**
 * Enforces user limit per tenant
 * Prevents creation of additional staff/users beyond subscription limit
 */
export async function validateUserLimit(c: Context<Env>, next: Next) {
    // Only enforce on staff creation endpoints
    if (
        c.req.method !== 'POST' ||
        !c.req.path.includes('/staff') ||
        c.req.path.includes('/staff/login')
    ) {
        await next();
        return;
    }

    const tenant = c.get('tenant');

    if (!tenant) {
        await next();
        return;
    }

    // Get current user count for this tenant
    try {
        // This query counts active staff in the tenant schema
        const result = await dbManager.executeRaw<{ count: string }>(
            tenant.schema_name,
            'SELECT COUNT(*) as count FROM staff WHERE deleted_at IS NULL'
        );

        const currentUsers = parseInt(result.rows?.[0]?.count as string) || 0;

        if (currentUsers >= tenant.max_users) {
            appLogger.warn('User limit reached', {
                tenant_id: tenant.id,
                current_users: currentUsers,
                max_users: tenant.max_users,
            });

            throw new ForbiddenError(
                `User limit reached (${tenant.max_users}). ` +
                'Upgrade your subscription or remove inactive users.'
            );
        }

        (c.set as any)('userLimitInfo', {
            current_count: currentUsers,
            limit: tenant.max_users,
            percentage_used: (currentUsers / tenant.max_users) * 100,
            tenant_id: tenant.id,
        });
    } catch (error) {
        // Rethrow ForbiddenError (from limit check) as-is
        if (error instanceof ForbiddenError) {
            throw error;
        }
        appLogger.error('Failed to validate user limit', undefined, {
            tenant_id: tenant.id,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Fail closed — deny request when validation cannot be performed
        throw new ForbiddenError(
            'Unable to validate subscription limits. Please try again later.'
        );
    }

    await next();
}

/**
 * Enforces member limit per tenant
 * Prevents registration of additional members beyond subscription limit
 */
export async function validateMemberLimit(c: Context<Env>, next: Next) {
    // Only enforce on member creation endpoints
    if (
        c.req.method !== 'POST' ||
        !c.req.path.includes('/members') ||
        c.req.path.includes('/members/search')
    ) {
        await next();
        return;
    }

    const tenant = c.get('tenant');

    if (!tenant) {
        await next();
        return;
    }

    try {
        // Get current member count
        const result = await dbManager.executeRaw<{ count: string }>(
            tenant.schema_name,
            'SELECT COUNT(*) as count FROM members WHERE deleted_at IS NULL'
        );

        const currentMembers = parseInt(result.rows?.[0]?.count as string) || 0;

        if (currentMembers >= tenant.max_members) {
            appLogger.warn('Member limit reached', {
                tenant_id: tenant.id,
                current_members: currentMembers,
                max_members: tenant.max_members,
            });

            throw new ForbiddenError(
                `Member limit reached (${tenant.max_members}). ` +
                'Upgrade your subscription to register more members.'
            );
        }

        // Warn if approaching limit (>80%)
        const percentageUsed = (currentMembers / tenant.max_members) * 100;
        if (percentageUsed > 80) {
            (c.set as any)('memberLimitWarning', {
                type: 'WARNING' as const,
                current_count: currentMembers,
                limit: tenant.max_members,
                tenant_id: tenant.id,
            });
        }
    } catch (error) {
        // Rethrow ForbiddenError (from limit check) as-is
        if (error instanceof ForbiddenError) {
            throw error;
        }
        appLogger.error('Failed to validate member limit', undefined, {
            tenant_id: tenant.id,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Fail closed — deny request when validation cannot be performed
        throw new ForbiddenError(
            'Unable to validate subscription limits. Please try again later.'
        );
    }

    await next();
}

/**
 * Restricts feature access based on subscription tier
 */
export async function validateFeatureAccess(featureName: string) {
    return async (c: Context<Env>, next: Next) => {
        const tenant = c.get('tenant');

        if (!tenant) {
            await next();
            return;
        }

        const allowedFeatures = SUBSCRIPTION_FEATURES[tenant.subscription_tier] || [];

        if (!allowedFeatures.includes(featureName)) {
            appLogger.warn('Feature access denied', {
                tenant_id: tenant.id,
                feature: featureName,
                tier: tenant.subscription_tier,
            });

            throw new ForbiddenError(
                `Feature "${featureName}" is not available in the ${tenant.subscription_tier} plan. ` +
                'Please upgrade your subscription.'
            );
        }

        appLogger.debug('Feature access granted', {
            tenant_id: tenant.id,
            feature: featureName,
        });

        await next();
    };
}

/**
 * Helper to check if a feature is available
 * Use in service layer before expensive operations
 */
export function isFeatureAvailable(
    subscriptionTier: string,
    featureName: string
): boolean {
    const allowedFeatures = SUBSCRIPTION_FEATURES[subscriptionTier] || [];
    return allowedFeatures.includes(featureName);
}

/**
 * Get all available features for a subscription tier
 */
export function getAvailableFeatures(subscriptionTier: string): string[] {
    return SUBSCRIPTION_FEATURES[subscriptionTier] || [];
}
