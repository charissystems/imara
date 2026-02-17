-- STRENGTHEN RLS POLICIES — Match app.current_tenant against current_schema()
-- Requirement: SEC-002   Prevent cross-tenant data access (hardening)
--
-- The original 011 migration only checks IS NOT NULL, meaning any non-empty
-- value of app.current_tenant passes. This migration replaces those policies
-- with ones that verify the session variable matches the schema the tables
-- belong to, preventing a compromised or buggy middleware path from leaking
-- data across tenants.

-- ═══════════════════════════════════════════════════════════
-- 1. MEMBERS
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS tenant_rls_members ON template.members;
CREATE POLICY tenant_rls_members ON template.members
    FOR ALL
    USING (current_setting('app.current_tenant', true) = current_schema());

-- ═══════════════════════════════════════════════════════════
-- 2. SAVINGS ACCOUNTS
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS tenant_rls_savings_accounts ON template.savings_accounts;
CREATE POLICY tenant_rls_savings_accounts ON template.savings_accounts
    FOR ALL
    USING (current_setting('app.current_tenant', true) = current_schema());

-- ═══════════════════════════════════════════════════════════
-- 3. DEPOSITS
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS tenant_rls_deposits ON template.deposits;
CREATE POLICY tenant_rls_deposits ON template.deposits
    FOR ALL
    USING (current_setting('app.current_tenant', true) = current_schema());

-- ═══════════════════════════════════════════════════════════
-- 4. WITHDRAWALS
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS tenant_rls_withdrawals ON template.withdrawals;
CREATE POLICY tenant_rls_withdrawals ON template.withdrawals
    FOR ALL
    USING (current_setting('app.current_tenant', true) = current_schema());

-- ═══════════════════════════════════════════════════════════
-- 5. LOAN ACCOUNTS
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS tenant_rls_loan_accounts ON template.loan_accounts;
CREATE POLICY tenant_rls_loan_accounts ON template.loan_accounts
    FOR ALL
    USING (current_setting('app.current_tenant', true) = current_schema());

-- ═══════════════════════════════════════════════════════════
-- 6. LOAN APPLICATIONS
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS tenant_rls_loan_applications ON template.loan_applications;
CREATE POLICY tenant_rls_loan_applications ON template.loan_applications
    FOR ALL
    USING (current_setting('app.current_tenant', true) = current_schema());

-- ═══════════════════════════════════════════════════════════
-- 7. LOAN REPAYMENTS
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS tenant_rls_loan_repayments ON template.loan_repayments;
CREATE POLICY tenant_rls_loan_repayments ON template.loan_repayments
    FOR ALL
    USING (current_setting('app.current_tenant', true) = current_schema());

-- ═══════════════════════════════════════════════════════════
-- 8. TRANSACTIONS
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS tenant_rls_transactions ON template.transactions;
CREATE POLICY tenant_rls_transactions ON template.transactions
    FOR ALL
    USING (current_setting('app.current_tenant', true) = current_schema());

-- ═══════════════════════════════════════════════════════════
-- 9. STAFF
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS tenant_rls_staff ON template.staff;
CREATE POLICY tenant_rls_staff ON template.staff
    FOR ALL
    USING (current_setting('app.current_tenant', true) = current_schema());

-- ═══════════════════════════════════════════════════════════
-- 10. STAFF CREDENTIALS
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS tenant_rls_staff_credentials ON template.staff_credentials;
CREATE POLICY tenant_rls_staff_credentials ON template.staff_credentials
    FOR ALL
    USING (current_setting('app.current_tenant', true) = current_schema());

-- ═══════════════════════════════════════════════════════════
-- 11. AUDIT LOG
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS tenant_rls_audit_log ON template.audit_log;
CREATE POLICY tenant_rls_audit_log ON template.audit_log
    FOR ALL
    USING (current_setting('app.current_tenant', true) = current_schema());

-- ═══════════════════════════════════════════════════════════
-- 12. SECURITY EVENTS
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS tenant_rls_security_events ON template.security_events;
CREATE POLICY tenant_rls_security_events ON template.security_events
    FOR ALL
    USING (current_setting('app.current_tenant', true) = current_schema());
