# Audit System Documentation

## Overview

The audit system tracks all significant operations across the multi-tenant platform for compliance, security investigation, and data recovery purposes. It operates at two levels:

1. **Platform Level** - Tenant lifecycle operations (create, delete, suspend, etc.)
2. **Application Level** - Per-tenant data changes (member updates, staff modifications, etc.)

---

## Platform-Level Audit

### Audit Log Table

**Database**: `public.tenant_audit_log`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `schema_name` | VARCHAR(63) | Affected tenant schema |
| `tenant_code` | VARCHAR(50) | Tenant identifier (code/subdomain) |
| `operation` | VARCHAR(20) | Operation type: CREATE, SOFT_DELETE, DROP, CREATE_FAILED, HEALTH_CHECK, etc. |
| `performed_by` | VARCHAR(100) | PostgreSQL user executing operation (default: `current_user`) |
| `performed_at` | TIMESTAMPTZ | Timestamp of operation (default: `now()`) |
| `details` | JSONB | Additional context (tenant ID, name, email, etc.) |
| `error_message` | TEXT | Error details if operation failed |

### Indexes

- `tenant_audit_log_schema_idx` - (schema_name, performed_at DESC) - Fast lookup by tenant
- `tenant_audit_log_operation_idx` - (operation, performed_at DESC) - Fast lookup by operation type

---

## API Endpoints

### 1. Get Audit Logs for Specific Tenant

```bash
GET /super-admin/tenants/:id/audit
```

**Query Parameters:**
- `limit` (default: 50) - Number of records to return
- `operation` (optional) - Filter by operation (CREATE, DROP, etc.)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "schema_name": "tenant_example",
      "tenant_code": "example",
      "operation": "CREATE_SUCCESS",
      "performed_by": "postgres",
      "performed_at": "2026-02-13T10:30:00Z",
      "details": {
        "tenantId": "uuid",
        "tenantName": "Example SACCO",
        "email": "contact@example.com",
        "hasPassword": true
      },
      "error_message": null
    }
  ],
  "count": 1,
  "tenantId": "uuid",
  "schemaName": "tenant_example"
}
```

### 2. Get All Audit Logs (Platform-Wide)

```bash
GET /super-admin/audit
```

**Query Parameters:**
- `limit` (default: 100) - Number of records
- `operation` (optional) - Filter by operation type
- `schema` (optional) - Filter by schema name
- `since` (optional) - ISO datetime string (e.g., "2026-02-13T00:00:00Z")

**Response:**
```json
{
  "success": true,
  "data": [...],
  "count": 10,
  "filters": {
    "operation": null,
    "schema": null,
    "since": null
  }
}
```

### 3. Get Audit Summary

```bash
GET /super-admin/audit-summary
```

**Query Parameters:**
- `days` (default: 7) - Look back period in days

**Response:**
```json
{
  "success": true,
  "data": {
    "period": {
      "days": 7,
      "since": "2026-02-06T12:00:00Z",
      "until": "2026-02-13T12:00:00Z"
    },
    "totalOperations": 45,
    "failedOperations": 2,
    "byOperation": [
      { "operation": "CREATE_SUCCESS", "count": 20 },
      { "operation": "SOFT_DELETE", "count": 15 },
      { "operation": "CREATE_FAILED", "count": 2 },
      { "operation": "HEALTH_CHECK", "count": 8 }
    ]
  }
}
```

---

## Operations Tracked

### Tenant Lifecycle

| Operation | Trigger | Details Captured |
|-----------|---------|------------------|
| `CREATE_SUCCESS` | Tenant created successfully | tenantId, tenantName, email, hasPassword |
| `CREATE_FAILED` | Tenant creation failed | tenantName, email, error message |
| `SOFT_DELETE` | Tenant marked as inactive | tenantId, tenantName |
| `HARD_DELETE` | Tenant schema physically dropped | schema, timestamp |
| `HARD_DELETE_FAILED` | Hard delete failed | schema, error message |
| `HEALTH_CHECK` | Health status verified | Full health report (JSONB) |

---

## Application-Level Audit

### Overview

Per-tenant audit logging for data modifications. The `AuditLogger` service tracks:

- **CREATE** operations - New records inserted
- **UPDATE** operations - Existing records modified (with change tracking)
- **DELETE** operations - Records removed

### Usage

```typescript
// In routes or services
const auditLogger = c.get('auditLogger');

// Log record creation
await auditLogger.logCreateRecord(
  'members',           // table name
  memberId,            // record ID
  { name, email, ... } // data
);

// Log record update with change tracking
await auditLogger.logUpdateRecord(
  'staff',
  staffId,
  { name: 'John', role: 'admin' },    // old data
  { name: 'John Doe', role: 'manager' } // new data
);
// Automatically captures: { name: { old: 'John', new: 'John Doe' }, ... }

// Log record deletion
await auditLogger.logDeleteRecord('members', memberId, memberData);
```

### Context Integration

The audit logger is automatically injected into every tenant-scoped request:

```typescript
export async function auditMiddleware(c: Context<Env>, next: Next) {
    const auditLogger = new AuditLogger(
        tenant?.schema_name || 'public',
        currentUser?.id
    );
    c.set('auditLogger', auditLogger);
}
```

### Logged Events

Each audit event captures:
- `tableName` - Which table was affected
- `operation` - CREATE, READ, UPDATE, DELETE
- `recordId` - The primary key
- `userId` - Who made the change (from context)
- `changes` - For UPDATE: field-level changes (old → new)
- `metadata` - Additional context
- `timestamp` - When it happened

**Note**: Events are currently logged to application logger. Future enhancement: Persist to dedicated `audit_events` table per tenant schema.

---

## Implementation Details

### TenantService Integration

The `TenantService` now logs all operations:

```typescript
async createTenant(...) {
  try {
    // ... create tenant ...
    await this.logAuditEvent(
      schemaName,
      'CREATE_SUCCESS',
      subdomain,
      { tenantId, tenantName, email, hasPassword }
    );
    return tenant;
  } catch (error) {
    await this.logAuditEvent(
      schemaName,
      'CREATE_FAILED',
      subdomain,
      { tenantName, email },
      errorMsg
    );
  }
}
```

### SQL Function Audit

The tenant engine SQL functions (`create_tenant_schema`, `soft_delete_tenant`, `drop_tenant_schema`) also log directly to `public.tenant_audit_log`:

```sql
-- Inside SQL function
INSERT INTO public.tenant_audit_log (schema_name, tenant_code, operation, details)
VALUES (p_schema_name, p_tenant_code, 'CREATE', jsonb_build_object(...));
```

This creates **dual audit trails**:
1. SQL function logs immediately (atomic with operation)
2. TenantService logs as well (application-level context)

---

## Security Considerations

### Access Control

- Platform audit (`/super-admin/audit`) - Requires `@admin` role
- Tenant audit (`/super-admin/tenants/:id/audit`) - Requires `@admin` role
- Application audit (via `AuditLogger`) - Available to all authenticated users in tenant context

### User Attribution

**Current State**: Uses PostgreSQL `current_user` (the database role)

**Future Enhancement**: To capture actual staff user making changes:
```typescript
// When staff authenticates, set in context
c.set('currentUser', { id: staffId, email, ... });

// AuditLogger automatically captures
const auditLogger = c.get('auditLogger');
// Logs with = staffId, not database role
```

### Data Retention

Currently: **Unlimited retention** - Audit logs grow indefinitely

**Recommended Policy**:
- Keep detailed audit for 90 days
- Archive to cold storage after 90 days
- Keep summary metrics indefinitely

---

## Compliance Use Cases

### 1. Tenant Provisioning Audit Trail

**Scenario**: Verify all tenants were created properly

```bash
curl -X GET "http://localhost:3000/super-admin/audit?operation=CREATE_SUCCESS" \
  -H "Authorization: Bearer <admin_token>"
```

Shows: When created, by whom, with what parameters, success/failure

### 2. Failed Operations Investigation

**Scenario**: Find which tenants failed to provision

```bash
curl -X GET "http://localhost:3000/super-admin/audit?operation=CREATE_FAILED" \
  -H "Authorization: Bearer <admin_token>"
```

Returns: Error messages, details, and timestamps for investigation

### 3. Tenant Deactivation History

**Scenario**: Confirm when/why tenant was suspended

```bash
curl -X GET "http://localhost:3000/super-admin/tenants/\{id\}/audit?operation=SOFT_DELETE" \
  -H "Authorization: Bearer <admin_token>"
```

### 4. Data Change Tracking

**Scenario**: See who changed a member's information and what changed

Using application-level audit:
```typescript
const auditLogger = c.get('auditLogger');
await auditLogger.logUpdateRecord(
  'members',
  memberId,
  oldMember,
  newMember
);
// Captures: { email: { old: 'old@ex.com', new: 'new@ex.com' }, ... }
```

### 5. Health Check Monitoring

**Scenario**: Verify tenant integrity over time

```bash
curl -X GET "http://localhost:3000/super-admin/audit?operation=HEALTH_CHECK&since=2026-02-06T00:00:00Z" \
  -H "Authorization: Bearer <admin_token>"
```

Returns: Schema exists, role exists, table count, subscription status

---

## Future Enhancements

1. **Audit Event Retentio**n Policy
   ```sql
   -- Automatic cleanup
   DELETE FROM public.tenant_audit_log 
   WHERE performed_at < NOW() - INTERVAL '90 days'
   AND operation NOT IN ('HARD_DELETE', 'SOFT_DELETE');
   ```

2. **Per-Tenant Audit Table**
   ```sql
   -- Create in each tenant schema
   CREATE TABLE tenant_audit_log (
     id UUID PRIMARY KEY,
     user_id UUID,
     operation VARCHAR(20),
     table_name VARCHAR(63),
     record_id UUID,
     old_data JSONB,
     new_data JSONB,
     performed_at TIMESTAMPTZ
   );
   ```

3. **Audit Webhooks**
   - Send audit events to external SIEM/compliance systems
   - Real-time alerting on suspicious operations

4. **Audit Dashboard**
   - Visual timeline of operations
   - Tenant activity heatmap
   - Anomaly detection

5. **PDF Export**
   - Generate compliance reports
   - Signed audit trails for regulatory requirements

---

## Testing Audit System

```bash
# Create test tenant (generates CREATE_SUCCESS audit)
curl -X POST http://localhost:3000/super-admin/tenants \
  -H "Authorization: Bearer <token>" \
  -d '{"name":"TestCo","code":"testco","subdomain":"testco"}'

# Check audit logs
curl -X GET http://localhost:3000/super-admin/tenants/\{tenant-id\}/audit \
  -H "Authorization: Bearer <token>"

# Check platform-wide audit
curl -X GET http://localhost:3000/super-admin/audit \
  -H "Authorization: Bearer <token>"

# Check summary
curl -X GET http://localhost:3000/super-admin/audit-summary?days=7 \
  -H "Authorization: Bearer <token>"
```

---

## References

- [OWASP Logging Guide](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [PostgreSQL Audit Logging](https://www.postgresql.org/docs/current/runtime-config-logging.html)
- [HIPAA Audit Requirements](https://www.hhs.gov/hipaa/for-professionals/security/audit-controls/)
