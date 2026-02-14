/**
 * Export Service Tests
 * Tests for PDF, Excel, and CSV export generation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportService, ExportOptions, ExportColumn } from '../../src/services/exportService';

// Mock logger
vi.mock('../../src/middleware/logger', () => ({
    appLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('ExportService', () => {
    let service: ExportService;

    const SAMPLE_COLUMNS: ExportColumn[] = [
        { key: 'name', header: 'Name', width: 100, align: 'left' },
        { key: 'amount', header: 'Amount', width: 80, align: 'right', format: 'currency' },
        { key: 'date', header: 'Date', width: 80, align: 'left', format: 'date' },
        { key: 'status', header: 'Status', width: 60, align: 'center' },
    ];

    const SAMPLE_DATA = [
        { name: 'John Doe', amount: '50000.00', date: '2026-01-15', status: 'active' },
        { name: 'Jane Smith', amount: '25000.50', date: '2026-01-16', status: 'active' },
        { name: 'Bob Wilson', amount: '75000.75', date: '2026-01-17', status: 'closed' },
    ];

    const DEFAULT_OPTIONS: ExportOptions = {
        title: 'Test Report',
        subtitle: 'January 2026',
        columns: SAMPLE_COLUMNS,
        data: SAMPLE_DATA,
        generatedBy: 'admin@test.com',
        tenantName: 'Test SACCO',
        generatedAt: new Date('2026-01-20'),
    };

    beforeEach(() => {
        service = new ExportService();
    });

    // ── PDF Export ──

    describe('generatePdf', () => {
        it('should generate a non-empty PDF buffer', async () => {
            const buffer = await service.generatePdf(DEFAULT_OPTIONS);

            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBeGreaterThan(0);
        });

        it('should generate valid PDF (starts with %PDF)', async () => {
            const buffer = await service.generatePdf(DEFAULT_OPTIONS);

            const header = buffer.subarray(0, 5).toString('ascii');
            expect(header).toBe('%PDF-');
        });

        it('should handle empty data', async () => {
            const buffer = await service.generatePdf({ ...DEFAULT_OPTIONS, data: [] });

            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBeGreaterThan(0);
        });

        it('should handle large datasets', async () => {
            const largeData = Array.from({ length: 200 }, (_, i) => ({
                name: `Member ${i + 1}`,
                amount: (Math.random() * 100000).toFixed(2),
                date: '2026-01-15',
                status: i % 2 === 0 ? 'active' : 'closed',
            }));

            const buffer = await service.generatePdf({ ...DEFAULT_OPTIONS, data: largeData });

            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBeGreaterThan(0);
        });

        it('should include totals when provided', async () => {
            const buffer = await service.generatePdf({
                ...DEFAULT_OPTIONS,
                totals: { totalAmount: '150001.25', totalRecords: 3 },
            });

            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBeGreaterThan(0);
        });

        it('should support landscape orientation', async () => {
            const buffer = await service.generatePdf({
                ...DEFAULT_OPTIONS,
                orientation: 'landscape',
            });

            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBeGreaterThan(0);
        });
    });

    // ── Excel Export ──

    describe('generateExcel', () => {
        it('should generate a non-empty Excel buffer', async () => {
            const buffer = await service.generateExcel(DEFAULT_OPTIONS);

            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBeGreaterThan(0);
        });

        it('should generate valid xlsx (starts with PK zip header)', async () => {
            const buffer = await service.generateExcel(DEFAULT_OPTIONS);

            // XLSX files are ZIP files and start with PK
            const header = buffer.subarray(0, 2).toString('ascii');
            expect(header).toBe('PK');
        });

        it('should handle empty data', async () => {
            const buffer = await service.generateExcel({ ...DEFAULT_OPTIONS, data: [] });

            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBeGreaterThan(0);
        });

        it('should handle totals row', async () => {
            const buffer = await service.generateExcel({
                ...DEFAULT_OPTIONS,
                totals: { totalAmount: '150001.25' },
            });

            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBeGreaterThan(0);
        });

        it('should handle large datasets', async () => {
            const largeData = Array.from({ length: 500 }, (_, i) => ({
                name: `Member ${i + 1}`,
                amount: (Math.random() * 100000).toFixed(2),
                date: '2026-01-15',
                status: 'active',
            }));

            const buffer = await service.generateExcel({ ...DEFAULT_OPTIONS, data: largeData });

            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBeGreaterThan(0);
        });
    });

    // ── CSV Export ──

    describe('generateCsv', () => {
        it('should generate a valid CSV string', async () => {
            const buffer = await service.generateCsv(DEFAULT_OPTIONS);

            const csv = buffer.toString('utf-8');
            const lines = csv.split('\n');

            // Header + 3 data rows
            expect(lines.length).toBeGreaterThanOrEqual(4);
            expect(lines[0]).toBe('Name,Amount,Date,Status');
        });

        it('should format currency values', async () => {
            const buffer = await service.generateCsv(DEFAULT_OPTIONS);

            const csv = buffer.toString('utf-8');
            const lines = csv.split('\n');

            // Check first data row contains formatted amount
            expect(lines[1]).toContain('50');
        });

        it('should escape fields with commas', async () => {
            const dataWithCommas = [
                { name: 'Doe, John', amount: '50000.00', date: '2026-01-15', status: 'active' },
            ];

            const buffer = await service.generateCsv({ ...DEFAULT_OPTIONS, data: dataWithCommas });
            const csv = buffer.toString('utf-8');

            expect(csv).toContain('"Doe, John"');
        });

        it('should escape fields with quotes', async () => {
            const dataWithQuotes = [
                { name: 'John "JD" Doe', amount: '50000.00', date: '2026-01-15', status: 'active' },
            ];

            const buffer = await service.generateCsv({ ...DEFAULT_OPTIONS, data: dataWithQuotes });
            const csv = buffer.toString('utf-8');

            expect(csv).toContain('John ""JD"" Doe');
        });

        it('should handle empty data', async () => {
            const buffer = await service.generateCsv({ ...DEFAULT_OPTIONS, data: [] });

            const csv = buffer.toString('utf-8');
            const lines = csv.split('\n');

            // Should at least have header
            expect(lines.length).toBeGreaterThanOrEqual(1);
            expect(lines[0]).toBe('Name,Amount,Date,Status');
        });

        it('should handle null values gracefully', async () => {
            const dataWithNulls = [
                { name: 'John', amount: null, date: undefined, status: 'active' },
            ];

            const buffer = await service.generateCsv({ ...DEFAULT_OPTIONS, data: dataWithNulls });
            const csv = buffer.toString('utf-8');

            expect(csv).toContain('John');
        });

        it('should include totals when provided', async () => {
            const buffer = await service.generateCsv({
                ...DEFAULT_OPTIONS,
                totals: { totalAmount: '150001.25', totalRecords: 3 },
            });

            const csv = buffer.toString('utf-8');
            expect(csv).toContain('Total Amount');
            expect(csv).toContain('150001.25');
        });
    });

    // ── Format Helpers ──

    describe('format helpers', () => {
        it('should handle all column format types', async () => {
            const columns: ExportColumn[] = [
                { key: 'text_val', header: 'Text', format: 'text' },
                { key: 'num_val', header: 'Number', format: 'number' },
                { key: 'curr_val', header: 'Currency', format: 'currency' },
                { key: 'date_val', header: 'Date', format: 'date' },
                { key: 'pct_val', header: 'Percentage', format: 'percentage' },
            ];

            const data = [{
                text_val: 'hello',
                num_val: '1234',
                curr_val: '5000.50',
                date_val: '2026-01-15T00:00:00Z',
                pct_val: '0.75',
            }];

            const buffer = await service.generateCsv({
                title: 'Format Test',
                columns,
                data,
                generatedBy: 'test',
            });

            const csv = buffer.toString('utf-8');
            expect(csv).toContain('hello');
        });
    });
});
