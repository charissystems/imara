# Accounts API

The Accounts API manages SACCO member savings accounts, deposits, withdrawals, transfers, and interest accrual.

## Overview

**Purpose**: Savings account lifecycle, transactions, balances, and statements
**Base Path**: `/api/accounts`
**Authentication**: Members can access own accounts; staff can access all

## Key Endpoints

### GET /accounts - List Accounts
Retrieve member savings and investment accounts.

### POST /accounts - Create Savings Account
Create a new savings account for a member.

### GET /accounts/:id - Get Account Details
View account balance, transactions, and statements.

### POST /accounts/:id/deposit - Record Deposit
Member deposits funds to savings account.

### POST /accounts/:id/withdraw - Record Withdrawal
Member withdraws funds from savings account.

### POST /accounts/:id/transfer - Transfer Between Accounts
Transfer funds between member's own accounts.

### GET /accounts/:id/statement - Get Statement
View account statement with transaction history.

## Account Types

- `savings` - Regular savings account
- `investment` - Long-term investment account
- `sweep` - Automatic sweep account

## Complete Documentation

For detailed endpoint specifications, request/response examples, and error handling, see:
- [API README](../README.md) - API overview and quick reference
- [Getting Started](../getting-started.md) - Authentication and common patterns
- [Error Handling](../error-handling.md) - Error codes and solutions
- [Workflows Guide](../guides/workflows.md#member-onboarding-flow) - Account setup workflow

## Related APIs

- [Members](members.md) - Member management
- [Fixed Deposits](fixed-deposits.md) - Term deposit accounts
- [Transactions](../getting-started.md#common-patterns) - Individual transaction recording
- [Reports](reports.md) - Account reporting
