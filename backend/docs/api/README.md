# SACCO API Documentation

Complete REST API documentation for the SACCO Management System.

## 📚 Quick Navigation

### Getting Started
- **[Getting Started Guide](getting-started.md)** - Start here! Overview, authentication, common patterns
- **[Authentication & Authorization](authentication.md)** - Tenant identification, tokens, roles, security
- **[Error Handling & Debugging](error-handling.md)** - Error codes, solutions, debugging tips

### API Endpoints by Domain

| Domain | Description | Reference |
|--------|-------------|-----------|
| **Auth** | Staff login, registration, password management, 2FA | [auth.md](domains/auth.md) |
| **Members** | Member registration, profiles, KYC, lifecycle | [members.md](domains/members.md) |
| **Accounts** | Savings accounts, deposits, withdrawals, transfers | (coming soon) |
| **Loans** | Loan products, applications, appraisals, disbursement | (coming soon) |
| **Shares** | Share purchases, dividends, management | (coming soon) |
| **Fixed Deposits** | Term deposits, rollovers, maturity tracking | (coming soon) |
| **Accounting** | Transactions, ledgers, journal entries | (coming soon) |
| **Messaging** | SMS/Email notifications, communication | (coming soon) |
| **Reports** | Financial reports, analytics, statistics | (coming soon) |
| **Audit** | Audit trails, compliance logs, system events | (coming soon) |
| **Admin** | Configuration, settings, staff management | (coming soon) |

### Workflow Guides
- **[Member Onboarding](guides/workflows.md#member-onboarding-flow)** - Complete member registration workflow
- **[Loan Lifecycle](guides/workflows.md#loan-application--disbursement)** - From application to repayment
- **[Share Management](guides/workflows.md#share-management)** - Share purchases and sales
- **[Pagination & Filtering](guides/pagination-filtering.md)** - Working with list endpoints

### Machine-Readable Specs
- **[OpenAPI Specification](openapi.yaml)** - Full API spec for code generation, Swagger UI, etc.

## 🚀 Quick Start

### 1. Set Up Your Environment

```bash
# Development base URL
BASE_URL="http://localhost:3000/api"

# Your tenant identifier
TENANT="test-sacco"
```

### 2. Create a Member

```bash
curl -X POST $BASE_URL/members \
  -H "X-Tenant-Subdomain: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "member_number": "MEM-001",
    "email": "john@example.com",
    "phone": "+254700000000"
  }'
```

### 3. Login as Staff

```bash
curl -X POST $BASE_URL/auth/login \
  -H "X-Tenant-Subdomain: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "staff@sacco.local",
    "password": "Password123"
  }'
```

### 4. Use Your Token

```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X GET $BASE_URL/loans \
  -H "X-Tenant-Subdomain: $TENANT" \
  -H "Authorization: Bearer $TOKEN"
```

## 📖 Understanding the Structure

### Multi-Tenancy

All requests require `X-Tenant-Subdomain` header to identify which SACCO:

```bash
# Returns members from sacco-nairobi
curl http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: sacco-nairobi"

# Returns members from sacco-mombasa
curl http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: sacco-mombasa"
```

Data is completely isolated per tenant.

### Response Format

All API responses follow standard structure:

```json
{
  "success": true,
  "data": {
    "id": "member-123",
    "name": "John Doe"
  },
  "meta": {
    "count": 1,
    "timestamp": "2026-02-15T10:30:00Z"
  }
}
```

### Error Handling

Consistent error format with helpful debugging info:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "email": ["Invalid email format"]
    },
    "statusCode": 400
  }
}
```

See [Error Handling Guide](error-handling.md) for full error reference.

## 🔐 Authentication

### Public Endpoints (No Auth Required)
- Member self-service endpoints
- Health check
- Public documentation

### Protected Endpoints (Bearer Token Required)
- Staff operations
- Admin functions
- Sensitive data access

**Getting a Token**:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -d '{"email": "staff@sacco.local", "password": "password"}'
# Returns: { "data": { "accessToken": "..." } }
```

**Using Token**:
```bash
curl http://localhost:3000/api/users/profile \
  -H "Authorization: Bearer {accessToken}"
```

See [Authentication Guide](authentication.md) for detailed info.

## 📋 Common Tasks

### List Items with Pagination
```bash
# Get page 1 (20 per page)
curl "http://localhost:3000/api/members?page=1&limit=20" \
  -H "X-Tenant-Subdomain: test-sacco"

# Get page 2 with custom size
curl "http://localhost:3000/api/members?page=2&limit=50" \
  -H "X-Tenant-Subdomain: test-sacco"
```

### Filter Results
```bash
# Active members only
curl "http://localhost:3000/api/members?status=active" \
  -H "X-Tenant-Subdomain: test-sacco"

# Joined in date range
curl "http://localhost:3000/api/members?joined_from=2026-01-01&joined_to=2026-02-28" \
  -H "X-Tenant-Subdomain: test-sacco"

# Search by name
curl "http://localhost:3000/api/members?search=john" \
  -H "X-Tenant-Subdomain: test-sacco"
```

### Sort Results
```bash
# Newest first (default)
curl "http://localhost:3000/api/members?sort_by=created_at&sort_order=desc" \
  -H "X-Tenant-Subdomain: test-sacco"

# Sort by name A-Z
curl "http://localhost:3000/api/members?sort_by=first_name&sort_order=asc" \
  -H "X-Tenant-Subdomain: test-sacco"
```

See [Pagination & Filtering Guide](guides/pagination-filtering.md) for complete details.

## 🛠️ Tools & Testing

### Interactive API Documentation

After starting the server, visit:
```
http://localhost:3000/api/docs
```

This provides:
- Interactive endpoint explorer
- Live API testing
- Full request/response examples
- Schema documentation

### Testing with cURL

```bash
# Test health endpoint
curl http://localhost:3000/health

# Test with verbose output
curl -v http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: test-sacco"

# Format JSON output
curl -s http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: test-sacco" | jq .
```

### Testing with Postman

1. Import our Postman collection: `postman-collection.json`
2. Set environment variables:
   - `base_url`: http://localhost:3000/api
   - `tenant`: test-sacco
   - `token`: your_auth_token
3. Run requests or test scripts

### Testing with Bash Scripts

See [Workflows Guide](guides/workflows.md) for complete bash script examples:
- Member onboarding workflow
- Loan lifecycle workflow
- Share management workflow
- Advanced pagination patterns

## 🔄 Typical API Integration Flow

```
1. Authenticate (get token)
   POST /auth/login

2. Create/manage members
   POST /members
   GET /members/:id
   PUT /members/:id

3. Create/manage accounts
   POST /accounts
   GET /accounts/:id
   POST /accounts/:id/withdraw

4. Create/manage loans
   POST /loans/applications
   POST /loans/applications/:id/appraise
   POST /loans/applications/:id/approve
   POST /loans/applications/:id/disburse

5. Record transactions
   POST /transactions

6. View reports
   GET /reports?type=...

7. Check audit logs
   GET /audit-logs
```

See [Workflows Guide](guides/workflows.md) for detailed step-by-step examples.

## 📊 API Versioning

**Current Version**: `v1.0.0`

Versioning strategy:
- `v1.x.x` - Backward compatible changes (new endpoints, optional fields)
- `v2.0.0` - Breaking changes (new major version)

**Accessing Specific Version**:
```bash
curl http://localhost:3000/api/v1.0/members \
  -H "X-Tenant-Subdomain: test-sacco"
```

## ✅ Best Practices

1. **Always Include Headers**
   ```bash
   -H "X-Tenant-Subdomain: your-tenant"
   -H "Content-Type: application/json"
   ```

2. **Use Pagination for Large Datasets**
   ```bash
   # Don't do this
   curl http://localhost:3000/api/members?limit=10000
   
   # Do this instead
   curl "http://localhost:3000/api/members?page=1&limit=100"
   ```

3. **Cache Responses When Appropriate**
   ```bash
   MEMBERS=$(curl -s http://localhost:3000/api/members)
   # Reuse $MEMBERS multiple times
   ```

4. **Implement Error Handling**
   ```bash
   if ! echo $RESPONSE | jq -e '.success' > /dev/null; then
     echo "Error: $(echo $RESPONSE | jq -r '.error.message')"
   fi
   ```

5. **Use Filtering Server-Side**
   ```bash
   # Don't filter locally
   curl http://localhost:3000/api/members | jq 'select(.status == "active")'
   
   # Filter server-side instead
   curl "http://localhost:3000/api/members?status=active"
   ```

6. **Validate Input Before Sending**
   - Email format
   - Phone number format
   - Required fields
   - Enum values (use lowercase)

## 🐛 Troubleshooting

### Common Issues

**"Tenant not found"**
- Check `X-Tenant-Subdomain` header
- Verify tenant exists with admin

**"Validation failed"**
- Check field names (case-sensitive)
- Verify data types
- Ensure required fields present

**"Unauthorized"**
- Provide valid Bearer token
- Token may have expired, refresh it

**"Rate limit exceeded"**
- Wait before retrying
- Implement exponential backoff
- Reduce request frequency

See [Error Handling Guide](error-handling.md) for comprehensive troubleshooting.

## 📞 Support

### Documentation Resources
1. Start with [Getting Started Guide](getting-started.md)
2. Check specific domain documentation
3. Review [Error Handling Guide](error-handling.md)
4. See [Workflows Guide](guides/workflows.md) for examples

### Find API Issues

1. Check response `error.code` in [Error Codes Reference](error-handling.md#error-codes-reference)
2. Review domain-specific docs for endpoint details
3. Check [Pagination & Filtering Guide](guides/pagination-filtering.md) for query issues
4. Look at [Workflows Guide](guides/workflows.md) for complete examples

### Contact Support
- Email: support@sacco.local
- Include request ID from error response
- Include full request/response details
- Describe what you were trying to do

## 📝 Documentation Standards

This documentation uses:
- **Getting Started** - Overview and quick reference
- **Domain Guides** - Complete API documentation per domain
- **Workflow Guides** - End-to-end scenario examples
- **Reference Sections** - Detailed specifications
- **Code Examples** - Bash/curl examples for all operations

## 🔗 File Structure

```
/api/
├── README.md (this file)
├── getting-started.md
├── authentication.md
├── error-handling.md
├── openapi.yaml
│
├── domains/
│   ├── auth.md
│   ├── members.md
│   ├── accounts.md (coming)
│   ├── loans.md (coming)
│   ├── shares.md (coming)
│   ├── fixed-deposits.md (coming)
│   ├── accounting.md (coming)
│   ├── messaging.md (coming)
│   ├── reports.md (coming)
│   ├── audit.md (coming)
│   └── admin.md (coming)
│
├── guides/
│   ├── workflows.md
│   └── pagination-filtering.md
│
└── test-scripts/
    └── (bash test scripts)
```

## 🎯 Next Steps

1. Choose your API domain: [Browse Endpoints](#-api-endpoints-by-domain)
2. Read the domain-specific documentation
3. Try the quick examples
4. Implement error handling
5. Test with provided scripts

Happy coding! 🚀
