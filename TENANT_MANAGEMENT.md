# Tenant Management API & CLI Documentation

This guide covers both the REST API and CLI tool for managing SACCO tenants in the system.

---

## REST API Endpoints

### Base URL
```
http://localhost:3000/super-admin
```

### Authentication
All endpoints require superadmin authentication via the `requireSuperAdmin` middleware.

---

## API Endpoints

### 1. List All Tenants
**GET `/super-admin/tenants`**

Lists all tenants in the system.

```bash
curl -X GET http://localhost:3000/super-admin/tenants
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "tenant-1",
      "code": "sacco1",
      "sacco_name": "SACCO One",
      "subdomain": "sacco1",
      "schema_name": "tenant_sacco1",
      "status": "active",
      "subscription_tier": "pro",
      "subscription_expires_at": "2026-12-31T00:00:00.000Z",
      "contact_email": "admin@sacco1.com",
      "contact_phone": "+254700000000",
      "created_at": "2026-01-01T00:00:00.000Z",
      "updated_at": "2026-01-01T00:00:00.000Z"
    }
  ],
  "count": 1
}
```

---

### 2. Get Tenant Details
**GET `/super-admin/tenants/:id`**

Retrieve details of a specific tenant.

```bash
curl -X GET http://localhost:3000/super-admin/tenants/tenant-1
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": "tenant-1",
    "code": "sacco1",
    "sacco_name": "SACCO One",
    ...
  }
}
```

---

### 3. Create New Tenant
**POST `/super-admin/tenants`**

Create a new tenant with schema and infrastructure.

```bash
curl -X POST http://localhost:3000/super-admin/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SACCO Two",
    "code": "sacco2",
    "subdomain": "sacco2",
    "contact_email": "admin@sacco2.com",
    "contact_phone": "+254700000001",
    "admin_password": "SecurePassword123"
  }'
```

**Request Body**:
```json
{
  "name": "string (required, 3-100 chars)",
  "code": "string (required, lowercase alphanumeric with dashes)",
  "subdomain": "string (required, lowercase alphanumeric with dashes)",
  "contact_email": "string (optional, email format)",
  "contact_phone": "string (optional)",
  "admin_password": "string (optional, min 8 chars)"
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "message": "Tenant created successfully",
  "data": {
    "id": "tenant-2",
    "schema_name": "tenant_sacco2",
    ...
  }
}
```

---

### 4. Update Tenant
**PATCH `/super-admin/tenants/:id`**

Update tenant information (name, status, subscription).

```bash
curl -X PATCH http://localhost:3000/super-admin/tenants/tenant-1 \
  -H "Content-Type: application/json" \
  -d '{
    "sacco_name": "Updated SACCO Name",
    "status": "suspended",
    "subscription_expires_at": "2027-12-31T00:00:00Z"
  }'
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": "tenant-1",
    "sacco_name": "Updated SACCO Name",
    "status": "suspended",
    ...
  }
}
```

---

### 5. Delete Tenant
**DELETE `/super-admin/tenants/:id`**

Soft delete a tenant (marks as deleted, preserves data).
Use `?hard=true` for hard delete (destructive).

```bash
# Soft delete (default)
curl -X DELETE http://localhost:3000/super-admin/tenants/tenant-1

# Hard delete (drops schema)
curl -X DELETE http://localhost:3000/super-admin/tenants/tenant-1?hard=true
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Tenant deleted"
}
```

---

### 6. Suspend Tenant
**POST `/super-admin/tenants/:id/suspend`**

Suspend a tenant (blocks access).

```bash
curl -X POST http://localhost:3000/super-admin/tenants/tenant-1/suspend
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Tenant suspended successfully",
  "data": { ... }
}
```

---

### 7. Reactivate Tenant
**POST `/super-admin/tenants/:id/reactivate`**

Reactivate a suspended tenant.

```bash
curl -X POST http://localhost:3000/super-admin/tenants/tenant-1/reactivate
```

---

### 8. Extend Subscription
**POST `/super-admin/tenants/:id/extend-subscription`**

Extend tenant subscription by specified days.

```bash
curl -X POST http://localhost:3000/super-admin/tenants/tenant-1/extend-subscription \
  -H "Content-Type: application/json" \
  -d '{"days": 30}'
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Subscription extended successfully",
  "data": {
    "tenantId": "tenant-1",
    "newExpiryDate": "2026-03-13T00:00:00.000Z",
    "daysExtended": 30
  }
}
```

---

### 9. Tenant Health Check
**GET `/super-admin/tenants/:id/health`**

Check health status of tenant schema.

```bash
curl -X GET http://localhost:3000/super-admin/tenants/tenant-1/health
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "schemaExists": true,
    "roleExists": true,
    "databaseConnectivity": "ok"
  }
}
```

---

### 10. Tenant Statistics
**GET `/super-admin/tenants/:id/stats`**

Get usage statistics for a tenant.

```bash
curl -X GET http://localhost:3000/super-admin/tenants/tenant-1/stats
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "tenantId": "tenant-1",
    "tenantCode": "sacco1",
    "members": 150,
    "staff": 25,
    "status": "active",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "subscriptionExpiresAt": "2026-12-31T00:00:00.000Z"
  }
}
```

---

### 11. Search Tenants
**GET `/super-admin/search`**

Search tenants by name, code, or subdomain.

```bash
curl -X GET "http://localhost:3000/super-admin/search?q=sacco"
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "tenant-1",
      "sacco_name": "SACCO One",
      "code": "sacco1",
      "subdomain": "sacco1",
      "status": "active"
    }
  ],
  "count": 1,
  "query": "sacco"
}
```

---

### 12. Backup Tenant
**POST `/super-admin/tenants/:id/backup`**

Initiate a backup of tenant schema.

```bash
curl -X POST http://localhost:3000/super-admin/tenants/tenant-1/backup
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Backup initiated",
  "data": {
    "backupId": "backup_sacco1_1707807600000",
    "tenantId": "tenant-1",
    "timestamp": "2026-02-12T13:30:00.000Z",
    "schemaName": "tenant_sacco1",
    "status": "pending"
  }
}
```

---

## CLI Tool

### Installation
The CLI tool is located at `backend/scripts/tenant-cli.ts`

### Basic Usage

```bash
npm run tenant-cli <command> [options]
```

Or directly:
```bash
npx tsx backend/scripts/tenant-cli.ts <command> [options]
```

---

## CLI Commands

### 1. Create Tenant
```bash
npx tsx scripts/tenant-cli.ts create "Tenant Name" subdomain [password] [email]
```

**Example**:
```bash
npx tsx scripts/tenant-cli.ts create "SACCO Three" sacco3 SecurePass123 admin@sacco3.com
```

**Output**:
```
Creating Tenant: SACCO Three
Please wait...
✓ Tenant created successfully!

Tenant Details:
  ID: tenant-3
  Name: SACCO Three
  Code: sacco3
  Subdomain: sacco3
  Schema: tenant_sacco3
  Status: active
  Admin Email: admin@sacco3.com
  Temp Password: SecurePass123
  Created: 2026-02-12T13:30:00.000Z
```

---

### 2. List All Tenants
```bash
npx tsx scripts/tenant-cli.ts list
```

**Output**:
```
Listing All Tenants

ID      │Name                 │Code       │Subdomain            │Status     │Schema                │Created
────────┼──────────────────────┼───────────┼─────────────────────┼───────────┼──────────────────────┼─────────────
tenant-1│SACCO One            │sacco1     │sacco1               │active     │tenant_sacco1         │01/02/2026
tenant-2│SACCO Two            │sacco2     │sacco2               │suspended  │tenant_sacco2         │02/02/2026

ℹ Total: 2 tenant(s)
```

---

### 3. Show Tenant Details
```bash
npx tsx scripts/tenant-cli.ts show <tenant-id>
```

**Example**:
```bash
npx tsx scripts/tenant-cli.ts show tenant-1
```

**Output**:
```
Tenant Details: tenant-1

General Information:
  ID: tenant-1
  Name: SACCO One
  Short Name: (none)
  Code: sacco1
  Subdomain: sacco1
  Schema: tenant_sacco1

Status & Subscription:
  Status: active
  Subscription Tier: pro
  Expires: 12/31/2026
  Max Users: 1000
  Max Members: 50000

Contact:
  Email: admin@sacco1.com
  Phone: +254700000000
  Website: (none)

Timestamps:
  Created: 2026-02-12 13:30:00
  Updated: 2026-02-12 13:30:00
  Deleted: Active
```

---

### 4. Update Tenant
```bash
npx tsx scripts/tenant-cli.ts update <tenant-id> [--status active|suspended|inactive] [--name "New Name"] [--email new@example.com]
```

**Examples**:
```bash
# Update status
npx tsx scripts/tenant-cli.ts update tenant-1 --status suspended

# Update name
npx tsx scripts/tenant-cli.ts update tenant-1 --name "SACCO One Updated"

# Update email
npx tsx scripts/tenant-cli.ts update tenant-1 --email newemail@sacco1.com
```

---

### 5. Delete Tenant
```bash
npx tsx scripts/tenant-cli.ts delete <tenant-id> [--hard]
```

**Examples**:
```bash
# Soft delete (default, safe)
npx tsx scripts/tenant-cli.ts delete tenant-1

# Hard delete (drops schema, destructive!)
npx tsx scripts/tenant-cli.ts delete tenant-1 --hard
```

---

### 6. Suspend Tenant
```bash
npx tsx scripts/tenant-cli.ts suspend <tenant-id>
```

```bash
npx tsx scripts/tenant-cli.ts suspend tenant-1
✓ Tenant suspended: SACCO One
```

---

### 7. Activate Tenant
```bash
npx tsx scripts/tenant-cli.ts activate <tenant-id>
```

```bash
npx tsx scripts/tenant-cli.ts activate tenant-1
✓ Tenant activated: SACCO One
```

---

### 8. Extend Subscription
```bash
npx tsx scripts/tenant-cli.ts extend <tenant-id> --days <number>
```

```bash
npx tsx scripts/tenant-cli.ts extend tenant-1 --days 30
✓ Subscription extended by 30 days
  Tenant: SACCO One
  New Expiry: 03/13/2026
```

---

### 9. Health Check
```bash
npx tsx scripts/tenant-cli.ts health <tenant-id>
```

```bash
npx tsx scripts/tenant-cli.ts health tenant-1

Health Check: tenant-1

Health Status:
{
  "status": "healthy",
  "schemaExists": true,
  "roleExists": true
}

✓ Tenant is healthy
```

---

### 10. Tenant Statistics
```bash
npx tsx scripts/tenant-cli.ts stats <tenant-id>
```

```bash
npx tsx scripts/tenant-cli.ts stats tenant-1

Tenant Information:
  Name: SACCO One
  Code: sacco1
  Status: active
  Created: 01/02/2026
  Subscription Expires: 12/31/2026 (323 days left)
```

---

### 11. Search Tenants
```bash
npx tsx scripts/tenant-cli.ts search <query>
```

```bash
npx tsx scripts/tenant-cli.ts search sacco

Search Results: "sacco"

Name        │Code       │Subdomain      │Status
────────────┼───────────┼────────────────┼──────────
SACCO One   │sacco1     │sacco1          │active
SACCO Two   │sacco2     │sacco2          │suspended

ℹ Found 2 tenant(s)
```

---

### 12. Help
```bash
npx tsx scripts/tenant-cli.ts help
```

---

## Workflow Examples

### Complete Tenant Lifecycle

#### 1. Create a new SACCO tenant
```bash
npx tsx scripts/tenant-cli.ts create "Nairobi SACCO" nairobi-sacco MySecurePass123 admin@nairobi-sacco.com
```

#### 2. Verify it was created
```bash
npx tsx scripts/tenant-cli.ts list
```

#### 3. Check health
```bash
npx tsx scripts/tenant-cli.ts health tenant-3
```

#### 4. Get statistics
```bash
npx tsx scripts/tenant-cli.ts stats tenant-3
```

#### 5. Extend subscription (add 6 months)
```bash
npx tsx scripts/tenant-cli.ts extend tenant-3 --days 180
```

#### 6. Suspend if needed
```bash
npx tsx scripts/tenant-cli.ts suspend tenant-3
```

#### 7. Reactivate
```bash
npx tsx scripts/tenant-cli.ts activate tenant-3
```

---

## Common Tasks

### Finding Tenants
```bash
# Search by name
npx tsx scripts/tenant-cli.ts search "nairobi"

# Or use API
curl -X GET "http://localhost:3000/super-admin/search?q=nairobi"
```

### Managing Subscriptions
```bash
# Extend subscription by 90 days
npx tsx scripts/tenant-cli.ts extend tenant-1 --days 90

# Or via API
curl -X POST http://localhost:3000/super-admin/tenants/tenant-1/extend-subscription \
  -H "Content-Type: application/json" \
  -d '{"days": 90}'
```

### Emergency Actions
```bash
# Suspend a problematic tenant
npx tsx scripts/tenant-cli.ts suspend tenant-1

# Hard delete a tenant (careful!)
npx tsx scripts/tenant-cli.ts delete tenant-1 --hard
```

---

## Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| `NOT_FOUND` | 404 | Tenant not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `DUPLICATE` | 409 | Code/subdomain already exists |
| `PERMISSION_DENIED` | 403 | Not authorized (not superadmin) |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Implementation Files

- **API Routes**: [backend/src/routes/superAdmin.ts](backend/src/routes/superAdmin.ts)
- **CLI Tool**: [backend/scripts/tenant-cli.ts](backend/scripts/tenant-cli.ts)
- **Service**: [backend/src/services/tenantService.ts](backend/src/services/tenantService.ts)
- **Repository**: [backend/src/repositories/tenantRepository.ts](backend/src/repositories/tenantRepository.ts)

