// tests/services/shareService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { ShareService } from '../../src/services/shareService';

// ────────────────────────────────────────────────────────────
// Mock DB Builder
// ────────────────────────────────────────────────────────────

function createMockQueryBuilder(rows: any[] = []) {
    const builder: any = {
        selectAll: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(rows),
        executeTakeFirst: vi.fn().mockResolvedValue(rows[0] ?? undefined),
        returning: vi.fn().mockReturnThis(),
        returningAll: vi.fn().mockReturnThis(),
        executeTakeFirstOrThrow: vi.fn().mockResolvedValue(rows[0] ?? {id: 'new-id'}),
        values: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
    };
    return builder;
}

function createMockDb(overrides: Record<string, any> = {}) {
    const insertBuilder = {
        values: vi.fn().mockReturnValue({
            returning: vi.fn().mockReturnValue({
                execute: vi.fn().mockResolvedValue(overrides.insertRows || [{ id: 'new-id' }]),
            }),
            returningAll: vi.fn().mockReturnValue({
                executeTakeFirstOrThrow: vi.fn().mockResolvedValue(overrides.insertRows?.[0] || { id: 'new-id' }),
                executeTakeFirst: vi.fn().mockResolvedValue(overrides.insertRows?.[0] || { id: 'new-id' }),
            }),
        }),
    };

    const updateBuilder = {
        set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
                returningAll: vi.fn().mockReturnValue({
                    executeTakeFirstOrThrow: vi.fn().mockResolvedValue(overrides.updateRows?.[0] || { id: 'updated-id' }),
                }),
                execute: vi.fn().mockResolvedValue([]),
            }),
        }),
    };

    return {
        selectFrom: vi.fn().mockReturnValue(createMockQueryBuilder(overrides.selectRows || [])),
        insertInto: vi.fn().mockReturnValue(insertBuilder),
        updateTable: vi.fn().mockReturnValue(updateBuilder),
        transaction: vi.fn(),
    } as any;
}

// ────────────────────────────────────────────────────────────
// Actual Service Tests
// ────────────────────────────────────────────────────────────

describe('ShareService - purchaseShares', () => {
    it('should throw error for inactive share class', async () => {
        const mockDb = createMockDb({ selectRows: [] });
        const service = new ShareService(mockDb);

        await expect(
            service.purchaseShares({
                memberId: 'member-1',
                shareClassId: 'class-999',
                quantity: 10,
                paymentMethod: 'cash',
                recordedBy: 'staff-1',
            })
        ).rejects.toThrow('Share class not found or inactive');
    });

    it('should throw error for zero unit price', async () => {
        const mockShareClass = {
            id: 'class-1',
            current_price: '0',
            is_active: true,
            deleted_at: null,
        };
        const mockDb = createMockDb({ selectRows: [mockShareClass] });
        const service = new ShareService(mockDb);

        await expect(
            service.purchaseShares({
                memberId: 'member-1',
                shareClassId: 'class-1',
                quantity: 10,
                paymentMethod: 'cash',
                recordedBy: 'staff-1',
            })
        ).rejects.toThrow('Unit price must be greater than zero');
    });

    it('should throw error for negative quantity', async () => {
        const mockShareClass = {
            id: 'class-1',
            current_price: '100',
            is_active: true,
            deleted_at: null,
        };
        const mockDb = createMockDb({ selectRows: [mockShareClass] });
        const service = new ShareService(mockDb);

        await expect(
            service.purchaseShares({
                memberId: 'member-1',
                shareClassId: 'class-1',
                quantity: -5,
                paymentMethod: 'cash',
                recordedBy: 'staff-1',
            })
        ).rejects.toThrow('Quantity must be greater than zero');
    });
});

// ────────────────────────────────────────────────────────────
// purchaseShares – happy paths via mock DB
// ────────────────────────────────────────────────────────────

describe('ShareService - purchaseShares happy paths', () => {
    it('should purchase shares and create new holding', async () => {
        const mockShareClass = {
            id: 'class-1',
            name: 'Ordinary',
            code: 'ORD',
            current_price: '500',
            minimum_shares: 1,
            maximum_shares: 10000,
            is_active: true,
            deleted_at: null,
        };

        const holdingResult = {
            id: 'holding-1',
            total_shares: 100,
            total_invested: '50000',
            certificate_number: 'SH-ABC-1234',
        };
        const txResult = { id: 'tx-1' };

        // selectFrom calls: 1st for share_classes, 2nd for share_holdings (no existing)
        const selectBuilder1 = createMockQueryBuilder([mockShareClass]);
        const selectBuilder2 = createMockQueryBuilder([]); // no existing holding

        let selectCallCount = 0;
        const mockDb = createMockDb({
            insertRows: [holdingResult],
        });
        mockDb.selectFrom = vi.fn().mockImplementation(() => {
            selectCallCount++;
            return selectCallCount === 1 ? selectBuilder1 : selectBuilder2;
        });

        // Insert must return holding first, then transaction
        const insertBuilder = {
            values: vi.fn().mockReturnValue({
                returningAll: vi.fn().mockReturnValue({
                    executeTakeFirstOrThrow: vi.fn()
                        .mockResolvedValueOnce(holdingResult)
                        .mockResolvedValueOnce(txResult),
                }),
                execute: vi.fn().mockResolvedValue([]),
            }),
        };
        mockDb.insertInto = vi.fn().mockReturnValue(insertBuilder);

        const service = new ShareService(mockDb);
        const result = await service.purchaseShares({
            memberId: 'member-1',
            shareClassId: 'class-1',
            quantity: 100,
            paymentMethod: 'cash',
            recordedBy: 'staff-1',
        });

        expect(result.holding.id).toBe('holding-1');
        expect(result.holding.totalShares).toBe(100);
        expect(result.transaction.id).toBe('tx-1');
        expect(result.transaction.quantity).toBe(100);
    });

    it('should enforce minimum shares requirement', async () => {
        const mockShareClass = {
            id: 'class-1',
            name: 'Premium',
            current_price: '1000',
            minimum_shares: 50,
            maximum_shares: null,
            is_active: true,
            deleted_at: null,
        };

        const selectBuilder1 = createMockQueryBuilder([mockShareClass]);
        const selectBuilder2 = createMockQueryBuilder([]); // no existing holding
        let selectCallCount = 0;
        const mockDb = createMockDb();
        mockDb.selectFrom = vi.fn().mockImplementation(() => {
            selectCallCount++;
            return selectCallCount === 1 ? selectBuilder1 : selectBuilder2;
        });

        const service = new ShareService(mockDb);
        await expect(
            service.purchaseShares({
                memberId: 'member-1',
                shareClassId: 'class-1',
                quantity: 10, // below minimum of 50
                paymentMethod: 'cash',
                recordedBy: 'staff-1',
            })
        ).rejects.toThrow('Minimum purchase is 50 shares');
    });

    it('should enforce maximum shares limit', async () => {
        const mockShareClass = {
            id: 'class-1',
            name: 'Standard',
            current_price: '100',
            minimum_shares: null,
            maximum_shares: 500,
            is_active: true,
            deleted_at: null,
        };

        const existingHolding = {
            id: 'holding-1',
            total_shares: 480,
            total_invested: '48000',
        };

        const selectBuilder1 = createMockQueryBuilder([mockShareClass]);
        const selectBuilder2 = createMockQueryBuilder([existingHolding]);
        let selectCallCount = 0;
        const mockDb = createMockDb();
        mockDb.selectFrom = vi.fn().mockImplementation(() => {
            selectCallCount++;
            return selectCallCount === 1 ? selectBuilder1 : selectBuilder2;
        });

        const service = new ShareService(mockDb);
        await expect(
            service.purchaseShares({
                memberId: 'member-1',
                shareClassId: 'class-1',
                quantity: 30, // 480 + 30 = 510 > 500
                paymentMethod: 'cash',
                recordedBy: 'staff-1',
            })
        ).rejects.toThrow('Maximum holding is 500 shares');
    });
});

// ────────────────────────────────────────────────────────────
// transferShares
// ────────────────────────────────────────────────────────────

describe('ShareService - transferShares', () => {
    it('should reject self-transfer', async () => {
        const mockDb = createMockDb();
        const service = new ShareService(mockDb);

        await expect(
            service.transferShares({
                fromMemberId: 'member-1',
                toMemberId: 'member-1',
                shareClassId: 'class-1',
                quantity: 10,
                initiatedBy: 'staff-1',
            })
        ).rejects.toThrow('Cannot transfer shares to yourself');
    });

    it('should reject zero quantity transfer', async () => {
        const mockDb = createMockDb();
        const service = new ShareService(mockDb);

        await expect(
            service.transferShares({
                fromMemberId: 'member-1',
                toMemberId: 'member-2',
                shareClassId: 'class-1',
                quantity: 0,
                initiatedBy: 'staff-1',
            })
        ).rejects.toThrow('Transfer quantity must be greater than zero');
    });

    it('should reject when share class not found', async () => {
        const mockDb = createMockDb({ selectRows: [] });
        const service = new ShareService(mockDb);

        await expect(
            service.transferShares({
                fromMemberId: 'member-1',
                toMemberId: 'member-2',
                shareClassId: 'class-999',
                quantity: 10,
                initiatedBy: 'staff-1',
            })
        ).rejects.toThrow('Share class not found');
    });

    it('should reject when sender has no shares', async () => {
        const mockShareClass = {
            id: 'class-1',
            current_price: '100',
            maximum_shares: null,
            deleted_at: null,
        };

        // 1st select: share class found, 2nd select: no sender holding
        const selectBuilder1 = createMockQueryBuilder([mockShareClass]);
        const selectBuilder2 = createMockQueryBuilder([]);
        let selectCallCount = 0;
        const mockDb = createMockDb();
        mockDb.selectFrom = vi.fn().mockImplementation(() => {
            selectCallCount++;
            return selectCallCount === 1 ? selectBuilder1 : selectBuilder2;
        });

        const service = new ShareService(mockDb);
        await expect(
            service.transferShares({
                fromMemberId: 'member-1',
                toMemberId: 'member-2',
                shareClassId: 'class-1',
                quantity: 10,
                initiatedBy: 'staff-1',
            })
        ).rejects.toThrow('Sender has no shares in this class');
    });

    it('should reject transfer of locked shares', async () => {
        const mockShareClass = {
            id: 'class-1',
            current_price: '100',
            maximum_shares: null,
            deleted_at: null,
        };

        const senderHolding = {
            id: 'holding-1',
            total_shares: 100,
            total_invested: '10000',
            is_locked: true,
        };

        const selectBuilder1 = createMockQueryBuilder([mockShareClass]);
        const selectBuilder2 = createMockQueryBuilder([senderHolding]);
        let selectCallCount = 0;
        const mockDb = createMockDb();
        mockDb.selectFrom = vi.fn().mockImplementation(() => {
            selectCallCount++;
            return selectCallCount === 1 ? selectBuilder1 : selectBuilder2;
        });

        const service = new ShareService(mockDb);
        await expect(
            service.transferShares({
                fromMemberId: 'member-1',
                toMemberId: 'member-2',
                shareClassId: 'class-1',
                quantity: 10,
                initiatedBy: 'staff-1',
            })
        ).rejects.toThrow("Sender's shares are locked");
    });

    it('should reject insufficient shares for transfer', async () => {
        const mockShareClass = {
            id: 'class-1',
            current_price: '100',
            maximum_shares: null,
            deleted_at: null,
        };

        const senderHolding = {
            id: 'holding-1',
            total_shares: 5,
            total_invested: '500',
            is_locked: false,
        };

        const selectBuilder1 = createMockQueryBuilder([mockShareClass]);
        const selectBuilder2 = createMockQueryBuilder([senderHolding]);
        let selectCallCount = 0;
        const mockDb = createMockDb();
        mockDb.selectFrom = vi.fn().mockImplementation(() => {
            selectCallCount++;
            return selectCallCount === 1 ? selectBuilder1 : selectBuilder2;
        });

        const service = new ShareService(mockDb);
        await expect(
            service.transferShares({
                fromMemberId: 'member-1',
                toMemberId: 'member-2',
                shareClassId: 'class-1',
                quantity: 10,
                initiatedBy: 'staff-1',
            })
        ).rejects.toThrow('Insufficient shares');
    });

    it('should reject when transfer would exceed receiver max', async () => {
        const mockShareClass = {
            id: 'class-1',
            current_price: '100',
            maximum_shares: 200,
            deleted_at: null,
        };

        const senderHolding = {
            id: 'holding-1',
            total_shares: 100,
            total_invested: '10000',
            is_locked: false,
        };

        const receiverHolding = {
            id: 'holding-2',
            total_shares: 190,
            total_invested: '19000',
        };

        // 1st: share class, 2nd: sender, 3rd: receiver
        const selectBuilder1 = createMockQueryBuilder([mockShareClass]);
        const selectBuilder2 = createMockQueryBuilder([senderHolding]);
        const selectBuilder3 = createMockQueryBuilder([receiverHolding]);
        let selectCallCount = 0;
        const mockDb = createMockDb();
        mockDb.selectFrom = vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) return selectBuilder1;
            if (selectCallCount === 2) return selectBuilder2;
            return selectBuilder3;
        });

        const service = new ShareService(mockDb);
        await expect(
            service.transferShares({
                fromMemberId: 'member-1',
                toMemberId: 'member-2',
                shareClassId: 'class-1',
                quantity: 20, // 190 + 20 = 210 > 200
                initiatedBy: 'staff-1',
            })
        ).rejects.toThrow('exceed maximum holding limit');
    });
});

// ────────────────────────────────────────────────────────────
// declareDividend
// ────────────────────────────────────────────────────────────

describe('ShareService - declareDividend', () => {
    it('should throw when share class not found', async () => {
        const mockDb = createMockDb({ selectRows: [] });
        const service = new ShareService(mockDb);

        await expect(
            service.declareDividend({
                shareClassId: 'class-999',
                dividendPerShare: '50',
                recordDate: new Date(),
                paymentDate: new Date(),
                declaredBy: 'staff-1',
            })
        ).rejects.toThrow('Share class not found');
    });

    it('should throw when share class is not dividend eligible', async () => {
        const mockShareClass = {
            id: 'class-1',
            code: 'ORD',
            dividend_eligible: false,
            deleted_at: null,
        };
        const mockDb = createMockDb({ selectRows: [mockShareClass] });
        const service = new ShareService(mockDb);

        await expect(
            service.declareDividend({
                shareClassId: 'class-1',
                dividendPerShare: '50',
                recordDate: new Date(),
                paymentDate: new Date(),
                declaredBy: 'staff-1',
            })
        ).rejects.toThrow('not eligible for dividends');
    });

    it('should create dividend declaration on happy path', async () => {
        const mockShareClass = {
            id: 'class-1',
            code: 'ORD',
            dividend_eligible: true,
            deleted_at: null,
        };

        const declarationResult = { id: 'decl-1' };

        const mockDb = createMockDb({
            selectRows: [mockShareClass],
            insertRows: [declarationResult],
        });
        const service = new ShareService(mockDb);

        const result = await service.declareDividend({
            shareClassId: 'class-1',
            dividendPerShare: '50',
            recordDate: new Date('2026-01-01'),
            paymentDate: new Date('2026-02-01'),
            withholdingTaxRate: '15',
            declaredBy: 'staff-1',
        });

        expect(result.declarationId).toBe('decl-1');
    });
});

// ────────────────────────────────────────────────────────────
// distributeDividend
// ────────────────────────────────────────────────────────────

describe('ShareService - distributeDividend', () => {
    it('should throw when declaration not found', async () => {
        const mockDb = createMockDb({ selectRows: [] });
        const service = new ShareService(mockDb);

        await expect(
            service.distributeDividend('decl-999', 'staff-1')
        ).rejects.toThrow('Dividend declaration not found');
    });

    it('should throw when declaration is not approved', async () => {
        const declaration = {
            id: 'decl-1',
            status: 'draft',
            deleted_at: null,
        };
        const mockDb = createMockDb({ selectRows: [declaration] });
        const service = new ShareService(mockDb);

        await expect(
            service.distributeDividend('decl-1', 'staff-1')
        ).rejects.toThrow("Cannot distribute dividend in 'draft' status");
    });

    it('should distribute dividend to holders on happy path', async () => {
        const declaration = {
            id: 'decl-1',
            status: 'approved',
            share_class_id: 'class-1',
            dividend_per_share: '25',
            withholding_tax_rate: '15',
            dividend_number: 'DIV-2026-ABC',
            deleted_at: null,
        };

        const holdings = [
            { id: 'h-1', member_id: 'member-1', total_shares: 100 },
            { id: 'h-2', member_id: 'member-2', total_shares: 200 },
        ];

        // 1st select: declaration, 2nd select: holdings
        const selectBuilder1 = createMockQueryBuilder([declaration]);
        const selectBuilder2 = createMockQueryBuilder(holdings);
        let selectCallCount = 0;

        const mockDb = createMockDb();
        mockDb.selectFrom = vi.fn().mockImplementation(() => {
            selectCallCount++;
            return selectCallCount === 1 ? selectBuilder1 : selectBuilder2;
        });

        // Fix insertInto mock to support .values().execute() chain (no returning)
        const insertBuilder = {
            values: vi.fn().mockReturnValue({
                execute: vi.fn().mockResolvedValue([]),
                returningAll: vi.fn().mockReturnValue({
                    executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'new-id' }),
                }),
            }),
        };
        mockDb.insertInto = vi.fn().mockReturnValue(insertBuilder);

        const service = new ShareService(mockDb);
        const result = await service.distributeDividend('decl-1', 'staff-1');

        expect(result.declarationId).toBe('decl-1');
        expect(result.holdersProcessed).toBe(2);
        // 100*25 + 200*25 = 7500 gross
        expect(result.totalDividendAmount).toBe('7500.00');
        // 7500 * 15% = 1125
        expect(result.totalWithholdingTax).toBe('1125.00');
        // 7500 - 1125 = 6375
        expect(result.totalNetDividend).toBe('6375.00');
        expect(result.errors).toHaveLength(0);
    });
});

// ────────────────────────────────────────────────────────────
// getShareCertificateData
// ────────────────────────────────────────────────────────────

describe('ShareService - getShareCertificateData', () => {
    it('should throw when holding not found', async () => {
        const mockDb = createMockDb({ selectRows: [] });
        const service = new ShareService(mockDb);

        await expect(
            service.getShareCertificateData('holding-999')
        ).rejects.toThrow('Share holding not found');
    });

    it('should return certificate data for valid holding', async () => {
        const holdingRow = {
            certificate_number: 'SH-ABC-1234',
            total_shares: 100,
            total_invested: '50000',
            purchase_date: new Date('2025-06-15'),
            member_id: 'member-1',
            class_name: 'Ordinary',
            class_code: 'ORD',
            par_value: '500',
            first_name: 'John',
            last_name: 'Doe',
        };

        const saccoConfig = { organization_name: 'Test SACCO' };

        const selectBuilder1 = createMockQueryBuilder([holdingRow]);
        const selectBuilder2 = createMockQueryBuilder([saccoConfig]);
        let selectCallCount = 0;

        const mockDb = createMockDb();
        mockDb.selectFrom = vi.fn().mockImplementation(() => {
            selectCallCount++;
            return selectCallCount === 1 ? selectBuilder1 : selectBuilder2;
        });

        const service = new ShareService(mockDb);
        const result = await service.getShareCertificateData('holding-1');

        expect(result.certificateNumber).toBe('SH-ABC-1234');
        expect(result.memberName).toBe('John Doe');
        expect(result.memberId).toBe('member-1');
        expect(result.shareClassName).toBe('Ordinary');
        expect(result.shareClassCode).toBe('ORD');
        expect(result.totalShares).toBe(100);
        expect(result.parValue).toBe('500.00');
        expect(result.totalInvested).toBe('50000.00');
        expect(result.saccoName).toBe('Test SACCO');
        expect(result.purchaseDate).toBe('2025-06-15');
    });
});

// ────────────────────────────────────────────────────────────
// getShareRegister
// ────────────────────────────────────────────────────────────

describe('ShareService - getShareRegister', () => {
    it('should return empty register when no holdings', async () => {
        const mockDb = createMockDb({ selectRows: [] });
        const service = new ShareService(mockDb);

        const result = await service.getShareRegister();
        expect(result).toEqual([]);
    });

    it('should return register entries with correct format', async () => {
        const rows = [
            {
                member_id: 'member-1',
                first_name: 'Jane',
                last_name: 'Doe',
                class_name: 'Ordinary',
                total_shares: 200,
                total_invested: '100000',
                certificate_number: 'SH-111-AAAA',
            },
            {
                member_id: 'member-2',
                first_name: 'Bob',
                last_name: 'Smith',
                class_name: 'Ordinary',
                total_shares: 50,
                total_invested: '25000',
                certificate_number: 'SH-222-BBBB',
            },
        ];
        const mockDb = createMockDb({ selectRows: rows });
        const service = new ShareService(mockDb);

        const result = await service.getShareRegister('class-1');
        expect(result).toHaveLength(2);
        expect(result[0].memberName).toBe('Jane Doe');
        expect(result[0].totalShares).toBe(200);
        expect(result[0].totalInvested).toBe('100000.00');
        expect(result[1].memberName).toBe('Bob Smith');
    });
});

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
