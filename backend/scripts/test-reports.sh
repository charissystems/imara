#!/bin/bash
# Live test script for report endpoints

BASE="http://localhost:3000"
SUBDOMAIN="testsacco"

# Generate a fresh JWT - loads .env to use the same secret as the server
TOKEN=$(cd /home/alemi/imara/backend && npx tsx -e "
import 'dotenv/config';
import { sign } from 'hono/jwt';
(async () => {
  const secret = process.env.JWT_SECRET || 'your-secret-key';
  const token = await sign({
    staffId: 'test-staff-id',
    staffEmail: 'admin@testsacco.com',
    staffNumber: 'STF-001',
    role: 'admin',
    tenantId: '29abfbfa-19aa-4107-be95-d726f5c1af8b',
    type: 'access',
    exp: Math.floor(Date.now()/1000) + 86400
  }, secret, 'HS256');
  console.log(token);
})();
" 2>/dev/null)

echo "JWT Token: ${TOKEN:0:40}..."
echo ""

call() {
    local label="$1"
    local url="$2"
    echo "=== $label ==="
    local resp
    resp=$(curl -s --max-time 10 "$url" \
      -H "Authorization: Bearer $TOKEN" \
      -H "X-Tenant-Subdomain: $SUBDOMAIN")
    local code=$?
    if [ $code -ne 0 ]; then
        echo "FAIL: curl error $code"
    else
        echo "$resp" | python3 -m json.tool 2>/dev/null || echo "$resp"
    fi
    echo ""
}

call_export() {
    local label="$1"
    local url="$2"
    local ext="$3"
    echo "=== $label ==="
    local tmpfile="/tmp/test-export.$ext"
    local http_code
    http_code=$(curl -s --max-time 10 -o "$tmpfile" -w "%{http_code}" "$url" \
      -H "Authorization: Bearer $TOKEN" \
      -H "X-Tenant-Subdomain: $SUBDOMAIN")
    local size=$(wc -c < "$tmpfile")
    echo "HTTP $http_code | File size: ${size} bytes | Saved to: $tmpfile"
    if [ "$ext" = "csv" ]; then
        echo "Content preview:"
        head -5 "$tmpfile"
    fi
    echo ""
}

echo "============================================"
echo "  FINANCIAL REPORTS"
echo "============================================"

call "1. Trial Balance" "$BASE/reports/financial/trial-balance"
call "2. Balance Sheet" "$BASE/reports/financial/balance-sheet"
call "3. Income Statement" "$BASE/reports/financial/income-statement?period_start=2026-01-01&period_end=2026-02-14"
call "4. Cash Flow" "$BASE/reports/financial/cash-flow?period_start=2026-01-01&period_end=2026-02-14"

echo "============================================"
echo "  FINANCIAL EXPORTS"
echo "============================================"

call_export "5. Trial Balance PDF" "$BASE/reports/financial/trial-balance/export?format=pdf" "pdf"
call_export "6. Trial Balance CSV" "$BASE/reports/financial/trial-balance/export?format=csv" "csv"
call_export "7. Trial Balance Excel" "$BASE/reports/financial/trial-balance/export?format=excel" "xlsx"

echo "============================================"
echo "  OPERATIONAL REPORTS"
echo "============================================"

call "8. Member Listing" "$BASE/reports/operational/members"
call "9. Savings Summary" "$BASE/reports/operational/savings"
call "10. Loan Portfolio" "$BASE/reports/operational/loans"
call "11. Arrears Ageing" "$BASE/reports/operational/arrears"
call "12. NPL Report" "$BASE/reports/operational/npl"
call "13. Daily Transactions" "$BASE/reports/operational/transactions"

echo "============================================"
echo "  OPERATIONAL EXPORTS"
echo "============================================"

call_export "14. Member Listing CSV" "$BASE/reports/operational/members/export?format=csv" "csv"
call_export "15. Savings Summary PDF" "$BASE/reports/operational/savings/export?format=pdf" "pdf"

echo "============================================"
echo "  DASHBOARD"
echo "============================================"

call "16. Full Dashboard" "$BASE/reports/dashboard"
call "17. Dashboard KPIs" "$BASE/reports/dashboard/kpis"
call "18. Recent Activity" "$BASE/reports/dashboard/activity"

echo "============================================"
echo "  DONE - All endpoints tested"
echo "============================================"
