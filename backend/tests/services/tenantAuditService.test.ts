// tests/services/tenantAuditService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database dependencies
const mockPoolQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
vi.mock('../../src/config/database', () => ({
    getPool: () => ({ query: mockPoolQuery }),
}));
vi.mock('../../src/middleware/logger', () => ({
    appLogger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import {
    logToPublicAudit,
    logToTenantSecurityEvents,
    logTenantSecurityEvent,
    queryPublicAuditLog,
    TenantAccessEvent,
} from '../../src/services/tenantAuditService';
import { appLogger } from '../../src/middleware/logger';

describe('TenantAuditService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── logToPublicAudit ─────────────────────────────────

    describe('logToPublicAudit', () => {
        it('should write event to public.tenant_audit_log', async () => {
            const event: TenantAccessEvent = {
                event_type: 'CROSS_TENANT_ACCESS',
                severity: 'critical',
                description: 'User attempted cross-tenant access',
                user_id: 'u1',
                tenant_id: 'tenant-1',
                schema_name: 'tenant_t1',
                tenant_code: 'T1',
            };

            await logToPublicAudit(event);

            expect(mockPoolQuery).toHaveBeenCalledTimes(1);
            const [sql, params] = mockPoolQuery.mock.calls[0];
            expect(sql).toContain('tenant_audit_log');
            expect(params[0]).toBe('tenant_t1');
            expect(params[1]).toBe('T1');
            expect(params[2]).toBe('CROSS_TENANT_ACCESS');
            // params[3] is JSON
            const details = JSON.parse(params[3]);
            expect(details.severity).toBe('critical');
            expect(details.user_id).toBe('u1');
        });

        it('should use defaults when optional fields missing', async () => {
            const event: TenantAccessEvent = {
                event_type: 'TENANT_ACCESS_DENIED',
                severity: 'medium',
                description: 'Denied',
            };

            await logToPublicAudit(event);

            const [, params] = mockPoolQuery.mock.calls[0];
            expect(params[0]).toBe('unknown'); // schema_name defaults
        });

        it('should not throw when pool.query fails', async () => {
            mockPoolQuery.mockRejectedValueOnce(new Error('DB down'));

            const event: TenantAccessEvent = {
                event_type: 'CROSS_TENANT_ACCESS',
                severity: 'critical',
                description: 'test',
            };

            // Should resolve without throwing
            await expect(logToPublicAudit(event)).resolves.toBeUndefined();
            expect(appLogger.error).toHaveBeenCalled();
        });
    });

    // ─── logToTenantSecurityEvents ────────────────────────

    describe('logToTenantSecurityEvents', () => {
        it('should insert into security_events with mapped event type', async () => {
            const mockExecute = vi.fn().mockResolvedValue(undefined);
            const mockValues = vi.fn().mockReturnValue({ execute: mockExecute });
            const mockInsertInto = vi.fn().mockReturnValue({ values: mockValues });
            const mockDb = { insertInto: mockInsertInto } as any;

            const event: TenantAccessEvent = {
                event_type: 'CROSS_TENANT_ACCESS',
                severity: 'critical',
                description: 'Cross-tenant attempt',
                user_id: 'u1',
                ip_address: '10.0.0.1',
            };

            await logToTenantSecurityEvents(mockDb, event);

            expect(mockInsertInto).toHaveBeenCalledWith('security_events');
            const insertedValues = mockValues.mock.calls[0][0];
            expect(insertedValues.event_type).toBe('unusual_activity');
            expect(insertedValues.severity).toBe('critical');
            expect(insertedValues.requires_investigation).toBe(true);
            expect(insertedValues.action_taken).toBe('Request blocked — 403 Forbidden');
        });

        it('should map SUPER_ADMIN_CROSS_TENANT to data_access', async () => {
            const mockExecute = vi.fn().mockResolvedValue(undefined);
            const mockValues = vi.fn().mockReturnValue({ execute: mockExecute });
            const mockInsertInto = vi.fn().mockReturnValue({ values: mockValues });
            const mockDb = { insertInto: mockInsertInto } as any;

            const event: TenantAccessEvent = {
                event_type: 'SUPER_ADMIN_CROSS_TENANT',
                severity: 'low',
                description: 'Super-admin access',
            };

            await logToTenantSecurityEvents(mockDb, event);

            const insertedValues = mockValues.mock.calls[0][0];
            expect(insertedValues.event_type).toBe('data_access');
            expect(insertedValues.requires_investigation).toBe(false);
        });

        it('should not throw when db insert fails', async () => {
            const mockDb = {
                insertInto: vi.fn().mockReturnValue({
                    values: vi.fn().mockReturnValue({
                        execute: vi.fn().mockRejectedValue(new Error('constraint violation')),
                    }),
                }),
            } as any;

            const event: TenantAccessEvent = {
                event_type: 'CROSS_TENANT_ACCESS',
                severity: 'critical',
                description: 'test',
            };

            await expect(logToTenantSecurityEvents(mockDb, event)).resolves.toBeUndefined();
            expect(appLogger.error).toHaveBeenCalled();
        });
    });

    // ─── logTenantSecurityEvent (combined) ────────────────

    describe('logTenantSecurityEvent', () => {
        it('should log to both public and tenant tables when db provided', async () => {
            const mockExecute = vi.fn().mockResolvedValue(undefined);
            const mockDb = {
                insertInto: vi.fn().mockReturnValue({
                    values: vi.fn().mockReturnValue({ execute: mockExecute }),
                }),
            } as any;

            const event: TenantAccessEvent = {
                event_type: 'CROSS_TENANT_ACCESS',
                severity: 'critical',
                description: 'Combined test',
                user_id: 'u1',
                tenant_id: 'tenant-1',
                schema_name: 'tenant_t1',
            };

            await logTenantSecurityEvent(event, mockDb);

            // Public log
            expect(mockPoolQuery).toHaveBeenCalled();
            // Tenant log
            expect(mockDb.insertInto).toHaveBeenCalledWith('security_events');
            // Application log (severity=critical → error level)
            expect(appLogger.error).toHaveBeenCalled();
        });

        it('should log only to public table when no tenant db', async () => {
            const event: TenantAccessEvent = {
                event_type: 'INVALID_SCHEMA_NAME',
                severity: 'critical',
                description: 'No tenant db available',
            };

            await logTenantSecurityEvent(event);

            expect(mockPoolQuery).toHaveBeenCalled();
        });

        it('should use warn level for medium severity', async () => {
            const event: TenantAccessEvent = {
                event_type: 'INACTIVE_TENANT_ACCESS',
                severity: 'medium',
                description: 'Medium severity event',
            };

            await logTenantSecurityEvent(event);

            expect(appLogger.warn).toHaveBeenCalled();
        });

        it('should use info level for low severity', async () => {
            const event: TenantAccessEvent = {
                event_type: 'SUPER_ADMIN_CROSS_TENANT',
                severity: 'low',
                description: 'Low severity event',
            };

            await logTenantSecurityEvent(event);

            expect(appLogger.info).toHaveBeenCalled();
        });
    });

    // ─── queryPublicAuditLog ──────────────────────────────

    describe('queryPublicAuditLog', () => {
        it('should query with no filters', async () => {
            mockPoolQuery.mockResolvedValueOnce({
                rows: [{ id: '1', schema_name: 'tenant_t1', operation: 'CROSS_TENANT_ACCESS' }],
            });

            const results = await queryPublicAuditLog();

            expect(mockPoolQuery).toHaveBeenCalled();
            const [sql] = mockPoolQuery.mock.calls[0];
            expect(sql).toContain('tenant_audit_log');
            expect(results).toHaveLength(1);
        });

        it('should apply schema_name filter', async () => {
            mockPoolQuery.mockResolvedValueOnce({ rows: [] });

            await queryPublicAuditLog({ schema_name: 'tenant_t1' });

            const [sql, params] = mockPoolQuery.mock.calls[0];
            expect(sql).toContain('schema_name = $1');
            expect(params[0]).toBe('tenant_t1');
        });

        it('should apply multiple filters', async () => {
            mockPoolQuery.mockResolvedValueOnce({ rows: [] });

            await queryPublicAuditLog({
                schema_name: 'tenant_t1',
                event_type: 'CROSS_TENANT_ACCESS',
                limit: 50,
            });

            const [sql, params] = mockPoolQuery.mock.calls[0];
            expect(sql).toContain('schema_name = $1');
            expect(sql).toContain('operation = $2');
            expect(params[0]).toBe('tenant_t1');
            expect(params[1]).toBe('CROSS_TENANT_ACCESS');
        });

        it('should return empty array on error', async () => {
            mockPoolQuery.mockRejectedValueOnce(new Error('DB error'));

            const results = await queryPublicAuditLog();

            expect(results).toEqual([]);
        });
    });
});
