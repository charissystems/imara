# Loans API

The Loans API manages loan products, applications, appraisals, disbursement, and repayment tracking.

## Overview

**Purpose**: Complete loan lifecycle from application to repayment and closure
**Base Path**: `/api/loans`
**Authentication**: Varies by endpoint (some public, others require staff token)

## Key Endpoints

### GET /loans/products - List Loan Products
Retrieve available loan products.

### POST /loans/products - Create Loan Product (Admin Only)
Define a new loan product with terms and conditions.

### POST /loans/applications - Create Loan Application
Member applies for a loan.

### POST /loans/applications/:id/appraise - Appraise Loan
Loan officer appraises the application and recommends approval/rejection.

### POST /loans/applications/:id/approve - Approve Loan
Loan committee approves the application and sets disbursement schedule.

### POST /loans/applications/:id/disburse - Disburse Loan
Funds are disbursed to member's account.

### POST /loans/:id/repayments - Record Repayment
Member makes loan repayment.

### GET /loans/:id - Get Loan Details
View loan status, balance, and payment schedule.

## Loan Statuses

- `pending_appraisal` - Awaiting loan officer appraisal
- `appraisal_completed` - Appraisal done, awaiting approval
- `pending_approval` - Awaiting loan committee approval
- `approved` - Approved, awaiting disbursement
- `active` - Disbursed and in repayment
- `closed` - Fully repaid
- `defaulted` - In default (missed payments)
- `rejected` - Application rejected
- `cancelled` - Cancelled by member

## Complete Documentation

For detailed endpoint specifications, request/response examples, and error handling, see:
- [API README](../README.md) - API overview and quick reference
- [Getting Started](../getting-started.md) - Authentication and common patterns
- [Error Handling](../error-handling.md) - Error codes and solutions
- [Workflows Guide](../guides/workflows.md#loan-application--disbursement) - Complete loan lifecycle example

## Related APIs

- [Members](members.md) - Member management
- [Accounts](accounts.md) - Savings accounts for loan disbursement
- [Messaging](messaging.md) - Loan notifications and reminders
- [Reports](reports.md) - Loan portfolio reporting
