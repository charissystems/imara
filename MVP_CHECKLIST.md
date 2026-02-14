# MVP Implementation Checklist
**Quick reference for daily development tracking**

## 🔥 CRITICAL PATH (Must complete in order)

### Week 1-2: Core Business Logic ✅ COMPLETE
- [x] **Loan Schedule Calculator** (P0)
  - [x] Declining balance calculation
  - [x] Flat rate and EMI methods
  - [x] Multiple repayment frequencies (weekly, bi-weekly, monthly, quarterly)
  - [x] Generate full repayment schedule with Decimal.js precision
  - [x] Test with sample loans (58 unit tests passing)
  
- [x] **Interest Accrual Service** (P0)
  - [x] Daily accrual calculation (InterestCalculator)
  - [x] Simple and compound methods
  - [x] 365/360 day basis support
  - [x] Batch process all accounts (InterestAccrualEngine)
  
- [x] **Repayment Allocation Logic** (P0)
  - [x] Penalties → Interest → Principal order
  - [x] Handle partial payments
  - [x] Handle overpayments
  - [x] Update loan schedule entries
  - [x] NPL flagging and penalty calculation

- [x] **Job Scheduler Setup** (P0)
  - [x] Install BullMQ + ioredis
  - [x] Configure 7 job queues (interest_accrual, interest_posting, penalty_calculation, npl_flagging, repayment_reminders, fd_maturity_check, fd_interest_accrual)
  - [x] Add job monitoring (getStats endpoint)
  - [x] Set up cron schedules
  - [x] Manual trigger endpoint (POST /admin/jobs/trigger)

### Week 1-2 Bonus: Database Layer Alignment ✅ COMPLETE
- [x] **Repository Layer Rewrite** — All 8 repositories rewritten with real Kysely queries
  - [x] LoanRepository (14+ methods: products, applications, accounts, schedules, repayments)
  - [x] AccountRepository (deposits, withdrawals, transfers consolidated)
  - [x] AuthRepository (fixed column mismatches: `account_locked`, removed ghosts)
  - [x] StaffRepository (fixed `email`/`position`, added `findAll`)
  - [x] DocumentsRepository (fixed `member_id`/`is_verified`)
  - [x] MemberRepository (fixed `search()` to use members table directly)
  - [x] ShareRepository (implemented from scratch: classes, holdings, transactions, dividends, register)
  - [x] TransactionRepository (deprecated → re-exports AccountRepository)
  - [x] PersonRepository (deleted — referenced non-existent `persons` table)

- [x] **Route Layer Fixes** — All 4 route files aligned to actual DB schema
  - [x] Loans: removed v2 naming, consolidated endpoints, fixed validation schemas
  - [x] Accounts: complete rewrite with correct field names and repository methods
  - [x] Auth: fixed login/register/me/change-password, stubbed reset-password (needs migration)
  - [x] Admin: fixed staff CRUD (removed `member_id` join, correct column names)

- [x] **TypeScript & Config**
  - [x] tsconfig.json: target ES2022, strict mode, skipLibCheck
  - [x] Fixed duplicate exports (dbManager, InterestMethod)
  - [x] Installed @types/bcryptjs
  - [x] 354 tests passing, 0 type errors in routes/repos/services

### Week 3-4: External Integrations
- [ ] **MTN Mobile Money** (P0)
  - [ ] Collection API (deposits)
  - [ ] Disbursement API (withdrawals)
  - [ ] Callback handlers
  - [ ] Error handling & retries
  
- [ ] **Airtel Money** (P0)
  - [ ] Collection API
  - [ ] Disbursement API
  - [ ] Callback handlers
  - [ ] Error handling & retries
  
- [ ] **Mobile Money Reconciliation** (P0)
  - [ ] Match transactions
  - [ ] Handle discrepancies
  - [ ] Reconciliation report
  
- [ ] **SMS Gateway (Africa's Talking)** (P0)
  - [ ] Send single SMS
  - [ ] Send bulk SMS
  - [ ] Template processing
  - [ ] Delivery tracking
  
- [x] **Email Service** (P0) ✅
  - [x] SMTP or API integration (nodemailer, per-tenant gateway config)
  - [x] Template processing ({{variable}} merge engine)
  - [ ] Attachment support
  - [x] Delivery tracking (message_delivery_log table)

### Week 5-6: Automation ✅ COMPLETE
- [x] **Penalty Calculation Job** (P1) ✅
  - [x] Identify overdue installments (RepaymentService.runPenaltyCalculation)
  - [x] Calculate penalties per product (via scheduler processPenaltyCalculation)
  - [x] Post penalty transactions
  - [x] Send notifications (sendPenaltyNotice + sendOverdueNotice via NotificationService)
  
- [x] **NPL Flagging Job** (P1) ✅
  - [x] Identify loans overdue >30 days (RepaymentService.runNplFlagging)
  - [x] Update loan status (scheduler processNplFlagging)
  - [x] Send NPL warnings to staff (sendNplWarning via NotificationService)
  
- [x] **Repayment Reminders** (P1) ✅
  - [x] Send 3 days before due date (wired to NotificationService)
  - [x] Send on due date
  - [x] Send 1 day after due date
  
- [x] **FD Maturity Alerts** (P1) ✅
  - [x] Send 30 days before (FixedDepositService.runMaturityCheck)
  - [x] Send 14 days before
  - [x] Send 7 days before
  - [x] Send on maturity date
  - [x] Auto-rollover for configured FDs
  - [x] Daily FD interest accrual (simple + compound)
  - [x] Premature withdrawal calculation (penalty + WHT)
  
- [x] **2FA Implementation** (P1) ✅
  - [x] TOTP-based authenticator app (otpauth — replaces SMS OTP)
  - [x] 2FA enable/disable endpoint (POST /auth/2fa/setup, /disable)
  - [x] Verify OTP endpoint (POST /auth/2fa/verify)
  - [x] Backup codes generation (10 codes, XXXX-XXXX format)
  - [x] QR code for authenticator setup
  - [x] 2FA login flow (temp token → verify → full access)

### Week 7-8: Reporting
- [ ] **Financial Reports** (P0)
  - [ ] Trial Balance
  - [ ] Balance Sheet
  - [ ] Income Statement (P&L)
  - [ ] Cash Flow Statement
  
- [ ] **Operational Reports** (P1)
  - [ ] Member listing
  - [ ] Savings summary
  - [ ] Loan portfolio
  - [ ] Arrears ageing
  - [ ] NPL report
  - [ ] Daily transactions
  
- [ ] **Export Functionality** (P1)
  - [ ] PDF export (jsPDF/pdfkit)
  - [ ] Excel export (ExcelJS)
  - [ ] CSV export
  
- [ ] **Dashboard** (P1)
  - [ ] Real-time KPIs
  - [ ] Charts/visualizations
  - [ ] Recent activity
  - [x] Alerts/notifications (NotificationService convenience methods)

---

## 📋 MODULE COMPLETION CHECKLISTS

### Member Management
- [x] Database schema
- [x] Basic CRUD endpoints
- [ ] Bulk CSV import
- [x] Welcome notifications (NotificationService.sendWelcome)
- [ ] Auto-create savings account
- [ ] Self-service portal
- [ ] Statement generation
- [ ] KYC workflow (Phase 2)

### Savings & Accounts
- [x] Database schema
- [x] Basic deposit/withdrawal
- [x] Repository with real Kysely queries (deposits, withdrawals, transfers)
- [x] Route endpoints aligned to schema
- [ ] Batch deposits
- [x] Interest accrual service (InterestAccrualEngine)
- [ ] Interest posting job
- [ ] Withdrawal approval workflow
- [ ] Account closure with fees
- [ ] Collateral lien checks
- [ ] Savings statements

### Shares
- [x] Database schema
- [x] Full repository (classes, holdings, transactions, dividends, register)
- [ ] Share purchase endpoint (route)
- [ ] Share certificate PDF
- [ ] Share transfer workflow
- [ ] Dividend calculation
- [ ] Dividend distribution
- [ ] Share register report
- [ ] Holding limits enforcement

### Fixed Deposits
- [x] Database schema
- [ ] FD opening endpoint
- [ ] FD certificate PDF
- [x] Interest calculation ✅ (FixedDepositService — daily simple + compound)
- [x] Maturity alert job ✅ (30/14/7/0 days, scheduler fd_maturity_check)
- [x] Auto-rollover logic ✅ (principal_only or principal_plus_interest)
- [x] Premature withdrawal ✅ (fixed, percentage, interest_reduction penalties)
- [x] WHT computation ✅ (withholding_tax_rate from product config)

### Loans
- [x] Database schema
- [x] Application endpoints (create, list, approve, reject)
- [x] **Schedule calculator** ✅ (flat, EMI, declining balance)
- [x] **Repayment allocation** ✅ (penalties → interest → principal)
- [x] Repayment processing endpoint (single consolidated POST)
- [x] Full repository (products, applications, accounts, schedules, repayments)
- [x] Penalty calculation service
- [x] NPL flagging service
- [ ] Eligibility checks
- [ ] Appraisal workflow
- [ ] Disbursement workflow
- [ ] Rescheduling
- [ ] Write-off workflow
- [ ] Early settlement

### Accounting
- [x] Database schema
- [x] Transaction recording
- [ ] Auto-posting triggers
- [ ] Manual journal entries
- [ ] **Financial statements** ⚠️
- [ ] Year-end closing
- [ ] Budget tracking (Phase 2)
- [ ] Bank reconciliation (Phase 2)

### Messaging
- [x] Database schema
- [ ] **SMS integration** ⚠️ (deferred — Africa's Talking)
- [x] **Email integration** ✅ (EmailService — SMTP/SendGrid/Mailgun/SES)
- [ ] Push notifications
- [x] Message queue worker (NotificationService dispatcher)
- [x] Bulk messaging (sendBulk method)
- [x] Template engine ({{variable}} merge, DB templates)
- [x] Delivery tracking (message_delivery_log)

### Security & Audit
- [x] Authentication (JWT access + refresh tokens)
- [x] RBAC (roles, permissions, hasPermission checks)
- [x] Audit logging
- [x] Password hashing (bcrypt)
- [x] Account lockout after failed attempts
- [x] Auth repository aligned to schema (account_locked, no ghost columns)
- [x] **2FA** ✅ (TOTP via otpauth, backup codes, QR setup)
- [ ] Password expiry
- [x] Password reset flow ✅ (Redis-based tokens, 30-min TTL, single-use)
- [ ] IP whitelisting (Phase 2)
- [ ] Audit log viewer
- [ ] Reversal workflow
- [ ] Suspicious activity detection (Phase 2)

---

## 🧪 TESTING CHECKLIST

### Unit Tests
- [x] Loan schedule calculator (flat, EMI, declining — 25 tests)
- [x] Interest accrual calculation (daily, compound, 365/360 — 12 tests)
- [x] Repayment allocation (partial, overpay, penalty — 13 tests)
- [x] Auth service (tokens, lockout, password — 434 total tests passing)
- [x] Email service tests (7 tests)
- [x] Notification service tests (17 tests)
- [x] Password reset service tests (8 tests)
- [x] Fixed deposit service tests (25 tests — interest calc, withdrawal, rollover, alerts)
- [x] Two-factor auth service tests (23 tests — TOTP, backup codes, verification flow)
- [x] Permission checks
- [x] Validation logic (middleware tests)
- [ ] Date calculations
- [ ] Currency calculations

### Integration Tests
- [ ] Member registration flow
- [ ] Deposit processing
- [ ] Withdrawal approval
- [ ] Loan application → disbursement
- [ ] Repayment processing
- [ ] Mobile money callbacks
- [ ] Multi-tenant isolation

### End-to-End Tests
- [ ] Complete loan lifecycle
- [ ] Complete savings lifecycle
- [ ] FD maturity workflow
- [ ] Dividend distribution
- [ ] Report generation
- [ ] Notification delivery

### Performance Tests
- [ ] 500 concurrent users
- [ ] Transaction processing <5s
- [ ] Report generation <60s
- [ ] Interest accrual batch
- [ ] Bulk operations

### Security Tests
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] CSRF protection
- [ ] Authentication bypass attempts
- [ ] Tenant isolation
- [ ] Permission boundary testing

---

## 🚀 DEPLOYMENT CHECKLIST

### Pre-Deployment
- [ ] All P0 tests passing
- [ ] Code review completed
- [ ] Security audit completed
- [ ] Database migrations tested
- [ ] Rollback plan prepared
- [ ] Backup verified

### Deployment
- [ ] Database migrated
- [ ] Environment variables set
- [ ] SSL certificates installed
- [ ] Load balancer configured
- [ ] Monitoring enabled
- [ ] Smoke tests passed

### Post-Deployment
- [ ] Health check passing
- [ ] Integration tests passing
- [ ] Error rate normal
- [ ] Performance metrics normal
- [ ] Backup running
- [ ] Alerts configured

---

## 📊 METRICS TO TRACK

### Development
- [ ] Test coverage: ____% (Target: 80%)
- [ ] Open P0 issues: ____ (Target: 0)
- [ ] Open P1 issues: ____ (Target: <5)
- [ ] Code review backlog: ____ (Target: <3)

### Performance
- [ ] Average API response time: ____ms (Target: <500ms)
- [ ] Transaction processing time: ____s (Target: <5s)
- [ ] Interest accrual job duration: ____min (Target: <30min)
- [ ] Report generation time: ____s (Target: <60s)

### Quality
- [ ] Production errors/day: ____ (Target: <10)
- [ ] Failed transactions: ____% (Target: <1%)
- [ ] SMS delivery rate: ____% (Target: >95%)
- [ ] Email delivery rate: ____% (Target: >98%)

### Business
- [ ] Daily active tenants: ____
- [ ] Daily transactions: ____
- [ ] Average transaction value: ____
- [ ] Total members: ____

---

## 🔧 INFRASTRUCTURE TASKS

### Database
- [ ] PostgreSQL 14+ installed
- [ ] Connection pooling configured
- [ ] Streaming replication setup
- [ ] Automatic failover configured
- [ ] Daily backups scheduled
- [ ] Backup restore tested
- [ ] Query performance monitoring

### Application
- [ ] Node.js 18+ installed
- [ ] PM2 or similar process manager
- [ ] Environment variables secured
- [ ] Log rotation configured
- [ ] Error tracking (Sentry)
- [ ] Horizontal scaling tested

### Cache & Queue
- [x] Redis installed
- [x] BullMQ queue configured (5 job types)
- [x] Manual trigger endpoint (POST /admin/jobs/trigger)
- [x] Job stats endpoint (GET /admin/jobs/stats)
- [ ] Job monitoring dashboard (UI)
- [x] Failed job retry logic
- [x] Queue persistence

### Monitoring
- [ ] Prometheus installed
- [ ] Grafana dashboards
- [ ] Alert rules configured
- [ ] On-call rotation setup
- [ ] Incident response plan

### Security
- [ ] TLS 1.2+ enforced
- [ ] Database encryption enabled
- [ ] Secrets management
- [ ] Firewall rules
- [ ] DDoS protection
- [ ] Regular security scans

---

## 📝 DOCUMENTATION TASKS

### Technical
- [ ] API documentation (Swagger/OpenAPI)
- [ ] Database schema diagram
- [ ] Architecture diagram
- [ ] Deployment guide
- [ ] Configuration guide
- [ ] Troubleshooting guide
- [ ] Disaster recovery plan

### User
- [ ] Staff user manual
- [ ] Admin configuration guide
- [ ] Member portal guide
- [ ] Training materials
- [ ] Video tutorials
- [ ] FAQ document

### Compliance
- [ ] Data privacy policy
- [ ] Security policy
- [ ] Backup policy
- [ ] Incident response plan
- [ ] Regulatory reporting guide

---

## ⚡ QUICK COMMANDS

### Development
```bash
# Start dev server
pnpm dev

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Lint
pnpm lint

# Format
pnpm format
```

### Database
```bash
# Run public migrations
psql -d imara_db -f backend/src/database/migrations-public/*.sql

# Create tenant
pnpm exec ts-node backend/scripts/create-tenant.ts

# Migrate tenant
pnpm exec ts-node backend/scripts/migrate-all-tenants.ts

# Backup tenant
./backend/scripts/backup-tenant.sh tenant_001
```

### Deployment
```bash
# Build
pnpm build

# Start production
NODE_ENV=production pnpm start

# Check health
curl http://localhost:3000/health

# View logs
pm2 logs
```

---

## 🎯 DAILY STANDUP TEMPLATE

### Yesterday
- Completed: ____________
- Blockers: ____________

### Today
- Working on: ____________
- Will complete: ____________

### Blockers
- Need help with: ____________
- Waiting on: ____________

---

## ✅ SPRINT GOALS

### Sprint 1 (Week 1-2) ✅ COMPLETE
**Goal:** Core transaction processing working
- [x] Loan schedules (scheduleCalculator.ts — 501 lines)
- [x] Interest accrual (interestAccrualService.ts)
- [x] Repayment allocation (repaymentService.ts)
- [x] Job scheduler (scheduler.ts — BullMQ)
- [x] All repositories rewritten with real DB queries
- [x] All routes aligned to actual schema
- [x] 354 tests passing

### Sprint 2 (Week 3-4) — IN PROGRESS
**Goal:** External integrations live
- [ ] Mobile money (MTN + Airtel) — deferred
- [x] Email Service (emailService.ts — SMTP + multi-provider)
- [x] Notification Service (notificationService.ts — template engine + channel dispatch)
- [x] Password Reset (passwordResetService.ts — Redis tokens)
- [x] Repayment reminders wired to email
- [ ] SMS Gateway — deferred
- [ ] Message queue (BullMQ already in place from Sprint 1)

### Sprint 3 (Week 5-6)
**Goal:** Automation complete
- [ ] Penalty job
- [ ] NPL job
- [ ] 2FA

### Sprint 4 (Week 7-8)
**Goal:** Reporting complete
- [ ] Financial reports
- [ ] Export functionality
- [ ] Dashboard

---

**Last Updated:** February 14, 2026  
**Sprint:** Sprint 2 IN PROGRESS (Email/Notifications done, MoMo/SMS deferred)  
**MVP Launch Target:** ~5 weeks remaining

### Key Files Added/Modified (Sprint 1)
| File | Lines | Purpose |
|------|-------|---------|
| `src/services/scheduleCalculator.ts` | 501 | Loan schedule generation (flat/EMI/declining) |
| `src/services/interestAccrualService.ts` | ~300 | Daily interest accrual engine |
| `src/services/repaymentService.ts` | ~400 | Repayment processing + penalty + NPL |
| `src/jobs/scheduler.ts` | ~470 | BullMQ job scheduler (5 recurring jobs) |
| `src/repositories/loanRepository.ts` | Rewritten | 14+ real Kysely query methods |
| `src/repositories/accountRepository.ts` | Rewritten | Deposits + withdrawals + transfers |
| `src/repositories/shareRepository.ts` | New | Full CRUD for shares module |
| `src/repositories/authRepository.ts` | Rewritten | Fixed column mismatches |
| `src/repositories/staffRepository.ts` | Rewritten | Fixed field names |
| `src/repositories/documentsRepository.ts` | Rewritten | Fixed member_id/is_verified |
| `src/repositories/memberRepository.ts` | Fixed | Removed persons table dependency |
| `src/routes/loans.ts` | Rewritten | Consolidated endpoints, correct schemas |
| `src/routes/accounts.ts` | Rewritten | Correct field names, proper repo usage |
| `src/routes/auth.ts` | Fixed | Aligned to actual staff_credentials columns |
| `src/routes/admin.ts` | Fixed | Removed member_id join, correct columns |

### Key Files Added/Modified (Sprint 2)
| File | Lines | Purpose |
|------|-------|---------|
| `src/services/emailService.ts` | ~350 | SMTP email with per-tenant gateway config |
| `src/services/notificationService.ts` | ~670 | Template engine + multi-channel dispatch |
| `src/services/passwordResetService.ts` | ~230 | Redis-based password reset tokens |
| `src/jobs/scheduler.ts` | Modified | Rewired repayment reminders to email |
| `src/routes/auth.ts` | Modified | Real password reset endpoints |
| `tests/services/emailService.test.ts` | New | 7 tests for email sending |
| `tests/services/notificationService.test.ts` | New | 17 tests for notifications |
| `tests/services/passwordResetService.test.ts` | New | 8 tests for password reset |
