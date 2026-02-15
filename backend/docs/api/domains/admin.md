# Admin & Configuration API

The Admin API manages SACCO system configuration, settings, staff management, and administrative operations.

## Overview

**Purpose**: System administration, configuration, staff management, and operational settings
**Base Path**: `/api/admin`
**Authentication**: Admin role required

## Key Endpoints

### GET /admin/settings - Get System Settings
Retrieve SACCO configuration and operational settings.

### PUT /admin/settings - Update System Settings
Modify system configuration (interest rates, fees, limits, etc.).

### GET /admin/staff - List Staff
View all staff members and roles.

### POST /admin/staff - Create Staff Member
Register new staff (admin only).

### PUT /admin/staff/:id - Update Staff
Modify staff profile or role.

### DELETE /admin/staff/:id - Deactivate Staff
Disable staff account access.

### GET /admin/fee-schedules - View Fee Schedules
View transaction and service fee structures.

### PUT /admin/fee-schedules - Update Fee Schedules
Modify SACCO fee structures.

### GET /admin/transaction-limits - View Transaction Limits
View minimum/maximum transaction limits.

### PUT /admin/transaction-limits - Update Limits
Modify transaction and account limits.

## Administrative Functions

- System configuration and settings
- Staff and role management
- Fee and interest rate configuration
- Transaction limits and controls
- Backup and restore operations
- System monitoring and health checks
- Tenant configuration

## Complete Documentation

For detailed endpoint specifications, request/response examples, and error handling, see:
- [API README](../README.md) - API overview and quick reference
- [Getting Started](../getting-started.md) - Authentication and common patterns
- [Error Handling](../error-handling.md) - Error codes and solutions
- [Authentication Guide](../authentication.md) - Role-based access control

## Related APIs

- [Authentication](auth.md) - Staff authentication and roles
- [Audit](audit.md) - Admin action logging
- [Reports](reports.md) - Administrative reporting
