/**
 * Export Service
 * Generates PDF, Excel, and CSV exports for reports
 *
 * Implements requirements:
 * - RPT-004: Export reports in PDF, Excel, and CSV formats
 */

import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { Readable } from 'stream';
import { appLogger } from '../middleware/logger';

// ── Types ──

export type ExportFormat = 'pdf' | 'excel' | 'csv';

export interface ExportColumn {
    key: string;
    header: string;
    width?: number;
    align?: 'left' | 'center' | 'right';
    format?: 'text' | 'number' | 'currency' | 'date' | 'percentage';
}

export interface ExportOptions {
    title: string;
    subtitle?: string;
    columns: ExportColumn[];
    data: Record<string, any>[];
    totals?: Record<string, any>;
    generatedBy: string;
    generatedAt?: Date;
    tenantName?: string;
    orientation?: 'portrait' | 'landscape';
}

export class ExportService {
    // ── PDF Export ──

    async generatePdf(options: ExportOptions): Promise<Buffer> {
        appLogger.info('Generating PDF export', { title: options.title, rows: options.data.length });

        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({
                size: 'A4',
                layout: options.orientation || 'portrait',
                margin: 40,
                bufferPages: true,
            });

            const chunks: Buffer[] = [];
            doc.on('data', (chunk: Buffer) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Header
            this.renderPdfHeader(doc, options);

            // Table
            this.renderPdfTable(doc, options);

            // Totals
            if (options.totals) {
                this.renderPdfTotals(doc, options);
            }

            // Footer
            this.renderPdfFooter(doc, options);

            doc.end();
        });
    }

    private renderPdfHeader(doc: PDFKit.PDFDocument, options: ExportOptions): void {
        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

        if (options.tenantName) {
            doc.fontSize(14).font('Helvetica-Bold').text(options.tenantName, { align: 'center' });
            doc.moveDown(0.3);
        }

        doc.fontSize(16).font('Helvetica-Bold').text(options.title, { align: 'center' });

        if (options.subtitle) {
            doc.fontSize(10).font('Helvetica').text(options.subtitle, { align: 'center' });
        }

        const genAt = options.generatedAt || new Date();
        doc.fontSize(8).font('Helvetica')
            .text(`Generated: ${genAt.toISOString().split('T')[0]} | By: ${options.generatedBy}`, { align: 'right' });

        doc.moveDown(1);

        // Divider
        doc.moveTo(doc.page.margins.left, doc.y)
            .lineTo(doc.page.margins.left + pageWidth, doc.y)
            .stroke();
        doc.moveDown(0.5);
    }

    private renderPdfTable(doc: PDFKit.PDFDocument, options: ExportOptions): void {
        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const cols = options.columns;
        const totalColWidth = cols.reduce((sum, c) => sum + (c.width || 80), 0);
        const scale = pageWidth / totalColWidth;

        const startX = doc.page.margins.left;
        let y = doc.y;

        // Header row
        doc.fontSize(8).font('Helvetica-Bold');
        let x = startX;
        for (const col of cols) {
            const w = (col.width || 80) * scale;
            doc.text(col.header, x, y, { width: w, align: col.align || 'left' });
            x += w;
        }
        y += 14;

        // Divider
        doc.moveTo(startX, y).lineTo(startX + pageWidth, y).stroke();
        y += 4;

        // Data rows
        doc.font('Helvetica').fontSize(7);
        for (const row of options.data) {
            // Check page break
            if (y > doc.page.height - doc.page.margins.bottom - 30) {
                doc.addPage();
                y = doc.page.margins.top;

                // Re-render header on new page
                doc.fontSize(8).font('Helvetica-Bold');
                x = startX;
                for (const col of cols) {
                    const w = (col.width || 80) * scale;
                    doc.text(col.header, x, y, { width: w, align: col.align || 'left' });
                    x += w;
                }
                y += 14;
                doc.moveTo(startX, y).lineTo(startX + pageWidth, y).stroke();
                y += 4;
                doc.font('Helvetica').fontSize(7);
            }

            x = startX;
            for (const col of cols) {
                const w = (col.width || 80) * scale;
                const value = this.formatCellValue(row[col.key], col.format);
                doc.text(value, x, y, { width: w, align: col.align || 'left' });
                x += w;
            }
            y += 12;
        }

        doc.y = y;
    }

    private renderPdfTotals(doc: PDFKit.PDFDocument, options: ExportOptions): void {
        if (!options.totals) return;

        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const startX = doc.page.margins.left;

        doc.moveDown(0.5);
        doc.moveTo(startX, doc.y).lineTo(startX + pageWidth, doc.y).stroke();
        doc.moveDown(0.3);

        doc.fontSize(9).font('Helvetica-Bold');
        for (const [key, value] of Object.entries(options.totals)) {
            const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
            doc.text(`${label}: ${value}`, startX, doc.y, { align: 'left' });
            doc.moveDown(0.3);
        }
    }

    private renderPdfFooter(doc: PDFKit.PDFDocument, options: ExportOptions): void {
        const pages = doc.bufferedPageRange();
        for (let i = pages.start; i < pages.start + pages.count; i++) {
            doc.switchToPage(i);
            doc.fontSize(7).font('Helvetica')
                .text(
                    `Page ${i + 1} of ${pages.count} | ${options.title}`,
                    doc.page.margins.left,
                    doc.page.height - 25,
                    { align: 'center', width: doc.page.width - doc.page.margins.left - doc.page.margins.right }
                );
        }
    }

    // ── Excel Export ──

    async generateExcel(options: ExportOptions): Promise<Buffer> {
        appLogger.info('Generating Excel export', { title: options.title, rows: options.data.length });

        const workbook = new ExcelJS.Workbook();
        workbook.creator = options.generatedBy;
        workbook.created = options.generatedAt || new Date();

        const sheet = workbook.addWorksheet(options.title.substring(0, 31), {
            pageSetup: {
                orientation: options.orientation || 'portrait',
                fitToPage: true,
            },
        });

        // Title rows
        const titleRow = sheet.addRow([options.title]);
        titleRow.font = { size: 14, bold: true };
        sheet.mergeCells(1, 1, 1, options.columns.length);

        if (options.subtitle) {
            const subtitleRow = sheet.addRow([options.subtitle]);
            subtitleRow.font = { size: 10, italic: true };
            sheet.mergeCells(2, 1, 2, options.columns.length);
        }

        if (options.tenantName) {
            const tenantRow = sheet.addRow([options.tenantName]);
            tenantRow.font = { size: 10 };
            sheet.mergeCells(sheet.rowCount, 1, sheet.rowCount, options.columns.length);
        }

        const genAt = options.generatedAt || new Date();
        const infoRow = sheet.addRow([`Generated: ${genAt.toISOString().split('T')[0]} | By: ${options.generatedBy}`]);
        infoRow.font = { size: 8, color: { argb: '808080' } };
        sheet.mergeCells(sheet.rowCount, 1, sheet.rowCount, options.columns.length);

        sheet.addRow([]); // Spacer

        // Column headers
        sheet.columns = options.columns.map((col) => ({
            key: col.key,
            header: col.header,
            width: col.width ? col.width / 5 : 18,
        }));

        // Overwrite auto-generated header row with styled header
        const headerRowNum = sheet.rowCount + 1;
        const headerRow = sheet.addRow(options.columns.map((c) => c.header));
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2E7D32' } };
        headerRow.alignment = { horizontal: 'center' };

        // Data rows
        for (const row of options.data) {
            const values = options.columns.map((col) => {
                const val = row[col.key];
                if (col.format === 'number' || col.format === 'currency' || col.format === 'percentage') {
                    return parseFloat(val) || 0;
                }
                return val ?? '';
            });
            const dataRow = sheet.addRow(values);

            // Apply number formats
            options.columns.forEach((col, idx) => {
                const cell = dataRow.getCell(idx + 1);
                if (col.format === 'currency') {
                    cell.numFmt = '#,##0.00';
                } else if (col.format === 'percentage') {
                    cell.numFmt = '0.00%';
                } else if (col.format === 'number') {
                    cell.numFmt = '#,##0';
                }
                cell.alignment = { horizontal: col.align || 'left' };
            });
        }

        // Totals row
        if (options.totals) {
            sheet.addRow([]); // Spacer
            for (const [key, value] of Object.entries(options.totals)) {
                const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
                const totalRow = sheet.addRow([label, value]);
                totalRow.font = { bold: true };
            }
        }

        // Auto-filter on header row
        sheet.autoFilter = {
            from: { row: headerRowNum, column: 1 },
            to: { row: headerRowNum, column: options.columns.length },
        };

        const buffer = await workbook.xlsx.writeBuffer();
        return Buffer.from(buffer);
    }

    // ── CSV Export ──

    async generateCsv(options: ExportOptions): Promise<Buffer> {
        appLogger.info('Generating CSV export', { title: options.title, rows: options.data.length });

        const lines: string[] = [];

        // Header
        lines.push(options.columns.map((c) => this.escapeCsvField(c.header)).join(','));

        // Data
        for (const row of options.data) {
            const values = options.columns.map((col) => {
                const val = row[col.key];
                return this.escapeCsvField(this.formatCellValue(val, col.format));
            });
            lines.push(values.join(','));
        }

        // Totals
        if (options.totals) {
            lines.push(''); // Spacer
            for (const [key, value] of Object.entries(options.totals)) {
                const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
                lines.push(`${this.escapeCsvField(label)},${this.escapeCsvField(String(value))}`);
            }
        }

        return Buffer.from(lines.join('\n'), 'utf-8');
    }

    // ── Helpers ──

    private formatCellValue(value: any, format?: string): string {
        if (value === null || value === undefined) return '';
        if (format === 'currency') {
            const num = parseFloat(value);
            return isNaN(num) ? String(value) : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        if (format === 'number') {
            const num = parseFloat(value);
            return isNaN(num) ? String(value) : num.toLocaleString('en-US');
        }
        if (format === 'percentage') {
            const num = parseFloat(value);
            return isNaN(num) ? String(value) : `${num.toFixed(2)}%`;
        }
        if (format === 'date') {
            const d = new Date(value);
            return isNaN(d.getTime()) ? String(value) : d.toISOString().split('T')[0];
        }
        return String(value);
    }

    private escapeCsvField(value: string): string {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }
}

// ── Column Definitions for Standard Reports ──

export const TRIAL_BALANCE_COLUMNS: ExportColumn[] = [
    { key: 'account_code', header: 'Account Code', width: 60, align: 'left' },
    { key: 'account_name', header: 'Account Name', width: 120, align: 'left' },
    { key: 'account_type', header: 'Type', width: 60, align: 'left' },
    { key: 'debit_balance', header: 'Debit', width: 80, align: 'right', format: 'currency' },
    { key: 'credit_balance', header: 'Credit', width: 80, align: 'right', format: 'currency' },
];

export const BALANCE_SHEET_COLUMNS: ExportColumn[] = [
    { key: 'account_code', header: 'Account Code', width: 60, align: 'left' },
    { key: 'account_name', header: 'Account Name', width: 140, align: 'left' },
    { key: 'account_type', header: 'Type', width: 60, align: 'left' },
    { key: 'balance', header: 'Balance', width: 100, align: 'right', format: 'currency' },
];

export const INCOME_STATEMENT_COLUMNS: ExportColumn[] = [
    { key: 'account_code', header: 'Account Code', width: 60, align: 'left' },
    { key: 'account_name', header: 'Account Name', width: 140, align: 'left' },
    { key: 'account_type', header: 'Type', width: 60, align: 'left' },
    { key: 'amount', header: 'Amount', width: 100, align: 'right', format: 'currency' },
];

export const CASH_FLOW_COLUMNS: ExportColumn[] = [
    { key: 'category', header: 'Category', width: 80, align: 'left' },
    { key: 'description', header: 'Description', width: 160, align: 'left' },
    { key: 'amount', header: 'Amount', width: 80, align: 'right', format: 'currency' },
    { key: 'transaction_date', header: 'Date', width: 80, align: 'left', format: 'date' },
];

export const MEMBER_LISTING_COLUMNS: ExportColumn[] = [
    { key: 'member_number', header: 'Member No.', width: 60, align: 'left' },
    { key: 'first_name', header: 'First Name', width: 80, align: 'left' },
    { key: 'last_name', header: 'Last Name', width: 80, align: 'left' },
    { key: 'phone', header: 'Phone', width: 70, align: 'left' },
    { key: 'email', header: 'Email', width: 100, align: 'left' },
    { key: 'status', header: 'Status', width: 50, align: 'center' },
    { key: 'joined_date', header: 'Joined', width: 60, align: 'left', format: 'date' },
    { key: 'savings_balance', header: 'Savings', width: 70, align: 'right', format: 'currency' },
    { key: 'loans_balance', header: 'Loans', width: 70, align: 'right', format: 'currency' },
];

export const SAVINGS_SUMMARY_COLUMNS: ExportColumn[] = [
    { key: 'product_code', header: 'Product Code', width: 60, align: 'left' },
    { key: 'product_name', header: 'Product Name', width: 120, align: 'left' },
    { key: 'total_accounts', header: 'Total Accounts', width: 60, align: 'right', format: 'number' },
    { key: 'active_accounts', header: 'Active', width: 50, align: 'right', format: 'number' },
    { key: 'total_balance', header: 'Total Balance', width: 80, align: 'right', format: 'currency' },
    { key: 'total_deposits', header: 'Deposits', width: 80, align: 'right', format: 'currency' },
    { key: 'total_withdrawals', header: 'Withdrawals', width: 80, align: 'right', format: 'currency' },
];

export const LOAN_PORTFOLIO_COLUMNS: ExportColumn[] = [
    { key: 'product_code', header: 'Product Code', width: 60, align: 'left' },
    { key: 'product_name', header: 'Product Name', width: 120, align: 'left' },
    { key: 'total_accounts', header: 'Total', width: 50, align: 'right', format: 'number' },
    { key: 'active_accounts', header: 'Active', width: 50, align: 'right', format: 'number' },
    { key: 'total_disbursed', header: 'Disbursed', width: 80, align: 'right', format: 'currency' },
    { key: 'principal_outstanding', header: 'Principal O/S', width: 80, align: 'right', format: 'currency' },
    { key: 'total_outstanding', header: 'Total O/S', width: 80, align: 'right', format: 'currency' },
];

export const ARREARS_AGEING_COLUMNS: ExportColumn[] = [
    { key: 'loan_number', header: 'Loan No.', width: 70, align: 'left' },
    { key: 'member_number', header: 'Member No.', width: 60, align: 'left' },
    { key: 'member_name', header: 'Member Name', width: 100, align: 'left' },
    { key: 'product_name', header: 'Product', width: 80, align: 'left' },
    { key: 'days_overdue', header: 'Days Overdue', width: 50, align: 'right', format: 'number' },
    { key: 'overdue_amount', header: 'Overdue Amount', width: 80, align: 'right', format: 'currency' },
    { key: 'ageing_bucket', header: 'Bucket', width: 60, align: 'center' },
];

export const NPL_REPORT_COLUMNS: ExportColumn[] = [
    { key: 'loan_number', header: 'Loan No.', width: 70, align: 'left' },
    { key: 'member_number', header: 'Member No.', width: 60, align: 'left' },
    { key: 'member_name', header: 'Member Name', width: 100, align: 'left' },
    { key: 'product_name', header: 'Product', width: 80, align: 'left' },
    { key: 'status', header: 'Status', width: 50, align: 'center' },
    { key: 'total_outstanding', header: 'Total O/S', width: 80, align: 'right', format: 'currency' },
    { key: 'days_in_default', header: 'Days Default', width: 50, align: 'right', format: 'number' },
    { key: 'npl_category', header: 'Category', width: 60, align: 'center' },
];

export const DAILY_TRANSACTIONS_COLUMNS: ExportColumn[] = [
    { key: 'code', header: 'Txn Code', width: 70, align: 'left' },
    { key: 'category', header: 'Category', width: 60, align: 'left' },
    { key: 'description', header: 'Description', width: 120, align: 'left' },
    { key: 'amount', header: 'Amount', width: 80, align: 'right', format: 'currency' },
    { key: 'payment_method', header: 'Method', width: 60, align: 'center' },
    { key: 'member_name', header: 'Member', width: 100, align: 'left' },
    { key: 'debit_account', header: 'Debit Account', width: 90, align: 'left' },
    { key: 'credit_account', header: 'Credit Account', width: 90, align: 'left' },
];

export function initExportService(): ExportService {
    return new ExportService();
}
