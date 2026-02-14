#!/bin/bash

# Live API Endpoint Testing Script
# This script tests all API endpoints in the SACCO management system
# Run this after starting the backend server on localhost:3000

BASE_URL="http://localhost:3000"
TENANT_SUBDOMAIN="test"  # Change this to an existing tenant subdomain
AUTH_TOKEN=""  # Will be set after login

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to make requests
make_request() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    local tenant_header=$5

    echo -e "${YELLOW}Testing: $description${NC}"
    echo "Method: $method, Endpoint: $endpoint"

    headers=""
    if [ -n "$tenant_header" ]; then
        headers="-H 'x-tenant-subdomain: $TENANT_SUBDOMAIN'"
    fi
    if [ -n "$AUTH_TOKEN" ]; then
        headers="$headers -H 'Authorization: Bearer $AUTH_TOKEN'"
    fi

    if [ "$method" = "GET" ]; then
        curl -s -X GET "$BASE_URL$endpoint" $headers -w "\nStatus: %{http_code}\n"
    elif [ "$method" = "POST" ]; then
        curl -s -X POST "$BASE_URL$endpoint" $headers -H "Content-Type: application/json" -d "$data" -w "\nStatus: %{http_code}\n"
    elif [ "$method" = "PATCH" ]; then
        curl -s -X PATCH "$BASE_URL$endpoint" $headers -H "Content-Type: application/json" -d "$data" -w "\nStatus: %{http_code}\n"
    elif [ "$method" = "DELETE" ]; then
        curl -s -X DELETE "$BASE_URL$endpoint" $headers -w "\nStatus: %{http_code}\n"
    fi

    echo -e "${GREEN}---${NC}\n"
}

echo "Starting API endpoint tests..."
echo "Base URL: $BASE_URL"
echo "Tenant: $TENANT_SUBDOMAIN"
echo

# Health check
make_request "GET" "/health" "" "Health check"

# Super Admin endpoints (no tenant required)
make_request "GET" "/super-admin/tenants" "" "List all tenants"
make_request "GET" "/super-admin/audit" "" "Get audit logs"
make_request "GET" "/super-admin/audit-summary" "" "Get audit summary"
make_request "GET" "/super-admin/search?q=test" "" "Search tenants"

# Auth endpoints (tenant required)
make_request "POST" "/auth/login" '{"email":"admin@test.com","password":"password123"}' "Login" "yes"
# Note: In a real test, you'd capture the token from login response and set AUTH_TOKEN

# Assuming we have a token, continue with authenticated endpoints
# For demo purposes, we'll skip auth-dependent tests or use dummy token

# Admin endpoints
make_request "GET" "/admin/staff" "" "List staff" "yes"
make_request "GET" "/admin/dashboard" "" "Get dashboard" "yes"

# Member endpoints
make_request "GET" "/members" "" "List members" "yes"
make_request "POST" "/members" '{"fullName":"Test Member","dateOfBirth":"1990-01-01","gender":"M","nationalId":"123456789","phone":"+256700000000","email":"test@example.com","physicalAddress":"Test Address","nationality":"Uganda","idDocumentType":"NIN"}' "Create member" "yes"

# Account endpoints
make_request "GET" "/accounts" "" "List accounts" "yes"
make_request "GET" "/accounts/products" "" "List savings products" "yes"

# Share endpoints
make_request "GET" "/shares/classes" "" "List share classes" "yes"
make_request "GET" "/shares/holdings" "" "List share holdings" "yes"

# Fixed Deposit endpoints
make_request "GET" "/fixed-deposits/products" "" "List FD products" "yes"
make_request "GET" "/fixed-deposits" "" "List fixed deposits" "yes"

# Loan endpoints
make_request "GET" "/loans/products" "" "List loan products" "yes"
make_request "GET" "/loans/applications" "" "List loan applications" "yes"
make_request "GET" "/loans" "" "List loans" "yes"

# Report endpoints
make_request "GET" "/reports/dashboard" "" "Get dashboard reports" "yes"
make_request "GET" "/reports/financial/trial-balance" "" "Get trial balance" "yes"

# Accounting endpoints
make_request "GET" "/accounting/accounts" "" "List chart of accounts" "yes"
make_request "GET" "/accounting/periods" "" "List financial periods" "yes"
make_request "GET" "/accounting/journals" "" "List journal entries" "yes"

echo "API testing complete!"
