# Error Handling & Debugging

This guide explains how to understand, recover from, and prevent API errors in the SACCO system.

## Error Response Format

All error responses follow this structure:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {},
    "statusCode": 400
  }
}
```

**Fields**:
- `code` - Machine-readable error identifier
- `message` - Human-readable explanation
- `details` - Additional context (validation errors, etc.)
- `statusCode` - HTTP status code

## HTTP Status Codes

| Code | Name | Meaning | Action |
|------|------|---------|--------|
| 400 | Bad Request | Invalid input or format | Fix request and retry |
| 401 | Unauthorized | Missing/invalid auth | Provide valid token |
| 403 | Forbidden | Insufficient permissions | Use account with proper role |
| 404 | Not Found | Resource doesn't exist | Verify ID or create resource |
| 409 | Conflict | State conflict (duplicate, etc.) | Check existing data |
| 422 | Unprocessable | Logic/business rule violation | Review business rules |
| 429 | Too Many Requests | Rate limit exceeded | Wait and retry |
| 440 | Login Timeout | Session expired | Re-authenticate |
| 500 | Server Error | Unexpected error | Contact support |

## Error Codes Reference

### Authentication & Authorization

#### `UNAUTHORIZED`
**Status**: 401
**Meaning**: No authentication token provided or token is invalid
**Example**:
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "No authorization token provided"
  }
}
```
**Fix**:
```bash
# Add valid Bearer token
curl -X GET http://localhost:3000/api/users/profile \
  -H "Authorization: Bearer {valid_token}"
```

#### `INVALID_TOKEN`
**Status**: 401
**Meaning**: Token is malformed, expired, or tampered with
**Example**:
```json
{
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Token has expired; please login again"
  }
}
```
**Fix**:
```bash
# Refresh expired token
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Authorization: Bearer {current_token}"
```

#### `FORBIDDEN`
**Status**: 403
**Meaning**: User authenticated but lacks permission for this action
**Example**:
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action",
    "details": {
      "required_role": "admin",
      "your_role": "loan_officer"
    }
  }
}
```
**Fix**:
- Use an account with the required role
- Request admin to grant appropriate permissions
- Use different endpoint appropriate for your role

#### `LOGIN_TIMEOUT`
**Status**: 440
**Meaning**: Session expired due to inactivity
**Example**:
```json
{
  "error": {
    "code": "LOGIN_TIMEOUT",
    "message": "Session expired due to inactivity. Please login again"
  }
}
```
**Fix**:
```bash
# Re-authenticate
curl -X POST http://localhost:3000/api/auth/login \
  -H "X-Tenant-Subdomain: test-sacco" \
  -d '{"email": "staff@example.com", "password": "password"}'
```

### Validation Errors

#### `VALIDATION_ERROR`
**Status**: 400
**Meaning**: Request data doesn't match the expected schema
**Example**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "email": ["Invalid email format"],
      "first_name": ["First name must be at least 2 characters"]
    }
  }
}
```
**Fix**:
- Check field names (case-sensitive)
- Verify field types (string, number, boolean)
- Ensure required fields
- Match enum values (lowercase)

**Example Fix**:
```bash
# Wrong
curl -X POST http://localhost:3000/api/members \
  -d '{"FirstName": "John", "email": "invalid"}'

# Correct
curl -X POST http://localhost:3000/api/members \
  -d '{"first_name": "John", "email": "john@example.com"}'
```

#### `INVALID_PHONE_FORMAT`
**Status**: 400
**Meaning**: Phone number doesn't match expected format
**Valid Formats**:
- International: `+254700000000` (country code + number)
- Local: `0700000000` (Kenya standard)
- Minimum 10 digits
- Numbers and `+` only

**Example**:
```bash
# Wrong formats
curl -X POST http://localhost:3000/api/members \
  -d '{"phone": "123"}' # Too short
curl -X POST http://localhost:3000/api/members \
  -d '{"phone": "+254 700 000 000"}' # Spaces not allowed

# Correct formats
curl -X POST http://localhost:3000/api/members \
  -d '{"phone": "+254700000000"}'
curl -X POST http://localhost:3000/api/members \
  -d '{"phone": "0700000000"}'
```

#### `INVALID_EMAIL_FORMAT`
**Status**: 400
**Meaning**: Email doesn't match standard email regex
**Rules**:
- Must contain @ symbol
- Domain must have dot and TLD
- No spaces or special chars (except . - _)

**Example**:
```bash
# Wrong
curl -X POST http://localhost:3000/api/members \
  -d '{"email": "john@example"}' # Missing TLD
curl -X POST http://localhost:3000/api/members \
  -d '{"email": "john @example.com"}' # Space

# Correct
curl -X POST http://localhost:3000/api/members \
  -d '{"email": "john@example.com"}'
```

#### `MISSING_REQUIRED_FIELD`
**Status**: 400
**Meaning**: Request missing a required field
**Example**:
```json
{
  "error": {
    "code": "MISSING_REQUIRED_FIELD",
    "message": "Request is missing required field",
    "details": {
      "required": ["first_name", "last_name", "member_number"]
    }
  }
}
```
**Fix**: Include all required fields in request

#### `INVALID_ENUM_VALUE`
**Status**: 400
**Meaning**: Field has unrecognized enum value
**Example**:
```json
{
  "error": {
    "code": "INVALID_ENUM_VALUE",
    "message": "Invalid enum value for field 'status'",
    "details": {
      "field": "status",
      "provided": "ACTIVE",
      "allowed": ["active", "inactive", "suspended", "closed"]
    }
  }
}
```
**Fix**: Use lowercase enum values
```bash
curl -X POST http://localhost:3000/api/members \
  -d '{"status": "active"}' # Not "ACTIVE"
```

### Resource Errors

#### `NOT_FOUND`
**Status**: 404
**Meaning**: Resource with provided ID doesn't exist
**Example**:
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Member with ID 'member-invalid' not found"
  }
}
```
**Fix**:
- Verify resource ID is correct
- Check if resource was deleted
- Ensure you're querying the right tenant

```bash
# Get valid IDs first
curl -X GET http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: test-sacco"

# Then use returned ID
curl -X GET http://localhost:3000/api/members/member-123 \
  -H "X-Tenant-Subdomain: test-sacco"
```

#### `TENANT_NOT_FOUND`
**Status**: 404
**Meaning**: Tenant doesn't exist or is inactive
**Example**:
```json
{
  "error": {
    "code": "TENANT_NOT_FOUND",
    "message": "Tenant 'invalid-tenant' not found"
  }
}
```
**Fix**:
- Verify tenant subdomain is correct (case-sensitive)
- Check with SACCO administrator for correct subdomain

```bash
# Wrong
curl http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: INVALID-TENANT"

# Correct
curl http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: test-sacco"
```

### Conflict Errors

#### `DUPLICATE`
**Status**: 409
**Meaning**: Record with unique field already exists
**Example**:
```json
{
  "error": {
    "code": "DUPLICATE",
    "message": "Member number 'MEM-001' already exists",
    "details": {
      "field": "member_number",
      "value": "MEM-001"
    }
  }
}
```
**Fix**:
- Use a unique value
- Update existing record instead of creating new
- Check if member already exists

```bash
# Before creating, check if member exists
curl -X GET "http://localhost:3000/api/members?member_number=MEM-001" \
  -H "X-Tenant-Subdomain: test-sacco"

# If exists, update instead
curl -X PUT http://localhost:3000/api/members/member-123 \
  -d '{"status": "active"}'

# If not, create with unique number
curl -X POST http://localhost:3000/api/members \
  -d '{"member_number": "MEM-002"}'
```

#### `INVALID_STATE_TRANSITION`
**Status**: 422
**Meaning**: Cannot transition resource to requested state
**Example**:
```json
{
  "error": {
    "code": "INVALID_STATE_TRANSITION",
    "message": "Cannot approve loan in 'rejected' state",
    "details": {
      "current_state": "rejected",
      "attempted_transition": "approved",
      "allowed_transitions": ["pending", "resubmitted"]
    }
  }
}
```
**Fix**:
- Review allowed state transitions
- Check current state first
- Follow correct workflow order

**Example Loan Workflow**:
```
pending_appraisal
  ↓
approved / rejected
  ↓ (if approved)
disbursed
  ↓
active
  ↓
closed
```

### Business Logic Errors

#### `INSUFFICIENT_BALANCE`
**Status**: 422
**Meaning**: Account doesn't have enough funds for transaction
**Example**:
```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Account balance insufficient for withdrawal",
    "details": {
      "required": 10000,
      "available": 5000,
      "shortfall": 5000
    }
  }
}
```
**Fix**:
- Deposit more funds first
- Reduce withdrawal amount
- Check account balance before transaction

```bash
# Check balance
curl -X GET http://localhost:3000/api/accounts/acc-123 \
  -H "X-Tenant-Subdomain: test-sacco"

# Adjust withdrawal amount
curl -X POST http://localhost:3000/api/accounts/acc-123/withdraw \
  -d '{"amount": 4000}' # Reduced from 5000
```

#### `MEMBER_INACTIVE`
**Status**: 422
**Meaning**: Member account is inactive/suspended
**Example**:
```json
{
  "error": {
    "code": "MEMBER_INACTIVE",
    "message": "Member account is inactive and cannot perform transactions",
    "details": {
      "member_id": "member-123",
      "status": "inactive"
    }
  }
}
```
**Fix**:
- Reactivate member account (admin action)
- Use different active member
- Contact administrator

#### `LOAN_LIMIT_EXCEEDED`
**Status**: 422
**Meaning**: Loan amount exceeds product limits
**Example**:
```json
{
  "error": {
    "code": "LOAN_LIMIT_EXCEEDED",
    "message": "Loan amount exceeds product limit",
    "details": {
      "requested": 100000,
      "maximum_allowed": 50000,
      "loan_product": "PERSONAL"
    }
  }
}
```
**Fix**:
- Reduce loan amount
- Apply for different loan product
- Check product limits first

```bash
# Check loan product limits
curl -X GET http://localhost:3000/api/loans/products \
  -H "X-Tenant-Subdomain: test-sacco"

# Apply within limits
curl -X POST http://localhost:3000/api/loans/applications \
  -d '{"amount": 40000}' # Within limit
```

### Rate Limiting

#### `RATE_LIMIT_EXCEEDED`
**Status**: 429
**Meaning**: Too many requests; rate limit exceeded
**Example**:
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests; please retry after 60 seconds",
    "details": {
      "retry_after_seconds": 60,
      "limit": 100,
      "window": "minute"
    }
  }
}
```
**Fix**:
- Wait before retrying (see `retry_after_seconds`)
- Implement exponential backoff
- Cache responses to reduce calls
- Batch operations where possible

**Good Retry Strategy**:
```bash
#!/bin/bash
attempt=1
max_attempts=5

while [ $attempt -le $max_attempts ]; do
  response=$(curl -s http://localhost:3000/api/members)
  status=$(echo $response | jq -r '.error.code')
  
  if [ "$status" = "RATE_LIMIT_EXCEEDED" ]; then
    wait_time=$((2 ** (attempt - 1))) # Exponential backoff
    echo "Rate limited. Waiting ${wait_time}s..."
    sleep $wait_time
    ((attempt++))
  else
    echo $response
    break
  fi
done
```

### Server Errors

#### `INTERNAL_SERVER_ERROR`
**Status**: 500
**Meaning**: Unexpected server error
**Example**:
```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred",
    "details": {
      "request_id": "req-12345",
      "timestamp": "2026-02-15T10:30:00Z"
    }
  }
}
```
**Fix**:
- Contact support with request ID
- Check server logs (if you have access)
- Retry after a short delay
- Check system status page

**Support Contact**:
- Include the `request_id` from error response
- Include timestamp
- Describe what you were trying to do
- Include full request/response

#### `DATABASE_ERROR`
**Status**: 500
**Meaning**: Database connection or query error
**Example**:
```json
{
  "error": {
    "code": "DATABASE_ERROR",
    "message": "Database operation failed"
  }
}
```
**Fix**:
- Wait a few seconds and retry
- Check database status
- Contact support with request details

## Debugging Tips

### 1. Use Request IDs

Every error includes a unique `request_id`:
```bash
curl -X POST http://localhost:3000/api/members \
  -d '{"invalid": "data"}' \
  | jq '.error.details.request_id'
# Output: "req-1645424100-12345"
```

Use this ID when contacting support.

### 2. Enable Verbose Logging

Test with verbose curl output:
```bash
curl -v -X POST http://localhost:3000/api/members \
  -d '{"first_name": "John"}'

# Shows:
# * Request headers
# * Response headers
# * Full response body
```

### 3. Pretty Print Responses

Use `jq` for readable JSON:
```bash
curl -s http://localhost:3000/api/members | jq .

# Shows formatted output:
# {
#   "success": true,
#   "data": [...],
#   "error": null
# }
```

### 4. Check Response Headers

View rate limit and other headers:
```bash
curl -i http://localhost:3000/api/members

# Shows:
# X-RateLimit-Limit: 100
# X-RateLimit-Remaining: 95
# X-RateLimit-Reset: 1645425000
```

### 5. Test with Minimal Data

Start with required fields only:
```bash
# Minimal
curl -X POST http://localhost:3000/api/members \
  -d '{"first_name": "John", "last_name": "Doe", "member_number": "MEM-001"}'

# Then add optional fields incrementally
```

### 6. Validate Input Before Sending

Check data types and formats:
```bash
# Wrong type (number as string)
curl -d '{"amount": "100"}' # Should be {"amount": 100}

# Wrong format (email)
curl -d '{"email": "john@invalid"}' # Missing TLD

# Wrong enum
curl -d '{"status": "ACTIVE"}' # Should be "active"
```

## Common Debugging Scenarios

### Scenario 1: "Member not found"
```bash
# List members first to get valid IDs
curl http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: test-sacco"

# Then use returned ID
curl http://localhost:3000/api/members/member-123
```

### Scenario 2: "Validation failed"
```bash
# Check request structure
echo '{"first_name": "John"}' | jq . # Valid JSON?

# Review required fields
# Missing: last_name, member_number (required)

# Resend with all required fields
curl -X POST http://localhost:3000/api/members \
  -d '{"first_name": "John", "last_name": "Doe", "member_number": "MEM-001"}'
```

### Scenario 3: "Unauthorized"
```bash
# Check if token is provided
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/users/profile

# If token invalid, re-authenticate
curl -X POST http://localhost:3000/api/auth/login \
  -d '{"email": "staff@sacco.local", "password": "password"}'

# Use returned token in future requests
```

## Error Prevention Best Practices

1. **Always validate input locally** before sending API requests
2. **Check resource existence** before updating/deleting
3. **Verify permissions** by checking user role
4. **Test with sample data** in development first
5. **Implement idempotency** for critical operations
6. **Log all requests** for debugging and audit
7. **Use retry logic** with exponential backoff
8. **Monitor rate limits** and implement throttling
9. **Keep tokens fresh** by refreshing before expiry
10. **Test error paths** in your integration

## Support & Escalation

If you encounter persistent errors:
1. Review relevant error code documentation above
2. Check [authentication.md](authentication.md) for auth issues
3. Check [getting-started.md](getting-started.md) for API basics
4. Review domain-specific documentation in [domains/](domains/)
5. Contact administrator with request ID from error response
