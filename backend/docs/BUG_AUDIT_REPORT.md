# Backend Bug Audit Report

**Date:** 2025-01-20  
**Scope:** `/backend/src/` — services, repositories, middleware, routes  
**Focus:** Logic bugs, security bugs, concurrency bugs, resource leaks, error handling, data integrity  

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 5     |
| High     | 6     |
| Medium   | 7     |
| Low      | 4     |
| **Total**| **22**|

---

## CRITICAL

### 1. Repayment allocation uses scheduled amounts instead of remaining unpaid amounts

**File:** `src/services/repaymentService.ts` lines 168–170  
**Description:**  
When processing a repayment, the code reads `inst.principal_payment` and `inst.interest_payment` from each installment and treats them as the current outstanding amounts for that installment:

```ts
const outstandingPrincipal = new Decimal(inst.principal_payment?.toString() ?? '0');
const outstandingInterest  = new Decimal(inst.interest_payment?.toString() ?? '0');
```

These columns store the **original scheduled** amounts, not the remaining unpaid balance. If an installment has been partially paid before (status `'partial'`), this code will **re-allocate payment towards the full scheduled amount**, effectively double-counting already-paid principal/interest. Additionally, after allocation, the update on lines 209–223 only writes `penalty_payment` and `status` — it never writes back the remaining unpaid principal/interest to the installment row.

**Impact:** Overpayments are absorbed silently; partially-paid installments require the full amount again; loan_accounts outstanding balances will desynchronize from schedule-level tracking.

**Suggested fix:**  
Add `principal_paid` and `interest_paid` columns to `loan_schedules` (or use the existing columns to track amounts paid). Compute outstanding as `scheduled - paid` and update the paid columns on each allocation:

```ts
const outstandingPrincipal = scheduledPrincipal.minus(alreadyPaidPrincipal);
const outstandingInterest  = scheduledInterest.minus(alreadyPaidInterest);
// After allocation:
.set({
    principal_paid: alreadyPaidPrincipal.plus(allocation.allocatedPrincipal),
    interest_paid:  alreadyPaidInterest.plus(allocation.allocatedInterest),
    penalty_payment: ...,
    status: newStatus,
})
```

---

### 2. Fixed deposit daily accrual never updates `last_accrual_date` — idempotency guard is broken

**File:** `src/services/fixedDepositService.ts` lines 300–306  
**Description:**  
The query on lines 272–276 filters deposits where `last_accrual_date IS NULL OR last_accrual_date < asOfDate` to prevent double-accrual. However, the update on lines 300–306 only sets `interest_accrued` and `updated_at` — it **never updates `last_accrual_date`**:

```ts
await this.db
    .updateTable('fixed_deposits')
    .set({
        interest_accrued: existingAccrued.plus(dailyInterest) as any,
        updated_at: new Date() as any,
    } as any)
    .where('id', '=', fd.deposit_id)
    .execute();
```

If the scheduler runs the job twice (cron overlap, retry, manual trigger), every fixed deposit will accrue interest **multiple times per day**.

**Impact:** Fixed deposit interest is inflated every time the job re-runs. Over months this could represent significant financial loss.

**Suggested fix:**

```ts
.set({
    interest_accrued: existingAccrued.plus(dailyInterest) as any,
    last_accrual_date: asOfDate as any,
    updated_at: new Date() as any,
} as any)
```

---

### 3. Savings interest accrual has no idempotency guard — double-accrual on re-run

**File:** `src/services/interestAccrualService.ts` lines 255–330  
**Description:**  
`runDailyAccrual()` fetches all active, non-frozen savings accounts and accrues daily interest. There is **no filter** excluding accounts that have already been accrued for the current date (unlike the FD service which at least attempts this). If the cron job fires twice or is retried, every savings account receives double interest.

Additionally, the `savings_accounts` update and the `interest_schedules` insert are **not wrapped in a per-account transaction** — if the process crashes between the account update and the audit insert, the accrued amount will have been incremented but no audit record exists, making reconciliation impossible.

**Impact:** Interest is duplicated on every re-run; inconsistent data on partial failure.

**Suggested fix:**
1. Add `last_accrual_date` to `savings_accounts` and filter `WHERE last_accrual_date < :today`.
2. Update `last_accrual_date` alongside `interest_accrued`.
3. Wrap the update + insert in a per-account transaction (or use a single INSERT … ON CONFLICT DO NOTHING guard via the unique `interest_schedules` row for the date).

---

### 4. Guarantor recovery: savings deduction and loan repayment are in separate transactions

**File:** `src/routes/loans.ts` lines 1950–2000  
**Description:**  
The guarantor recovery endpoint performs two critical operations:
1. **Deduct funds from the guarantor's savings account** — inside `db.transaction()`
2. **Process the loan repayment** — via `repaymentService.processRepayment()` which starts its own, separate transaction

```ts
// Transaction 1: withdraw from guarantor
const result = await db.transaction().execute(async (trx) => {
    // debit guarantor savings...
});

// Transaction 2 (separate!): credit loan
const repaymentResult = await repaymentService.processRepayment({...});
```

If the repayment processing throws (e.g., no outstanding installments, database error), **Transaction 1 has already committed** — the guarantor's savings are deducted but the loan receives no repayment. The money effectively disappears.

**Impact:** Financial discrepancy — member savings deducted without corresponding loan repayment. Requires manual intervention and could erode depositor trust.

**Suggested fix:**  
Execute both operations inside a single transaction. Pass `trx` into `RepaymentService` instead of `db`, or restructure so that `processRepayment` can accept an external transaction handle:

```ts
await db.transaction().execute(async (trx) => {
    // 1. Debit guarantor savings
    // 2. Record withdrawal
    // 3. Process repayment (using trx)
    const repService = new RepaymentService(trx as any);
    await repService.processRepayment({...});
});
```

---

### 5. Guarantor recovery uses floating-point arithmetic for financial calculations

**File:** `src/routes/loans.ts` lines 1930–1940  
**Description:**  

```ts
const guarantorSavings = guarantorAccounts.reduce(
    (sum, acc) => sum + Number(acc.principal_balance || 0), 0
);
// ...
principal_balance: String(Number(sourceAccount.principal_balance) - data.amount) as any,
```

Balance comparison and deduction use JavaScript `Number` (IEEE 754 doubles) rather than `Decimal.js`. For amounts like `1000.10 - 999.99`, floating-point errors can produce values like `0.10999999999...` which, when stored as a string, corrupt the balance.

**Impact:** Rounding errors in savings balances; potential for negative balances passing the sufficiency check.

**Suggested fix:** Use `Decimal.js` consistently:

```ts
const guarantorSavings = guarantorAccounts.reduce(
    (sum, acc) => sum.plus(new Decimal(acc.principal_balance || 0)), new Decimal(0)
);
// ...
const newBalance = new Decimal(sourceAccount.principal_balance).minus(data.amount);
```

---

## HIGH

### 6. Journal entry validation uses floating-point arithmetic

**File:** `src/services/accountingService.ts` lines 261–268  
**Description:**

```ts
const totalDebits  = entries.reduce((sum, e) => sum + (e.debit || 0), 0);
const totalCredits = entries.reduce((sum, e) => sum + (e.credit || 0), 0);
if (Math.abs(totalDebits - totalCredits) > 0.01) { ... }
```

This validates the fundamental accounting equation (debits = credits) using floating-point addition. With enough line items, accumulated rounding errors can cause `totalDebits - totalCredits` to exceed `0.01` even when the entries actually balance, or conversely, allow an imbalanced entry within the `0.01` tolerance.

**Impact:** Valid journal entries may be rejected; invalid entries (up to 0.01 per journal) may be accepted.

**Suggested fix:** Accumulate with `Decimal.js` and check for exact zero:

```ts
const totalDebits  = entries.reduce((sum, e) => sum.plus(e.debit || 0), new Decimal(0));
const totalCredits = entries.reduce((sum, e) => sum.plus(e.credit || 0), new Decimal(0));
if (!totalDebits.eq(totalCredits)) { ... }
```

---

### 7. Deposit journal entry has inverted debit/credit (wrong accounting polarity)

**File:** `src/services/accountingService.ts` lines 290–310  
**Description:**  

```ts
lineItems: [
    { accountCode: depositAccountCode, accountName: 'Member Savings Account', debit: amount, credit: 0 },
    { accountCode: cashAccountCode,    accountName: 'Cash / Bank',            debit: 0,      credit: amount },
],
```

For a SACCO, member savings are **liabilities** (the institution owes the member). When a member deposits cash:
- **Cash (Asset)** increases → **Debit**  ✓
- **Member Savings (Liability)** increases → **Credit**

The code debits the savings account and credits cash — **the polarity is swapped**. This will produce incorrect trial balances and financial statements (assets and liabilities are both understated).

**Impact:** All auto-posted deposit journal entries are incorrect; trial balance, income statement, and balance sheet are wrong.

**Suggested fix:**

```ts
lineItems: [
    { accountCode: cashAccountCode,    accountName: 'Cash / Bank',            debit: amount, credit: 0 },
    { accountCode: depositAccountCode, accountName: 'Member Savings Account', debit: 0,      credit: amount },
],
```

> **Note:** If the chart of accounts treats member savings as an asset (uncommon but possible in some SACCO setups where the institution considers itself the savings custodian), then the current polarity would be correct. Verify the chart of accounts design and comment the rationale.

---

### 8. Rate limiter falls back to shared `'unknown'` key when no proxy is configured

**File:** `src/middleware/rateLimiter.ts` lines 127–130  
**Description:**

```ts
// No trusted proxy — fall back to a stable request fingerprint.
return c.req.header('x-real-ip') || 'unknown';
```

When `TRUSTED_PROXY_COUNT=0` (default) and no `x-real-ip` header is present, **all requests share the rate-limit key `'unknown'`**. A single user can exhaust the rate limit for every other user.

**Impact:** Denial-of-service: one actor can lock out all users from rate-limited endpoints (login, password reset, etc.).

**Suggested fix:** Use the socket remote address as the default fallback. In Hono:

```ts
return c.req.header('x-real-ip')
    || c.env?.remoteAddr
    || c.req.raw?.headers?.get('cf-connecting-ip')
    || `unknown-${nanoid(8)}`;  // worst case: per-request key (no rate limiting, but no shared lockout)
```

Also consider logging a warning at startup if `TRUSTED_PROXY_COUNT` is `0` and the app is behind a reverse proxy.

---

### 9. Penalty batch runs without a transaction — partial failure causes data inconsistency

**File:** `src/services/repaymentService.ts` lines 320–410  
**Description:**  
`runPenaltyCalculation()` iterates over overdue installments, updating each `loan_schedules` row individually, then updates `loan_accounts.penalties_outstanding` in a separate loop. None of these operations are wrapped in a transaction.

If the process crashes mid-way:
- Some installments have updated penalties, others do not
- The `loan_accounts.penalties_outstanding` aggregate may not match the sum of schedule-level penalties
- The penalty totals reported in the result object do not match the actual database state

**Impact:** Inconsistent penalty state across schedules and the loan account aggregate; incorrect penalty amounts shown to members.

**Suggested fix:** Wrap the entire batch in a transaction, or at minimum wrap per-loan operations (all installment updates + aggregate update) in a transaction.

---

### 10. Loan reschedule discards outstanding interest without capitalizing it

**File:** `src/routes/loans.ts` lines 1176–1195  
**Description:**

```ts
const outstandingPrincipal = Number(loan.principal_outstanding || loan.approved_amount);
// ... uses outstandingPrincipal as the new schedule's principal
```

When rescheduling, old unpaid schedules are marked `'written_off'` but the outstanding interest (`loan.interest_outstanding`) is **not added to the rescheduled principal**. This means accrued but unpaid interest is silently forgiven — a revenue loss for the SACCO.

Additionally, the old schedules are marked as `'written_off'` rather than `'rescheduled'`, which conflates two different concepts (actual write-offs vs. administrative rescheduling) in reporting.

**Impact:** Interest revenue leakage on every reschedule; incorrect write-off reporting.

**Suggested fix:**  
Capitalize outstanding interest into the new principal (or make it a policy option):

```ts
const outstandingPrincipal = new Decimal(loan.principal_outstanding || loan.approved_amount)
    .plus(new Decimal(loan.interest_outstanding || 0)); // capitalize
```

And use a distinct status like `'rescheduled'` instead of `'written_off'`.

---

### 11. Repayment processes: data fetched outside transaction (TOCTOU race condition)

**File:** `src/services/repaymentService.ts` lines 110–145  
**Description:**  
The loan account, product, and installments are all fetched **before** the transaction begins:

```ts
const loan = await this.db.selectFrom('loan_accounts')...executeTakeFirst();
const product = await this.db.selectFrom('loan_products')...executeTakeFirst();
const installments = await this.db.selectFrom('loan_schedules')...execute();
// ...
return await this.db.transaction().execute(async (trx) => {
    // uses loan, product, installments from outside the transaction
});
```

Between the reads and the transaction start, another concurrent request could modify the same loan (e.g., another repayment, a write-off, a reschedule). The transaction then operates on stale data.

**Impact:** Double repayment on the same installment; negative outstanding balances; allocation using an obsolete schedule.

**Suggested fix:** Move the reads inside the transaction and use `FOR UPDATE` locks:

```ts
return await this.db.transaction().execute(async (trx) => {
    const loan = await trx.selectFrom('loan_accounts')
        .selectAll().where(...).forUpdate().executeTakeFirst();
    const installments = await trx.selectFrom('loan_schedules')
        .selectAll().where(...).forUpdate().execute();
    // ... rest of allocation logic
});
```

---

## MEDIUM

### 12. `calculateCompoundInterest` uses `Math.pow` instead of `Decimal.js`

**File:** `src/services/savingsService.ts` lines 372–377  
**Description:**

```ts
const rate = annualRate / 100 / compoundingFrequency;
const periods = (days / daysInYear) * compoundingFrequency;
const amount = principal * Math.pow(1 + rate, periods);
return amount - principal;
```

All other financial calculations in the codebase (InterestAccrualService, FixedDepositService, ScheduleCalculator) use `Decimal.js`. This method uses native `Number` and `Math.pow`, which introduces floating-point imprecision. Although this particular method may be used only for display/estimation, if it's ever used for actual interest posting, balances will differ from the accrual engine.

**Suggested fix:** Rewrite using `Decimal.js`:

```ts
const rate = new Decimal(annualRate).div(100).div(compoundingFrequency);
const periods = new Decimal(days).div(daysInYear).mul(compoundingFrequency);
const amount = new Decimal(principal).mul(rate.plus(1).pow(periods));
return amount.minus(principal).toDecimalPlaces(4).toNumber();
```

---

### 13. `calculateDailyInterestAccrual` silently returns 0 for 'tiered' interest method

**File:** `src/services/savingsService.ts` lines 413–422  
**Description:**

```ts
calculateDailyInterestAccrual(balance, annualRate, method, daysInYear) {
    if (method === 'simple') {
        return this.calculateSimpleInterest(balance, annualRate, 1, daysInYear);
    } else if (method === 'compound') {
        return this.calculateCompoundInterest(balance, annualRate, 1, daysInYear);
    }
    return 0; // <-- tiered method silently falls through
}
```

If a savings product is configured with `interest_calculation_method = 'tiered'`, this method returns `0` without logging a warning. Interest will never accrue for tiered products.

**Suggested fix:** Either delegate to `calculateTieredInterest` or throw an explicit error:

```ts
} else if (method === 'tiered') {
    throw new Error('Tiered interest requires balance tiers — use calculateTieredInterest() directly');
}
throw new Error(`Unsupported interest method: ${method}`);
```

---

### 14. Batch deposit: partial failures within a committed transaction

**File:** `src/routes/accounts.ts` lines 990–1047  
**Description:**  
Individual deposit errors are caught and added to an `errors` array, then execution `continue`s to the next deposit. The transaction only rolls back if **all** deposits fail. If 9 out of 10 succeed, the transaction commits with 9 deposits and the response reports 1 failure — but there's no way to retry just that one failure, and no compensation mechanism.

While this is partially by design (the code explicitly checks `if (results.length === 0 && errors.length > 0)`), it creates an all-or-nothing UX problem: the caller cannot easily handle partial success. More importantly, if the `continue`d error was a transient DB issue (lock timeout, serialization failure), the skipped deposit could have succeeded on retry.

**Suggested fix:** Consider one of:
- Fail the entire batch on any error (append `throw` instead of `continue`)
- Process each deposit in its own savepoint: `await trx.raw('SAVEPOINT sp_' + i)` / `ROLLBACK TO SAVEPOINT sp_' + i'`

---

### 15. Standing instruction service has no authorization or self-transfer check

**File:** `src/services/standingInstructionService.ts`  
**Description:**  
`createStandingInstruction()` does not verify:
1. That the authenticated user owns the `source_account_id`
2. That `source_account_id !== destination_account_id` (self-transfer loop)
3. That accounts exist and are active

Any authenticated user could create standing instructions against any account.

**Suggested fix:** Add ownership verification and self-transfer prevention:

```ts
if (data.source_account_id === data.destination_account_id) {
    throw new ValidationError('Source and destination accounts must differ');
}
const sourceAccount = await db.selectFrom('savings_accounts')
    .where('id', data.source_account_id).where('member_id', authenticatedMemberId)
    .executeTakeFirst();
if (!sourceAccount) throw new UnauthorizedError('Not authorized for this account');
```

---

### 16. Tenant resolver: `x-tenant-subdomain` header accepted without user-tenant cross-check

**File:** `src/middleware/tenantResolver.ts`  
**Description:**  
The tenant resolver accepts tenant identity from the `x-tenant-subdomain` request header with higher priority than hostname extraction. While the `tenantIsolation` middleware downstream verifies `user.tenant_id === tenant.id`, there is a window during unauthenticated requests (public routes, login) where an attacker can set `x-tenant-subdomain: victim-tenant` and interact with that tenant's login flow, potentially probing for valid usernames or triggering rate limits against the victim tenant.

**Suggested fix:** Restrict `x-tenant-subdomain` to development environments only, or validate it against a signed cookie / encrypted session. At minimum, log when the header overrides hostname-derived tenant.

---

### 17. Penalty batch overwrites partial-payment penalty amounts

**File:** `src/services/repaymentService.ts` lines 355–370  
**Description:**  
In `runPenaltyCalculation()`, the penalty for each overdue installment is computed fresh and **overwrites** the existing `penalty_payment`:

```ts
.set({
    penalty_payment: penalty as any,
    status: 'overdue' as any,
    ...
})
```

If a member has already partially paid some penalty (via `processRepayment` which allocates to penalties first), this overwrite replaces the remaining penalty with the full newly-computed penalty, **erasing evidence of partial penalty payment** and potentially requiring the member to pay the penalty portion again.

**Suggested fix:** Either:
- Track `penalty_scheduled` and `penalty_paid` separately
- Compute penalty as `max(existingPenalty, newPenalty)` to never decrease, and respect already-allocated amounts

---

### 18. `result.totalPenaltiesAdded` in penalty batch double-counts

**File:** `src/services/repaymentService.ts` lines 370–375  
**Description:**

```ts
result.totalPenaltiesAdded = result.totalPenaltiesAdded.plus(penalty);
```

This accumulates the **total** penalty amount per installment, not the **incremental** penalty added. If an installment already had a penalty of 50 from yesterday and today's computation yields 60, the "added" amount is reported as 60 (not 10). The metric is therefore misleading.

**Suggested fix:**

```ts
const previousPenalty = new Decimal(inst.penalty_payment?.toString() ?? '0');
const added = Decimal.max(0, penalty.minus(previousPenalty));
result.totalPenaltiesAdded = result.totalPenaltiesAdded.plus(added);
```

---

## LOW

### 19. `generateAuditId` uses short collision-prone IDs for audit records

**File:** `src/middleware/audit.ts` line 123  
**Description:** `nanoid(12)` produces ~71 bits of entropy. For an audit log that accumulates indefinitely, the birthday-problem collision probability becomes non-trivial at scale (~10M+ records). While unlikely for most deployments, audit logs are legally sensitive.

**Suggested fix:** Use `nanoid(21)` (default, ~126 bits) or a UUID v7 for time-ordered audit IDs.

---

### 20. Database config: tenant DB instances cached forever without eviction

**File:** `src/config/database.ts` lines 100–112  
**Description:**  
`getTenantDb()` caches Kysely instances in a `Map` with no size limit or TTL. For a SaaS with hundreds of tenants, this accumulates Kysely instances (each holding references to the shared pool) indefinitely. While not a connection leak (they share the pool), the cache grows without bound.

**Suggested fix:** Add an LRU eviction policy or periodic cleanup for tenants that haven't been accessed recently.

---

### 21. Error handler exposes internal error messages in non-production

**File:** `src/middleware/errorHandler.ts`  
**Description:** The error handler conditionally exposes error messages and stack traces based on `NODE_ENV`. However, the `message` field is returned for *all* error types in production. For database errors, this can leak table names, column names, or constraint names.

**Suggested fix:** In production, replace unrecognized error messages with a generic message and only pass through messages from known application error classes (`ValidationError`, `NotFoundError`, etc.).

---

### 22. `autoPostDepositTransaction` and similar builders set `tenantId: ''`

**File:** `src/services/accountingService.ts` lines 293–295  
**Description:**

```ts
return {
    id: `AUTO-${nanoid(12)}`,
    tenantId: '', // Will be set by caller
    ...
};
```

The `tenantId` is left empty with a comment "Will be set by caller." If any caller forgets to set it, the journal entry is stored with an empty tenant ID, breaking multi-tenant isolation for accounting data. The same pattern appears in `autoPostLoanDisbursement` and `autoPostRepaymentTransaction`.

**Suggested fix:** Accept `tenantId` as a required parameter:

```ts
autoPostDepositTransaction(tenantId: string, memberId: string, amount: number, ...): JournalEntry {
    return { tenantId, ... };
}
```

---

## Recommendations

1. **Highest priority:** Fix bugs #1, #2, and #3 (repayment allocation + idempotency) — these are actively corrupting financial data on every run.
2. **Second priority:** Fix #4 (guarantor recovery atomicity) and #7 (deposit accounting polarity) — financial integrity issues.
3. **Add integration tests** for the repayment → schedule → account balance lifecycle to catch regressions.
4. **Standardize financial math:** Audit every use of `Number()`, `+`, `-`, `*`, `/`, `Math.pow` on monetary values and replace with `Decimal.js`.
5. **Standardize batch job safety:** All daily batch jobs (interest accrual, penalty calculation, NPL flagging, FD accrual) should be idempotent, transactional, and logged with before/after checksums.
