# Fixed Deposits API

The Fixed Deposits API manages SACCO fixed deposit (term deposit) accounts, maturity tracking, and rollovers.

## Overview

**Purpose**: Fixed deposit product management, term tracking, maturity alerts, and rollovers
**Base Path**: `/api/fixed-deposits`
**Authentication**: Members manage own deposits; admin manages products and maturities

## Key Endpoints

### GET /fixed-deposits/products - List FD Products
Retrieve available fixed deposit products with interest rates.

### POST /fixed-deposits - Create Fixed Deposit
Member opens a new fixed deposit account.

### GET /fixed-deposits/:id - Get FD Details
View deposit status, maturity date, and projected interest.

### POST /fixed-deposits/:id/renew - Renew Fixed Deposit
Automatically renew fixed deposit at maturity.

### POST /fixed-deposits/:id/withdraw - Withdraw at Maturity
Withdraw principal and interest at maturity.

### GET /fixed-deposits/maturity-alerts - Get Maturity Alerts
View deposits approaching maturity.

## Fixed Deposit Features

- Multiple term options (3 months, 6 months, 1 year, etc.)
- Interest rate tiers based on amount and duration
- Automatic renewal at maturity
- Maturity alerts and notifications
- Early withdrawal penalties

## Complete Documentation

For detailed endpoint specifications, request/response examples, and error handling, see:
- [API README](../README.md) - API overview and quick reference
- [Getting Started](../getting-started.md) - Authentication and common patterns
- [Error Handling](../error-handling.md) - Error codes and solutions

## Related APIs

- [Members](members.md) - Member management
- [Accounts](accounts.md) - Savings account management
- [Messaging](messaging.md) - Maturity notifications
- [Reports](reports.md) - FD portfolio reporting
