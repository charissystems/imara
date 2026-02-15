# Audit & Compliance API

The Audit API provides audit trails, compliance tracking, and system event logging.

## Overview

**Purpose**: Complete audit trail, compliance tracking, security events, and system monitoring
**Base Path**: `/api/audit`
**Authentication**: Admin/Accountant access; audit trail immutable

## Key Endpoints

### GET /audit/logs - View Audit Logs
Retrieve system audit logs with filtering and search.

### GET /audit/logs/:id - View Log Detail
Get details of specific audit event.

### GET /audit/user-activity - User Activity Report
View activities by specific user.

### GET /audit/login-history - Login History
View user login history and failed attempts.

### GET /audit/data-changes - Data Changes Log
View who changed what data and when.

### GET /audit/export-history - Data Export Logs
Track who exported what data and when.

## Audit Events

- User logins/logouts
- Staff actions (create, update, delete)
- Data access and exports
- Permission changes
- System configuration changes
- Security events (failed logins, lockouts)
- Approval workflows
- Financial transactions

## Compliance Features

- Immutable audit logs (cannot be modified/deleted)
- Timestamp all events
- Track user identity and IP address
- Monitor sensitive operations
- Generate compliance reports
- Data retention policies

## Complete Documentation

For detailed endpoint specifications, request/response examples, and error handling, see:
- [API README](../README.md) - API overview and quick reference
- [Getting Started](../getting-started.md) - Authentication and common patterns
- [Error Handling](../error-handling.md) - Error codes and solutions

## Related APIs

- [Authentication](auth.md) - Login and session events
- [Accounting](accounting.md) - Financial transaction logs
- [Reports](reports.md) - Audit and compliance reporting
