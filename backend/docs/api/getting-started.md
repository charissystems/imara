# Getting Started with SACCO API

Welcome to the SACCO Management System API. This guide covers essential setup, authentication, and common patterns for integrating with our platform.

## Base URL

```
https://api.sacco.local/api
```

For development/testing:
```
http://localhost:3000/api
```

## Authentication

All API requests require proper tenant identification via HTTP headers.

### Required Headers

```bash
curl -X GET http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: test-tenant" \
  -H "Content-Type: application/json"
```

| Header | Required | Format | Example |
|--------|----------|--------|---------|
| `X-Tenant-Subdomain` | Yes | String | `test-sacco`, `sacco-nairobi` |
| `Authorization` | For staff/admin | Bearer token | `Bearer eyJhbGc...` |
| `Content-Type` | For POST/PUT | application/json | `application/json` |

See [authentication.md](authentication.md) for detailed auth information.

## Understanding Tenants

Each SACCO organization is isolated in its own database schema. The `X-Tenant-Subdomain` header identifies which SACCO's data to access.

**Example: Two SACCOs**
```
Tenant 1: "microsave-kenya" → queries schema "microsave_kenya"
Tenant 2: "trust-sacco" → queries schema "trust_sacco"
```

Members and data in one tenant are completely isolated from another.

## Standard Response Format

All API responses follow a consistent structure:

### Success Response (200, 201)
```json
{
  "success": true,
  "data": {
    // Response payload
    "id": "member-123",
    "name": "John Doe"
  },
  "meta": {
    "count": 1,
    "tenant": "test-tenant",
    "timestamp": "2026-02-15T10:30:00Z"
  }
}
```

### Error Response (4xx, 5xx)
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "email": ["Invalid email format"],
      "phone": ["Phone must be at least 10 characters"]
    },
    "statusCode": 400
  }
}
```

See [error-handling.md](error-handling.md) for detailed error information.

## Common Patterns

### 1. Listing Resources with Pagination

```bash
curl -X GET \
  "http://localhost:3000/api/members?page=1&limit=20&status=active" \
  -H "X-Tenant-Subdomain: test-tenant"
```

**Query Parameters**:
- `page` - Page number (default: 1)
- `limit` - Records per page (default: 20, max: 100)
- `status` - Filter by status (active, inactive, suspended, closed)
- `sort_by` - Sort field (default: created_at)
- `sort_order` - asc or desc (default: desc)

**Response**:
```json
{
  "success": true,
  "data": [
    { "id": "member-1", "name": "John Doe" },
    { "id": "member-2", "name": "Jane Smith" }
  ],
  "meta": {
    "count": 2,
    "total": 150,
    "page": 1,
    "limit": 20,
    "pages": 8
  }
}
```

### 2. Creating Resources

```bash
curl -X POST http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: test-tenant" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "phone": "+254700000000",
    "member_number": "MEM-001"
  }'
```

**Guidelines**:
- Include only required and relevant fields
- Use ISO 8601 format for dates: `2026-02-15T10:30:00Z`
- Enum values are lowercase
- Nested objects use dot notation in responses

### 3. Updating Resources (Partial Updates)

```bash
curl -X PUT http://localhost:3000/api/members/member-123 \
  -H "X-Tenant-Subdomain: test-tenant" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Jane",
    "status": "inactive"
  }'
```

**Guidelines**:
- Only include fields you want to change
- Null values delete/reset fields
- All fields are optional

### 4. Deleting Resources

```bash
curl -X DELETE http://localhost:3000/api/members/member-123 \
  -H "X-Tenant-Subdomain: test-tenant"
```

**Soft Deletes**: Most resources use soft deletes—data remains in the database with a `deleted_at` timestamp. Hard deletes are rare and typically require superadmin privileges.

### 5. Filtering and Searching

```bash
# Filter by status
curl -X GET \
  "http://localhost:3000/api/members?status=active" \
  -H "X-Tenant-Subdomain: test-tenant"

# Multiple filters
curl -X GET \
  "http://localhost:3000/api/loans?status=active&product=HOME&member_id=member-123" \
  -H "X-Tenant-Subdomain: test-tenant"

# Search by name
curl -X GET \
  "http://localhost:3000/api/members?search=john" \
  -H "X-Tenant-Subdomain: test-tenant"
```

## Rate Limiting

API requests are rate-limited to prevent abuse:
- **Standard**: 100 requests per minute per IP
- **Burst**: Up to 20 requests per second

Rate limit information is returned in response headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1645425000
```

If you exceed limits, you'll receive a `429 Too Many Requests` status.

## Environments

### Development
```
Base URL: http://localhost:3000/api
No authentication required (bypass via config)
Use test tenant: "test-tenant"
```

### Staging
```
Base URL: https://staging-api.sacco.local/api
Bearer token required
Test credentials provided separately
```

### Production
```
Base URL: https://api.sacco.local/api
Bearer token required
Your organization's tenant subdomain
```

## Testing Your Integration

### Using Curl
```bash
# Test health endpoint
curl http://localhost:3000/health

# List members (development)
curl http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: test-tenant"
```

### Using Postman
1. Import our Postman collection: [Download](postman-collection.json)
2. Set variables in environment:
   - `base_url`: http://localhost:3000/api
   - `tenant`: test-tenant
   - `token`: your_auth_token
3. Run requests directly

### Using the Internal API Documentation
Navigate to `/api/docs` after starting your local server for an interactive Swagger UI.

## Common Issues & Solutions

### ❌ "Tenant not found"
**Issue**: Invalid `X-Tenant-Subdomain` header
**Solution**: Verify tenant name is correct. Check with your SACCO administrator.

```bash
# Correct
curl http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: test-sacco"

# Wrong
curl http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: test-sacco-invalid"
```

### ❌ "Validation failed"
**Issue**: Request data doesn't match schema
**Solution**: Check field names, types, and required vs optional fields

```bash
# Wrong: email is optional but must match regex if provided
curl -X POST http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: test-tenant" \
  -H "Content-Type: application/json" \
  -d '{ "first_name": "John", "email": "invalid" }'

# Correct
curl -X POST http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: test-tenant" \
  -H "Content-Type: application/json" \
  -d '{ "first_name": "John", "email": "john@example.com" }'
```

### ❌ "Unauthorized"
**Issue**: Missing or invalid Bearer token for staff endpoints
**Solution**: Ensure you're providing valid credentials. See [authentication.md](authentication.md)

## Next Steps

1. **Choose Your Domain**: Browse documentation for the API domain you need:
   - [Members](domains/members.md) - Member management
   - [Authentication](domains/auth.md) - Staff login and registration
   - [Accounts](domains/accounts.md) - Savings accounts
   - [Loans](domains/loans.md) - Loan management
   - [Fixed Deposits](domains/fixed-deposits.md) - Term deposits
   - [Shares](domains/shares.md) - Share management
   - [Accounting](domains/accounting.md) - Financial reporting
   - [Reports](domains/reports.md) - Analytics and reporting
   - [Messaging](domains/messaging.md) - SMS/Email notifications
   - [Audit](domains/audit.md) - Audit trails and compliance

2. **Review Workflow Guides**: See complete end-to-end scenarios:
   - [Member Onboarding](guides/member-onboarding-flow.md)
   - [Loan Lifecycle](guides/loan-lifecycle.md)
   - [Multi-Tenancy](guides/multi-tenancy.md)

3. **Handle Errors**: Review [error-handling.md](error-handling.md) for error codes and recovery strategies.

4. **Check Authentication**: Review [authentication.md](authentication.md) for token generation and role-based access.

## Support

For issues or questions:
- Check [error-handling.md](error-handling.md) for common error codes
- Review workflow guides in [guides/](guides/) for multi-step scenarios
- Consult domain-specific documentation in [domains/](domains/)
- Open an issue in the GitHub repository

## API Versioning

Current version: **v1.0**
See [versioning.md](versioning.md) for version management and deprecation policy.
