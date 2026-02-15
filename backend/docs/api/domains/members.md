# Members API

The Members API manages SACCO member registration, profiles, KYC information, and member lifecycle.

## Overview

**Purpose**: Member management (registration, profile, KYC, lifecycle)
**Base Path**: `/api/members`
**Authentication**: Some endpoints public (self-service), others require staff login

## Endpoints

### GET /members - List Members

Retrieve list of all members with optional filtering and pagination.

**Request**:
```bash
curl -X GET "http://localhost:3000/api/members?page=1&limit=20&status=active" \
  -H "X-Tenant-Subdomain: test-sacco"
```

**Query Parameters**:
- `page` (number, default: 1) - Page number
- `limit` (number, default: 20, max: 100) - Records per page
- `status` (enum: active|inactive|suspended|closed) - Filter by status
- `search` (string) - Search by name or member number
- `joined_from` (ISO date) - Filter members joined after date
- `joined_to` (ISO date) - Filter members joined before date
- `sort_by` (string, default: created_at) - Sort field
- `sort_order` (enum: asc|desc, default: desc) - Sort order

**Response (200 OK)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "member-1",
      "member_number": "MEM-001",
      "first_name": "John",
      "last_name": "Doe",
      "phone": "+254700000000",
      "email": "john@example.com",
      "status": "active",
      "joined_date": "2026-01-15T00:00:00Z"
    }
  ],
  "meta": {
    "count": 1,
    "total": 150,
    "page": 1,
    "limit": 20,
    "pages": 8
  }
}
```

### GET /members/:id - Get Single Member

Retrieve detailed member profile including KYC information.

**Request**:
```bash
curl -X GET http://localhost:3000/api/members/member-1 \
  -H "X-Tenant-Subdomain: test-sacco"
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": "member-1",
    "member_number": "MEM-001",
    "first_name": "John",
    "middle_name": "Peter",
    "last_name": "Doe",
    "phone": "+254700000000",
    "email": "john@example.com",
    "date_of_birth": "1990-05-20",
    "gender": "male",
    "marital_status": "married",
    "nationality": "Kenyan",
    "physical_address": {
      "street": "123 Main Street",
      "city": "Nairobi",
      "postal_code": "00100"
    },
    "postal_address": {
      "box": "1234",
      "code": "00100"
    },
    "employment_details": {
      "employer": "Tech Corp",
      "position": "Software Engineer",
      "industry": "Technology"
    },
    "next_of_kin": {
      "name": "Jane Doe",
      "relationship": "Spouse",
      "phone": "+254700000001"
    },
    "status": "active",
    "joined_date": "2026-01-15T00:00:00Z",
    "referred_by": "member-2"
  }
}
```

### POST /members - Create Member

Register a new SACCO member.

**Request**:
```bash
curl -X POST http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Jane",
    "last_name": "Smith",
    "member_number": "MEM-002",
    "phone": "+254722333444",
    "email": "jane@example.com",
    "date_of_birth": "1992-03-15",
    "gender": "female",
    "marital_status": "single",
    "nationality": "Kenyan",
    "physical_address": {
      "street": "456 Oak Avenue",
      "city": "Mombasa",
      "postal_code": "80100"
    },
    "employment_details": {
      "employer": "Finance Ltd",
      "position": "Accountant"
    },
    "next_of_kin": {
      "name": "John Smith",
      "relationship": "Brother",
      "phone": "+254722333445"
    },
    "status": "active",
    "joined_date": "2026-02-15T00:00:00Z",
    "auto_create_savings": true
  }'
```

**Body Parameters** (all optional except marked *required*):
- `first_name` (*required*, string) - Member first name (min 2 chars)
- `middle_name` (string) - Middle name
- `last_name` (*required*, string) - Last name (min 2 chars)
- `member_number` (*required*, string) - Unique member ID (min 3 chars)
- `phone` (string) - Phone number (international format preferred)
- `email` (string) - Email address
- `date_of_birth` (ISO date) - Birth date
- `gender` (enum: male|female|other|unknown) - Gender
- `marital_status` (enum: single|married|divorced|widowed|unknown) - Marital status
- `nationality` (string) - Country of citizenship
- `physical_address` (object) - Residential address
  - `street` (string)
  - `city` (string)
  - `postal_code` (string)
- `postal_address` (object) - Mailing address
  - `box` (string)
  - `code` (string)
- `employment_details` (object)
  - `employer` (string)
  - `position` (string)
  - `industry` (string)
- `next_of_kin` (object)
  - `name` (string)
  - `relationship` (string)
  - `phone` (string)
- `status` (enum: active|inactive|suspended|closed, default: active)
- `joined_date` (ISO date, default: current date)
- `referred_by` (UUID) - ID of member who referred this member
- `auto_create_savings` (boolean, default: true) - Automatically create savings account

**Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "id": "member-2",
    "member_number": "MEM-002",
    "first_name": "Jane",
    "last_name": "Smith",
    "phone": "+254722333444",
    "email": "jane@example.com",
    "status": "active",
    "joined_date": "2026-02-15T00:00:00Z"
  },
  "meta": {
    "created": true
  }
}
```

**Error Examples**:
- `400 Bad Request` - Validation failed
- `409 Conflict` - Member number already exists

### PUT /members/:id - Update Member

Update member profile information.

**Request**:
```bash
curl -X PUT http://localhost:3000/api/members/member-2 \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+254722333444",
    "email": "jane.smith@example.com",
    "status": "active"
  }'
```

**Body Parameters** (all optional):
- `first_name`, `middle_name`, `last_name`
- `phone`, `email`
- `date_of_birth`, `gender`, `marital_status`, `nationality`
- `physical_address`, `postal_address`
- `employment_details`, `next_of_kin`
- `status`

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": "member-2",
    "member_number": "MEM-002",
    "first_name": "Jane",
    "last_name": "Smith",
    "phone": "+254722333444",
    "email": "jane.smith@example.com",
    "status": "active"
  }
}
```

### DELETE /members/:id - Soft Delete Member

Soft delete member (mark as deleted, preserve data).

**Request**:
```bash
curl -X DELETE http://localhost:3000/api/members/member-2 \
  -H "X-Tenant-Subdomain: test-sacco"
```

**Response (200 OK)**:
```json
{
  "success": true,
  "meta": {
    "deleted": true
  }
}
```

### GET /members/:id/accounts - Member Accounts

Get all savings/investment accounts for a member.

**Request**:
```bash
curl -X GET http://localhost:3000/api/members/member-1/accounts \
  -H "X-Tenant-Subdomain: test-sacco"
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "account-1",
      "member_id": "member-1",
      "account_type": "savings",
      "account_number": "ACC-001",
      "balance": 50000.00,
      "status": "active"
    }
  ],
  "meta": {
    "count": 1
  }
}
```

### GET /members/:id/loans - Member Loans

Get all loans for a member.

**Request**:
```bash
curl -X GET http://localhost:3000/api/members/member-1/loans \
  -H "X-Tenant-Subdomain: test-sacco"
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "loan-1",
      "member_id": "member-1",
      "loan_number": "LOAN-001",
      "product_name": "Personal Loan",
      "amount": 100000.00,
      "balance": 45000.00,
      "status": "active"
    }
  ],
  "meta": {
    "count": 1
  }
}
```

## Member Statuses

| Status | Description |
|--------|-------------|
| `active` | Active member with full privileges |
| `inactive` | Temporarily inactive (on hold) |
| `suspended` | Suspended due to breach of rules |
| `closed` | Account closed, no further transactions |

## Complete Member Workflow

1. **Register Member**
```bash
curl -X POST http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: test-sacco" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "member_number": "MEM-'$(date +%s)'",
    "email": "john@example.com",
    "phone": "+254700000000"
  }'
# Store returned member ID
```

2. **Retrieve Member Details**
```bash
curl -X GET http://localhost:3000/api/members/{member-id} \
  -H "X-Tenant-Subdomain: test-sacco"
```

3. **Update Member Profile**
```bash
curl -X PUT http://localhost:3000/api/members/{member-id} \
  -H "X-Tenant-Subdomain: test-sacco" \
  -d '{"status": "active", "email": "john@newemail.com"}'
```

4. **View Member Accounts**
```bash
curl -X GET http://localhost:3000/api/members/{member-id}/accounts \
  -H "X-Tenant-Subdomain: test-sacco"
```

5. **View Member Loans**
```bash
curl -X GET http://localhost:3000/api/members/{member-id}/loans \
  -H "X-Tenant-Subdomain: test-sacco"
```

## Field Validation

### Phone Number
- International format recommended: `+254700000000`
- Local format: `0700000000` (Kenya)
- No spaces or special characters
- Minimum 10 digits

### Email
- Must be valid email format: `name@domain.com`
- Will be used for password reset and notifications

### Member Number
- Unique within tenant
- Typically format: `MEM-###` or `MEM-####`
- User-defined (not auto-generated)

### Dates
- ISO 8601 format: `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ssZ`
- Must be valid dates

## Common Issues

### ❌ "Member number already exists"
**Cause**: Member number not unique
**Solution**: Use different member number

```bash
# Check existing members
curl http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: test-sacco"

# Use unique number
curl -X POST http://localhost:3000/api/members \
  -d '{"member_number": "MEM-NEW"}'
```

### ❌ "Invalid phone format"
**Cause**: Phone doesn't match expected format
**Solution**: Use international or local format

```bash
# Wrong: "123" (too short)
# Correct: "+254700000000" or "0700000000"
```

### ❌ "Invalid email format"
**Cause**: Email doesn't match regex
**Solution**: Provide valid email or omit field

```bash
# Wrong: "john@invalid" (missing TLD)
# Correct: "john@example.com"
```

## Related Documentation

- [Getting Started](../getting-started.md) - API basics
- [Accounts API](accounts.md) - Savings account management
- [Loans API](loans.md) - Loan management
- [Authentication API](auth.md) - Staff authentication
