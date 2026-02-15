# Reports API

The Reports API generates financial reports, analytics, and business intelligence for SACCO management.

## Overview

**Purpose**: Financial reporting, analytics, statistics, and business intelligence
**Base Path**: `/api/reports`
**Authentication**: Staff access based on role (accountants, managers, admin)

## Key Endpoints

### GET /reports/member-summary - Member Summary Report
Summary statistics on member base (total, active, joined period, etc.).

### GET /reports/loan-portfolio - Loan Portfolio Report
Loan status distribution, disbursed vs outstanding, default rate.

### GET /reports/savings-summary - Savings Summary Report
Total savings, deposits, withdrawals, interest accrued.

### GET /reports/daily-transactions - Daily Transaction Report
Daily transaction volume and value by type.

### GET /reports/profit-loss - Profit & Loss Report
Income summary, expenses, net profit/loss.

### GET /reports/balance-sheet - Balance Sheet
Assets, liabilities, equity position.

### GET /reports/accounts-receivable - Accounts Receivable Report
Loan balance aging, overdue amounts by member.

### GET /reports/compliance - Compliance Report
Regulatory compliance metrics and statutory requirements.

## Report Parameters

- `date_from` - Start date (ISO format: 2026-01-01)
- `date_to` - End date (ISO format: 2026-02-28)
- `format` - Output format (json, csv, pdf)
- `group_by` - Grouping dimension (by_date, by_member, by_product)

## Report Features

- Customizable date ranges
- Department-level filtering
- Export to multiple formats (JSON, CSV, PDF)
- Scheduled report generation
- Email delivery of reports
- Historical comparison and trending

## Complete Documentation

For detailed endpoint specifications, request/response examples, and error handling, see:
- [API README](../README.md) - API overview and quick reference
- [Getting Started](../getting-started.md) - Authentication and common patterns
- [Error Handling](../error-handling.md) - Error codes and solutions

## Related APIs

- [Accounting](accounting.md) - Accounting transactions
- [Loans](loans.md) - Loan data
- [Accounts](accounts.md) - Savings account data
- [Audit](audit.md) - Audit trail tracking
