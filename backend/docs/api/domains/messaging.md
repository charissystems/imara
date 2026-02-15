# Messaging & Notifications API

The Messaging API manages SMS messages, email notifications, and member communications.

## Overview

**Purpose**: SMS and email messaging, notification management, communication templates
**Base Path**: `/api/messaging`
**Authentication**: Staff can send; members can view notifications

## Key Endpoints

### GET /messaging/notifications - List Notifications
Retrieve member notifications and message history.

### POST /messaging/sms - Send SMS
Send SMS message to member.

### POST /messaging/email - Send Email
Send email to member.

### POST /messaging/broadcast - Send Broadcast Message
Send message to multiple members.

### GET /messaging/templates - List Message Templates
Retrieve available SMS/email templates.

### POST /messaging/templates - Create Template
Create new message template for common scenarios.

## Message Types

- **Loan notifications**: Application status, approval, disbursement, due date reminders
- **Account alerts**: Low balance, withdrawal/deposit confirmations
- **General messages**: Policy updates, announcements, meeting invitations
- **Authentication**: SMS OTP, password reset codes

## Notification Management

- Message scheduling and delivery tracking
- Template-based messaging
- Broadcast to member lists
- Opt-in/opt-out management
- SMS and email preferences per member
- Message delivery confirmation

## Complete Documentation

For detailed endpoint specifications, request/response examples, and error handling, see:
- [API README](../README.md) - API overview and quick reference
- [Getting Started](../getting-started.md) - Authentication and common patterns
- [Error Handling](../error-handling.md) - Error codes and solutions

## Related APIs

- [Members](members.md) - Member contact information
- [Loans](loans.md) - Loan lifecycle notifications
- [Accounts](accounts.md) - Account transaction alerts
