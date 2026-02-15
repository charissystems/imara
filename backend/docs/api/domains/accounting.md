# Accounting API

The Accounting API manages financial transactions, journal entries, ledgers, and accounting reports.

## Overview

**Purpose**: Financial accounting, transaction recording, ledger management, and compliance
**Base Path**: `/api/accounting`
**Authentication**: Accountant role required; audit trail maintained

## Key Endpoints

### GET /accounting/transactions - List Transactions
Retrieve all financial transactions with filtering.

### POST /accounting/transactions - Record Transaction
Record manual journal entry or adjustment.

### GET /accounting/ledgers - Get Ledgers
View account ledgers and balances.

### POST /accounting/journal-entries - Create Journal Entry
Record complex multi-account journal entry.

### GET /accounting/trial-balance - Get Trial Balance
View trial balance for period.

### GET /accounting/profit-loss - Get P&L Statement
Generate profit and loss statement.

### GET /accounting/balance-sheet - Get Balance Sheet
Generate balance sheet for date.

## Accounting Features

- Double-entry accounting system
- General ledger management
- Journal entries with audit trail
- Financial statements (P&L, Balance Sheet, Trial Balance)
- Account reconciliation
- Period closing procedures

## Complete Documentation

For detailed endpoint specifications, request/response examples, and error handling, see:
- [API README](../README.md) - API overview and quick reference
- [Getting Started](../getting-started.md) - Authentication and common patterns
- [Error Handling](../error-handling.md) - Error codes and solutions

## Related APIs

- [Loans](loans.md) - Loan transaction accounting
- [Accounts](accounts.md) - Account transaction accounting
- [Reports](reports.md) - Financial reporting
- [Audit](audit.md) - Audit trail tracking
