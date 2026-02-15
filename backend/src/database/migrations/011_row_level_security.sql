-- ROW LEVEL SECURITY — Defence-in-Depth for Tenant Isolation
-- Requirement: SEC-002   Prevent cross-tenant data access
--
-- Architecture context
-- ─────────────────────
-- The application already isolates tenants via separate PostgreSQL schemas
-- (tenant_<code>). This migration adds a SECOND isolation layer using RLS
-- policies that check the session variable `app.current_tenant`.
--
-- How it works:
--   1. The middleware sets  SET app.current_tenant = '<schema_name>'  per request.
--   2. The middleware sets  SET ROLE <schema_name>_role  per request.
--   3. RLS policies below allow data access ONLY when app.current_tenant is set.
--   4. The table owner (main DB user) bypasses RLS, so migrations and admin
--      scripts continue to work without modification.
--
-- Covered tables (high-risk financial & PII data):
--   members, savings_accounts, deposits, withdrawals, loan_accounts,
--   loan_applications, loan_repayments, staff, staff_credentials,
--   transactions, audit_log, security_events
--
-- NOTE: This migration uses "template." prefix because the tenant migration
--       runner applies it with SET search_path TO <schema>, public.
--       References to "template." are resolved to the actual tenant schema
--       during the schema-clone step in create_tenant_schema().

-- ═══════════════════════════════════════════════════════════
-- 1.  MEMBERS  (PII — names, phone, national IDs)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE template.members ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_rls_members ON template.members
    FOR ALL
    USING (current_setting('app.current_tenant', true) IS NOT NULL);

-- ═══════════════════════════════════════════════════════════
-- 2.  SAVINGS ACCOUNTS  (financial data)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE template.savings_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_rls_savings_accounts ON template.savings_accounts
    FOR ALL
    USING (current_setting('app.current_tenant', true) IS NOT NULL);

-- ═══════════════════════════════════════════════════════════
-- 3.  DEPOSITS  (financial transactions)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE template.deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_rls_deposits ON template.deposits
    FOR ALL
    USING (current_setting('app.current_tenant', true) IS NOT NULL);

-- ═══════════════════════════════════════════════════════════
-- 4.  WITHDRAWALS  (financial transactions)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE template.withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_rls_withdrawals ON template.withdrawals
    FOR ALL
    USING (current_setting('app.current_tenant', true) IS NOT NULL);

-- ═══════════════════════════════════════════════════════════
-- 5.  LOAN ACCOUNTS  (financial data)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE template.loan_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_rls_loan_accounts ON template.loan_accounts
    FOR ALL
    USING (current_setting('app.current_tenant', true) IS NOT NULL);

-- ═══════════════════════════════════════════════════════════
-- 6.  LOAN APPLICATIONS  (financial + PII)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE template.loan_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_rls_loan_applications ON template.loan_applications
    FOR ALL
    USING (current_setting('app.current_tenant', true) IS NOT NULL);

-- ═══════════════════════════════════════════════════════════
-- 7.  LOAN REPAYMENTS  (financial transactions)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE template.loan_repayments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_rls_loan_repayments ON template.loan_repayments
    FOR ALL
    USING (current_setting('app.current_tenant', true) IS NOT NULL);

-- ═══════════════════════════════════════════════════════════
-- 8.  TRANSACTIONS  (accounting journal entries)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE template.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_rls_transactions ON template.transactions
    FOR ALL
    USING (current_setting('app.current_tenant', true) IS NOT NULL);

-- ═══════════════════════════════════════════════════════════
-- 9.  STAFF  (credentials, roles — sensitive)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE template.staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_rls_staff ON template.staff
    FOR ALL
    USING (current_setting('app.current_tenant', true) IS NOT NULL);

-- ═══════════════════════════════════════════════════════════
-- 10. STAFF CREDENTIALS  (hashed passwords, tokens)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE template.staff_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_rls_staff_credentials ON template.staff_credentials
    FOR ALL
    USING (current_setting('app.current_tenant', true) IS NOT NULL);

-- ═══════════════════════════════════════════════════════════
-- 11. AUDIT LOG  (immutable audit trail)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE template.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_rls_audit_log ON template.audit_log
    FOR ALL
    USING (current_setting('app.current_tenant', true) IS NOT NULL);

-- ═══════════════════════════════════════════════════════════
-- 12. SECURITY EVENTS  (security incident log)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE template.security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_rls_security_events ON template.security_events
    FOR ALL
    USING (current_setting('app.current_tenant', true) IS NOT NULL);

-- ═══════════════════════════════════════════════════════════
-- VERIFICATION QUERY (run manually to confirm RLS is active)
-- ═══════════════════════════════════════════════════════════
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = '<your_tenant_schema>'
--   AND rowsecurity = true
-- ORDER BY tablename;
