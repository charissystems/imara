// tests/middleware/subscriptionValidation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Context, Next } from 'hono';
import {
    isFeatureAvailable,
    getAvailableFeatures,
    validateSubscription,
} from '../../src/middleware/subscriptionValidation';

/**
 * Subscription Validation Tests
 * Covers: feature matrix, tier access, subscription status enforcement
 */

// ─── Helper ──────────────────────────────────────────────────

const createMockContext = (tenant: any): Context => {
    const store: Record<string, any> = {};
    return {
        get: vi.fn((key: string) => {
            if (key === 'tenant') return tenant;
            return store[key];
        }),
        set: vi.fn((key: string, value: any) => { store[key] = value; }),
        req: { path: '/members', method: 'GET' },
    } as unknown as Context;
};

// ═══════════════════════════════════════════════════════════════
// isFeatureAvailable
// ═══════════════════════════════════════════════════════════════

describe('isFeatureAvailable', () => {
    // Trial tier
    it('trial: allows members', () => {
        expect(isFeatureAvailable('trial', 'members')).toBe(true);
    });
    it('trial: allows savings', () => {
        expect(isFeatureAvailable('trial', 'savings')).toBe(true);
    });
    it('trial: allows basic_reports', () => {
        expect(isFeatureAvailable('trial', 'basic_reports')).toBe(true);
    });
    it('trial: denies loans', () => {
        expect(isFeatureAvailable('trial', 'loans')).toBe(false);
    });
    it('trial: denies shares', () => {
        expect(isFeatureAvailable('trial', 'shares')).toBe(false);
    });

    // Basic tier
    it('basic: allows loans', () => {
        expect(isFeatureAvailable('basic', 'loans')).toBe(true);
    });
    it('basic: allows shares', () => {
        expect(isFeatureAvailable('basic', 'shares')).toBe(true);
    });
    it('basic: allows accounting', () => {
        expect(isFeatureAvailable('basic', 'accounting')).toBe(true);
    });
    it('basic: denies fixed_deposits', () => {
        expect(isFeatureAvailable('basic', 'fixed_deposits')).toBe(false);
    });
    it('basic: denies advanced_analytics', () => {
        expect(isFeatureAvailable('basic', 'advanced_analytics')).toBe(false);
    });

    // Pro tier
    it('pro: allows fixed_deposits', () => {
        expect(isFeatureAvailable('pro', 'fixed_deposits')).toBe(true);
    });
    it('pro: allows advanced_analytics', () => {
        expect(isFeatureAvailable('pro', 'advanced_analytics')).toBe(true);
    });
    it('pro: allows mobile_app', () => {
        expect(isFeatureAvailable('pro', 'mobile_app')).toBe(true);
    });
    it('pro: allows sso', () => {
        expect(isFeatureAvailable('pro', 'sso')).toBe(true);
    });

    // Unknown tier
    it('unknown tier: denies everything', () => {
        expect(isFeatureAvailable('enterprise', 'members')).toBe(false);
    });

    // Unknown feature
    it('unknown feature: returns false', () => {
        expect(isFeatureAvailable('pro', 'nonexistent_feature')).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════
// getAvailableFeatures
// ═══════════════════════════════════════════════════════════════

describe('getAvailableFeatures', () => {
    it('trial: returns limited set', () => {
        const features = getAvailableFeatures('trial');
        expect(features).toHaveLength(3);
        expect(features).toContain('members');
        expect(features).toContain('savings');
    });

    it('basic: returns more features than trial', () => {
        const basic = getAvailableFeatures('basic');
        const trial = getAvailableFeatures('trial');
        expect(basic.length).toBeGreaterThan(trial.length);
    });

    it('pro: returns most features', () => {
        const pro = getAvailableFeatures('pro');
        expect(pro.length).toBeGreaterThan(getAvailableFeatures('basic').length);
    });

    it('unknown tier: returns empty array', () => {
        expect(getAvailableFeatures('enterprise')).toEqual([]);
    });
});

// ═══════════════════════════════════════════════════════════════
// validateSubscription middleware
// ═══════════════════════════════════════════════════════════════

describe('validateSubscription', () => {
    let mockNext: Next;

    beforeEach(() => {
        mockNext = vi.fn().mockResolvedValue(undefined);
    });

    it('should pass when no tenant (public route)', async () => {
        const ctx = createMockContext(null);
        await validateSubscription(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });

    it('should pass for active subscription', async () => {
        const ctx = createMockContext({
            id: 't-1',
            code: 'T1',
            status: 'active',
            subscription_tier: 'basic',
            subscription_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        });
        await validateSubscription(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });

    it('should throw ForbiddenError for suspended tenant', async () => {
        const ctx = createMockContext({
            id: 't-1',
            code: 'T1',
            status: 'suspended',
            subscription_tier: 'basic',
        });
        await expect(validateSubscription(ctx, mockNext)).rejects.toThrow('suspended');
    });

    it('should throw ForbiddenError for expired subscription', async () => {
        const ctx = createMockContext({
            id: 't-1',
            code: 'T1',
            status: 'active',
            subscription_tier: 'basic',
            subscription_expires_at: new Date(Date.now() - 86400000).toISOString(), // yesterday
        });
        await expect(validateSubscription(ctx, mockNext)).rejects.toThrow('expired');
    });

    it('should set warning for expiring-soon subscription', async () => {
        const expiresIn3Days = new Date(Date.now() + 3 * 86400000).toISOString();
        const ctx = createMockContext({
            id: 't-1',
            code: 'T1',
            status: 'active',
            subscription_tier: 'basic',
            subscription_expires_at: expiresIn3Days,
        });
        await validateSubscription(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
        // Should have set a warning via c.set
        expect(ctx.set).toHaveBeenCalledWith(
            'subscriptionWarning',
            expect.objectContaining({ type: 'EXPIRING_SOON' }),
        );
    });

    it('should not warn if expiry is more than 7 days away', async () => {
        const expiresIn30Days = new Date(Date.now() + 30 * 86400000).toISOString();
        const ctx = createMockContext({
            id: 't-1',
            code: 'T1',
            status: 'active',
            subscription_tier: 'basic',
            subscription_expires_at: expiresIn30Days,
        });
        await validateSubscription(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
        // subscriptionWarning should NOT have been set
        const sets = (ctx.set as any).mock.calls;
        const warningCalls = sets.filter((c: any[]) => c[0] === 'subscriptionWarning');
        expect(warningCalls).toHaveLength(0);
    });

    it('should pass when no subscription_expires_at', async () => {
        const ctx = createMockContext({
            id: 't-1',
            code: 'T1',
            status: 'active',
            subscription_tier: 'basic',
        });
        await validateSubscription(ctx, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });
});
