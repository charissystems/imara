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
