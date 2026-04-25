# Imara — Hackathon Proposal

> *Imara (Swahili): steadfast, reliable*

---

## Problem Statement

Over 175 million Africans belong to savings and credit cooperatives (SACCOs), yet the vast majority of these institutions still operate on paper ledgers, spreadsheets, or expensive legacy software built for banks — not cooperatives. This results in:

- **Manual errors** in loan interest calculations, share registers, and repayment schedules
- **No audit trail**, making fraud detection nearly impossible
- **Zero automation** for routine tasks like interest accrual, penalty posting, and member notifications
- **Single-SACCO software** that forces every cooperative to buy and maintain separate systems
- **No mobile or remote access**, leaving members unable to check balances or apply for loans without visiting a branch

Smaller SACCOs — which serve rural and low-income communities most — simply cannot afford enterprise fintech solutions, leaving millions of people financially underserved and their cooperatives vulnerable to mismanagement.

---

## Proposed Solution

Imara is a **multi-tenant SACCO management platform** that gives any savings cooperative — from a 50-member village chama to a 50,000-member urban SACCO — a modern, secure, and fully self-serve back-office on one shared infrastructure.

Each SACCO gets an isolated data environment (schema-per-tenant) without the cost of dedicated servers. A single deployment serves many cooperatives simultaneously, with strict data isolation, role-based access control, and a full audit trail on every transaction.

### Core Capabilities

| Domain | What Imara Does |
|---|---|
| **Members** | Registration, KYC, next-of-kin, beneficiary designation, bulk CSV/Excel import, welcome SMS/email |
| **Savings Accounts** | Deposits, withdrawals, internal transfers, configurable interest accrual (simple or compound), PDF statements |
| **Loans** | Product configuration, multi-stage workflow (appraise → approve → disburse), repayment schedules, guarantors, penalty accrual, loan agreements |
| **Shares** | Share class management, purchases, transfers, dividend tracking, shareholder certificates |
| **Fixed Deposits** | Term deposits with configurable rates, rollover, and maturity notifications |
| **Accounting** | Double-entry general ledger, chart of accounts, income statement, balance sheet |
| **Messaging** | SMS and email notifications via Africa's Talking, Twilio, SendGrid, or AWS SES |
| **Reports** | Financial reports, portfolio analytics, arrears aging, executive dashboards |
| **Security** | JWT authentication, TOTP two-factor auth, RBAC, rate limiting, full immutable audit log |
| **Administration** | Per-SACCO configuration, multi-branch support, transaction limits by role and channel, fee schedules |

### Why Multi-Tenancy Changes Everything

Instead of every SACCO buying separate software, Imara lets many cooperatives share one platform. Each tenant's data lives in its own isolated PostgreSQL schema — completely invisible to other tenants. Onboarding a new SACCO takes minutes, not weeks. This breaks the cost barrier that keeps small cooperatives on spreadsheets.

---

## Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| **Runtime** | Node.js (ESM) + TypeScript | Type safety across the entire backend |
| **Web Framework** | Hono | Lightweight, fast, middleware-friendly |
| **Database** | PostgreSQL (schema-per-tenant) | ACID guarantees, row-level isolation, proven at scale |
| **Query Builder** | Kysely | Fully type-safe SQL without ORM overhead |
| **Cache & Queues** | Redis + BullMQ | Session caching, background jobs (interest accrual, notifications, scheduled tasks) |
| **Validation** | Zod | Runtime schema validation on all API inputs |
| **Authentication** | JWT + bcrypt + TOTP | Stateless auth with two-factor support |
| **PDF Generation** | PDFKit | Loan agreements, account statements, share certificates |
| **Notifications** | Nodemailer + SMS gateway adapters | Email and SMS delivery abstraction |
| **Excel/CSV** | ExcelJS | Bulk member import and data exports |
| **Background Jobs** | node-cron + BullMQ | Daily interest posting, penalty application, reminders |
| **Testing** | Vitest | Unit and integration test coverage (≥70% lines) |
| **Containerisation** | Docker + Docker Compose | Reproducible local and production environments |
| **Package Manager** | pnpm | Fast, disk-efficient dependency management |

---

## Why Imara Wins

1. **Solves a real, large-scale problem** — cooperative banking is Africa's most common form of structured saving, yet it is chronically underserved by technology.
2. **Multi-tenancy is the moat** — one platform, infinite SACCOs, zero per-cooperative infrastructure cost.
3. **Production-grade from day one** — double-entry accounting, full audit logs, RBAC, 2FA, and automated compliance reporting are built in, not bolted on.
4. **Open and extensible** — RESTful JSON API with OpenAPI spec means any front-end (web portal, USSD, mobile app, agent app) can integrate immediately.
5. **Financially inclusive by design** — works for a 50-member village cooperative with the same reliability as a large urban SACCO.
