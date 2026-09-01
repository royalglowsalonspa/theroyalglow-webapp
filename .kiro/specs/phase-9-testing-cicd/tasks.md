# Implementation Plan: Phase 9 — Testing & CI/CD

## Overview

Stand up the test harness (Vitest unit/integration + Playwright E2E + MSW + v8 coverage + faker), implement the guarded `/api/health` endpoint, write representative tests for the riskiest pure logic and a few smoke paths, and author the GitHub Actions pipeline (CI, integration/E2E, load/security, prod deploy, weekly backup) plus Lighthouse/k6/ZAP config — mirroring `deployment.md`, `git-workflow.md`, and `testing.md`. Tests ARE the deliverable this phase (explicit exception to the no-test-files rule). Everything runs with NO external keys: `test:unit`, `typecheck`, `lint`, `build` pass offline and `/api/health` returns 200 locally (DB up, Redis/R2 skipped). Verification: `SKIP_ENV_VALIDATION=1 bun run typecheck`, `bun run lint`, `bun run test:unit`.

## Tasks

- [x] 1. Test tooling install + config (Vitest workspace, Playwright, MSW, coverage)
  - Add devDependencies to `apps/web/package.json`: `vitest`, `@vitest/coverage-v8`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@playwright/test`, `msw`, `@faker-js/faker`, `wait-on`. Run `bun install`
  - Create root `vitest.config.ts`: `test.projects` array — a `business` project (`environment: 'node'`, `include: ['packages/business/**/*.test.ts']`) and a `web` project (`environment: 'jsdom'`, `plugins: [react()]`, `include: ['apps/web/**/*.test.{ts,tsx}']`, `setupFiles: ['./vitest.setup.ts']`, alias `@` → `apps/web/src`). Coverage: provider `v8`, reporters `['text','html']`, `reportsDirectory: './coverage'`, exclude `**/*.config.*`, `**/e2e/**`, `**/payload-types.ts`, `.next`, `**/*.test.*`
  - Create `vitest.setup.ts`: import `@testing-library/jest-dom`; set up MSW (`beforeAll(server.listen)`, `afterEach(server.resetHandlers)`, `afterAll(server.close)`) importing a shared `apps/web/src/test/msw-server.ts` (create it: `setupServer()` with empty default handlers)
  - Create `playwright.config.ts`: `testDir: './apps/web/e2e'`, chromium project, `webServer` `command: 'bun run build && bun run start'` (filtered to web) url `http://localhost:3000` timeout 120000 `reuseExistingServer: !process.env.CI`, `use.baseURL`, HTML reporter, `outputDir`/`reporter` to `playwright-report`
  - Add scripts to ROOT `package.json`: `test`: `vitest run --project business --project web` (exclude *.integration via config glob), `test:unit`: `vitest run` (excludes `*.integration.test.*` and `e2e`), `test:integration`: `vitest run` targeting `**/*.integration.test.ts`, `test:e2e`: `playwright test`. Implement the unit/integration split via separate include globs or `--exclude`. Wire a `test` task into `turbo.json` (`dependsOn: ['^build']`, no cache for e2e)
  - _Requirements: 1.1, 6.2_

- [x] 2. Health endpoint `/api/health`
  - Create `apps/web/src/app/api/health/route.ts` per `deployment.md`: `GET` returning `HealthStatus` JSON. `checkDatabase()` → `db.execute(sql\`SELECT 1\`)` from `@rgss/db` + `drizzle-orm` `sql`, pass/fail with latency. `checkRedis()` → `skip` when `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` absent (read `process.env` directly), else guarded REST `PING` (use `@upstash/redis` via guarded dynamic import or a plain `fetch` to the REST URL) pass/fail. `checkR2()` → `skip` when `NEXT_PUBLIC_R2_PUBLIC_URL` absent, else `HEAD ${url}/.health` pass/fail
  - Aggregate: `unhealthy` iff `database.status === 'fail'` → 503; else 200. `degraded` if DB pass but a non-skip redis/r2 fails; `skip` never degrades. Headers `Cache-Control: no-store`, `X-Health-Status`. `version` from `process.env.COMMIT_SHA ?? 'unknown'`, `uptime` from `process.uptime?.() ?? 0`. Wrap checks in `Promise.allSettled` so the handler never throws. Type `ComponentHealth`/`HealthStatus` with the `'pass'|'fail'|'skip'` union; no `any`
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 3. Unit + PBT tests for pure business logic
  - `packages/business/src/utils/currency.test.ts`: `formatINR` — Indian grouping, 2 decimals, paise→₹; PBT: any non-negative integer paise formats without throwing and round-trips the rupee magnitude
  - `packages/business/src/invoicing/gst.test.ts`: `splitGST` — PBT invariant `base + gst === total === input`, all integers, 18% inclusive back-calc, no float drift across a wide range of paise
  - `packages/business/src/utils/date.test.ts` + `packages/business/src/jobs/time.test.ts`: `formatDateIN` (DD/MM/YYYY, IST), and the IST window helpers (`istToday`, `istDateInDays`, `isSameISTDay`, `reminderWindowMatch`, `monthKeyIST`) — deterministic boundary cases
  - `packages/business/src/loyalty/gems.test.ts` and `packages/business/src/offers/discount.test.ts`: gems earn (1 per ₹100 floor), discount math — representative cases
  - Keep all tests pure (no I/O); no `any`; faker for inputs where helpful
  - _Requirements: 1.2, 1.4, 6.1_

- [x] 4. Unit tests for web pure modules (SEO, consent, CMS guards)
  - `apps/web/src/lib/seo/jsonld.test.ts`: `localBusinessJsonLd` (@context, @type array incl LocalBusiness, NAP from BUSINESS), `serviceJsonLd` (Offer price = whole-rupee string from paise, INR), `breadcrumbJsonLd` (positions, item omitted on last), `faqPageJsonLd`, `blogPostingJsonLd` (@type BlogPosting, ISO datePublished, mainEntityOfPage), `imageObjectJsonLd`
  - `apps/web/src/lib/seo/metadata.test.ts`: `buildMetadata` canonical = SITE_URL + path with NO double slash (PBT over arbitrary leading-slash paths); robots index per arg
  - `apps/web/src/lib/consent/consent.test.ts`: `setConsent`→`getConsent` round-trip (necessary always true, decided true after set); default unset reads decided:false (jsdom localStorage)
  - `apps/web/src/lib/cms/client.test.ts` (MSW): `getPublishedPosts`/`getPostBySlug`/`getAllPostSlugs` map docs and return `[]`/`null` on non-2xx/unconfigured; `getActiveBanners(now)` window filter (PBT-ish boundary cases)
  - _Requirements: 1.2, 1.4_

- [x] 5. Integration + E2E tests
  - `apps/web/src/app/api/health/route.integration.test.ts`: mock `@rgss/db` (`vi.mock`) so `SELECT 1` resolves → expect 200, `database: pass`, `redis`/`r2`: `skip` with no keys; mock the db to throw → expect 503 `unhealthy`. Assert `Cache-Control: no-store`
  - One representative read integration test (e.g. `llms.txt` route or a CMS-backed read) using MSW for the upstream and asserting graceful fallback
  - `apps/web/e2e/home.spec.ts`: homepage loads, hero + "Book Now" CTA visible; clicking Book Now opens the booking dialog (or `/?book=1` deep-link opens it)
  - `apps/web/e2e/seo.spec.ts`: `GET /sitemap.xml` 200 + xml, `GET /robots.txt` 200 + text (contains `Sitemap:`), `GET /llms.txt` 200 + `text/plain`
  - _Requirements: 1.3, 2.1, 2.2, 2.3_

- [x] 6. GitHub Actions workflows + Lighthouse/k6/ZAP config
  - Create `.github/workflows/ci.yml`: jobs `lint-typecheck`, `unit-tests` (`bun run test:unit --coverage` + upload coverage), `build` (needs lint-typecheck, upload `.next`), `dependency-audit` (Trivy fs HIGH/CRITICAL exit-1 + Socket). `on: pull_request: [dev,test,pprd,prod]` + `push: [dev]`; `concurrency` cancel-in-progress; `oven-sh/setup-bun@v2`; `bun install --frozen-lockfile`
  - Create `.github/workflows/integration.yml`: `integration-tests` (seed test DB, `bun run test:integration`, `DATABASE_URL: secrets.DATABASE_URL_TEST`, `APP_ENV: test`), `playwright-e2e` (install chromium, build+start, `wait-on`, `bun run test:e2e`, upload report), `lighthouse-ci` (`bunx @lhci/cli autorun`). `on: pull_request: [test,pprd,prod]`
  - Create `.github/workflows/load-test.yml`: `k6-load-test` (`grafana/setup-k6-action`, run `tests/load/booking-flow.js`, `K6_TARGET_URL: secrets.PPRD_URL`), `security-scan` (Trivy fs CRITICAL/HIGH exit-1 + `zaproxy/action-baseline` target `secrets.PPRD_URL` rules `zap-rules.tsv`). `on: pull_request: [pprd,prod]`
  - Create `.github/workflows/deploy-aws.yml` with the single implemented deploy job: check out the selected `git_ref`, install with Bun, assume the AWS role through GitHub OIDC, run `bunx sst deploy --stage production`, record `.sst/outputs.json` best-effort, conditionally retry both `/api/health` endpoints, and attempt incident notification on failure. Document that SST/Pulumi failure can partially apply and requires operator inspection before manual redeployment of a known-good ref. Keep migrations in separate manual `.github/workflows/migrate.yml`; do not claim source-map upload, prechecks, broad smoke tests, backup verification, or automatic rollback.
  - Create `.github/workflows/weekly-backup.yml`: cron `0 2 * * 0` — `pg_dump` (`secrets.DATABASE_URL_UNPOOLED_PROD`) → gzip → `aws s3 cp` to R2 (`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`, endpoint `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`) → `gunzip -t` verify → keep-last-8 cleanup → `BETTER_STACK_HEARTBEAT_BACKUP` ping → incident webhook on failure
  - Create `.github/workflows/monthly-backup-test.yml` and `.github/workflows/replicate-prod-to-pprd.yml` per `deployment.md`/`git-workflow.md` (delivered, ops-activated — header comment noting they require Neon/R2 secrets)
  - Create `lighthouserc.json` (assert performance ≥ 0.95; accessibility/seo/best-practices = 1.0; urls `/`, `/services`, `/about`; upload temporary-public-storage), `tests/load/booking-flow.js` (k6 thresholds p95<500ms, error<1%; stages + `GET /`, `/api/services`, `/api/availability`), and `zap-rules.tsv` (baseline tuning)
  - Use the CANONICAL env/secret names from `environment-variables.md` throughout
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 5.1, 5.2_

- [x] 7. Verification — typecheck, lint, unit tests
  - Run `SKIP_ENV_VALIDATION=1 bun run typecheck` workspace-wide; resolve type errors in new test files, configs, and the health route (no `any`, no `@ts-ignore`)
  - Run `bun run lint` (Biome) and fix genuine new issues (ignore the pre-existing CRLF/import-order/useSemanticElements baseline)
  - Run `bun run test:unit` — all unit/PBT tests pass offline with no env keys
  - Confirm `/api/health` typechecks and (smoke, optional) returns 200 locally with `database: pass`, `redis`/`r2`: `skip`; confirm test deps are devDependencies only and the production build does not import them
  - _Requirements: 1.4, 6.1, 6.2_

## Notes

- This phase mirrors `deployment.md` (workflows + health + backup), `git-workflow.md` (branch gate matrix), and `testing.md` (Vitest/Playwright/MSW/Lighthouse/k6 budgets). Those are the source of truth.
- Tests ARE the deliverable here — the explicit exception to "no test files unless requested".
- Guarded everywhere: `/api/health` and the suite run with NO keys. Redis/R2 absent → `skip` (not fail). DB is the only hard dependency; integration tests mock `@rgss/db`.
- All test tooling is devDependency-only; never imported at runtime. Turbo `test` task `dependsOn: ['^build']`.
- Canonical env/secret names only (post-alignment): `DATABASE_URL`, `DATABASE_URL_UNPOOLED_PROD`, `UPSTASH_REDIS_REST_URL/TOKEN`, `NEXT_PUBLIC_R2_PUBLIC_URL`, `R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_ACCOUNT_ID`, `SENTRY_AUTH_TOKEN`, `BETTER_STACK_HEARTBEAT_BACKUP`, `BETTER_STACK_DEPLOY_WEBHOOK`/`_INCIDENT_WEBHOOK`, `PPRD_URL`. DNS deployment alone may use `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_DEFAULT_ACCOUNT_ID`; neither belongs in app runtime env.
- Provisioning AWS/SST deployment permissions, Neon API access, DNS-only `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_DEFAULT_ACCOUNT_ID`, and BetterStack monitors is deploy-time ops; workflows reference the names. k6 against a live URL and the backup/replication crons are ops-activated.
- PowerShell verification: `cd <pkg>; $env:SKIP_ENV_VALIDATION=1; bunx tsc --noEmit` (the POSIX `VAR=1 cmd` form fails on this shell).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2", "6"] },
    { "id": 1, "tasks": ["3", "4"] },
    { "id": 2, "tasks": ["5"] },
    { "id": 3, "tasks": ["7"] }
  ]
}
```
