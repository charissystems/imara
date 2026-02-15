# Workflows & Guides

Complete end-to-end scenarios for common SACCO operations.

## Quick Links

- [Member Onboarding Flow](#member-onboarding-flow)
- [Loan Application & Disbursement](#loan-application--disbursement)
- [Share Management](#share-management)
- [Multi-Tenancy Concepts](#multi-tenancy-concepts)
- [Pagination & Sorting](#pagination--sorting)

---

## Member Onboarding Flow

Complete process from member registration to account setup.

### Step 1: Register Member

```bash
MEMBER_RESPONSE=$(curl -s -X POST http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: sacco-nairobi" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "last_name": "Njoroge",
    "member_number": "MEM-'$(date +%s)'",
    "email": "john@example.com",
    "phone": "+254700000000",
    "date_of_birth": "1990-05-20",
    "gender": "male",
    "nationality": "Kenyan",
    "auto_create_savings": true
  }')

echo "Member Registration Response:"
echo $MEMBER_RESPONSE | jq .

# Extract member ID for subsequent calls
MEMBER_ID=$(echo $MEMBER_RESPONSE | jq -r '.data.id')
echo "Member ID: $MEMBER_ID"
```

**Expected Output**:
```json
{
  "success": true,
  "data": {
    "id": "member-abc123",
    "member_number": "MEM-1707986400",
    "first_name": "John",
    "last_name": "Njoroge",
    "email": "john@example.com",
    "phone": "+254700000000",
    "status": "active"
  }
}
```

### Step 2: Complete Member KYC

Update member profile with complete KYC information:

```bash
curl -s -X PUT http://localhost:3000/api/members/$MEMBER_ID \
  -H "X-Tenant-Subdomain: sacco-nairobi" \
  -H "Content-Type: application/json" \
  -d '{
    "physical_address": {
      "street": "123 Moi Avenue",
      "city": "Nairobi",
      "postal_code": "00100"
    },
    "employment_details": {
      "employer": "Tech Solutions Ltd",
      "position": "Developer",
      "industry": "Technology"
    },
    "next_of_kin": {
      "name": "Mary Njoroge",
      "relationship": "Spouse",
      "phone": "+254700000001"
    }
  }' | jq .
```

### Step 3: Verify Member Details

Retrieve and verify complete member profile:

```bash
curl -s -X GET http://localhost:3000/api/members/$MEMBER_ID \
  -H "X-Tenant-Subdomain: sacco-nairobi" | jq .data
```

### Step 4: View Auto-Created Savings Account

View the automatically created savings account:

```bash
ACCOUNTS_RESPONSE=$(curl -s -X GET \
  http://localhost:3000/api/members/$MEMBER_ID/accounts \
  -H "X-Tenant-Subdomain: sacco-nairobi")

echo $ACCOUNTS_RESPONSE | jq .

ACCOUNT_ID=$(echo $ACCOUNTS_RESPONSE | jq -r '.data[0].id')
echo "Savings Account ID: $ACCOUNT_ID"
```

### Step 5: Member Can Now Access Services

With member registered and account created:
- ✅ Open savings accounts
- ✅ Apply for loans
- ✅ Purchase shares
- ✅ Open fixed deposit accounts
- ✅ Perform balance transfers

---

## Loan Application & Disbursement  

Complete loan lifecycle from application to repayment.

### Step 1: Verify Loan Products Available

```bash
PRODUCTS=$(curl -s -X GET http://localhost:3000/api/loans/products \
  -H "X-Tenant-Subdomain: sacco-nairobi")

echo "Available Loan Products:"
echo $PRODUCTS | jq '.data[] | {name, min_amount: .minimum_amount, max_amount: .maximum_amount}'
```

### Step 2: Member Applies for Loan

```bash
LOAN_APP=$(curl -s -X POST http://localhost:3000/api/loans/applications \
  -H "X-Tenant-Subdomain: sacco-nairobi" \
  -H "Authorization: Bearer {member_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "member_id": "'$MEMBER_ID'",
    "loan_product_id": "product-personal",
    "amount": 50000,
    "duration_months": 12
  }')

echo "Loan Application Created:"
echo $LOAN_APP | jq .

APP_ID=$(echo $LOAN_APP | jq -r '.data.id')
echo "Application ID: $APP_ID"
```

### Step 3: Loan Officer Reviews & Schedules Appraisal

```bash
APPRAISAL=$(curl -s -X POST \
  http://localhost:3000/api/loans/applications/$APP_ID/appraise \
  -H "X-Tenant-Subdomain: sacco-nairobi" \
  -H "Authorization: Bearer {loan_officer_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "appraised_amount": 50000,
    "appraised_date": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "appraisal_notes": "Approved - Good credit history"
  }')

echo "Appraisal Submitted:"
echo $APPRAISAL | jq .
```

### Step 4: Loan Committee Approves

```bash
APPROVAL=$(curl -s -X POST \
  http://localhost:3000/api/loans/applications/$APP_ID/approve \
  -H "X-Tenant-Subdomain: sacco-nairobi" \
  -H "Authorization: Bearer {approval_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "approved_amount": 50000,
    "approved_date": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "approval_notes": "Committee approved"
  }')

echo "Loan Approved:"
echo $APPROVAL | jq .
```

### Step 5: Disburse Funds

```bash
DISBURSEMENT=$(curl -s -X POST \
  http://localhost:3000/api/loans/applications/$APP_ID/disburse \
  -H "X-Tenant-Subdomain: sacco-nairobi" \
  -H "Authorization: Bearer {admin_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "disbursed_amount": 50000,
    "disbursement_date": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "account_number": "ACC-001"
  }')

echo "Loan Disbursed:"
echo $DISBURSEMENT | jq .

LOAN_ID=$(echo $DISBURSEMENT | jq -r '.data.loan_id')
```

### Step 6: Member Makes Repayment

```bash
REPAYMENT=$(curl -s -X POST \
  http://localhost:3000/api/loans/$LOAN_ID/repayments \
  -H "X-Tenant-Subdomain: sacco-nairobi" \
  -H "Authorization: Bearer {member_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 4500,
    "payment_method": "mobile_money",
    "reference": "M-PESA-12345"
  }')

echo "Repayment Recorded:"
echo $REPAYMENT | jq .
```

### Step 7: Monitor Loan Status

```bash
# Check loan details
curl -s -X GET http://localhost:3000/api/loans/$LOAN_ID \
  -H "X-Tenant-Subdomain: sacco-nairobi" | jq '.data | {status, balance, next_payment_date}'

# View all loans for member
curl -s -X GET http://localhost:3000/api/members/$MEMBER_ID/loans \
  -H "X-Tenant-Subdomain: sacco-nairobi" | jq '.data[] | {loan_id: .id, status, balance}'
```

---

## Share Management

Managing share purchases and dividends.

### Step 1: View Share Products

```bash
curl -s -X GET http://localhost:3000/api/shares/products \
  -H "X-Tenant-Subdomain: sacco-nairobi" | jq '.data[] | {name, par_value, current_price}'
```

### Step 2: Member Purchases Shares

```bash
PURCHASE=$(curl -s -X POST http://localhost:3000/api/shares/purchases \
  -H "X-Tenant-Subdomain: sacco-nairobi" \
  -H "Authorization: Bearer {member_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "member_id": "'$MEMBER_ID'",
    "share_product_id": "product-share-1",
    "quantity": 100,
    "purchase_price": 1000
  }')

echo "Shares Purchased:"
echo $PURCHASE | jq .
```

### Step 3: View Share Holdings

```bash
curl -s -X GET http://localhost:3000/api/members/$MEMBER_ID/shares \
  -H "X-Tenant-Subdomain: sacco-nairobi" | jq '.data[] | {product_name, quantity, total_value}'
```

### Step 4: Member Sells Shares

```bash
curl -s -X POST http://localhost:3000/api/shares/sales \
  -H "X-Tenant-Subdomain: sacco-nairobi" \
  -H "Authorization: Bearer {member_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "share_holding_id": "holding-123",
    "quantity": 50,
    "sale_price": 1100
  }' | jq .
```

---

## Multi-Tenancy Concepts

### Understanding Tenant Isolation

Each SACCO is a separate tenant with complete data isolation:

```bash
# SACCO 1: Nairobi
curl -X GET http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: sacco-nairobi"
# Returns only Nairobi SACCO members

# SACCO 2: Mombasa  
curl -X GET http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: sacco-mombasa"
# Returns only Mombasa SACCO members
```

### Admin Operations Across Tenants

SuperAdmin can perform operations across multiple tenants:

```bash
# SuperAdmin creates new tenant
curl -s -X POST http://localhost:3000/api/super-admin/tenants \
  -H "Authorization: Bearer {superadmin_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New SACCO",
    "subdomain": "new-sacco"
  }' | jq .

# SuperAdmin views audit logs across all tenants
curl -s -X GET http://localhost:3000/api/super-admin/audit-logs \
  -H "Authorization: Bearer {superadmin_token}" | jq .
```

---

## Pagination & Sorting

### Pagination Example

Retrieve members page by page:

```bash
# Page 1 (first 20 members)
curl -s -X GET "http://localhost:3000/api/members?page=1&limit=20" \
  -H "X-Tenant-Subdomain: sacco-nairobi" | jq '.meta | {page, total, pages}'

# Page 2
curl -s -X GET "http://localhost:3000/api/members?page=2&limit=20" \
  -H "X-Tenant-Subdomain: sacco-nairobi"

# Custom page size
curl -s -X GET "http://localhost:3000/api/members?page=1&limit=50" \
  -H "X-Tenant-Subdomain: sacco-nairobi"
```

### Sorting Example

Sort members by different fields:

```bash
# Sort by name (newest first)
curl -s "http://localhost:3000/api/members?sort_by=first_name&sort_order=asc" \
  -H "X-Tenant-Subdomain: sacco-nairobi"

# Sort by joined date (oldest first)
curl -s "http://localhost:3000/api/members?sort_by=joined_date&sort_order=asc" \
  -H "X-Tenant-Subdomain: sacco-nairobi"

# Sort by status (default: newest first)
curl -s "http://localhost:3000/api/members?sort_by=status&sort_order=desc" \
  -H "X-Tenant-Subdomain: sacco-nairobi"
```

### Filtering Example

Filter members by multiple criteria:

```bash
# Active members only
curl -s "http://localhost:3000/api/members?status=active" \
  -H "X-Tenant-Subdomain: sacco-nairobi"

# Members joined in specific date range
curl -s "http://localhost:3000/api/members?joined_from=2026-01-01&joined_to=2026-02-28" \
  -H "X-Tenant-Subdomain: sacco-nairobi"

# Search by name
curl -s "http://localhost:3000/api/members?search=john" \
  -H "X-Tenant-Subdomain: sacco-nairobi"
```

### Combining Filters & Pagination

```bash
# Page 1 of active members, sorted by join date
curl -s "http://localhost:3000/api/members?status=active&page=1&limit=20&sort_by=joined_date&sort_order=desc" \
  -H "X-Tenant-Subdomain: sacco-nairobi"
```

---

## Complete Script: Full Member & Loan Workflow

```bash
#!/bin/bash
set -e

TENANT="sacco-nairobi"
BASE_URL="http://localhost:3000/api"

echo "=== SACCO Member & Loan Workflow Demo ==="
echo ""

# Step 1: Register Member
echo "[1/7] Registering member..."
MEMBER=$(curl -s -X POST $BASE_URL/members \
  -H "X-Tenant-Subdomain: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Alice",
    "last_name": "Johnson",
    "member_number": "MEM-'$(date +%s)'",
    "email": "alice@example.com",
    "phone": "+254700000000"
  }')

MEMBER_ID=$(echo $MEMBER | jq -r '.data.id')
echo "✓ Member created: $MEMBER_ID"

# Step 2: Update Member Profile
echo "[2/7] Updating member profile..."
curl -s -X PUT $BASE_URL/members/$MEMBER_ID \
  -H "X-Tenant-Subdomain: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{
    "physical_address": {"city": "Nairobi", "postal_code": "00100"},
    "employment_details": {"employer": "Bank", "position": "Manager"}
  }' > /dev/null
echo "✓ Member profile updated"

# Step 3: View Member Accounts
echo "[3/7] Viewing member accounts..."
ACCOUNTS=$(curl -s -X GET $BASE_URL/members/$MEMBER_ID/accounts \
  -H "X-Tenant-Subdomain: $TENANT")
ACCOUNT_COUNT=$(echo $ACCOUNTS | jq '.meta.count')
echo "✓ Member has $ACCOUNT_COUNT account(s)"

# Step 4: Create Loan Application
echo "[4/7] Applying for loan..."
LOAN_APP=$(curl -s -X POST $BASE_URL/loans/applications \
  -H "X-Tenant-Subdomain: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{
    "member_id": "'$MEMBER_ID'",
    "loan_product_id": "product-personal",
    "amount": 50000,
    "duration_months": 12
  }')

APP_ID=$(echo $LOAN_APP | jq -r '.data.id')
echo "✓ Loan application created: $APP_ID"

# Step 5: View Loan Status
echo "[5/7] Checking loan status..."
curl -s -X GET $BASE_URL/loans/applications/$APP_ID \
  -H "X-Tenant-Subdomain: $TENANT" | jq '.data | {id, status, amount}'

# Step 6: View Member's Loans
echo "[6/7] Viewing all member loans..."
LOANS=$(curl -s -X GET $BASE_URL/members/$MEMBER_ID/loans \
  -H "X-Tenant-Subdomain: $TENANT")
LOAN_COUNT=$(echo $LOANS | jq '.meta.count')
echo "✓ Member has $LOAN_COUNT loan(s)"

# Step 7: List All Members
echo "[7/7] Listing all members..."
MEMBERS=$(curl -s -X GET "http://localhost:3000/api/members?limit=5" \
  -H "X-Tenant-Subdomain: $TENANT")
TOTAL=$(echo $MEMBERS | jq '.meta.total')
echo "✓ Total members in tenant: $TOTAL"

echo ""
echo "=== Workflow Complete ==="
```

---

## Best Practices for Workflows

1. **Always Store IDs**: Save returned IDs for subsequent operations
   ```bash
   MEMBER_ID=$(echo $RESPONSE | jq -r '.data.id')
   ```

2. **Check Response Success**: Verify success before proceeding
   ```bash
   SUCCESS=$(echo $RESPONSE | jq -r '.success')
   if [ "$SUCCESS" != "true" ]; then
     echo "Error: $(echo $RESPONSE | jq -r '.error.message')"
     exit 1
   fi
   ```

3. **Use Consistent Headers**: Always include required headers
   ```bash
   -H "X-Tenant-Subdomain: your-tenant"
   -H "Content-Type: application/json"
   ```

4. **Validate Dates**: Use ISO 8601 format
   ```bash
   "date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
   ```

5. **Handle Errors Gracefully**: Check for error responses
   ```bash
   if echo $RESPONSE | jq -e '.error' > /dev/null; then
     echo "API Error: $(echo $RESPONSE | jq -r '.error.message')"
   fi
   ```

## Related Documentation

- [Getting Started](../getting-started.md) - API basics
- [Members API](../domains/members.md) - Member management
- [Loans API](../domains/loans.md) - Loan operations
- [Authentication](../authentication.md) - Auth details
