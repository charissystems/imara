# Authentication & Authorization

This document covers authentication mechanisms, token management, and role-based access control (RBAC) in the SACCO API.

## Overview

The SACCO API uses two authentication layers:
1. **Tenant Identification** - Required for all requests via `X-Tenant-Subdomain` header
2. **User Authentication** - Required for staff/admin endpoints via Bearer tokens

## Tenant Identification

### What is a Tenant?

A tenant represents one SACCO organization. Each tenant has:
- Isolated database schema
- Independent users and data
- Separate configuration and audit trails
- Multi-tenant row-level security (RLS)

### X-Tenant-Subdomain Header

All requests must include tenant identification:

```bash
curl -X GET http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: test-tenant"
```

**Format**:
- Alphanumeric + hyphens
- 3-50 characters
- Lowercase recommended
- Examples: `sacco-nairobi`, `microsave-kenya`, `test-sacco`

### Multi-Tenant Isolation

```
Request → Router → Load Tenant Context → Query Tenant Schema

GET /api/members (tenant: sacco-1)
  └─ Queries: sacco_1.members table
  └─ Returns: Members from sacco-1 only

GET /api/members (tenant: sacco-2)
  └─ Queries: sacco_2.members table
  └─ Returns: Members from sacco-2 only
```

**Data Isolation Guarantees**:
- Row-level security policies prevent cross-tenant queries
- Foreign keys scoped to tenant schema
- Audit logs isolated per tenant
- Session context enforces tenant boundaries

## User Authentication

### For Member/Public Endpoints

Members can access their own data without authentication:

```bash
# Get member profiles (public, read-only)
curl -X GET http://localhost:3000/api/members/member-123 \
  -H "X-Tenant-Subdomain: test-sacco"
```

### For Staff/Admin Endpoints

Staff and administrators require valid Bearer tokens:

```bash
curl -X POST http://localhost:3000/api/loans/applications/app-123/approve \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## Token Generation

### Staff Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "staff@sacco.local",
    "password": "SecurePassword123"
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 3600,
    "user": {
      "id": "staff-123",
      "email": "staff@sacco.local",
      "first_name": "John",
      "role": "loan_officer"
    }
  }
}
```

**Token Details**:
- Valid for 1 hour (3600 seconds)
- Includes user ID and role
- Encoded with tenant context
- Can be refreshed before expiry

### Staff Registration (Admin Only)

```bash
curl -X POST http://localhost:3000/api/auth/register-staff \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Authorization: Bearer {admin_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Jane",
    "last_name": "Smith",
    "email": "jane@sacco.local",
    "password": "SecurePassword123",
    "role": "loan_officer"
  }'
```

**Roles Available**:
- `admin` - Full system access
- `loan_officer` - Loan management
- `accountant` - Accounting and reporting
- `member_care` - Member support
- `operations` - Operational management

## Bearer Token Format

Tokens are JWT (JSON Web Tokens) with header, payload, and signature:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzdGFmZi0xMjMiLCJyb2xlIjoibG9hbl9vZmZpY2VyIiwiaWF0IjoxNjQ1NDI0MTAwLCJleHAiOjE2NDU0Mjc3MDB9.signature
```

**Decoded Payload**:
```json
{
  "sub": "staff-123",
  "role": "loan_officer",
  "tenant": "test-sacco",
  "iat": 1645424100,
  "exp": 1645427700
}
```

**Claims**:
- `sub` - Subject (user ID)
- `role` - User role
- `tenant` - Tenant identifier
- `iat` - Issued at (timestamp)
- `exp` - Expiration (timestamp)

## Using Bearer Tokens

Include token in the Authorization header:

```bash
curl -X GET http://localhost:3000/api/users/profile \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Format**:
```
Authorization: Bearer <token>
```

## Token Refresh

Refresh tokens before expiry to maintain session:

```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Authorization: Bearer {current_token}" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 3600
  }
}
```

## Logout

Invalidate current token:

```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Token is immediately invalidated; subsequent requests will fail.

## Role-Based Access Control (RBAC)

### Role Hierarchy

```
SuperAdmin (System-level)
  ├─ Tenant Access: All tenants
  └─ Permissions: Setup, audit, multi-tenancy management

Admin (Tenant-level)
  ├─ Tenant Access: Single tenant
  └─ Permissions: Staff management, configuration, full access

Loan Officer
  ├─ Tenant Access: Single tenant
  └─ Permissions: Loan management, member view (limited)

Accountant
  ├─ Tenant Access: Single tenant
  └─ Permissions: Transactions, reporting, audit logs

Member Care
  ├─ Tenant Access: Single tenant
  └─ Permissions: Member support, notifications, communication
```

### Permission Examples

**Admin Access** (Full):
```bash
# Can create new staff
curl -X POST http://localhost:3000/api/admin/staff \
  -H "Authorization: Bearer {admin_token}"

# Can configure SACCO settings
curl -X PUT http://localhost:3000/api/admin/settings \
  -H "Authorization: Bearer {admin_token}"
```

**Loan Officer Access** (Limited):
```bash
# Can view loans assigned to them
curl -X GET http://localhost:3000/api/loans?assigned_to=staff-123 \
  -H "Authorization: Bearer {loan_officer_token}"

# Cannot modify fee schedules
curl -X PUT http://localhost:3000/api/admin/fee-schedules/fee-1 \
  -H "Authorization: Bearer {loan_officer_token}"
# Returns: 403 Forbidden
```

**Accountant Access**:
```bash
# Can view transactions
curl -X GET http://localhost:3000/api/transactions \
  -H "Authorization: Bearer {accountant_token}"

# Cannot approve loans
curl -X PUT http://localhost:3000/api/loans/app-123/approve \
  -H "Authorization: Bearer {accountant_token}"
# Returns: 403 Forbidden
```

### Checking Permissions

API returns 403 Forbidden when user lacks required permissions:

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action",
    "required_role": "admin",
    "your_role": "loan_officer",
    "statusCode": 403
  }
}
```

## Password Policy

### Requirements

Passwords must contain:
- ✅ At least 8 characters
- ✅ At least 1 uppercase letter (A-Z)
- ✅ At least 1 lowercase letter (a-z)
- ✅ At least 1 number (0-9)
- ❌ No commonly used passwords (e.g., "password123")

### Examples

```
✅ Valid:    "StrongPass123"
✅ Valid:    "MyPassword2026"
❌ Invalid:  "weak" (too short)
❌ Invalid:  "Nodigits" (missing number)
❌ Invalid:  "password123" (no uppercase)
```

### Change Password

```bash
curl -X POST http://localhost:3000/api/auth/change-password \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "OldPassword123",
    "newPassword": "NewPassword456",
    "confirmPassword": "NewPassword456"
  }'
```

## Password Reset (Forgot Password)

### Step 1: Request Reset

```bash
curl -X POST http://localhost:3000/api/auth/request-password-reset \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "staff@sacco.local"
  }'
```

**Response**:
```json
{
  "success": true,
  "message": "Password reset link sent to email"
}
```

A reset token is sent via email (valid for 1 hour).

### Step 2: Reset Password

```bash
curl -X POST http://localhost:3000/api/auth/reset-password \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "reset_token_from_email",
    "newPassword": "NewPassword456",
    "confirmPassword": "NewPassword456"
  }'
```

## Two-Factor Authentication (2FA)

### Enable 2FA

```bash
curl -X POST http://localhost:3000/api/auth/2fa/enable \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response** (includes QR code):
```json
{
  "success": true,
  "data": {
    "qr_code": "data:image/png;base64,...",
    "secret": "JBSWY3DPEHPK3PXP",
    "recovery_codes": ["code1", "code2", ...]
  }
}
```

### Verify & Activate 2FA

```bash
curl -X POST http://localhost:3000/api/auth/2fa/verify \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "123456"
  }'
```

### Login with 2FA

```bash
# Step 1: Initial login
curl -X POST http://localhost:3000/api/auth/login \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "staff@sacco.local",
    "password": "password123"
  }'
# Returns: { "2fa_required": true, "2fa_token": "..." }

# Step 2: Provide 2FA code
curl -X POST http://localhost:3000/api/auth/2fa/verify-login \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Content-Type: application/json" \
  -d '{
    "2fa_token": "...",
    "code": "123456"
  }'
# Returns: { "token": "...", "expires_in": 3600 }
```

## Session Management

### Session Timeout

Sessions expire after 1 hour of inactivity. Refresh token before expiry:

```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Authorization: Bearer {token}"
```

### Concurrent Sessions

Users can maintain multiple active sessions (different devices/browsers).
Logout invalidates only current session.

### Session Invalidation

All user sessions are invalidated when:
- Admin changes user role or permissions
- Admin disables user account
- User initiates "logout all sessions"

## SuperAdmin Access

SuperAdmin accounts have system-level access across all tenants:

```bash
# SuperAdmin can create new tenants
curl -X POST http://localhost:3000/api/super-admin/tenants \
  -H "Authorization: Bearer {superadmin_token}" \
  -d '{
    "name": "New SACCO",
    "subdomain": "new-sacco"
  }'

# SuperAdmin can view audit logs across tenants
curl -X GET http://localhost:3000/api/super-admin/audit-logs \
  -H "Authorization: Bearer {superadmin_token}"
```

SuperAdmin operations require explicit tenant header OR system-wide context.

## Security Best Practices

1. **Store tokens securely**
   - Use HttpOnly cookies for web apps
   - Keychain/Keystore for mobile apps
   - Never store in localStorage (XSS vulnerability)

2. **Token rotation**
   - Refresh tokens regularly
   - Clear tokens on logout
   - Invalidate on device loss

3. **HTTPS only**
   - Always use HTTPS in production
   - Set secure cookie flags
   - Implement HSTS headers

4. **Password management**
   - Never send passwords in URLs
   - Hash passwords with bcrypt
   - Implement rate limiting on login attempts

5. **Monitor access**
   - Check audit logs for suspicious activity
   - Review failed login attempts
   - Set up alerts for privilege escalation

## Error Responses

### 401 Unauthorized
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "No authorization token provided",
    "statusCode": 401
  }
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Insufficient permissions",
    "statusCode": 403
  }
}
```

### 440 Login Timeout
```json
{
  "success": false,
  "error": {
    "code": "LOGIN_TIMEOUT",
    "message": "Session expired. Please login again",
    "statusCode": 440
  }
}
```

See [error-handling.md](error-handling.md) for complete error code reference.
