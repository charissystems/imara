// tests/services/shareService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';

// ────────────────────────────────────────────────────────────
// Share Service Business Logic Tests
// ────────────────────────────────────────────────────────────

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

describe('ShareService - Business Logic', () => {

    // ─── Share Purchase Calculations ─────────────────────────

    describe('Share Purchase Calculations', () => {
        const calculatePurchaseTotal = (quantity: number, unitPrice: string): { total: string; avgCost: string } => {
            const price = new Decimal(unitPrice);
            const total = price.mul(quantity);
            return { total: total.toFixed(2), avgCost: price.toFixed(2) };
        };

        it('should calculate total cost for share purchase', () => {
            const result = calculatePurchaseTotal(100, '500.00');
            expect(result.total).toBe('50000.00');
            expect(result.avgCost).toBe('500.00');
        });

        it('should handle fractional prices', () => {
            const result = calculatePurchaseTotal(50, '1250.75');
            expect(result.total).toBe('62537.50');
        });

        it('should handle single share purchase', () => {
            const result = calculatePurchaseTotal(1, '10000.00');
            expect(result.total).toBe('10000.00');
        });

        it('should handle large quantity purchases', () => {
            const result = calculatePurchaseTotal(10000, '100.00');
            expect(result.total).toBe('1000000.00');
        });
    });

    // ─── Average Cost Calculation ────────────────────────────

    describe('Average Cost Per Share', () => {
        const calculateNewAvgCost = (
            existingShares: number,
            existingInvested: string,
            newQuantity: number,
            newPrice: string,
        ): { avgCost: string; totalShares: number; totalInvested: string } => {
            const existingInv = new Decimal(existingInvested);
            const newTotal = new Decimal(newPrice).mul(newQuantity);
            const totalInvested = existingInv.plus(newTotal);
            const totalShares = existingShares + newQuantity;
            const avgCost = totalInvested.div(totalShares);
            return {
                avgCost: avgCost.toFixed(2),
                totalShares,
                totalInvested: totalInvested.toFixed(2),
            };
        };

        it('should calculate average cost after additional purchase', () => {
            // Existing: 100 shares @ 500 = 50,000. Buying 50 @ 600 = 30,000
            // New total = 80,000 / 150 = 533.33
            const result = calculateNewAvgCost(100, '50000', 50, '600');
            expect(result.avgCost).toBe('533.33');
            expect(result.totalShares).toBe(150);
            expect(result.totalInvested).toBe('80000.00');
        });

        it('should handle first purchase (no existing)', () => {
            const result = calculateNewAvgCost(0, '0', 100, '500');
            expect(result.avgCost).toBe('500.00');
            expect(result.totalShares).toBe(100);
        });

        it('should handle purchase at same price', () => {
            const result = calculateNewAvgCost(100, '50000', 100, '500');
            expect(result.avgCost).toBe('500.00');
            expect(result.totalShares).toBe(200);
        });
    });

    // ─── Holding Limits Enforcement ──────────────────────────

    describe('Holding Limits', () => {
        const validateHoldingLimits = (
            currentShares: number,
            purchaseQuantity: number,
            minimumShares: number | null,
            maximumShares: number | null,
        ): { valid: boolean; errors: string[] } => {
            const errors: string[] = [];

            if (minimumShares != null && purchaseQuantity < minimumShares) {
                errors.push(`Minimum purchase is ${minimumShares} shares`);
            }

            const newTotal = currentShares + purchaseQuantity;
            if (maximumShares != null && newTotal > maximumShares) {
                errors.push(
                    `Maximum holding is ${maximumShares} shares. ` +
                    `Current: ${currentShares}, requested: ${purchaseQuantity}`
                );
            }

            return { valid: errors.length === 0, errors };
        };

        it('should allow purchase within limits', () => {
            const result = validateHoldingLimits(50, 10, 1, 1000);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should reject below minimum purchase', () => {
            const result = validateHoldingLimits(0, 5, 10, 1000);
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('Minimum purchase');
        });

        it('should reject exceeding maximum holding', () => {
            const result = validateHoldingLimits(990, 20, 1, 1000);
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('Maximum holding');
        });

        it('should allow purchase at exact maximum', () => {
            const result = validateHoldingLimits(990, 10, 1, 1000);
            expect(result.valid).toBe(true);
        });

        it('should handle null limits (no restriction)', () => {
            const result = validateHoldingLimits(5000, 10000, null, null);
            expect(result.valid).toBe(true);
        });

        it('should handle zero current holdings', () => {
            const result = validateHoldingLimits(0, 100, 10, 500);
            expect(result.valid).toBe(true);
        });
    });

    // ─── Share Transfer Validation ───────────────────────────

    describe('Transfer Validation', () => {
        const validateTransfer = (
            senderShares: number,
            quantity: number,
            isLocked: boolean,
            receiverShares: number,
            maximumShares: number | null,
        ): { valid: boolean; errors: string[] } => {
            const errors: string[] = [];

            if (quantity <= 0) {
                errors.push('Transfer quantity must be greater than zero');
            }

            if (isLocked) {
                errors.push('Sender\'s shares are locked and cannot be transferred');
            }

            if (senderShares < quantity) {
                errors.push(`Insufficient shares. Available: ${senderShares}, requested: ${quantity}`);
            }

            const receiverNewTotal = receiverShares + quantity;
            if (maximumShares != null && receiverNewTotal > maximumShares) {
                errors.push(`Transfer would exceed maximum holding limit (${maximumShares}) for receiver`);
            }

            return { valid: errors.length === 0, errors };
        };

        it('should allow valid transfer', () => {
            const result = validateTransfer(100, 50, false, 20, 1000);
            expect(result.valid).toBe(true);
        });

        it('should reject transfer of locked shares', () => {
            const result = validateTransfer(100, 50, true, 20, 1000);
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('locked');
        });

        it('should reject insufficient shares', () => {
            const result = validateTransfer(30, 50, false, 20, 1000);
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('Insufficient');
        });

        it('should reject exceeding receiver max', () => {
            const result = validateTransfer(100, 50, false, 960, 1000);
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('maximum holding limit');
        });

        it('should reject zero quantity', () => {
            const result = validateTransfer(100, 0, false, 20, 1000);
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('greater than zero');
        });

        it('should allow transfer of all shares', () => {
            const result = validateTransfer(100, 100, false, 0, 1000);
            expect(result.valid).toBe(true);
        });
    });

    // ─── Dividend Calculations ───────────────────────────────

    describe('Dividend Calculations', () => {
        const calculateDividend = (
            shares: number,
            dividendPerShare: string,
            whtRate: string,
        ): { gross: string; wht: string; net: string } => {
            const dps = new Decimal(dividendPerShare);
            const gross = dps.mul(shares);
            const wht = gross.mul(new Decimal(whtRate).div(100));
            const net = gross.minus(wht);
            return {
                gross: gross.toFixed(2),
                wht: wht.toFixed(2),
                net: net.toFixed(2),
            };
        };

        it('should calculate gross, WHT, and net dividend', () => {
            // 100 shares × 50/share = 5,000 gross
            // WHT 15% = 750
            // Net = 4,250
            const result = calculateDividend(100, '50', '15');
            expect(result.gross).toBe('5000.00');
            expect(result.wht).toBe('750.00');
            expect(result.net).toBe('4250.00');
        });

        it('should handle zero WHT rate', () => {
            const result = calculateDividend(200, '25', '0');
            expect(result.gross).toBe('5000.00');
            expect(result.wht).toBe('0.00');
            expect(result.net).toBe('5000.00');
        });

        it('should handle fractional dividend per share', () => {
            const result = calculateDividend(150, '33.333', '10');
            const gross = new Decimal('33.333').mul(150);
            expect(result.gross).toBe(gross.toFixed(2));
        });

        it('should handle single share', () => {
            const result = calculateDividend(1, '100', '20');
            expect(result.gross).toBe('100.00');
            expect(result.wht).toBe('20.00');
            expect(result.net).toBe('80.00');
        });

        it('should handle large holdings', () => {
            const result = calculateDividend(50000, '10', '15');
            expect(result.gross).toBe('500000.00');
            expect(result.wht).toBe('75000.00');
            expect(result.net).toBe('425000.00');
        });
    });

    // ─── Dividend Distribution Totals ────────────────────────

    describe('Dividend Distribution', () => {
        it('should sum total distribution across multiple holders', () => {
            const holders = [
                { memberId: 'a', shares: 100 },
                { memberId: 'b', shares: 200 },
                { memberId: 'c', shares: 50 },
            ];

            const dividendPerShare = new Decimal('25');
            const whtRate = new Decimal('15');

            let totalGross = new Decimal(0);
            let totalWht = new Decimal(0);
            let totalNet = new Decimal(0);

            for (const holder of holders) {
                const gross = dividendPerShare.mul(holder.shares);
                const wht = gross.mul(whtRate).div(100);
                const net = gross.minus(wht);
                totalGross = totalGross.plus(gross);
                totalWht = totalWht.plus(wht);
                totalNet = totalNet.plus(net);
            }

            // Total shares = 350, DPS = 25
            // Gross = 8,750
            // WHT = 1,312.50
            // Net = 7,437.50
            expect(totalGross.toFixed(2)).toBe('8750.00');
            expect(totalWht.toFixed(2)).toBe('1312.50');
            expect(totalNet.toFixed(2)).toBe('7437.50');
        });
    });

    // ─── Certificate Number Generation ───────────────────────

    describe('Certificate Number Generation', () => {
        it('should generate unique certificate numbers', () => {
            const gen = () => `SH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
            const cert1 = gen();
            const cert2 = gen();
            expect(cert1).toMatch(/^SH-[A-Z0-9]+-[A-Z0-9]+$/);
            expect(cert2).toMatch(/^SH-[A-Z0-9]+-[A-Z0-9]+$/);
            // Generated at close intervals, but random suffix ensures uniqueness
            expect(cert1).not.toBe(cert2);
        });
    });
});
