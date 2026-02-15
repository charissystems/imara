# Shares API

The Shares API manages SACCO share purchases, sales, dividends, and shareholder management.

## Overview

**Purpose**: Share product management, member share holdings, and dividend distribution
**Base Path**: `/api/shares`
**Authentication**: Members manage own shares; admin manages products and distributions

## Key Endpoints

### GET /shares/products - List Share Products
Retrieve available share products.

### POST /shares/purchases - Purchase Shares
Member buys shares in SACCO.

### POST /shares/sales - Sell Shares
Member sells owned shares.

### GET /members/:id/shares - View Member Holdings
View member's share holdings and value.

### POST /shares/dividends - Distribute Dividends
Admin records dividend distribution to shareholders.

## Share Management

- Share purchase and sale tracking
- Dividend calculations and distribution
- Shareholder value management
- Annual general meeting (AGM) features

## Complete Documentation

For detailed endpoint specifications, request/response examples, and error handling, see:
- [API README](../README.md) - API overview and quick reference
- [Getting Started](../getting-started.md) - Authentication and common patterns
- [Error Handling](../error-handling.md) - Error codes and solutions
- [Workflows Guide](../guides/workflows.md#share-management) - Share purchase workflow

## Related APIs

- [Members](members.md) - Member management
- [Accounting](accounting.md) - Share-related accounting
- [Reports](reports.md) - Shareholder and dividend reporting
