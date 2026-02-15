#!/bin/bash

# Comprehensive Live API Endpoint Testing Script
# Tests ALL endpoints with PASS and FAIL scenarios
# Run after starting the backend server

BASE_URL="${BASE_URL:-http://imara.local:3000}"
TENANT_SUBDOMAIN="testsacco"
AUTH_TOKEN=""
MEMBER_ID=""
ACCOUNT_ID=""
LOAN_ID=""
PRODUCT_ID=""
SHARE_CLASS_ID=""
FD_PRODUCT_ID=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
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
echo "  API ENDPOINT TESTING - COMPREHENSIVE"
echo "  Server: $BASE_URL"
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

# SUPER ADMIN ENDPOINTS
echo -e "${YELLOW}=== SUPER ADMIN: Tenant Management ===${NC}"
make_request "GET" "/super-admin/tenants" "" "List all tenants" "" "200" "no"
make_request "GET" "/super-admin/tenants/00000000-0000-0000-0000-000000000000" "" "Get non-existent tenant" "" "404" "no"
make_request "POST" "/super-admin/tenants" '{}' "Create tenant - empty data" "" "400" "no"
make_request "POST" "/super-admin/tenants" '{"sacco_name":"Test SACCO","code":"TEST"}' "Create tenant - valid" "" "201" "no"
make_request "PATCH" "/super-admin/tenants/00000000-0000-0000-0000-000000000000" '{"sacco_name":"Updated"}' "Patch tenant - non-existent" "" "404" "no"
make_request "DELETE" "/super-admin/tenants/00000000-0000-0000-0000-000000000000" "" "Delete non-existent tenant" "" "404" "no"

echo -e "${YELLOW}=== SUPER ADMIN: Monitoring & Audit ===${NC}"
make_request "GET" "/super-admin/tenants/00000000-0000-0000-0000-000000000000/health" "" "Get tenant health - non-existent" "" "404" "no"
make_request "GET" "/super-admin/tenants/00000000-0000-0000-0000-000000000000/audit" "" "Get tenant audit - non-existent" "" "404" "no"
make_request "GET" "/super-admin/audit" "" "List super admin audit logs" "" "200" "no"
make_request "GET" "/super-admin/audit-summary" "" "Get audit summary" "" "200" "no"
make_request "GET" "/super-admin/tenants/00000000-0000-0000-0000-000000000000/stats" "" "Get tenant statistics" "" "404" "no"
make_request "GET" "/super-admin/search?q=test" "" "Search across tenants" "" "200" "no"

echo -e "${YELLOW}=== SUPER ADMIN: Tenant Operations ===${NC}"
make_request "POST" "/super-admin/tenants/00000000-0000-0000-0000-000000000000/suspend" "" "Suspend tenant - non-existent" "" "404" "no"
make_request "POST" "/super-admin/tenants/00000000-0000-0000-0000-000000000000/reactivate" "" "Reactivate tenant - non-existent" "" "404" "no"
make_request "POST" "/super-admin/tenants/00000000-0000-0000-0000-000000000000/extend-subscription" '{"days":30}' "Extend subscription - non-existent" "" "404" "no"
make_request "POST" "/super-admin/tenants/00000000-0000-0000-0000-000000000000/backup" "" "Backup tenant - non-existent" "" "404" "no"

# AUTH ENDPOINTS
echo -e "${YELLOW}=== AUTH: Authentication ===${NC}"

TIMESTAMP=$(date +%s)
TEST_EMAIL="test-${TIMESTAMP}@test.com"

make_request "POST" "/auth/register" "{\"first_name\":\"Test\",\"last_name\":\"User\",\"email\":\"${TEST_EMAIL}\",\"password\":\"Test123!\"}" "Register - valid new user" "yes" "201" "no"
make_request "POST" "/auth/register" '{"email":"invalid"}' "Register - invalid email" "yes" "400" "no"
make_request "POST" "/auth/register" '{"first_name":"Test","last_name":"User","email":"test@test.com","password":"weak"}' "Register - weak password" "yes" "400" "no"
make_request "POST" "/auth/register" '{}' "Register - empty data" "yes" "400" "no"

make_request "POST" "/auth/login" "{\"email\":\"${TEST_EMAIL}\",\"password\":\"Test123!\"}" "Login - valid credentials" "yes" "200" "no"
make_request "POST" "/auth/login" '{"email":"wrong@test.com","password":"bad"}' "Login - invalid credentials" "yes" "401" "no"
make_request "POST" "/auth/login" '{}' "Login - empty body" "yes" "400" "no"
make_request "POST" "/auth/login" '{"email":""}' "Login - empty email" "yes" "400" "no"
make_request "POST" "/auth/login" '{"email":"test@test.com"}' "Login - no password" "yes" "400" "no"

echo -e "${YELLOW}=== AUTH: Account Management ===${NC}"
make_request "GET" "/auth/me" "" "Get user profile - no auth" "yes" "401" "no"
make_request "POST" "/auth/logout" "" "Logout - no auth" "yes" "401" "no"
make_request "POST" "/auth/refresh" "" "Refresh token - no auth" "yes" "401" "no"
make_request "POST" "/auth/change-password" '{"currentPassword":"old","newPassword":"New123!","confirmPassword":"New123!"}' "Change password - invalid" "yes" "400" "no"
make_request "POST" "/auth/forgot-password" '{"email":"notfound@test.com"}' "Forgot password - non-existent" "yes" "200" "no"
make_request "POST" "/auth/reset-password" '{"token":"invalid","newPassword":"New123!","confirmPassword":"New123!"}' "Reset password - invalid token" "yes" "400" "no"

echo -e "${YELLOW}=== AUTH: Two-Factor Authentication ===${NC}"
make_request "POST" "/auth/2fa/verify" '{"code":"000000"}' "Verify 2FA - invalid" "yes" "400" "no"
make_request "POST" "/auth/2fa/setup" "" "Setup 2FA - no auth" "yes" "401" "no"
make_request "GET" "/auth/2fa/status" "" "Get 2FA status - no auth" "yes" "401" "no"

# ADMIN ENDPOINTS
echo -e "${YELLOW}=== ADMIN: Staff Management ===${NC}"
make_request "GET" "/admin/staff" "" "List staff - no auth" "yes" "401" "no"
make_request "POST" "/admin/staff" '{"email":"invalid"}' "Create staff - invalid email" "yes" "400" "yes"

echo -e "${YELLOW}=== ADMIN: Dashboard & Configuration ===${NC}"
make_request "GET" "/admin/dashboard" "" "Dashboard - no auth" "yes" "401" "no"
make_request "GET" "/admin/config" "" "Get configuration - no auth" "yes" "401" "no"
make_request "GET" "/admin/config/fiscal-year" "" "Get fiscal year - no auth" "yes" "401" "no"
make_request "PUT" "/admin/config/fiscal-year" '{"fiscal_year_start":"01-01"}' "Update fiscal year - no auth" "yes" "401" "no"

echo -e "${YELLOW}=== ADMIN: Fee Schedules & Limits ===${NC}"
make_request "GET" "/admin/fee-schedules" "" "List fee schedules - no auth" "yes" "401" "no"
make_request "POST" "/admin/fee-schedules" '{}' "Create fee schedule - empty" "yes" "400" "yes"
make_request "GET" "/admin/transaction-limits" "" "List transaction limits - no auth" "yes" "401" "no"
make_request "POST" "/admin/transaction-limits" '{}' "Create transaction limit - empty" "yes" "400" "yes"

echo -e "${YELLOW}=== ADMIN: Job Scheduler ===${NC}"
make_request "GET" "/admin/jobs/stats" "" "Get job stats - no auth" "yes" "401" "no"
make_request "POST" "/admin/jobs/trigger" '{"job_type":"invalid"}' "Trigger job - invalid" "yes" "400" "yes"

# MEMBER ENDPOINTS
echo -e "${YELLOW}=== MEMBERS: Core Operations ===${NC}"
make_request "GET" "/members" "" "List members - no auth" "yes" "401" "no"
make_request "POST" "/members" '{}' "Create member - empty" "yes" "400" "yes"
make_request "POST" "/members" '{"fullName":"Test"}' "Create member - missing fields" "yes" "400" "yes"
make_request "POST" "/members" '{"first_name":"Kid","last_name":"User","date_of_birth":"2020-01-01","gender":"M"}' "Create member - under 18" "yes" "400" "yes"
make_request "GET" "/members/00000000-0000-0000-0000-000000000000" "" "Get non-existent member" "yes" "404" "yes"
make_request "PUT" "/members/00000000-0000-0000-0000-000000000000" '{"first_name":"Updated"}' "Update non-existent member" "yes" "404" "yes"
make_request "DELETE" "/members/00000000-0000-0000-0000-000000000000" "" "Delete non-existent member" "yes" "404" "yes"

echo -e "${YELLOW}=== MEMBERS: Documents & Identity ===${NC}"
make_request "GET" "/members/00000000-0000-0000-0000-000000000000/documents" "" "Get member documents - no auth" "yes" "401" "no"
make_request "POST" "/members/00000000-0000-0000-0000-000000000000/documents" '{}' "Upload document - empty" "yes" "400" "yes"
make_request "PATCH" "/members/00000000-0000-0000-0000-000000000000/kyc" '{"kyc_status":"approved"}' "Update KYC - no auth" "yes" "401" "no"

echo -e "${YELLOW}=== MEMBERS: Relationships ===${NC}"
make_request "GET" "/members/00000000-0000-0000-0000-000000000000/beneficiaries" "" "Get beneficiaries - no auth" "yes" "401" "no"
make_request "POST" "/members/00000000-0000-0000-0000-000000000000/beneficiaries" '{}' "Add beneficiary - empty" "yes" "400" "yes"
make_request "GET" "/members/00000000-0000-0000-0000-000000000000/next-of-kin" "" "Get next of kin - no auth" "yes" "401" "no"
make_request "PUT" "/members/00000000-0000-0000-0000-000000000000/next-of-kin" '{}' "Update next of kin - no auth" "yes" "401" "no"

echo -e "${YELLOW}=== MEMBERS: Imports & Bulk ===${NC}"
make_request "POST" "/members/bulk-import" '{"csv_data":""}' "Bulk import - empty data" "yes" "400" "yes"
make_request "GET" "/members/00000000-0000-0000-0000-000000000000/account" "" "Get member accounts - no auth" "yes" "401" "no"
make_request "GET" "/members/00000000-0000-0000-0000-000000000000/statement" "" "Get member statement - no auth" "yes" "401" "no"
make_request "GET" "/members/00000000-0000-0000-0000-000000000000/audit-log" "" "Get member audit log - no auth" "yes" "401" "no"

# ACCOUNTS & SAVINGS ENDPOINTS
echo -e "${YELLOW}=== ACCOUNTS: Products ===${NC}"
make_request "GET" "/accounts/products" "" "List savings products" "yes" "200" "no"
make_request "GET" "/accounts/products/00000000-0000-0000-0000-000000000000" "" "Get non-existent product" "yes" "404" "no"
make_request "POST" "/accounts/products" '{}' "Create product - empty" "yes" "400" "yes"
make_request "POST" "/accounts/products" '{"name":"","interest_rate":5}' "Create product - no name" "yes" "400" "yes"
make_request "POST" "/accounts/products" '{"name":"Savings","interest_rate":-5}' "Create product - negative rate" "yes" "400" "yes"
make_request "PATCH" "/accounts/products/00000000-0000-0000-0000-000000000000" '{"name":"Updated"}' "Update product - non-existent" "yes" "404" "no"

echo -e "${YELLOW}=== ACCOUNTS: Core Operations ===${NC}"
make_request "GET" "/accounts" "" "List accounts - no auth" "yes" "401" "no"
make_request "POST" "/accounts" '{}' "Create account - empty" "yes" "400" "yes"
make_request "POST" "/accounts" '{"member_id":"invalid"}' "Create account - invalid member" "yes" "400" "yes"
make_request "GET" "/accounts/00000000-0000-0000-0000-000000000000" "" "Get non-existent account" "yes" "404" "yes"
make_request "GET" "/accounts/00000000-0000-0000-0000-000000000000/statement" "" "Get account statement - no auth" "yes" "401" "no"

echo -e "${YELLOW}=== ACCOUNTS: Transactions ===${NC}"
make_request "POST" "/accounts/deposit" '{}' "Deposit - empty" "yes" "400" "yes"
make_request "POST" "/accounts/deposit" '{"amount":-100}' "Deposit - negative" "yes" "400" "yes"
make_request "POST" "/accounts/deposit" '{"amount":0}' "Deposit - zero" "yes" "400" "yes"
make_request "POST" "/accounts/withdrawal" '{"amount":-100}' "Withdrawal - negative" "yes" "400" "yes"
make_request "POST" "/accounts/transfer" '{}' "Transfer - empty" "yes" "400" "yes"
make_request "POST" "/accounts/transfer" '{"from_account_id":"same","to_account_id":"same","amount":100}' "Transfer - same account" "yes" "400" "yes"
make_request "POST" "/accounts/batch-deposit" '{"deposits":[]}' "Batch deposit - empty" "yes" "400" "yes"

echo -e "${YELLOW}=== ACCOUNTS: Advanced ===${NC}"
make_request "GET" "/accounts/standing-instructions" "" "List standing instructions - no auth" "yes" "401" "no"
make_request "POST" "/accounts/standing-instructions" '{}' "Create standing instruction - empty" "yes" "400" "yes"
make_request "GET" "/accounts/00000000-0000-0000-0000-000000000000/liens" "" "Get liens - no auth" "yes" "401" "no"
make_request "POST" "/accounts/liens" '{}' "Place lien - empty" "yes" "400" "yes"

# SHARES ENDPOINTS
echo -e "${YELLOW}=== SHARES: Classes & Management ===${NC}"
make_request "GET" "/shares/classes" "" "List share classes" "yes" "200" "no"
make_request "GET" "/shares/classes/00000000-0000-0000-0000-000000000000" "" "Get non-existent class" "yes" "404" "no"
make_request "POST" "/shares/classes" '{}' "Create class - empty" "yes" "400" "yes"
make_request "POST" "/shares/classes" '{"name":""}' "Create class - empty name" "yes" "400" "yes"
make_request "POST" "/shares/classes" '{"name":"Class","par_value":-100}' "Create class - negative value" "yes" "400" "yes"
make_request "PATCH" "/shares/classes/00000000-0000-0000-0000-000000000000" '{"name":"Updated"}' "Update class - non-existent" "yes" "404" "no"

echo -e "${YELLOW}=== SHARES: Transactions ===${NC}"
make_request "POST" "/shares/purchase" '{}' "Purchase - empty" "yes" "400" "yes"
make_request "POST" "/shares/purchase" '{"quantity":0}' "Purchase - zero quantity" "yes" "400" "yes"
make_request "POST" "/shares/purchase" '{"quantity":-10}' "Purchase - negative quantity" "yes" "400" "yes"
make_request "POST" "/shares/transfer" '{}' "Transfer - empty" "yes" "400" "yes"
make_request "GET" "/shares/holdings" "" "List holdings" "yes" "200" "no"
make_request "GET" "/shares/holdings/00000000-0000-0000-0000-000000000000" "" "Get non-existent holding" "yes" "404" "no"

echo -e "${YELLOW}=== SHARES: Dividends & Retirement ===${NC}"
make_request "GET" "/shares/dividends" "" "List dividends" "yes" "200" "no"
make_request "POST" "/shares/dividends/declare" '{}' "Declare dividend - empty" "yes" "400" "yes"
make_request "POST" "/shares/dividends/declare" '{"dividend_per_share":-100}' "Declare dividend - negative" "yes" "400" "yes"
make_request "POST" "/shares/retire" '{}' "Retire shares - empty" "yes" "400" "yes"
make_request "GET" "/shares/register" "" "Get share register" "yes" "200" "no"

# FIXED DEPOSITS ENDPOINTS
echo -e "${YELLOW}=== FIXED DEPOSITS: Products ===${NC}"
make_request "GET" "/fixed-deposits/products" "" "List FD products" "yes" "200" "no"
make_request "GET" "/fixed-deposits/products/00000000-0000-0000-0000-000000000000" "" "Get non-existent FD product" "yes" "404" "no"
make_request "POST" "/fixed-deposits/products" '{}' "Create FD product - empty" "yes" "400" "yes"
make_request "POST" "/fixed-deposits/products" '{"name":""}' "Create FD product - empty name" "yes" "400" "yes"
make_request "POST" "/fixed-deposits/products" '{"name":"FD","tenure_days":0}' "Create FD product - zero tenure" "yes" "400" "yes"
make_request "POST" "/fixed-deposits/products" '{"name":"FD","tenure_days":30,"interest_rate":-5}' "Create FD product - negative rate" "yes" "400" "yes"
make_request "PATCH" "/fixed-deposits/products/00000000-0000-0000-0000-000000000000" '{"name":"Updated"}' "Update FD product - non-existent" "yes" "404" "no"

echo -e "${YELLOW}=== FIXED DEPOSITS: Operations ===${NC}"
make_request "GET" "/fixed-deposits" "" "List FDs - no auth" "yes" "401" "no"
make_request "GET" "/fixed-deposits/00000000-0000-0000-0000-000000000000" "" "Get non-existent FD" "yes" "404" "yes"
make_request "POST" "/fixed-deposits/open" '{}' "Open FD - empty" "yes" "400" "yes"
make_request "POST" "/fixed-deposits/open" '{"principal_amount":0}' "Open FD - zero amount" "yes" "400" "yes"
make_request "POST" "/fixed-deposits/open" '{"principal_amount":-50000}' "Open FD - negative amount" "yes" "400" "yes"
make_request "POST" "/fixed-deposits/00000000-0000-0000-0000-000000000000/withdraw" '{"confirm":false}' "Withdraw FD - not confirmed" "yes" "400" "yes"
make_request "GET" "/fixed-deposits/maturing" "" "Get maturing FDs - no auth" "yes" "401" "no"

# LOANS ENDPOINTS
echo -e "${YELLOW}=== LOANS: Products ===${NC}"
make_request "GET" "/loans/products" "" "List loan products" "yes" "200" "no"
make_request "GET" "/loans/products/00000000-0000-0000-0000-000000000000" "" "Get non-existent loan product" "yes" "404" "no"
make_request "POST" "/loans/products" '{}' "Create loan product - empty" "yes" "400" "yes"
make_request "POST" "/loans/products" '{"name":""}' "Create loan product - empty name" "yes" "400" "yes"
make_request "POST" "/loans/products" '{"name":"Loan","interest_rate":-10}' "Create loan product - negative rate" "yes" "400" "yes"
make_request "POST" "/loans/products" '{"name":"Loan","max_amount":0}' "Create loan product - zero max" "yes" "400" "yes"
make_request "PATCH" "/loans/products/00000000-0000-0000-0000-000000000000" '{"name":"Updated"}' "Update loan product - non-existent" "yes" "404" "no"

echo -e "${YELLOW}=== LOANS: Applications ===${NC}"
make_request "GET" "/loans/applications" "" "List applications - no auth" "yes" "401" "no"
make_request "GET" "/loans/applications/00000000-0000-0000-0000-000000000000" "" "Get non-existent application" "yes" "404" "yes"
make_request "POST" "/loans/applications" '{}' "Apply loan - empty" "yes" "400" "yes"
make_request "POST" "/loans/applications" '{"requested_amount":0}' "Apply loan - zero amount" "yes" "400" "yes"
make_request "POST" "/loans/applications" '{"requested_amount":-100000}' "Apply loan - negative amount" "yes" "400" "yes"
make_request "POST" "/loans/applications" '{"requested_amount":1000000,"tenure_months":0}' "Apply loan - zero tenure" "yes" "400" "yes"
make_request "PATCH" "/loans/applications/00000000-0000-0000-0000-000000000000/approve" '{"approved_amount":50000,"approved_interest_rate":10,"approved_tenure_months":12}' "Approve - non-existent" "yes" "404" "yes"
make_request "PATCH" "/loans/applications/00000000-0000-0000-0000-000000000000/reject" '{"rejection_reason":"Insufficient collateral"}' "Reject - non-existent" "yes" "404" "yes"

echo -e "${YELLOW}=== LOANS: Loan Management ===${NC}"
make_request "GET" "/loans" "" "List loans - no auth" "yes" "401" "no"
make_request "GET" "/loans/00000000-0000-0000-0000-000000000000" "" "Get non-existent loan" "yes" "404" "yes"
make_request "POST" "/loans/repayment" '{}' "Repay - empty" "yes" "400" "yes"
make_request "POST" "/loans/repayment" '{"amount":0}' "Repay - zero amount" "yes" "400" "yes"
make_request "POST" "/loans/repayment" '{"amount":-5000}' "Repay - negative amount" "yes" "400" "yes"
make_request "GET" "/loans/00000000-0000-0000-0000-000000000000/schedule" "" "Get schedule - no auth" "yes" "401" "no"
make_request "GET" "/loans/00000000-0000-0000-0000-000000000000/repayments" "" "Get repayments - no auth" "yes" "401" "no"

echo -e "${YELLOW}=== LOANS: Advanced Operations ===${NC}"
make_request "POST" "/loans/schedule/preview" '{}' "Preview schedule - empty" "yes" "400" "yes"
make_request "POST" "/loans/schedule/preview" '{"principal":0}' "Preview schedule - zero principal" "yes" "400" "yes"
make_request "POST" "/loans/schedule/preview" '{"principal":100000,"interest_rate":-5}' "Preview schedule - negative rate" "yes" "400" "yes"
make_request "POST" "/loans/eligibility" '{}' "Check eligibility - empty" "yes" "400" "yes"
make_request "POST" "/loans/00000000-0000-0000-0000-000000000000/reschedule" '{}' "Reschedule - empty" "yes" "400" "yes"
make_request "POST" "/loans/00000000-0000-0000-0000-000000000000/write-off" '{"reason":"Bad debt"}' "Write-off - no auth" "yes" "401" "no"

# ACCOUNTING ENDPOINTS
echo -e "${YELLOW}=== ACCOUNTING: Chart of Accounts ===${NC}"
make_request "GET" "/accounting/accounts" "" "List GL accounts - no auth" "yes" "401" "no"
make_request "GET" "/accounting/accounts/00000000-0000-0000-0000-000000000000" "" "Get non-existent GL account" "yes" "404" "yes"
make_request "POST" "/accounting/accounts" '{}' "Create GL account - empty" "yes" "400" "yes"
make_request "POST" "/accounting/accounts" '{"code":"","name":"Test"}' "Create GL account - empty code" "yes" "400" "yes"
make_request "POST" "/accounting/accounts" '{"code":"1000","name":"","type":"Asset"}' "Create GL account - empty name" "yes" "400" "yes"
make_request "POST" "/accounting/accounts" '{"code":"1000","name":"Test","type":"Invalid"}' "Create GL account - invalid type" "yes" "400" "yes"
make_request "PATCH" "/accounting/accounts/00000000-0000-0000-0000-000000000000" '{"name":"Updated"}' "Update GL account - non-existent" "yes" "404" "yes"

echo -e "${YELLOW}=== ACCOUNTING: Periods & Journals ===${NC}"
make_request "GET" "/accounting/periods" "" "List periods - no auth" "yes" "401" "no"
make_request "POST" "/accounting/periods" '{}' "Create period - empty" "yes" "400" "yes"
make_request "POST" "/accounting/periods" '{"name":"Test","start_date":"invalid"}' "Create period - invalid date" "yes" "400" "yes"
make_request "POST" "/accounting/periods" '{"name":"Test","start_date":"2026-12-31","end_date":"2026-01-01"}' "Create period - end before start" "yes" "400" "yes"

make_request "GET" "/accounting/journals" "" "List journals - no auth" "yes" "401" "no"
make_request "GET" "/accounting/journals/00000000-0000-0000-0000-000000000000" "" "Get non-existent journal" "yes" "404" "yes"
make_request "POST" "/accounting/journals" '{}' "Create journal - empty" "yes" "400" "yes"
make_request "POST" "/accounting/journals" '{"description":"Test","entry_date":"invalid"}' "Create journal - invalid date" "yes" "400" "yes"
make_request "POST" "/accounting/journals" '{"description":"Test","entry_date":"2026-02-15","lines":[]}' "Create journal - no lines" "yes" "400" "yes"

echo -e "${YELLOW}=== ACCOUNTING: Financial Statements ===${NC}"
make_request "GET" "/accounting/trial-balance" "" "Get trial balance - no auth" "yes" "401" "no"
make_request "GET" "/accounting/balance-sheet" "" "Get balance sheet - no auth" "yes" "401" "no"
make_request "GET" "/accounting/income-statement" "" "Get income statement - no auth" "yes" "401" "no"
make_request "POST" "/accounting/auto-post" '{}' "Auto post - empty" "yes" "400" "yes"

# REPORTS ENDPOINTS
echo -e "${YELLOW}=== REPORTS: Financial Reports ===${NC}"
make_request "GET" "/reports/financial/trial-balance" "" "Trial balance - no auth" "yes" "401" "no"
make_request "GET" "/reports/financial/trial-balance/export?format=invalid" "" "Export - invalid format" "yes" "400" "yes"
make_request "GET" "/reports/financial/balance-sheet" "" "Balance sheet - no auth" "yes" "401" "no"
make_request "GET" "/reports/financial/balance-sheet/export" "" "Export balance sheet - no auth" "yes" "401" "no"
make_request "GET" "/reports/financial/income-statement?period_start=invalid&period_end=2026-02-15" "" "Income statement - invalid date" "yes" "400" "yes"
make_request "GET" "/reports/financial/income-statement?period_start=2026-12-31&period_end=2026-01-01" "" "Income statement - end before start" "yes" "400" "yes"

echo -e "${YELLOW}=== REPORTS: Operational Reports ===${NC}"
make_request "GET" "/reports/operational/members" "" "Members report - no auth" "yes" "401" "no"
make_request "GET" "/reports/operational/savings" "" "Savings report - no auth" "yes" "401" "no"
make_request "GET" "/reports/operational/loans" "" "Loans report - no auth" "yes" "401" "no"
make_request "GET" "/reports/operational/arrears" "" "Arrears report - no auth" "yes" "401" "no"
make_request "GET" "/reports/operational/npl" "" "NPL report - no auth" "yes" "401" "no"
make_request "GET" "/reports/operational/transactions" "" "Transactions report - no auth" "yes" "401" "no"

echo -e "${YELLOW}=== REPORTS: Dashboard ===${NC}"
make_request "GET" "/reports/dashboard" "" "Dashboard - no auth" "yes" "401" "no"
make_request "GET" "/reports/dashboard/kpis" "" "Dashboard KPIs - no auth" "yes" "401" "no"
make_request "GET" "/reports/dashboard/activity" "" "Dashboard activity - no auth" "yes" "401" "no"

# AUDIT ENDPOINTS
echo -e "${YELLOW}=== AUDIT: Audit Trails ===${NC}"
make_request "GET" "/audit/trail" "" "Audit trail - no auth" "yes" "401" "no"
make_request "GET" "/audit/activity" "" "Activity log - no auth" "yes" "401" "no"
make_request "GET" "/audit/security-events" "" "Security events - no auth" "yes" "401" "no"
make_request "POST" "/audit/reversal" '{}' "Reversal - empty" "yes" "400" "yes"
make_request "POST" "/audit/member-pin" '{}' "Set PIN - empty" "yes" "400" "yes"
make_request "POST" "/audit/member-pin/reset" '{}' "Reset PIN - empty" "yes" "400" "yes"

# MESSAGING ENDPOINTS
echo -e "${YELLOW}=== MESSAGING: Messages & Campaigns ===${NC}"
make_request "POST" "/messaging/send" '{}' "Send message - empty" "yes" "400" "yes"
make_request "GET" "/messaging/campaigns" "" "List campaigns - no auth" "yes" "401" "no"
make_request "GET" "/messaging/campaigns/00000000-0000-0000-0000-000000000000" "" "Get non-existent campaign" "yes" "404" "yes"
make_request "POST" "/messaging/bulk" '{}' "Bulk campaign - empty" "yes" "400" "yes"

echo -e "${YELLOW}=== MESSAGING: Templates & Preferences ===${NC}"
make_request "GET" "/messaging/templates" "" "List templates - no auth" "yes" "401" "no"
make_request "GET" "/messaging/templates/00000000-0000-0000-0000-000000000000" "" "Get non-existent template" "yes" "404" "yes"
make_request "POST" "/messaging/templates" '{}' "Create template - empty" "yes" "400" "yes"
make_request "GET" "/messaging/delivery-log" "" "Delivery log - no auth" "yes" "401" "no"
make_request "GET" "/messaging/preferences/00000000-0000-0000-0000-000000000000" "" "Get preferences - no auth" "yes" "401" "no"

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
