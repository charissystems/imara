#!/bin/bash

# Comprehensive Live API Endpoint Testing Script
# Tests ALL endpoints with PASS and FAIL scenarios
# Run after starting the backend server on localhost:3000

BASE_URL="http://localhost:3000"
TENANT_SUBDOMAIN="testsacco"
AUTH_TOKEN=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Counters
TOTAL=0
PASSED=0
FAILED=0

make_request() {
    local method=$1
    local endpoint=$2
    local data=$3
    local desc=$4
    local tenant=$5
    local expected=$6
    local auth=$7

    TOTAL=$((TOTAL + 1))
    
    if [ "$expected" = "200" ] || [ "$expected" = "201" ]; then
        echo -e "${BLUE}[$TOTAL] ${GREEN}✓ PASS${NC}: $desc"
    else
        echo -e "${BLUE}[$TOTAL] ${MAGENTA}✗ FAIL${NC}: $desc"
    fi
    echo "    $method $endpoint (expect: $expected)"

    local cmd="curl -s -X $method \"$BASE_URL$endpoint\""
    [ -n "$tenant" ] && cmd="$cmd -H \"x-tenant-subdomain: $TENANT_SUBDOMAIN\""
    [ "$auth" = "yes" ] && [ -n "$AUTH_TOKEN" ] && cmd="$cmd -H \"Authorization: Bearer $AUTH_TOKEN\""
    [ "$method" != "GET" ] && cmd="$cmd -H \"Content-Type: application/json\" -d '$data'"
    cmd="$cmd -w \"\nHTTP:%{http_code}\""
    
    local resp=$(eval $cmd 2>&1)
    local code=$(echo "$resp" | grep "HTTP:" | cut -d: -f2)
    
    if [ "$code" = "$expected" ]; then
        echo -e "    ${GREEN}✓ $code${NC}\n"
        PASSED=$((PASSED + 1))
    else
        echo -e "    ${RED}✗ Expected $expected, got $code${NC}\n"
        FAILED=$((FAILED + 1))
    fi
}

echo "========================================"
echo "  API ENDPOINT TESTING"
echo "  PASS & FAIL Scenarios"
echo "========================================"
echo ""

# SETUP: Generate JWT token using Node.js
echo -e "${YELLOW}=== SETUP: Generating JWT token ===${NC}"

# Generate JWT token using the same method as integration tests
AUTH_TOKEN=$(cd /home/alemi/imara/backend && npx tsx -e "
import 'dotenv/config';
import { sign } from 'hono/jwt';

(async () => {
  const secret = process.env.JWT_SECRET || 'imara-jwt-secret-change-in-production';
  const now = Math.floor(Date.now() / 1000);
  const token = await sign({
    staffId: '00000000-0000-4000-a000-000000000001',
    staffEmail: 'teststaff@example.com',
    staffNumber: 'STF-001',
    role: 'sacco_administrator',
    tenantId: '29abfbfa-19aa-4107-be95-d726f5c1af8b',
    type: 'access',
    iat: now,
    exp: now + 3600
  }, secret, 'HS256');
  console.log(token);
})();
" 2>/dev/null)

if [ -n "$AUTH_TOKEN" ]; then
    echo -e "${GREEN}✓ Successfully generated JWT token${NC}"
    echo "Token: ${AUTH_TOKEN:0:20}..."
else
    echo -e "${RED}✗ Failed to generate JWT token - tests requiring auth will fail${NC}"
fi
echo ""

# HEALTH
echo -e "${YELLOW}=== HEALTH ===${NC}"
make_request "GET" "/health" "" "Health check" "" "200" "no"

# SUPER ADMIN
echo -e "${YELLOW}=== SUPER ADMIN ===${NC}"
make_request "GET" "/super-admin/tenants" "" "List tenants" "" "200" "no"
make_request "GET" "/super-admin/audit" "" "Audit logs" "" "200" "no"
make_request "POST" "/super-admin/tenants" '{}' "Create tenant - empty data" "" "400" "no"
make_request "POST" "/super-admin/tenants" '{"name":""}' "Create tenant - empty name" "" "400" "no"
make_request "GET" "/super-admin/tenants/00000000-0000-0000-0000-000000000000" "" "Get non-existent tenant" "" "404" "no"

# AUTH
echo -e "${YELLOW}=== AUTH ===${NC}"

# Create a test user for login test
TIMESTAMP=$(date +%s)
TEST_EMAIL="test-${TIMESTAMP}@test.com"
make_request "POST" "/auth/register" "{\"first_name\":\"Test\",\"last_name\":\"User\",\"email\":\"${TEST_EMAIL}\",\"password\":\"Test123!\"}" "Register - create test user" "yes" "201" "no"
make_request "POST" "/auth/login" "{\"email\":\"${TEST_EMAIL}\",\"password\":\"Test123!\"}" "Login - valid credentials" "yes" "200" "no"
make_request "POST" "/auth/login" '{"email":"wrong@test.com","password":"bad"}' "Login - invalid credentials" "yes" "401" "no"
make_request "POST" "/auth/login" '{}' "Login - empty body" "yes" "400" "no"
make_request "POST" "/auth/login" '{"email":""}' "Login - empty email" "yes" "400" "no"
make_request "POST" "/auth/login" '{"email":"test@test.com"}' "Login - no password" "yes" "400" "no"
make_request "POST" "/auth/register" "{\"first_name\":\"Test\",\"last_name\":\"User\",\"email\":\"new-${TIMESTAMP}@test.com\",\"password\":\"Test123!\"}" "Register - valid new user" "yes" "201" "no"
make_request "POST" "/auth/register" '{"email":"bad-email","password":"Test123!"}' "Register - invalid email" "yes" "400" "no"
make_request "POST" "/auth/register" '{"first_name":"Test","last_name":"User","email":"test@test.com","password":"weak"}' "Register - weak password" "yes" "400" "no"
make_request "POST" "/auth/register" '{}' "Register - empty data" "yes" "400" "no"
make_request "GET" "/auth/me" "" "Get user - no auth" "yes" "401" "no"
make_request "POST" "/auth/logout" "" "Logout - no auth" "yes" "401" "no"

# ADMIN
echo -e "${YELLOW}=== ADMIN ===${NC}"
make_request "GET" "/admin/staff" "" "List staff - no auth" "yes" "401" "no"
make_request "GET" "/admin/dashboard" "" "Dashboard - no auth" "yes" "401" "no"
make_request "POST" "/admin/staff" '{"email":"invalid"}' "Create staff - invalid email" "yes" "400" "yes"

# MEMBERS
echo -e "${YELLOW}=== MEMBERS ===${NC}"
make_request "GET" "/members" "" "List members - no auth" "yes" "401" "no"
make_request "POST" "/members" '{}' "Create member - empty" "yes" "400" "yes"
make_request "POST" "/members" '{"fullName":"Test"}' "Create member - missing fields" "yes" "400" "yes"
make_request "POST" "/members" '{"fullName":"Kid","dateOfBirth":"2020-01-01","gender":"M","nationalId":"123","phone":"+256700000000","email":"kid@test.com","physicalAddress":"Test","nationality":"Uganda","idDocumentType":"NIN"}' "Create member - under 18" "yes" "400" "yes"
make_request "POST" "/members" '{"fullName":"Test","dateOfBirth":"1990-01-01","gender":"X","nationalId":"123","phone":"+256700000000","email":"test@test.com","physicalAddress":"Test","nationality":"Uganda","idDocumentType":"NIN"}' "Create member - invalid gender" "yes" "400" "yes"
make_request "POST" "/members" '{"fullName":"Test","dateOfBirth":"1990-01-01","gender":"M","nationalId":"123","phone":"bad","email":"test@test.com","physicalAddress":"Test","nationality":"Uganda","idDocumentType":"NIN"}' "Create member - invalid phone" "yes" "400" "yes"
make_request "GET" "/members/00000000-0000-0000-0000-000000000000" "" "Get non-existent member" "yes" "404" "yes"
make_request "DELETE" "/members/00000000-0000-0000-0000-000000000000" "" "Delete non-existent member" "yes" "404" "yes"

# ACCOUNTS
echo -e "${YELLOW}=== ACCOUNTS ===${NC}"
make_request "POST" "/accounts/products" '{}' "Create product - empty" "yes" "400" "yes"
make_request "POST" "/accounts/products" '{"product_name":""}' "Create product - empty name" "yes" "400" "yes"
make_request "POST" "/accounts/products" '{"product_name":"Test","interest_rate":-5}' "Create product - negative rate" "yes" "400" "yes"
make_request "POST" "/accounts/products" '{"product_name":"Test","minimum_balance":-1000}' "Create product - negative min balance" "yes" "400" "yes"
make_request "GET" "/accounts/products/00000000-0000-0000-0000-000000000000" "" "Get non-existent product" "yes" "404" "yes"
make_request "POST" "/accounts" '{}' "Create account - empty" "yes" "400" "yes"
make_request "POST" "/accounts" '{"member_id":"invalid"}' "Create account - invalid member" "yes" "400" "yes"
make_request "GET" "/accounts/00000000-0000-0000-0000-000000000000" "" "Get non-existent account" "yes" "404" "yes"
make_request "POST" "/accounts/deposit" '{}' "Deposit - empty" "yes" "400" "yes"
make_request "POST" "/accounts/deposit" '{"account_id":"test","amount":-100}' "Deposit - negative" "yes" "400" "yes"
make_request "POST" "/accounts/deposit" '{"account_id":"test","amount":0}' "Deposit - zero" "yes" "400" "yes"
make_request "POST" "/accounts/withdrawal" '{"account_id":"test","amount":-100}' "Withdraw - negative" "yes" "400" "yes"
make_request "POST" "/accounts/transfer" '{}' "Transfer - empty" "yes" "400" "yes"
make_request "POST" "/accounts/transfer" '{"from_account_id":"same","to_account_id":"same","amount":100}' "Transfer - same account" "yes" "400" "yes"

# SHARES
echo -e "${YELLOW}=== SHARES ===${NC}"
make_request "POST" "/shares/classes" '{}' "Create class - empty" "yes" "400" "yes"
make_request "POST" "/shares/classes" '{"class_name":""}' "Create class - empty name" "yes" "400" "yes"
make_request "POST" "/shares/classes" '{"class_name":"Test","nominal_value":-100}' "Create class - negative value" "yes" "400" "yes"
make_request "GET" "/shares/classes/00000000-0000-0000-0000-000000000000" "" "Get non-existent class" "yes" "404" "yes"
make_request "POST" "/shares/purchase" '{}' "Purchase - empty" "yes" "400" "yes"
make_request "POST" "/shares/purchase" '{"member_id":"test","class_id":"test","shares_quantity":0}' "Purchase - zero quantity" "yes" "400" "yes"
make_request "POST" "/shares/purchase" '{"member_id":"test","class_id":"test","shares_quantity":-10}' "Purchase - negative quantity" "yes" "400" "yes"
make_request "POST" "/shares/transfer" '{}' "Transfer - empty" "yes" "400" "yes"
make_request "POST" "/shares/dividends/declare" '{}' "Declare dividend - empty" "yes" "400" "yes"
make_request "POST" "/shares/dividends/declare" '{"class_id":"test","dividend_per_share":-100}' "Declare dividend - negative" "yes" "400" "yes"

# FIXED DEPOSITS
echo -e "${YELLOW}=== FIXED DEPOSITS ===${NC}"
make_request "POST" "/fixed-deposits/products" '{}' "Create FD product - empty" "yes" "400" "yes"
make_request "POST" "/fixed-deposits/products" '{"product_name":""}' "Create FD product - empty name" "yes" "400" "yes"
make_request "POST" "/fixed-deposits/products" '{"product_name":"Test","tenure_months":0}' "Create FD product - zero tenure" "yes" "400" "yes"
make_request "POST" "/fixed-deposits/products" '{"product_name":"Test","tenure_months":6,"interest_rate":-5}' "Create FD product - negative rate" "yes" "400" "yes"
make_request "POST" "/fixed-deposits/open" '{}' "Open FD - empty" "yes" "400" "yes"
make_request "POST" "/fixed-deposits/open" '{"member_id":"test","product_id":"test","principal_amount":0}' "Open FD - zero amount" "yes" "400" "yes"
make_request "POST" "/fixed-deposits/open" '{"member_id":"test","product_id":"test","principal_amount":-50000}' "Open FD - negative amount" "yes" "400" "yes"
make_request "GET" "/fixed-deposits/00000000-0000-0000-0000-000000000000" "" "Get non-existent FD" "yes" "404" "yes"

# LOANS
echo -e "${YELLOW}=== LOANS ===${NC}"
make_request "POST" "/loans/products" '{}' "Create loan product - empty" "yes" "400" "yes"
make_request "POST" "/loans/products" '{"product_name":""}' "Create loan product - empty name" "yes" "400" "yes"
make_request "POST" "/loans/products" '{"product_name":"Test","interest_rate":-10}' "Create loan product - negative rate" "yes" "400" "yes"
make_request "POST" "/loans/products" '{"product_name":"Test","max_amount":0}' "Create loan product - zero max" "yes" "400" "yes"
make_request "GET" "/loans/products/00000000-0000-0000-0000-000000000000" "" "Get non-existent loan product" "yes" "404" "yes"
make_request "POST" "/loans/applications" '{}' "Apply loan - empty" "yes" "400" "yes"
make_request "POST" "/loans/applications" '{"member_id":"test","product_id":"test","requested_amount":0}' "Apply loan - zero amount" "yes" "400" "yes"
make_request "POST" "/loans/applications" '{"member_id":"test","product_id":"test","requested_amount":-100000}' "Apply loan - negative amount" "yes" "400" "yes"
make_request "POST" "/loans/applications" '{"member_id":"test","product_id":"test","requested_amount":1000000,"tenure_months":0}' "Apply loan - zero tenure" "yes" "400" "yes"
make_request "GET" "/loans/applications/00000000-0000-0000-0000-000000000000" "" "Get non-existent application" "yes" "404" "yes"
make_request "POST" "/loans/repayment" '{}' "Repay - empty" "yes" "400" "yes"
make_request "POST" "/loans/repayment" '{"loan_id":"test","amount":0}' "Repay - zero amount" "yes" "400" "yes"
make_request "POST" "/loans/repayment" '{"loan_id":"test","amount":-5000}' "Repay - negative amount" "yes" "400" "yes"
make_request "POST" "/loans/repayment" '{"loan_id":"00000000-0000-0000-0000-000000000000","amount":1000}' "Repay - non-existent loan" "yes" "404" "yes"
make_request "POST" "/loans/schedule/preview" '{}' "Preview schedule - empty" "yes" "400" "yes"
make_request "POST" "/loans/schedule/preview" '{"principal":0,"interest_rate":12,"tenure_months":12}' "Preview schedule - zero principal" "yes" "400" "yes"
make_request "POST" "/loans/schedule/preview" '{"principal":1000000,"interest_rate":-5,"tenure_months":12}' "Preview schedule - negative rate" "yes" "400" "yes"
make_request "POST" "/loans/eligibility" '{}' "Check eligibility - empty" "yes" "400" "yes"

# REPORTS
echo -e "${YELLOW}=== REPORTS ===${NC}"
make_request "GET" "/reports/dashboard" "" "Dashboard - no auth" "yes" "401" "no"
make_request "GET" "/reports/financial/trial-balance" "" "Trial balance - no auth" "yes" "401" "no"
make_request "GET" "/reports/financial/income-statement?period_start=invalid&period_end=2026-02-15" "" "Income statement - invalid date" "yes" "400" "yes"
make_request "GET" "/reports/financial/income-statement?period_start=2026-12-31&period_end=2026-01-01" "" "Income statement - end before start" "yes" "400" "yes"
make_request "GET" "/reports/financial/trial-balance/export?format=invalid" "" "Export - invalid format" "yes" "400" "yes"

# ACCOUNTING
echo -e "${YELLOW}=== ACCOUNTING ===${NC}"
make_request "POST" "/accounting/accounts" '{}' "Create GL account - empty" "yes" "400" "yes"
make_request "POST" "/accounting/accounts" '{"account_code":"","account_name":"Test"}' "Create GL account - empty code" "yes" "400" "yes"
make_request "POST" "/accounting/accounts" '{"account_code":"1000","account_name":"","account_type":"Asset"}' "Create GL account - empty name" "yes" "400" "yes"
make_request "POST" "/accounting/accounts" '{"account_code":"1000","account_name":"Test","account_type":"Invalid"}' "Create GL account - invalid type" "yes" "400" "yes"
make_request "GET" "/accounting/accounts/00000000-0000-0000-0000-000000000000" "" "Get non-existent GL account" "yes" "404" "yes"
make_request "POST" "/accounting/periods" '{}' "Create period - empty" "yes" "400" "yes"
make_request "POST" "/accounting/periods" '{"period_name":"Test","start_date":"invalid"}' "Create period - invalid date" "yes" "400" "yes"
make_request "POST" "/accounting/periods" '{"period_name":"Test","start_date":"2026-12-31","end_date":"2026-01-01"}' "Create period - end before start" "yes" "400" "yes"
make_request "POST" "/accounting/journals" '{}' "Create journal - empty" "yes" "400" "yes"
make_request "POST" "/accounting/journals" '{"reference":"","transaction_date":"2026-02-15"}' "Create journal - empty ref" "yes" "400" "yes"
make_request "POST" "/accounting/journals" '{"reference":"JV001","transaction_date":"invalid"}' "Create journal - invalid date" "yes" "400" "yes"
make_request "POST" "/accounting/journals" '{"reference":"JV001","transaction_date":"2026-02-15","lines":[]}' "Create journal - no lines" "yes" "400" "yes"
make_request "GET" "/accounting/journals/00000000-0000-0000-0000-000000000000" "" "Get non-existent journal" "yes" "404" "yes"

# SUMMARY
echo ""
echo "========================================"
echo "  TEST SUMMARY"
echo "========================================"
echo -e "Total:  ${BLUE}$TOTAL${NC}"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""
[ $FAILED -eq 0 ] && echo -e "${GREEN}All tests passed!${NC}" || echo -e "${YELLOW}Some tests failed.${NC}"
echo "========================================"
