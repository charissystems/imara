# Contributing to Imara

Thank you for contributing! This guide covers the branching strategy, commit conventions, and workflow that all contributors must follow.

---

## Branching Strategy

We use a **trunk-based development** model with a stable `main` branch and a `development` integration branch.

### Branch Hierarchy

```
main              ← Production-ready code (protected, deploys to production)
  └─ development  ← Integration branch (protected, deploys to staging)
       └─ feat/*  ← Feature branches (created from development)
       └─ fix/*   ← Bug fix branches
       └─ hotfix/* ← Urgent production fixes (created from main)
```

### Branch Naming Convention

All branches **must** follow this pattern:

```
<type>/<ticket-or-slug>
```

| Type | Use Case | Base Branch | Merges Into |
|---|---|---|---|
| `feat/` | New features or capabilities | `development` | `development` |
| `fix/` | Bug fixes (non-urgent) | `development` | `development` |
| `hotfix/` | Critical production fixes | `main` | `main` AND `development` |
| `refactor/` | Code restructuring (no behavior change) | `development` | `development` |
| `chore/` | Tooling, config, CI/CD changes | `development` | `development` |
| `docs/` | Documentation only | `development` | `development` |
| `test/` | Adding or improving tests | `development` | `development` |

### Examples

```bash
feat/mtn-momo-integration
feat/variable-interest-rates
fix/duplicate-repayment-posting
hotfix/loan-accrual-overflow
refactor/centralize-interest-logic
chore/add-docker-healthcheck
docs/api-authentication-guide
test/loan-calculator-edge-cases
```

### Rules

- **Lowercase only**, words separated by hyphens
- **No personal names** (use `feat/export-pdf`, not `john/export-pdf`)
- Keep slugs **short but descriptive** (2-5 words)
- Delete branches after merge

---

## Workflow

### 1. Starting new work

```bash
# Always start from an up-to-date development branch
git checkout development
git pull origin development

# Create your branch
git checkout -b feat/my-feature
```

### 2. Working on your branch

- Make small, focused commits (see [Commit Messages](#commit-messages) below)
- Push regularly: `git push -u origin feat/my-feature`
- Keep your branch up to date:

```bash
git fetch origin
git rebase origin/development
```

### 3. Opening a Pull Request

- Target: `development` (or `main` for hotfixes)
- Fill out the PR template completely
- Ensure CI passes (typecheck, unit tests, integration tests)
- Request review from at least one team member

### 4. After merge

```bash
git checkout development
git pull origin development
git branch -d feat/my-feature          # Delete local branch
git push origin --delete feat/my-feature  # Delete remote branch
```

### 5. Hotfix workflow

```bash
git checkout main
git pull origin main
git checkout -b hotfix/critical-bug

# Fix, commit, push, open PR to main
# After merge to main, also merge main → development
git checkout development
git merge main
git push origin development
```

---

## Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. Full rules are in [copilot-instructions.md](.github/copilot-instructions.md).

### Format

```
<type>(<scope>): <summary>

[optional body]

[optional footer]
```

### Quick Reference

| Type | When to use |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code change, no behavior change |
| `perf` | Performance improvement |
| `docs` | Documentation only |
| `test` | Adding/fixing tests |
| `style` | Formatting, linting (no logic change) |
| `chore` | Maintenance, tooling, config |
| `build` | Build system or dependencies |
| `ci` | CI/CD pipeline changes |

### Scopes

Use short, lowercase domain names: `auth`, `loans`, `ledger`, `api`, `ui`, `config`, `db`, `shares`, `deposits`, `members`, `messaging`, `audit`, `jobs`

### Examples

```
feat(loans): add variable interest rate support
fix(api): prevent duplicate repayment posting
refactor(ledger): centralize interest accrual logic
ci(docker): add multi-stage production build
test(shares): add dividend calculation edge cases
```

---

## Code Standards

- **TypeScript** for all code — no `any` unless absolutely necessary
- **Functional components** with hooks for React
- **Immutable data** — prefer `const` and `readonly`
- Run `pnpm tsc --noEmit` before pushing to catch type errors early
- Run `pnpm test` before pushing

---

## Pull Request Checklist

Before requesting review, confirm:

- [ ] Branch follows naming convention (`feat/`, `fix/`, etc.)
- [ ] Commits follow conventional commit format
- [ ] TypeScript compiles with no errors (`pnpm tsc --noEmit`)
- [ ] All tests pass (`pnpm test`)
- [ ] New code has tests where applicable
- [ ] No secrets, credentials, or `.env` files committed
- [ ] PR description explains **what** and **why**

---

## Environment Setup

```bash
# Clone and install
git clone git@github.com:charissystems/imara.git
cd imara/backend
pnpm install

# Set up environment
cp .env.example .env  # Edit with your local credentials

# Run tests
pnpm test

# Start dev server
pnpm dev
```

## Questions?

Open an issue or reach out to the team.
