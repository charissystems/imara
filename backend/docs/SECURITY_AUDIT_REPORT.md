# Security Audit & Bug Hunt Report

**Scope:** 12 backend route files  
**Date:** 2025-01-XX  
**Auditor:** Automated deep-read analysis  
**Codebase:** Multi-tenant SACCO management system (Hono + Kysely + PostgreSQL)

---

## Executive Summary

| Severity | Security Issues | Bugs |
|----------|:-:|:-:|
| **Critical** | 3 | 2 |
| **High** | 8 | 3 |
| **Medium** | 9 | 4 |
| **Low** | 4 | 3 |
| **Total** | **24** | **12** |

---

## SECURITY ISSUES

---

### SEC-01 · Missing Authorization on Admin Staff Endpoints

**File:** `src/routes/admin.ts`  
**Lines:** 22, 66, 111  
**Severity:** Critical

`GET /staff`, `POST /members`, and `POST /staff` have **no** `enforcePermission` middleware. Any authenticated user in the tenant can list all staff, create members, and create new staff accounts (including admin roles).

```typescript
// Line 22 — no permission guard
app.get('/staff', async (c) => {

// Line 66 — no permission guard
app.post('/members', validate(createMemberSchema), async (c) => {

// Line 111 — no permission guard
app.post('/staff', validate(createStaffSchema), async (c) => {
```

**Recommended Fix:**
```typescript
app.get('/staff', enforcePermission('staff', 'read'), async (c) => { ... });
app.post('/members', enforcePermission('members', 'create'), async (c) => { ... });
app.post('/staff', enforcePermission('staff', 'create'), async (c) => { ... });
```

---

### SEC-02 · Missing Authorization on Admin Dashboard & Jobs

**File:** `src/routes/admin.ts`  
**Lines:** 198, 241, 274  
**Severity:** High

`GET /dashboard`, `POST /jobs/trigger`, and `GET /jobs/stats` have no permission checks. Any authenticated user can view the admin dashboard (including financial metrics), trigger background jobs (interest accrual, penalty, loan overdue processing), and view job statistics.

```typescript
// Line 198
app.get('/dashboard', async (c) => {

// Line 241 — anyone can trigger scheduler jobs
app.post('/jobs/trigger', validate(triggerJobSchema), async (c) => {

// Line 274
app.get('/jobs/stats', async (c) => {
```

**Recommended Fix:**
```typescript
app.get('/dashboard', enforcePermission('dashboard', 'read'), async (c) => { ... });
app.post('/jobs/trigger', enforcePermission('configuration', 'update'), async (c) => { ... });
app.get('/jobs/stats', enforcePermission('configuration', 'read'), async (c) => { ... });
```

---

### SEC-03 · Missing Authorization on Accounting Read Routes

**File:** `src/routes/accounting.ts`  
**Lines:** ~100–150, ~550–580, ~1080–1205  
**Severity:** High

Multiple accounting GET routes use `hasPermission` inline on write operations but have **no** `enforcePermission` middleware on read routes for chart of accounts, journals, trial balance, income statement, and balance sheet. Any authenticated user can read the full financial statements.

Routes affected (no `enforcePermission` middleware):
- `GET /accounts` — chart of accounts listing
- `GET /accounts/:id` — single account
- `GET /journals` — journal entries listing
- `GET /journals/:id` — single journal
- `GET /trial-balance`
- `GET /income-statement`
- `GET /balance-sheet`
- `POST /auto-post` — auto-posting trigger

**Recommended Fix:** Add `enforcePermission('chart_of_accounts', 'read')` or `enforcePermission('reports', 'read')` to all read endpoints.

---

### SEC-04 · Fixed Deposits Listing Has No IDOR Protection

**File:** `src/routes/fixedDeposits.ts`  
**Lines:** 217–265  
**Severity:** High

`GET /fixed-deposits` has no `enforcePermission` and no member-scoping. Any authenticated user can list **all** fixed deposits across the tenant, or filter by any arbitrary `member_id`, exposing other members' financial data.

```typescript
// Line 217 — no enforcePermission, no member-scoping check
fixedDepositRoutes.get('/', async (c) => {
    const memberId = c.req.query('member_id');
    // ...
    if (memberId) {
        query = query.where('fd.member_id', '=', memberId);
    }
    // If no memberId filter, returns ALL FDs
```

**Recommended Fix:**
```typescript
fixedDepositRoutes.get('/', async (c) => {
    const user = c.get('user');
    if (user?.role === 'member') {
        query = query.where('fd.member_id', '=', user.id);
    } else if (!hasPermission(user?.role || '', 'fixed_deposits', 'read')) {
        throw new UnauthorizedError('Insufficient permissions');
    }
```

---

### SEC-05 · Fixed Deposits Withdrawal Preview Missing Auth

**File:** `src/routes/fixedDeposits.ts`  
**Lines:** 397–418, 1181–1201  
**Severity:** Medium

`GET /:depositId/withdrawal-preview` and `GET /:depositId/premature-withdrawal-preview` have **no** permission check at all. Any authenticated user can preview withdrawal amounts for any FD.

```typescript
// Line 397 — no enforcePermission, no hasPermission
fixedDepositRoutes.get('/:depositId/withdrawal-preview', async (c) => {

// Line 1181 — same issue on alias route
fixedDepositRoutes.get('/:depositId/premature-withdrawal-preview', async (c) => {
```

**Recommended Fix:** Add `enforcePermission('fixed_deposits', 'read')` and member ownership check.

---

### SEC-06 · Share Routes Defined After `export default` — Dead Code

**File:** `src/routes/shares.ts`  
**Lines:** 867–1192  
**Severity:** Critical

`export default shareRoutes` is on line 867, but routes from lines 874–1192 are registered **after** the export. While the Hono router object is mutable so these routes technically exist on the exported object, this pattern is highly error-prone and unexpected. If the import mechanism ever copies the value at import time, ~325 lines of routes silently stop working. Additionally, before line 867 many routes (e.g., `GET /classes`, `POST /classes`, `GET /holdings`, `GET /dividends`) lack any `enforcePermission` middleware while routes after line 867 properly use `enforcePermission`.

Routes registered after `export default` (lines 874–1192):
- `GET /purchases/:purchaseId`
- `GET /members/:memberId/holdings`
- `GET /members/:memberId/transactions`
- `GET /transfers/:transferId`
- `GET /dividends/declarations`
- `GET /dividends/declarations/:declarationId`
- `POST /dividends/declarations/:declarationId/approve`
- `GET /members/:memberId/certificate`
- `GET /classes/:classId/analytics`

**Recommended Fix:** Move `export default shareRoutes` to the end of the file (after all route registrations).

---

### SEC-07 · Messaging Routes Defined After `export default` — Dead Code Risk

**File:** `src/routes/messaging.ts`  
**Lines:** 1102–1223  
**Severity:** High

Same pattern as SEC-06. `export default messagingRoutes` is on line 1102, but 3 analytics routes are registered after it (lines 1112–1223):
- `GET /analytics/summary`
- `GET /analytics/delivery-rates`
- `GET /analytics/channel-performance`

**Recommended Fix:** Move `export default messagingRoutes` to the end of the file.

---

### SEC-08 · Share Holdings GET Has Empty-String IDOR Fallback

**File:** `src/routes/shares.ts`  
**Lines:** 288–305  
**Severity:** Medium

When a user is not admin and has no `memberId`, the code falls through to `findHoldingsByMemberId('')`, which may return unexpected results depending on the repository implementation (could match a falsy member_id or return empty).

```typescript
// Line 303
} else {
    holdings = await shareRepo.findHoldingsByMemberId(''); // Returns empty for safety
}
```

**Recommended Fix:** Throw an `UnauthorizedError` for unauthenticated/unidentifiable users instead of querying with an empty ID.

---

### SEC-09 · Share Class/Dividend Routes Missing `enforcePermission`

**File:** `src/routes/shares.ts`  
**Lines:** 78, 100, 288, 320, 341, 363, 385, 414, 452, 513, 544, 566  
**Severity:** High

The first ~867 lines of share routes (before `export default`) use inline `hasPermission` checks on some write routes but use **no** `enforcePermission` middleware on read routes. Any authenticated user can:
- View all share classes (`GET /classes`)
- View any holding details (`GET /holdings/:holdingId`)
- View any holding transactions (`GET /holdings/:holdingId/transactions`)
- View any holding certificate (`GET /holdings/:holdingId/certificate`)
- View all dividend declarations (`GET /dividends`)
- View share register (`GET /register`)
- View register by member (`GET /register/member/:memberId`)

**Recommended Fix:** Add `enforcePermission('shares', 'read')` to all GET routes.

---

### SEC-10 · FD Product Routes Missing Authorization

**File:** `src/routes/fixedDeposits.ts`  
**Lines:** 68, 98  
**Severity:** Low

`GET /products` and `GET /products/:productId` have no permission check. Any authenticated user can view all FD products. This is likely acceptable for member-facing flows, but product details (like internal pricing structures) may be sensitive.

**Recommended Fix:** Consider adding `enforcePermission('fixed_deposits', 'read')` or leave public if intentional (add comment).

---

### SEC-11 · Loan Appraisal & Guarantor GET Routes Missing Authorization

**File:** `src/routes/loans.ts`  
**Lines:** ~908, ~993  
**Severity:** Medium

`GET /applications/:applicationId/appraisal` and `GET /applications/:applicationId/guarantors` have no permission check. Any authenticated user can view appraisal details (income, expenses, DTI ratio, risk rating) and guarantor information for any loan application.

```typescript
// Line ~908 — no hasPermission or enforcePermission
loanRoutes.get('/applications/:applicationId/appraisal', async (c) => {

// Line ~993 — no permission check
loanRoutes.get('/applications/:applicationId/guarantors', async (c) => {
```

**Recommended Fix:** Add `enforcePermission('loan_applications', 'read')` and IDOR check for member role.

---

### SEC-12 · Loan Eligibility Endpoint Missing Role-Based Scoping

**File:** `src/routes/loans.ts`  
**Lines:** ~689  
**Severity:** Medium

`POST /loans/eligibility` requires authentication but allows any authenticated user to query eligibility for **any** `member_id`. A member could check another member's savings balance and loan exposure.

**Recommended Fix:** Restrict `member_id` to `currentUser.id` for member role, or require `enforcePermission('loans', 'read')` for cross-member queries.

---

### SEC-13 · Webhook Endpoint Relies on Optional `db` — Potential Null Usage

**File:** `src/routes/messaging.ts`  
**Lines:** 1052–1098  
**Severity:** Medium

`POST /webhooks/delivery-status` gets `db` as `c.get('db')` without the `!` assertion, then conditionally uses it. If `db` is `null` (e.g., tenant resolution middleware isn't applied on webhook paths), the status update silently fails while returning `success: true`.

```typescript
// Line 1080
const db = c.get('db');
// ...
if (db) {
    await db.updateTable('messages')...
}
return c.json({ success: true }); // Returns success even if no update happened
```

**Recommended Fix:** Return a 500 or log a warning if `db` is null. Alternatively, ensure the webhook route has tenant context.

---

### SEC-14 · Share Retirement Not Wrapped in Transaction

**File:** `src/routes/shares.ts`  
**Lines:** 678–764  
**Severity:** High

`POST /shares/retire` performs two separate database writes (insert transaction + update holding) **without** a database transaction. If the process crashes between the insert and update, shares are debited in the transaction record but the holding quantity isn't reduced — or vice versa. This is a financial integrity issue.

```typescript
// Line 720 — standalone insert
await db.insertInto('share_transactions').values({...}).execute();

// Line 737 — standalone update (no transaction wrapper)
await db.updateTable('share_holdings').set({
    total_shares: newQuantity as any,
}).where('id', '=', data.holding_id).execute();
```

**Recommended Fix:**
```typescript
await db.transaction().execute(async (trx) => {
    await trx.insertInto('share_transactions').values({...}).execute();
    await trx.updateTable('share_holdings').set({...}).where(...).execute();
});
```

---

### SEC-15 · FD Rollover Not Wrapped in Transaction

**File:** `src/routes/fixedDeposits.ts`  
**Lines:** 1274–1365  
**Severity:** High

`POST /:depositId/rollover` performs three separate DB writes (insert new FD, insert rollover record, update original FD status) without a transaction wrapper. If any operation fails mid-way, data integrity is compromised.

**Recommended Fix:** Wrap all three operations in `db.transaction().execute()`.

---

### SEC-16 · Reports Dashboard Endpoints Missing `enforcePermission`

**File:** `src/routes/reports.ts`  
**Lines:** 500–527  
**Severity:** Medium

`GET /dashboard/activity`, `GET /dashboard/alerts`, and `GET /dashboard/trends` are not protected by the global `enforcePermission('reports', 'read')` middleware that covers other report routes. These are defined outside the scope of the guard.

**Recommended Fix:** Add `enforcePermission('reports', 'read')` to each of these routes.

---

### SEC-17 · Cancelled Scheduled Message Uses 'failed' Status

**File:** `src/routes/messaging.ts`  
**Lines:** 878–900  
**Severity:** Low

`DELETE /scheduled/:messageId` sets the message status to `'failed'` with reason `'Cancelled by user'`. It also doesn't check if the message is actually scheduled or already sent, allowing status override on any message.

```typescript
// Line 892 — sets status regardless of current status
await db.updateTable('messages')
    .set({ status: 'failed' as any, failed_reason: 'Cancelled by user' })
    .where('id', '=', messageId)
    .execute();
```

**Recommended Fix:** Check `message.status` is in `['draft', 'queued']` before cancelling, and use a `'cancelled'` status.

---

### SEC-18 · Loan Early Settlement Missing Permission Check

**File:** `src/routes/loans.ts`  
**Lines:** ~1391  
**Severity:** Medium

`POST /:loanId/early-settlement` only checks `if (!user)` but does not verify the user has permission to process early settlements. Any authenticated user (including a regular member) can process early settlement for **any** loan, not just their own.

**Recommended Fix:** Add `hasPermission` check for officer/admin role, or verify `loan.member_id === user.id` for self-service.

---

### SEC-19 · Loan Write-Off Uses 'approve' Permission but is a Destructive Action

**File:** `src/routes/loans.ts`  
**Lines:** ~1258  
**Severity:** Low

`POST /:loanId/write-off` checks `hasPermission(user.role, 'loans', 'approve')`. Write-off is a highly sensitive action that should arguably require a separate permission (e.g., `loans:write_off`) or dual authorization.

**Recommended Fix:** Consider a dedicated `write_off` permission or dual-authorization workflow.

---

### SEC-20 · Member Document Upload Missing `enforcePermission` Middleware

**File:** `src/routes/members.ts`  
**Lines:** ~395 (based on route structure)  
**Severity:** Medium

Document upload routes use inline `hasPermission` checks inconsistently compared to other routes that use `enforcePermission` middleware. This makes the authorization model harder to audit and maintain.

**Recommended Fix:** Standardize on `enforcePermission` middleware for all protected routes.

---

### SEC-21 · Guarantor Recovery Splits Across Two Transactions

**File:** `src/routes/loans.ts`  
**Lines:** 1855–1985  
**Severity:** Medium

`POST /:loanId/guarantor-recovery` correctly wraps the savings withdrawal in a DB transaction, but then calls `repaymentService.processRepayment()` **outside** that transaction. If the repayment processing fails, the guarantor's savings have already been deducted without a corresponding loan repayment.

```typescript
// Line ~1953 — inside transaction: deduct from guarantor
const result = await db.transaction().execute(async (trx) => {
    // withdrawal from savings
});

// Line ~1965 — OUTSIDE transaction: process loan repayment
const repaymentResult = await repaymentService.processRepayment({...});
```

**Recommended Fix:** Either merge into a single transaction or implement a compensating transaction (rollback savings withdrawal if repayment fails).

---

### SEC-22 · Shares Register/Full Endpoint Select-Map Mismatch

**File:** `src/routes/shares.ts`  
**Lines:** 845–849  
**Severity:** Low  
(Also a bug — see BUG-01)

The map callback references `e.quantity` and `e.average_cost` but the SQL SELECT uses `sh.total_shares` and `sh.average_cost_per_share`. These properties would be `undefined` in the response objects.

---

### SEC-23 · Superadmin Subscription Extension — Date Calculation

**File:** `src/routes/superAdmin.ts`  
**Lines:** ~330–340  
**Severity:** Low  
(Also a bug — see BUG-02)

Subscription extension calculates the new expiry from `new Date()` rather than from the current `subscription_expires_at`. This silently shortens active subscriptions.

---

### SEC-24 · Accounting Auto-Post Missing Permission Check

**File:** `src/routes/accounting.ts`  
**Lines:** ~870–920  
**Severity:** High

`POST /auto-post` has no `hasPermission` or `enforcePermission` check. Any authenticated user can trigger automatic journal posting, which creates financial entries and updates account balances.

**Recommended Fix:** Add `enforcePermission('journal_entries', 'approve')` middleware.

---

## BUGS

---

### BUG-01 · Share Register Map References Non-Existent Properties

**File:** `src/routes/shares.ts`  
**Lines:** 845–849  
**Severity:** High

In the `GET /register/full` response, the map callback references `e.quantity` and `e.average_cost` but the SELECT clause uses `sh.total_shares` and `sh.average_cost_per_share`. The response will contain `undefined` values for these fields.

```typescript
// Lines 845-849
quantity: e.quantity,                    // ❌ Should be (e as any).total_shares
average_cost: e.average_cost?.toString(),// ❌ Should be (e as any).average_cost_per_share
// ...
current_value: (Number(e.quantity || 0) * Number(e.current_price || 0)).toFixed(2),
// ❌ e.quantity is undefined → always "0.00"
```

**Recommended Fix:**
```typescript
quantity: (e as any).total_shares,
average_cost: (e as any).average_cost_per_share?.toString(),
current_value: (Number((e as any).total_shares || 0) * Number(e.current_price || 0)).toFixed(2),
```

---

### BUG-02 · Subscription Extension Calculates From Wrong Date

**File:** `src/routes/superAdmin.ts`  
**Lines:** ~330–340  
**Severity:** High

Extending a subscription calculates the new expiry from `new Date()` instead of from the tenant's current `subscription_expires_at`. If a tenant has 60 days remaining and an admin extends by 30 days, the tenant gets 30 days from now (net loss of 30 days).

```typescript
const newExpiry = new Date();
newExpiry.setDate(newExpiry.getDate() + (data.duration_days || 30));
```

**Recommended Fix:**
```typescript
const currentExpiry = new Date(tenant.subscription_expires_at);
const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
const newExpiry = new Date(baseDate);
newExpiry.setDate(newExpiry.getDate() + (data.duration_days || 30));
```

---

### BUG-03 · Year-End Close Locks All Unlocked Transactions Regardless of Year

**File:** `src/routes/accounting.ts`  
**Lines:** ~493–497  
**Severity:** Critical

The year-end close procedure locks **all** unlocked transactions in the tenant, not just transactions for the fiscal year being closed. It also closes **all** unlocked financial periods regardless of year.

```typescript
// Line ~489 — closes ALL non-closed periods (no year filter)
.where('status', '!=', 'closed')

// Line ~496 — locks ALL unlocked transactions (no year/date filter)
await trx.updateTable('transactions')
    .set({ is_locked: true as any })
    .where('is_locked', '=', false)
    .execute();
```

**Recommended Fix:** Add date range filters:
```typescript
.where('start_date', '>=', fiscalYearStart)
.where('end_date', '<=', fiscalYearEnd)
// and for transactions:
.where('transaction_date', '>=', fiscalYearStart)
.where('transaction_date', '<=', fiscalYearEnd)
```

---

### BUG-04 · Journal Rejection Stores `approved_by` and `approved_at`

**File:** `src/routes/accounting.ts`  
**Lines:** 808–814  
**Severity:** Medium

When rejecting a journal entry, the code sets `approved_by` and `approved_at` fields, even though the action is rejection. This is semantically incorrect and makes audit trails confusing.

```typescript
// Lines 808-813
.set({
    status: 'rejected',
    approved_by: user.id,    // ❌ Should be rejected_by
    approved_at: new Date(), // ❌ Should be rejected_at
    updated_at: new Date(),
})
```

**Recommended Fix:** Use `rejected_by` / `rejected_at` columns (add a migration if needed), or at minimum use the `notes` field to record the rejection context.

---

### BUG-05 · Auto-Create Savings Uses Hardcoded `product_id: 'default'`

**File:** `src/routes/members.ts`  
**Lines:** 349, 515  
**Severity:** Critical

When auto-creating savings accounts for new members (both single create and bulk import), the code uses `product_id: 'default'` as a string literal. This is almost certainly not a valid UUID in the `savings_products` table, causing the insert to silently fail (caught and suppressed) or create an orphaned record.

```typescript
// Line 349
product_id: 'default',

// Line 515 (bulk import)
product_id: 'default',
```

**Recommended Fix:** Query for a default savings product or require a `default_savings_product_id` in SACCO configuration:
```typescript
const defaultProduct = await db
    .selectFrom('savings_products')
    .select('id')
    .where('is_default', '=', true)
    .executeTakeFirst();

if (defaultProduct) {
    await accountRepo.create({
        product_id: defaultProduct.id,
        // ...
    });
}
```

---

### BUG-06 · Dividend Rejection Sets Status to 'draft' Instead of 'rejected'

**File:** `src/routes/shares.ts`  
**Lines:** 486–488  
**Severity:** High

When a dividend declaration is rejected, it is set back to `'draft'` status. This means it can be re-submitted and re-approved, effectively nullifying the rejection. There's no audit trail of the rejection action.

```typescript
// Line 487
const newStatus = data.action === 'approve' ? 'approved' : 'draft';
```

**Recommended Fix:**
```typescript
const newStatus = data.action === 'approve' ? 'approved' : 'rejected';
```

---

### BUG-07 · Bulk Member Import Lacks Transaction Wrapper

**File:** `src/routes/members.ts`  
**Lines:** ~470–545  
**Severity:** Medium

The bulk import processes members sequentially in a loop with individual inserts but no outer database transaction. If the process fails mid-batch (e.g., server crash, connection drop), some members are created while others are lost, with no way to identify the incomplete state.

**Recommended Fix:** Wrap the entire batch in a transaction with savepoint-per-member for error isolation, or implement an idempotent import with a batch ID for retries.

---

### BUG-08 · Loan Rescheduling Marks Replaced Schedules as 'written_off'

**File:** `src/routes/loans.ts`  
**Lines:** ~1159  
**Severity:** Medium

When rescheduling, old unpaid schedule entries are marked with status `'written_off'`. This is semantically incorrect — they were rescheduled, not written off. Using `'written_off'` conflates two different operations and corrupts reporting that tracks actual loan write-offs.

```typescript
// Line ~1159
.set({ status: 'written_off' as any, ... })
.where('status', 'in', ['scheduled', 'partial', 'overdue'])
```

**Recommended Fix:** Use a dedicated `'rescheduled'` status.

---

### BUG-09 · Loan Rescheduling Creates Recovery Action with Wrong Type

**File:** `src/routes/loans.ts`  
**Lines:** 1224–1234  
**Severity:** Low

The reschedule endpoint records a recovery action with `action_type: 'reminder'` and a comment `// closest type for reschedule`. This misclassifies the recovery action in reports.

```typescript
// Line 1228
action_type: 'reminder' as any, // closest type for reschedule
```

**Recommended Fix:** Add a `'reschedule'` action type to the enum/schema, or use a more appropriate existing type.

---

### BUG-10 · Messaging Duplicate Template Update Handlers

**File:** `src/routes/messaging.ts`  
**Lines:** 414, 461  
**Severity:** Low

There are two handlers for updating a template — `PUT /templates/:templateId` (line 414) and `PATCH /templates/:templateId` (line 461) — with identical logic. This is code duplication that increases maintenance burden.

**Recommended Fix:** Keep one (PATCH is more appropriate for partial updates) and remove the other, or have PUT delegate to PATCH.

---

### BUG-11 · Account Statement Running Balance Starts at Zero

**File:** `src/routes/accounts.ts`  
**Lines:** ~1320  
**Severity:** Medium

The statement endpoint initializes `runningBalance = new Decimal(0)` and builds it from only the entries in the requested date range. This means the opening balance of the statement is always 0, regardless of prior transactions.

```typescript
// Line ~1320
let runningBalance = new Decimal(0);
```

**Recommended Fix:** Calculate the opening balance from transactions before `from` date:
```typescript
const openingBalance = await calculateBalanceAsOf(accountId, from);
let runningBalance = new Decimal(openingBalance);
```

---

### BUG-12 · FD Rollover tenure_days Misused for Months/Years

**File:** `src/routes/fixedDeposits.ts`  
**Lines:** 1310–1320  
**Severity:** Medium

When rolling over an FD, the code reads `tenure_days` from the product but then uses it as the number of months or years depending on `tenure_type`. If `tenure_type` is `'months'` and `tenure_days` is `365`, the code adds 365 *months* (30+ years).

```typescript
// Lines 1310-1317
const tenureDays = Number(fd.tenure_days || 365);

if (fd.tenure_type === 'months') {
    newMaturityDate.setMonth(newMaturityDate.getMonth() + tenureDays); // ❌ 365 months!
} else if (fd.tenure_type === 'years') {
    newMaturityDate.setFullYear(newMaturityDate.getFullYear() + tenureDays); // ❌ 365 years!
}
```

**Recommended Fix:** The product should store tenure in a consistent unit, or the column should be renamed to `tenure_value`. Additionally, validate the tenure against product constraints before rollover.

---

## Summary of Recommendations

### Immediate (Critical/High Priority)

1. **Add `enforcePermission` middleware** to all unprotected routes in `admin.ts`, `accounting.ts`, `shares.ts`, `fixedDeposits.ts`, and `reports.ts`
2. **Move `export default`** to end of file in `shares.ts` and `messaging.ts`
3. **Fix year-end close** to scope period closing and transaction locking to the target fiscal year
4. **Fix `product_id: 'default'`** in member creation — use actual product lookup
5. **Fix share retirement & FD rollover** — wrap in database transactions
6. **Fix dividend rejection** — use `'rejected'` status, not `'draft'`
7. **Fix share register** — use correct property names in response mapping

### Short-Term (Medium Priority)

8. **Fix subscription extension** to extend from current expiry
9. **Add IDOR protection** to FD listing, loan appraisal/guarantor views, and eligibility check
10. **Fix journal rejection** to use correct field names
11. **Fix account statement** to use correct opening balance
12. **Fix FD rollover tenure calculation**
13. **Wrap guarantor recovery** in a single atomic transaction

### Long-Term (Low Priority)

14. Standardize authorization approach (middleware vs inline checks)
15. Add dedicated permission types for destructive actions (write-off)
16. Remove duplicate template update handlers in messaging
17. Add proper status types for rescheduled loan schedules
