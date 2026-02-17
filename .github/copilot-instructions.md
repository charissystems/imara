# Project branching & workflow strategy
applyTo: "**"

## Branch Naming Convention

All branches must follow the pattern: `<type>/<short-slug>`

| Type | Base Branch | Merges To | Use Case |
|---|---|---|---|
| `feat/` | `development` | `development` | New feature or capability |
| `fix/` | `development` | `development` | Bug fix (non-urgent) |
| `hotfix/` | `main` | `main` + `development` | Critical production fix (urgent) |
| `refactor/` | `development` | `development` | Code restructuring, no behavior change |
| `chore/` | `development` | `development` | Tooling, config, dependencies |
| `docs/` | `development` | `development` | Documentation only |
| `test/` | `development` | `development` | Adding or improving tests |

## Examples

```
feat/mtn-momo-integration
feat/variable-interest-rates
fix/duplicate-repayment-posting
hotfix/loan-accrual-overflow
refactor/centralize-interest-logic
chore/add-docker-healthcheck
```

**Rules:**
- Lowercase only, words separated by hyphens
- No personal names or WIP branches on shared branches
- Delete branches after merge
- Always base from up-to-date remote branch

## Development Workflow

1. **Start new work:**
   ```bash
   git checkout development && git pull origin development
   git checkout -b feat/my-feature
   ```

2. **Before pushing:**
   - Run `pnpm tsc --noEmit` (no type errors)
   - Run `pnpm test` (all tests pass)
   - Keep commits small and focused (see commit guidelines below)

3. **Open a Pull Request:**
   - Target: `development` (or `main` for hotfixes)
   - Fill out PR template completely
   - Ensure CI passes (typecheck, unit tests, integration tests)
   - Request review from at least one team member

4. **After merge:**
   ```bash
   git checkout development && git pull origin development
   git branch -d feat/my-feature
   git push origin --delete feat/my-feature
   ```

5. **Hotfix workflow** (critical production fixes):
   ```bash
   git checkout main && git pull origin main
   git checkout -b hotfix/critical-bug
   # Fix, commit, push, open PR to main
   # After merge to main, merge main → development
   ```

## CI/CD Gating

- All PRs require status checks to pass: typecheck, unit tests, integration tests
- Production deploys require manual approval in GitHub Environment
- Coverage threshold: 70% lines/functions, 60% branches

---

# Project general coding standards
applyTo: "**"

## Naming Conventions
- Use PascalCase for component names, interfaces, and type aliases
- Use camelCase for variables, functions, and methods
- Prefix private class members with underscore (_)
- Use ALL_CAPS for constants

## Error Handling
- Use try/catch blocks for async operations
- Implement proper error boundaries in React components
- Always log errors with contextual information

# Project coding standards for TypeScript and React
applyTo: "**/*.ts,**/*.tsx"

## TypeScript Guidelines
- Use TypeScript for all new code
- Follow functional programming principles where possible
- Use interfaces for data structures and type definitions
- Prefer immutable data (const, readonly)
- Use optional chaining (?.) and nullish coalescing (??) operators

## React Guidelines
- Use functional components with hooks
- Follow the React hooks rules (no conditional hooks)
- Use React.FC type for components with children
- Keep components small and focused
- Use CSS modules for component styling



# Project documentation writing guidelines
applyTo: "docs/**/*.md"

## General Guidelines
- Write clear and concise documentation.
- Use consistent terminology and style.
- Include code examples where applicable.

## Grammar
* Use present tense verbs (is, open) instead of past tense (was, opened).
* Write factual statements and direct commands. Avoid hypotheticals like "could" or "would".
* Use active voice where the subject performs the action.
* Write in second person (you) to speak directly to readers.

## Markdown Guidelines
- Use headings to organize content.
- Use bullet points for lists.
- Include links to related resources.
- Use code blocks for code snippets.

# Pre-commit checklist
applyTo: "**"

Before committing code, verify:

- [ ] **TypeScript compiles:** `pnpm tsc --noEmit` (no errors)
- [ ] **Tests pass:** `pnpm test` (unit + integration)
- [ ] **Coverage thresholds met:** `pnpm test:coverage` (70% lines/functions, 60% branches)
- [ ] **No secrets committed:** `.env`, API keys, credentials excluded
- [ ] **Branch is up to date:** `git fetch && git rebase origin/<base-branch>`
- [ ] **Commits follow conventions:** See commit message guidelines below

Reference: [CONTRIBUTING.md](../../CONTRIBUTING.md) for full development workflow, PR process, and hotfix procedures.

# Project commit message guidelines  
applyTo: "**/*"
Apply these rules to **all commits**, regardless of size or scope.

---

## General Guidelines

- Every commit must represent **one logical change**.
- Commits must be **reviewable, reversible, and traceable**.
- Do not combine refactors, formatting, and feature changes in one commit.
- Avoid vague messages such as:
  - `update`
  - `fix stuff`
  - `changes`
- Write commit messages assuming they will be read during:
  - Code reviews
  - Audits
  - Incident investigations
  - Changelog generation

## Commit Message Format (Mandatory)
```
<type>(<scope>): <short summary>

[optional body]

[optional footer]
```
## Commit Types

Use one of the following standardized types:

- `feat` – new functionality or capability
- `fix` – bug fix
- `refactor` – code change without behavior change
- `perf` – performance improvement
- `docs` – documentation only
- `test` – adding or correcting tests
- `style` – formatting or linting (no logic change)
- `chore` – maintenance, tooling, or configuration
- `build` – build system or dependency changes
- `ci` – CI/CD pipeline changes
- `revert` – revert a previous commit

---

## Scope Guidelines

- Scope identifies **where the change applies**.
- Use short, lowercase, domain-relevant names.
- Examples:
  - `auth`
  - `api`
  - `loans`
  - `ledger`
  - `ui`
  - `config`

Example:
```
feat(loans): support variable interest rates
```

---

## Summary Line Rules

- Use **imperative, present tense** (“add”, not “added”).
- Maximum **72 characters**.
- Do **not** end with a period.
- Describe **what the change does**, not how.

Good:
```
fix(api): prevent duplicate repayment posting
```

Bad:
```
fixed repayment bug
```

---

## Commit Body Guidelines (When Needed)

Use the body to explain **why the change exists**, not restate the code.

- Wrap lines at ~72 characters.
- Use bullet points for clarity.
- Include business or technical context when relevant.

Example:
```
refactor(ledger): centralize interest accrual logic

Removes duplicated monthly calculation paths

Improves audit traceability

No external behavior changes
```

---

## Footer Guidelines (Optional)

Use the footer to reference external context:

- Issue or ticket numbers
- Breaking changes
- Compliance references

Examples:
```
Closes #142
Refs FIN-08
```

```
BREAKING CHANGE: loan schedules now use daily accrual
```

---

## React & TypeScript-Specific Commit Rules

- UI-only changes must use:
  - `feat(ui)`
  - `fix(ui)`
  - `style(ui)`
- Type-only changes must use:
  - `refactor(types)`
- Formatting or linting changes must use:
  - `style`
  - No logic changes allowed

---

## Prohibited Practices

- No `WIP` commits on shared branches.
- No bundling unrelated changes.
- No commit messages generated without review.
- No force-pushing rewritten commit history on shared branches.

---

## Expected Outcomes

Following these rules ensures:
- Clean and readable `git log`
- Automated changelog compatibility
- Easier debugging and rollback
- Professional-grade audit trails
