# Git Workflow & Branch Strategy

## Branch Overview

Single developer workflow with **4 persistent branches**, each mapped to an environment:

| Branch | Environment | Purpose |
|--------|-------------|---------|
| `prod` | Production | Live traffic — real customers |
| `pprd` | Pre-production | Final validation before going live |
| `test` | Test | Integration tests, QA |
| `dev` | Development | Active development work |

---

## Flow Direction

```
dev → test → pprd → prod
```

- Work happens on `dev` (or short-lived feature branches off `dev`)
- Code must pass all CI gates at each stage before being promoted
- **No direct pushes to `prod`** — always flows through the pipeline

---

## Branch Protection Rules

| Branch | Protection |
|--------|-----------|
| `prod` | Require manual approval + all CI checks passing |
| `pprd` | Require all CI checks passing (lint, test, Playwright, Lighthouse, k6) |
| `test` | Require lint + unit + integration + Playwright + Lighthouse CI |
| `dev` | Require lint + type check + unit tests |

---

## Database Per Environment

All environments use **Neon DB branches** within a single Neon project — no separate paid projects needed.

| Branch | Neon Branch | Notes |
|--------|------------|-------|
| `prod` | `main` | Live customer data — pg_cron jobs run here |
| `pprd` | `preprod` | Reset from `main` every 24h via Neon branch reset API (PII stripped) |
| `test` | `test` | Isolated, seeded with fixtures, wiped before each CI run |
| `dev` | `dev` | Developer sandbox with fake data |

---

## Prod → Preprod Data Replication

Every **24 hours**, a GitHub Actions cron job uses the **Neon Branch Reset API** to sync preprod from prod:

1. Calls the Neon API to reset the `preprod` branch from `main`
2. Runs a PII anonymisation script against `preprod` (names, phone numbers, emails replaced with fake data)
3. Preprod is now a clean, realistic copy of prod without real customer data

> This approach is simpler and faster than `pg_dump` / `pg_restore` because Neon branching is a near-instant copy-on-write operation at the storage layer.

### GitHub Actions Cron (concept)
```yaml
# .github/workflows/replicate-prod-to-pprd.yml
name: Replicate Prod → Preprod (Daily)

on:
  schedule:
    - cron: '0 1 * * *'   # 1 AM UTC daily

jobs:
  replicate:
    runs-on: ubuntu-latest
    steps:
      - name: Reset preprod branch from main
        run: |
          curl -X POST https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/branches/$PREPROD_BRANCH_ID/restore \
            -H "Authorization: Bearer $NEON_API_KEY" \
            -H "Content-Type: application/json" \
            -d '{"source_branch_id": "$MAIN_BRANCH_ID"}'

      - name: Anonymize PII in preprod
        run: node scripts/anonymize-preprod.mjs
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL_PPRD }}
```

### Database Branching Decision
Neon branch reset is the locked strategy for environment isolation. Supabase branching is not used because the project standardizes on one Neon PostgreSQL project with `main`, `preprod`, `test`, and `dev` branches.

---

## CI/CD Pipeline (GitHub Actions)

### On PR to `dev`
```
✅ Lint + Format (Biome + Ultracite)
✅ Type check (tsc --noEmit)
✅ Unit tests (Vitest)
```

### On PR to `test`
```
✅ Lint + Format (Biome)
✅ Type check
✅ Unit tests
✅ Integration tests
✅ Playwright E2E tests
✅ Lighthouse CI (performance ≥ 95; accessibility, best practices, and SEO = 100)
```

### On PR to `pprd`
```
✅ All tests from test branch
✅ k6 load test against pprd environment
✅ Smoke test Playwright suite
```

### On PR to `prod`
```
✅ All CI gates passing
✅ Manual approval required
🚀 Deploy to Cloudflare Pages
```

---

## Commit Conventions

Use **Conventional Commits** for clean history and automatic changelog generation:

```
feat: add booking confirmation email
fix: correct availability calculation for same-day slots
chore: update dependencies
docs: update testing plan
test: add E2E test for admin user management
refactor: extract pricing logic to service layer
```

---

## Secrets Management

| Secret | Where Stored |
|--------|-------------|
| `DATABASE_URL_PROD` / `DATABASE_URL_PPRD` / `DATABASE_URL_TEST` / `DATABASE_URL_DEV` | GitHub Actions encrypted secrets |
| `DATABASE_URL_UNPOOLED_PROD` / `DATABASE_URL_UNPOOLED_PPRD` / `DATABASE_URL_UNPOOLED_TEST` / `DATABASE_URL_UNPOOLED_DEV` | GitHub Actions encrypted secrets for migrations/admin tasks |
| `RESEND_API_KEY` | GitHub Actions encrypted secret |
| `BREVO_API_KEY` | GitHub Actions encrypted secret |
| `BETTER_AUTH_SECRET` | GitHub Actions encrypted secret |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | GitHub Actions encrypted secret |

**Rule: Never commit secrets to git.** Use `.env.local` locally (gitignored) and GitHub Actions secrets in CI.

> See [environment-variables.md](./environment-variables.md) for the full list of all environment variables.

---

## Pre-Commit Hooks (Husky + lint-staged)

Every `git commit` automatically runs **Biome** lint + format on staged files. If the check fails, the commit is blocked.

```bash
# What runs on every commit (via Husky + lint-staged):
biome check --write --staged    # Lint + format only staged files (~200ms)
```

This catches formatting issues and obvious lint errors **before they ever reach CI** — saving pipeline minutes and avoiding "fix lint" commits.

> See [testing.md](./testing.md) Section 18 for full pre-commit hook configuration.

---

## Cross-References

| Topic | Document |
|-------|----------|
| Full testing strategy & CI gates | [testing.md](./testing.md) |
| Deployment pipeline config | [deployment.md](./deployment.md) |
| Environment variables | [environment-variables.md](./environment-variables.md) |
| Release process & documents | [release-documents.md](./release-documents.md) |
