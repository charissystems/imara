# Imara SACCO - MVP Completion Roadmap
**Generated:** February 14, 2026  
**Target MVP Launch:** 8-10 weeks from now

## Quick Stats
- **Overall Progress:** 45% MVP Complete
- **Database Schema:** 90% ✅
- **Business Logic:** 35% ⚠️
- **Integrations:** 20% ❌
- **Testing:** <50% coverage ❌

---

## 🚨 CRITICAL BLOCKERS (Must complete for MVP)

### 1. Loan Schedule Calculator
**Priority:** P0 - BLOCKER  
**Effort:** 3-5 days  
**Impact:** Entire loan module unusable without this

**Location:** `backend/src/services/loanService.ts`

**Requirements:**
- Calculate installments using declining balance method
- Support multiple repayment frequencies (weekly, monthly, etc.)
- Generate payment schedule with principal, interest, balance
- Handle irregular payment dates

**Acceptance Criteria:**
```typescript
interface RepaymentSchedule {
  installmentNumber: number;
  dueDate: Date;
  principalDue: Decimal;
  interestDue: Decimal;
  totalDue: Decimal;
  principalPaid: Decimal;
  interestPaid: Decimal;
  totalPaid: Decimal;
  principalBalance: Decimal;
  status: 'pending' | 'paid' | 'overdue';
}
```

---

### 2. Mobile Money Integrations
**Priority:** P0 - BLOCKER  
**Effort:** 2 weeks  
**Impact:** Primary transaction channel in Uganda

#### 2a. MTN Mobile Money
**API Documentation:** https://momodeveloper.mtn.com/  
**Required Endpoints:**
- POST /collection/v1_0/requesttopay (deposits)
- POST /disbursement/v1_0/transfer (withdrawals)
- GET /collection/v1_0/requesttopay/{referenceId} (status check)

**Files to Create:**
- `backend/src/integrations/mtn-momo.ts`
- `backend/src/services/mobileMoneyService.ts`

#### 2b. Airtel Money
**Similar implementation pattern to MTN**

**Key Features Needed:**
- Collection (deposits)
- Disbursement (withdrawals)
- Callback handlers for async notifications
- Reconciliation queue
- Retry logic for failed transactions

---

### 3. Interest Accrual Job
**Priority:** P0 - BLOCKER  
**Effort:** 3-4 days  
**Impact:** Savings module financial accuracy

**Location:** `backend/src/jobs/interestAccrual.ts`

**Requirements:**
- Run daily at configured time (e.g., 00:01)
- Calculate interest for all active savings accounts
- Support simple and compound interest methods
- Respect calculation basis (365 vs 360 days)
- Update `interest_accrued` field
- Post interest to accounts on configured schedule

**Scheduler Options:**
- node-cron
- bull (with Redis)
- AWS EventBridge (if on AWS)

---

### 4. SMS Gateway Integration
**Priority:** P0 - BLOCKER  
**Effort:** 2-3 days  
**Impact:** All member communications blocked

**Recommended:** Africa's Talking
- Great coverage in Uganda
- Reliable delivery
- Good pricing

**Location:** `backend/src/integrations/sms-gateway.ts`

**Required Features:**
- Send single SMS
- Send bulk SMS
- Delivery status callbacks
- Template merge fields (name, amount, balance, etc.)
- Queue failed messages for retry

---

### 5. Financial Reports
**Priority:** P0 - BLOCKER  
**Effort:** 1 week  
**Impact:** Regulatory compliance requirement

**Reports Needed:**
1. **Trial Balance**
   - All accounts with debit/credit balances
   - Must balance to zero
   
2. **Balance Sheet**
   - Assets, Liabilities, Equity
   - As at specific date
   
3. **Income Statement (P&L)**
   - Income and Expenses
   - For specific period
   
4. **Cash Flow Statement**
   - Operating, Investing, Financing activities

**Location:** `backend/src/services/reportingService.ts`

---

## 🔥 HIGH PRIORITY (Complete within 2 weeks)

### 6. Repayment Allocation Logic
**File:** `backend/src/services/loanService.ts::recordRepayment()`

**Allocation Order:**
1. Penalties (oldest first)
2. Interest (oldest first)
3. Principal (oldest first)

**Edge Cases:**
- Partial payments
- Overpayments (credit to account)
- Multiple overdue installments

---

### 7. Automated Job Scheduler
**Recommended:** Bull + Redis

**Jobs to Schedule:**
- Interest accrual (daily, 00:01)
- Penalty calculation (daily, 00:05)
- NPL flagging (daily, 01:00)
- Repayment reminders (daily, 09:00)
- FD maturity alerts (daily, 08:00)
- Statement generation (monthly, 1st at 02:00)

**Setup:**
```bash
pnpm add bull ioredis
pnpm add -D @types/bull
```

---

### 8. Email Service Integration
**Recommended:** SendGrid or AWS SES

**Use Cases:**
- Welcome emails
- Password resets
- Monthly statements
- Loan approval notifications
- Admin alerts

**Location:** `backend/src/integrations/email-service.ts`

---

### 9. Core Operational Reports
**Priority:** P1  
**Effort:** 1 week

**Reports:**
1. Member Listing (with filters)
2. Savings Summary Report
3. Loan Portfolio Report
4. Arrears Ageing Report
5. NPL Report
6. Daily Transaction Summary

**Export Formats:**
- PDF (using jsPDF or pdfkit)
- Excel (using ExcelJS)
- CSV (using built-in Node streams)

---

### 10. 2FA Implementation
**Priority:** P1 - Security  
**Effort:** 3-4 days

**Options:**
1. **SMS OTP** (easier, uses existing SMS gateway)
2. **TOTP Apps** (Google/Microsoft Authenticator)

**Recommended:** Start with SMS OTP, add TOTP later

**Files:**
- `backend/src/services/twoFactorService.ts`
- Update `backend/src/routes/auth.ts`

**Flow:**
1. User enters email/password
2. System sends 6-digit code via SMS
3. User enters code within 5 minutes
4. System validates and issues JWT

---

## ⚠️ MEDIUM PRIORITY (Complete before MVP launch)

### 11. Penalty Calculation Job
**Runs:** Daily  
**Logic:** Check all overdue loan installments, apply penalty per product config

### 12. NPL Flagging Job
**Runs:** Daily  
**Logic:** Flag loans overdue >30 days as Non-Performing

### 13. Withdrawal Approval Workflow
**Threshold:** Configurable (e.g., >UGX 500,000)  
**Approvers:** Manager → Senior Manager

### 14. Member Self-Service Portal
**Endpoints:**
- GET /portal/dashboard (balance, recent transactions)
- GET /portal/statements
- POST /portal/loan-applications
- GET /portal/loan-schedules

### 15. PDF/Excel Export
**Library:** jsPDF + ExcelJS  
**Apply to:** All reports and statements

---

## 📊 TESTING REQUIREMENTS

### Current Coverage: <50%
### Target Coverage: ≥80%

**Priority Test Areas:**
1. Loan schedule calculations
2. Interest accrual logic
3. Repayment allocation
4. Transaction double-entry posting
5. Permission and role checks
6. Tenant isolation

**Framework:** Already using Vitest (good choice)

**Command:**
```bash
pnpm test:coverage
```

---

## 🏗️ INFRASTRUCTURE SETUP

### Before MVP Launch:

1. **Database Replication**
   - Set up PostgreSQL streaming replication
   - Configure automatic failover

2. **Automated Backups**
   - Daily full backups
   - Hourly incremental backups
   - Encrypted storage
   - Test restore procedure

3. **Monitoring & Alerting**
   - Set up Prometheus + Grafana
   - Configure alerts for:
     - High error rates
     - Slow queries
     - Failed jobs
     - Integration failures

4. **Load Testing**
   - Test with 500 concurrent users
   - Verify <5s transaction processing
   - Identify bottlenecks

5. **CI/CD Pipeline**
   - Automated testing on PR
   - Staging deployment
   - Production deployment with rollback

---

## 📅 SUGGESTED SPRINT PLAN

### Sprint 1 (Week 1-2): Core Transactions
- [ ] Loan schedule calculator
- [ ] Repayment allocation logic
- [ ] Interest accrual job
- [ ] Job scheduler setup

### Sprint 2 (Week 3-4): Integrations
- [ ] MTN Mobile Money integration
- [ ] Airtel Money integration
- [ ] SMS gateway (Africa's Talking)
- [ ] Email service (SendGrid)
- [ ] Message queue processor

### Sprint 3 (Week 5-6): Automation
- [ ] Penalty calculation job
- [ ] NPL flagging job
- [ ] Repayment reminder scheduler
- [ ] FD maturity alerts
- [ ] 2FA implementation

### Sprint 4 (Week 7-8): Reporting & Polish
- [ ] Financial reports (Trial Balance, BS, P&L, CF)
- [ ] Operational reports
- [ ] PDF/Excel export
- [ ] Dashboard with KPIs
- [ ] Member self-service portal
- [ ] Increase test coverage to 80%

### Sprint 5 (Week 9-10): Infrastructure & Launch Prep
- [ ] Database replication setup
- [ ] Automated backup configuration
- [ ] Monitoring and alerting
- [ ] Load testing
- [ ] Security audit
- [ ] User acceptance testing

---

## 🎯 DEFINITION OF DONE (MVP)

### Functional Requirements
- [x] Multi-tenant architecture working
- [x] Authentication with JWT
- [ ] Member management complete
- [ ] Savings: deposits, withdrawals, interest
- [ ] Loans: application → approval → disbursement → repayment
- [ ] Shares: purchase, certificates, dividends
- [ ] Fixed Deposits: opening, interest, maturity
- [ ] Mobile money integrations
- [ ] SMS and email notifications
- [ ] Core operational reports
- [ ] Financial statements

### Non-Functional Requirements
- [ ] ≥80% test coverage
- [ ] <5s transaction processing
- [ ] 2FA for staff accounts
- [ ] Database replication
- [ ] Automated daily backups
- [ ] Monitoring and alerting
- [ ] Load tested to 500 concurrent users

### Documentation
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Deployment guide
- [ ] User manual (staff)
- [ ] Admin guide
- [ ] Backup/restore procedures

---

## 💡 QUICK WINS (Can be done in parallel)

1. **Add API versioning** (2 hours)
   - Update routes to `/v1/members`, `/v1/loans`, etc.

2. **Implement CSV member import** (1 day)
   - Parse CSV, validate, bulk insert
   - Return error report

3. **Add welcome email/SMS on registration** (4 hours)
   - Trigger from member creation
   - Use template with merge fields

4. **Implement transaction receipts** (1 day)
   - Generate PDF receipt for deposits/withdrawals
   - Email or SMS link to member

5. **Add audit log viewer** (2 days)
   - Filter by user, date, action
   - Export to CSV

---

## 🚀 POST-MVP ENHANCEMENTS (Phase 2)

These are "SHOULD" priority from the spec:
- Mobile app (Android/iOS)
- USSD integration
- Digital wallet
- Multi-branch support
- Budget tracking
- Scheduled report delivery
- Credit scoring system
- Automated loan top-ups
- Share transfers between members

---

## 📞 NEED HELP?

### External Dependencies
- **MTN Mobile Money:** Get API credentials from MTN
- **Airtel Money:** Get API credentials from Airtel
- **Africa's Talking:** Sign up at africastalking.com
- **SendGrid:** Sign up at sendgrid.com (free tier available)

### Technical Decisions Needed
1. Job scheduler: Bull (recommended) vs node-cron vs AWS EventBridge?
2. Redis for queue: Required for Bull, optional for others
3. PDF library: jsPDF (client-side) vs pdfkit (server-side)?
4. Frontend framework: React or Vue? (API is framework-agnostic)

### Repository Structure
Consider organizing:
```
backend/
  src/
    jobs/           # Scheduled jobs
    integrations/   # External API integrations
    reports/        # Report generators
    templates/      # Email/SMS templates
```

---

## 🎉 MVP LAUNCH CHECKLIST

### 1 Week Before Launch:
- [ ] All P0 and P1 items complete
- [ ] Load testing passed
- [ ] Security audit complete
- [ ] Backup/restore tested
- [ ] Monitoring configured
- [ ] User training completed

### Launch Day:
- [ ] Deploy to production
- [ ] Verify all integrations working
- [ ] Monitor error rates closely
- [ ] Have rollback plan ready
- [ ] Support team on standby

### 1 Week After Launch:
- [ ] Review error logs
- [ ] Gather user feedback
- [ ] Performance optimization
- [ ] Plan Phase 2 features

---

**Last Updated:** February 14, 2026  
**Review Status:** Initial assessment complete  
**Next Review:** After Sprint 1 completion
