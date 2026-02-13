# Member API Endpoints - Curl Test Collection

## Overview
This file contains comprehensive curl commands to test all Member API endpoints.

**Base URL**: `http://localhost:3000`
**Authentication**: Header-based tenant identification using `X-Tenant-Subdomain`

---

## Testing Notes
- All endpoints require a valid tenant identifier via `X-Tenant-Subdomain` header
- Replace `{tenant}` with actual tenant identifier (e.g., `test-tenant`, `sacco1`)
- Replace `{member-id}` with actual member ID returned from create endpoint
- Responses include success/error information and metadata

---

## Endpoints

### 1. GET /members - List All Members
List all members for the current tenant with optional status filtering.

**Request**:
```bash
curl -X GET \
  -H "X-Tenant-Subdomain: {tenant}" \
  http://localhost:3000/members
```

**With Status Filter**:
```bash
curl -X GET \
  -H "X-Tenant-Subdomain: {tenant}" \
  http://localhost:3000/members?status=active
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": "member-1",
      "member_number": "MEM-001",
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com",
      "phone": "+254700000000",
      "status": "active",
      "joined_date": "2026-01-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "count": 1,
    "tenant": "test-tenant"
  }
}
```

---

### 2. GET /members/:id - Get Single Member
Retrieve details of a specific member.

**Request**:
```bash
curl -X GET \
  -H "X-Tenant-Subdomain: {tenant}" \
  http://localhost:3000/members/{member-id}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "member-1",
    "member_number": "MEM-001",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "phone": "+254700000000",
    "status": "active",
    "joined_date": "2026-01-01T00:00:00.000Z"
  }
}
```

**Error Response** (404 Not Found):
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Member with identifier '{member-id}' not found",
    "statusCode": 404
  }
}
```

---

### 3. POST /members - Create New Member
Create a new member with required and optional fields.

**Request**:
```bash
curl -X POST \
  -H "X-Tenant-Subdomain: {tenant}" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Jane",
    "last_name": "Smith",
    "phone": "+254722333444",
    "email": "jane@example.com",
    "member_number": "MEM-002",
    "status": "active",
    "joined_date": "2026-02-12T00:00:00Z"
  }' \
  http://localhost:3000/members
```

**Required Fields**:
- `first_name` (string, min 2 chars)
- `last_name` (string, min 2 chars)
- `member_number` (string, min 3 chars)

**Optional Fields**:
- `phone` (string, valid phone format)
- `email` (string, valid email format)
- `status` (enum: active|inactive|suspended, default: active)
- `joined_date` (ISO 8601 datetime, default: current date)

**Expected Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": "member-2",
    "member_number": "MEM-002",
    "first_name": "Jane",
    "last_name": "Smith",
    "email": "jane@example.com",
    "phone": "+254722333444",
    "status": "active",
    "joined_date": "2026-02-12T00:00:00.000Z"
  },
  "meta": {
    "created": true
  }
}
```

**Validation Error Response** (400 Bad Request):
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "first_name": ["First name must be at least 2 characters"]
    },
    "statusCode": 400
  }
}
```

**Duplicate Member Number Error** (409 Conflict):
```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE",
    "message": "Member number already exists",
    "statusCode": 409
  }
}
```

---

### 4. PUT /members/:id - Update Member
Update one or more fields of an existing member.

**Request**:
```bash
curl -X PUT \
  -H "X-Tenant-Subdomain: {tenant}" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Janet",
    "status": "inactive"
  }' \
  http://localhost:3000/members/{member-id}
```

**All Fields Optional**:
- `first_name`, `last_name`, `phone`, `email`, `member_number`, `status`, `joined_date`

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "member-2",
    "member_number": "MEM-002",
    "first_name": "Janet",
    "last_name": "Smith",
    "email": "jane@example.com",
    "phone": "+254722333444",
    "status": "inactive",
    "joined_date": "2026-02-12T00:00:00.000Z"
  },
  "meta": {
    "updated": true
  }
}
```

**Error Response** (404 Not Found):
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Member with identifier '{member-id}' not found",
    "statusCode": 404
  }
}
```

---

### 5. DELETE /members/:id - Soft Delete Member
Soft delete a member (marks deleted_at timestamp without removing data).

**Request**:
```bash
curl -X DELETE \
  -H "X-Tenant-Subdomain: {tenant}" \
  http://localhost:3000/members/{member-id}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "meta": {
    "deleted": true
  }
}
```

**Error Response** (404 Not Found):
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Member with identifier '{member-id}' not found",
    "statusCode": 404
  }
}
```

---

## Complete Test Workflow

This workflow demonstrates creating a member, retrieving it, updating it, and deleting it.

### Step 1: Create a Member
```bash
RESPONSE=$(curl -s -X POST \
  -H "X-Tenant-Subdomain: test-tenant" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+254700000000",
    "email": "john@example.com",
    "member_number": "TEST-'$(date +%s)'",
    "status": "active"
  }' \
  http://localhost:3000/members)

echo $RESPONSE | python3 -m json.tool

# Extract member ID for next steps
MEMBER_ID=$(echo $RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
echo "Created member ID: $MEMBER_ID"
```

### Step 2: Retrieve the Member
```bash
curl -s -X GET \
  -H "X-Tenant-Subdomain: test-tenant" \
  http://localhost:3000/members/$MEMBER_ID | python3 -m json.tool
```

### Step 3: List All Members
```bash
curl -s -X GET \
  -H "X-Tenant-Subdomain: test-tenant" \
  http://localhost:3000/members | python3 -m json.tool
```

### Step 4: Update the Member
```bash
curl -s -X PUT \
  -H "X-Tenant-Subdomain: test-tenant" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Jane",
    "status": "inactive"
  }' \
  http://localhost:3000/members/$MEMBER_ID | python3 -m json.tool
```

### Step 5: Delete the Member
```bash
curl -s -X DELETE \
  -H "X-Tenant-Subdomain: test-tenant" \
  http://localhost:3000/members/$MEMBER_ID | python3 -m json.tool
```

---

## Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| `NOT_FOUND` | 404 | Member or Tenant not found |
| `VALIDATION_ERROR` | 400 | Request data validation failed |
| `DUPLICATE` | 409 | Member number already exists |
| `INVALID_TENANT` | 400 | Invalid tenant identifier |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Features Implemented

✅ **CRUD Operations**
- Create new members with validation
- Read members (list all, get single)
- Update member fields
- Soft delete members (preserves data)

✅ **Validation**
- Email format validation
- Phone number format validation
- Min/max length for text fields
- Duplicate member number detection

✅ **Multi-Tenancy**
- Tenant isolation via schema
- Tenant resolution from headers
- Proper tenant context management

✅ **Error Handling**
- Detailed error messages
- Proper HTTP status codes
- Validation error details

✅ **Testing**
- Test suite with vitest (tests/routes/members.test.ts)
- Manual testing with curl commands

---

## Running Tests

### Automated Tests
```bash
npm test -- tests/routes/members.test.ts
```

### Manual Testing
Use the curl commands above to manually test each endpoint. Ensure the backend server is running on port 3000.

### Server Status
```bash
curl http://localhost:3000/health
```
