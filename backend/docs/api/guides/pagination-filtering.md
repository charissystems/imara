# Pagination, Filtering & Sorting Guide

Comprehensive guide for working with list endpoints in the SACCO API.

## Overview

Most list endpoints support:
- **Pagination** - Navigate through large result sets
- **Filtering** - Narrow results by fields
- **Sorting** - Order results by different criteria
- **Searching** - Full-text search across fields

## Pagination

Navigate through large datasets efficiently.

### Basic Pagination

```bash
# Get first 20 items (default)
curl http://localhost:3000/api/members \
  -H "X-Tenant-Subdomain: test-sacco"

# Get page 2 with custom page size
curl "http://localhost:3000/api/members?page=2&limit=50" \
  -H "X-Tenant-Subdomain: test-sacco"
```

**Parameters**:
- `page` (default: 1) - Page number (1-indexed)
- `limit` (default: 20, max: 100) - Records per page

**Response Meta**:
```json
{
  "success": true,
  "data": [...],
  "meta": {
    "total": 150,
    "count": 20,
    "page": 1,
    "limit": 20,
    "pages": 8
  }
}
```

**Pagination Examples**:
```bash
# Page 1 (items 1-20)
curl "http://localhost:3000/api/members?page=1&limit=20"

# Page 2 (items 21-40)
curl "http://localhost:3000/api/members?page=2&limit=20"

# Page 3 - 50 items per page (items 101-150)
curl "http://localhost:3000/api/members?page=3&limit=50"

# Last page (total 150, using 20 per page)
curl "http://localhost:3000/api/members?page=8&limit=20"
```

### Cursor-Based Pagination (Optional)

For large datasets, cursor-based pagination is more efficient:

```bash
# Get first 20 items
curl "http://localhost:3000/api/members?limit=20"

# Response includes next cursor
# {
#   "data": [...],
#   "meta": {
#     "cursor": "abc123def456",
#     "has_more": true
#   }
# }

# Get next page using cursor
curl "http://localhost:3000/api/members?limit=20&after=abc123def456"
```

### Efficient Pagination Script

```bash
#!/bin/bash

# Fetch all members efficiently
TENANT="test-sacco"
PAGE=1
LIMIT=50
TOTAL=0

while true; do
  RESPONSE=$(curl -s "http://localhost:3000/api/members?page=$PAGE&limit=$LIMIT" \
    -H "X-Tenant-Subdomain: $TENANT")
  
  COUNT=$(echo $RESPONSE | jq '.meta.count')
  TOTAL=$((TOTAL + COUNT))
  
  # Process this page
  echo $RESPONSE | jq '.data[] | {id, member_number, name: .first_name}'
  
  # Check if more pages exist
  HAS_MORE=$(echo $RESPONSE | jq '.meta.pages > .meta.page')
  if [ "$HAS_MORE" != "true" ]; then
    break
  fi
  
  PAGE=$((PAGE + 1))
done

echo "Total members processed: $TOTAL"
```

## Filtering

Narrow result set by specifying field values.

### Common Filters

```bash
# Filter by status
curl "http://localhost:3000/api/members?status=active" \
  -H "X-Tenant-Subdomain: test-sacco"

# Multiple values (status = active OR inactive)
curl "http://localhost:3000/api/members?status=active,inactive" \
  -H "X-Tenant-Subdomain: test-sacco"

# Range filters
curl "http://localhost:3000/api/loans?amount_min=10000&amount_max=100000" \
  -H "X-Tenant-Subdomain: test-sacco"

# Date range filters
curl "http://localhost:3000/api/members?joined_from=2026-01-01&joined_to=2026-02-28" \
  -H "X-Tenant-Subdomain: test-sacco"
```

### Available Filters by Endpoint

**Members** (`/api/members`):
- `status` (enum: active|inactive|suspended|closed)
- `joined_from` (ISO date)
- `joined_to` (ISO date)
- `search` (text search)

**Loans** (`/api/loans`):
- `status` (enum: pending|approved|active|closed|defaulted)
- `product_id` (UUID)
- `member_id` (UUID)
- `amount_min` (number)
- `amount_max` (number)

**Accounts** (`/api/accounts`):
- `status` (enum: active|closed|dormant)
- `account_type` (enum: savings|investment)
- `member_id` (UUID)
- `balance_min` (number)
- `balance_max` (number)

**Transactions** (`/api/transactions`):
- `type` (enum: deposit|withdrawal|transfer)
- `account_id` (UUID)
- `date_from` (ISO date)
- `date_to` (ISO date)
- `amount_min` (number)
- `amount_max` (number)

## Sorting

Order results by different criteria.

### Basic Sorting

```bash
# Sort ascending (A to Z, oldest to newest)
curl "http://localhost:3000/api/members?sort_by=first_name&sort_order=asc" \
  -H "X-Tenant-Subdomain: test-sacco"

# Sort descending (Z to A, newest to oldest)
curl "http://localhost:3000/api/members?sort_by=first_name&sort_order=desc" \
  -H "X-Tenant-Subdomain: test-sacco"
```

**Parameters**:
- `sort_by` (default: created_at) - Field to sort by
- `sort_order` (default: desc) - Direction (asc|desc)

### Multi-Field Sorting

```bash
# Primary: sort by status, Secondary: sort by name
curl "http://localhost:3000/api/members?sort_by=status,first_name&sort_order=asc,asc" \
  -H "X-Tenant-Subdomain: test-sacco"
```

### Available Sort Fields

**Members**:
- `first_name`, `last_name`
- `joined_date`
- `status`
- `created_at` (default)

**Loans**:
- `amount`
- `status`
- `created_at` (default)
- `disbursed_date`
- `maturity_date`

**Accounts**:
- `balance`
- `status`
- `created_at` (default)
- `last_transaction`

### Sorting Examples

```bash
# Newest members first
curl "http://localhost:3000/api/members?sort_by=created_at&sort_order=desc"

# Oldest members first
curl "http://localhost:3000/api/members?sort_by=created_at&sort_order=asc"

# Members by name (A-Z)
curl "http://localhost:3000/api/members?sort_by=first_name&sort_order=asc"

# Active members first, then by name
curl "http://localhost:3000/api/members?sort_by=status,first_name&sort_order=asc,asc"

# Largest loans first
curl "http://localhost:3000/api/loans?sort_by=amount&sort_order=desc"

# Richest members (balance)
curl "http://localhost:3000/api/accounts?sort_by=balance&sort_order=desc"
```

## Searching

Full-text search across multiple fields.

### Text Search

```bash
# Search by name
curl "http://localhost:3000/api/members?search=john" \
  -H "X-Tenant-Subdomain: test-sacco"

# Search by email
curl "http://localhost:3000/api/members?search=john@example.com" \
  -H "X-Tenant-Subdomain: test-sacco"

# Search by member number
curl "http://localhost:3000/api/members?search=MEM-001" \
  -H "X-Tenant-Subdomain: test-sacco"
```

**Search Behavior**:
- Case-insensitive
- Partial matching supported
- Searches across common fields (name, email, member number)

### Search Examples

```bash
# Find "john" in members
curl "http://localhost:3000/api/members?search=john"
# Returns: John Doe, Johnny Smith, Paul John, etc.

# Find loan application
curl "http://localhost:3000/api/loans?search=APP-001"
# Returns: matching loan applications

# Find by account number
curl "http://localhost:3000/api/accounts?search=ACC-12345"
```

## Combining Filters, Sorting & Pagination

### Complex Query Examples

```bash
# Active members, sorted by name, page 2
curl "http://localhost:3000/api/members?status=active&sort_by=first_name&sort_order=asc&page=2&limit=20" \
  -H "X-Tenant-Subdomain: test-sacco"

# Approved loans from 2026, sorted by amount (largest first)
curl "http://localhost:3000/api/loans?status=approved&created_from=2026-01-01&sort_by=amount&sort_order=desc&page=1&limit=50"

# Search + filter + sort
# Active members named "John", sorted by joined date
curl "http://localhost:3000/api/members?status=active&search=john&sort_by=joined_date&sort_order=desc&page=1"

# Accounts with balance > 10,000, sorted by balance
curl "http://localhost:3000/api/accounts?balance_min=10000&sort_by=balance&sort_order=desc"

# Transactions from specific date range, sorted by amount
curl "http://localhost:3000/api/transactions?date_from=2026-02-01&date_to=2026-02-15&sort_by=amount&sort_order=desc&page=1&limit=100"
```

## Performance & Best Practices

### Optimize Large Result Sets

```bash
# ❌ Inefficient: Get all members at once
curl "http://localhost:3000/api/members?limit=10000"

# ✅ Efficient: Paginate with reasonable page size
curl "http://localhost:3000/api/members?limit=100&page=1"
# Then iterate through pages
```

### Use Filters to Reduce Results

```bash
# ❌ Inefficient: Get all loans, then filter locally
curl "http://localhost:3000/api/loans" | jq 'select(.status == "active")'

# ✅ Efficient: Filter server-side
curl "http://localhost:3000/api/loans?status=active"
```

### Combine Filters Efficiently

```bash
# ❌ Multiple requests
curl "http://localhost:3000/api/members?status=active"
# Then filter by date locally

# ✅ Single request
curl "http://localhost:3000/api/members?status=active&joined_from=2026-01-01"
```

### Cache Results When Possible

```bash
# Store results for reuse
MEMBERS=$(curl -s "http://localhost:3000/api/members?status=active" \
  -H "X-Tenant-Subdomain: test-sacco")

# Use multiple times
echo $MEMBERS | jq '.data | length'
echo $MEMBERS | jq '.data[] | .email'
```

### Use Appropriate Page Sizes

```bash
# Small pages: slow, but responsive UI
curl "http://localhost:3000/api/members?limit=10"

# Medium pages: balanced
curl "http://localhost:3000/api/members?limit=50"

# Large pages: faster for batch operations
curl "http://localhost:3000/api/members?limit=100"
```

## Common Patterns

### Get All Records of a Type

```bash
#!/bin/bash

fetch_all_members() {
  local tenant=$1
  local page=1
  
  while true; do
    response=$(curl -s "http://localhost:3000/api/members?page=$page&limit=100" \
      -H "X-Tenant-Subdomain: $tenant")
    
    # Process data
    echo $response | jq '.data[]'
    
    # Check if more pages
    count=$(echo $response | jq '.meta.count')
    if [ "$count" -lt 100 ]; then
      break
    fi
    
    page=$((page + 1))
  done
}

fetch_all_members "test-sacco"
```

### Filter & Sort Complex Results

```bash
#!/bin/bash

# Get large loan applications by recent approvals
curl -s "http://localhost:3000/api/loans?amount_min=50000&status=approved&sort_by=created_at&sort_order=desc&limit=50" \
  -H "X-Tenant-Subdomain: test-sacco" | \
  jq '.data[] | {amount, member_id, status, created_at}'
```

### Search & Paginate Results

```bash
#!/bin/bash

# Search for members named John, paginate results
search_and_paginate() {
  local search_term=$1
  local tenant=$2
  local page=1
  
  while true; do
    response=$(curl -s "http://localhost:3000/api/members?search=$search_term&page=$page&limit=20" \
      -H "X-Tenant-Subdomain: $tenant")
    
    # Display results
    echo "Page $page:"
    echo $response | jq '.data[] | {id, first_name, last_name}'
    
    # Check if more pages
    pages=$(echo $response | jq '.meta.pages')
    if [ "$page" -ge "$pages" ]; then
      break
    fi
    
    page=$((page + 1))
  done
}

search_and_paginate "john" "test-sacco"
```

## URL Encoding Tips

Special characters in filter values need URL encoding:

```bash
# Space → %20
curl "http://localhost:3000/api/members?search=john%20doe"

# @ → %40
curl "http://localhost:3000/api/members?search=john%40example.com"

# Use jq to build URLs safely
SEARCH="john@example.com"
ENCODED=$(echo "$SEARCH" | jq -sRr @uri)
curl "http://localhost:3000/api/members?search=$ENCODED"
```

## Related Documentation

- [Getting Started](../getting-started.md) - API basics
- [Workflows Guide](workflows.md) - Complete end-to-end scenarios
- [Error Handling](../error-handling.md) - Debugging query issues
