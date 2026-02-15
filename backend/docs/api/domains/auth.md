# Authentication API

The Authentication API manages staff registration, login, password management, and security features like 2FA.

## Overview

**Purpose**: Staff login, token generation, password management, and 2FA
**Base Path**: `/api/auth`
**Authentication**: Some endpoints are public, others require valid Bearer token

## Endpoints

### POST /auth/login - Staff Login

Authenticate a staff member and obtain access/refresh tokens.

**Request**:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "staff@sacco.local",
    "password": "Password123"
  }'
```

**Body Parameters**:
- `email` (string, required) - Staff email address
- `password` (string, required) - Staff password

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "staff": {
      "id": "staff-123",
      "staffNumber": "STAFF-001",
      "email": "staff@sacco.local",
      "department": "Loans",
      "position": "Loan Officer"
    }
  },
  "meta": {
    "tokenExpiresIn": "8h",
    "tenant": "test-sacco"
  }
}
```

**With 2FA Required (200 OK)**:
```json
{
  "success": true,
  "data": {
    "requiresTwoFactor": true,
    "tempToken": "temp_token...",
    "staff": {
      "id": "staff-123",
      "email": "staff@sacco.local"
    }
  },
  "meta": {
    "message": "Two-factor authentication required"
  }
}
```

**Error Responses**:
- `401 Unauthorized` - Invalid email or password
- `400 Bad Request` - Missing required fields
- `422 Unprocessable` - Account locked (too many failed attempts)

**Error Example (Account Locked)**:
```json
{
  "success": false,
  "error": {
    "code": "ACCOUNT_LOCKED",
    "message": "Account is locked due to multiple failed login attempts. Try again in 30 minutes.",
    "statusCode": 422
  }
}
```

### POST /auth/register - Staff Registration

Register a new staff member (typically admin only).

**Request**:
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Authorization: Bearer {admin_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Jane",
    "last_name": "Smith",
    "email": "jane@sacco.local",
    "password": "Password123",
    "phone": "+254700000000"
  }'
```

**Body Parameters**:
- `first_name` (string, required) - First name
- `last_name` (string, required) - Last name
- `email` (string, required) - Email (must be unique)
- `password` (string, required) - Must contain uppercase, lowercase, digit (min 8 chars)
- `phone` (string, optional) - Phone number

**Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "id": "staff-456",
    "staffNumber": "STAFF-002",
    "first_name": "Jane",
    "last_name": "Smith",
    "email": "jane@sacco.local",
    "phone": "+254700000000",
    "status": "active"
  },
  "meta": {
    "created": true
  }
}
```

### POST /auth/change-password - Change Password

Change password for authenticated user.

**Request**:
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

**Body Parameters**:
- `currentPassword` (string, required) - Current password
- `newPassword` (string, required) - New password (must meet requirements)
- `confirmPassword` (string, required) - Must match newPassword

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

**Error Examples**:
- `401 Unauthorized` - Incorrect current password
- `400 Bad Request` - New password doesn't meet requirements

### POST /auth/request-password-reset - Forgot Password

Request a password reset link (sends email with reset token).

**Request**:
```bash
curl -X POST http://localhost:3000/api/auth/request-password-reset \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "staff@sacco.local"
  }'
```

**Body Parameters**:
- `email` (string, required) - Staff email address

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Password reset link sent to your email"
}
```

**Note**: Email contains reset link with token valid for 1 hour.

### POST /auth/reset-password - Reset Password

Complete password reset using token from email.

**Request**:
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

**Body Parameters**:
- `token` (string, required) - Reset token from email
- `newPassword` (string, required) - New password
- `confirmPassword` (string, required) - Must match newPassword

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

**Error Examples**:
- `400 Bad Request` - Invalid or expired token
- `400 Bad Request` - Password doesn't meet requirements

### POST /auth/refresh - Refresh Token

Get new access token using current valid token.

**Request**:
```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Authorization: Bearer {current_token}" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 28800
  }
}
```

**Error Examples**:
- `401 Unauthorized` - Invalid or expired token
- `440 Login Timeout` - Session expired

### POST /auth/logout - Logout

Invalidate current session token.

**Request**:
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### POST /auth/2fa/enable - Enable Two-Factor Authentication

Enable 2FA for authenticated user.

**Request**:
```bash
curl -X POST http://localhost:3000/api/auth/2fa/enable \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "qr_code": "data:image/png;base64,iVBORw0KGgoAAAANS...",
    "secret": "JBSWY3DPEHPK3PXP",
    "recovery_codes": [
      "ABC123DEF456",
      "GHI789JKL012",
      "MNO345PQR678",
      "STU901VWX234",
      "YZ567ABC890"
    ]
  }
}
```

**Next Steps**: 
1. User scans QR code with authenticator app (Google Authenticator, Microsoft Authenticator, etc.)
2. User verifies with code from authenticator app using `/2fa/verify` endpoint

### POST /auth/2fa/verify - Verify and Activate 2FA

Verify 2FA code to activate two-factor authentication.

**Request**:
```bash
curl -X POST http://localhost:3000/api/auth/2fa/verify \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "123456"
  }'
```

**Body Parameters**:
- `code` (string, required) - 6-digit code from authenticator app

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Two-factor authentication enabled successfully"
}
```

**Error Examples**:
- `400 Bad Request` - Invalid or expired code
- `401 Unauthorized` - Not authenticated

### POST /auth/2fa/verify-login - Complete Login with 2FA

Verify 2FA code during login.

**Request** (after receiving `requiresTwoFactor: true` from login):
```bash
curl -X POST http://localhost:3000/api/auth/2fa/verify-login \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Content-Type: application/json" \
  -d '{
    "tempToken": "temp_token_from_login",
    "code": "123456"
  }'
```

**Body Parameters**:
- `tempToken` (string, required) - Temporary token from login response
- `code` (string, required) - 6-digit code from authenticator

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "staff": {
      "id": "staff-123",
      "email": "staff@sacco.local"
    }
  }
}
```

### POST /auth/2fa/disable - Disable Two-Factor Authentication

Disable 2FA for authenticated user.

**Request**:
```bash
curl -X POST http://localhost:3000/api/auth/2fa/disable \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "123456"
  }'
```

**Body Parameters**:
- `code` (string, required) - Current 6-digit code to confirm identity

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Two-factor authentication disabled"
}
```

## Password Requirements

All passwords must contain:
- ✅ Minimum 8 characters
- ✅ At least 1 uppercase letter (A-Z)
- ✅ At least 1 lowercase letter (a-z)
- ✅ At least 1 number (0-9)

**Examples**:
- ✅ `MyPassword123` - Valid
- ✅ `SecurePass456` - Valid
- ❌ `password123` - Missing uppercase
- ❌ `PASSWORD` - Missing lowercase and number
- ❌ `Pass1` - Too short

## Authentication Flow Diagram

```
┌─────────────────┐
│  Staff Login    │
│  (email/pwd)    │
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│  Validate Email     │
│  & Password         │
└────────┬────────────┘
         │
         ├─ ❌ Invalid → 401 Unauthorized
         │
         ├─ ✅ Valid & 2FA OFF → Generate Tokens → Return
         │
         └─ ✅ Valid & 2FA ON → Return Temp Token → 
                                 User Verifies Code → 
                                 Generate Final Tokens
```

## Common Issues

### ❌ "Invalid email or password"
**Cause**: Incorrect credentials
**Solution**: Verify email and password are correct

```bash
# Ensure correct format
email: "staff@sacco.local"  # Must be valid email
password: "Password123"      # Case-sensitive
```

### ❌ "Account is locked"
**Cause**: Too many failed login attempts (usually 5)
**Solution**: Wait 30 minutes or contact administrator

```bash
# Check account status
curl http://localhost:3000/api/auth/account-status \
  -H "X-Tenant-Subdomain: test-sacco"
```

### ❌ "Password doesn't meet requirements"
**Cause**: Password missing uppercase, lowercase, or digit
**Solution**: Use stronger password with mix of character types

```bash
# Wrong: "password123"  (no uppercase)
# Correct: "Password123"
```

### ❌ "Two-factor authentication required"
**Cause**: 2FA enabled on account
**Solution**: Provide 2FA code from authenticator app

```bash
# Use /auth/2fa/verify-login endpoint
curl -X POST http://localhost:3000/api/auth/2fa/verify-login \
  -d '{
    "tempToken": "...",
    "code": "123456"
  }'
```

## Best Practices

1. **Secure Token Storage**
   - Store tokens in HttpOnly cookies (web)
   - Store in Keychain/Keystore (mobile)
   - Never store in localStorage

2. **Token Refresh**
   - Refresh before expiry (token expires in 8 hours)
   - Implement auto-refresh on background
   - Clear token on logout

3. **Password Management**
   - Change password every 90 days
   - Never share passwords in chat/email
   - Use password manager for complex passwords
   - Enable 2FA for accounts with sensitive access

4. **Session Security**
   - Logout when leaving workstation
   - Check concurrent sessions periodically
   - Logout from other devices if suspicious activity

5. **2FA Best Practices**
   - Save recovery codes in secure location
   - Use authenticator app (not SMS when possible)
   - Update authenticator backup settings

## Related Documentation

- [Getting Started](../getting-started.md) - API basics
- [Authentication Guide](../authentication.md) - Detailed auth information
- [Error Handling](../error-handling.md) - Error codes and solutions
