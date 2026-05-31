# Requirements Document

## Introduction

Phase 9 builds the automated quality and delivery backbone for Royal Glow Salon & Spa: a test harness (Vitest unit/integration, Playwright E2E, MSW mocking, v8 coverage, faker fixtures), a `/api/health` endpoint, the GitHub Actions CI/CD pipeline (CI, integration/E2E, load/security, production deploy), and the supporting config for Lighthouse CI, k6 load testing, and the weekly off-site backup. It implements the locked specifications in `deployment.md`, `git-workflow.md`, and `testing.md` — those documents are authoritative and this phase turns them into committed files.

This phase is the explicit exception to the project's "no test files unless requested" rule: the tests are the deliverable. The goal is a working harness plus meaningful, representative coverage of the riskiest pure logic (money/GST/date math, SEO builders, consent and CMS-client guards) and a few integration + E2E smoke paths — not 100% coverage, which grows continuously.

Everything must run with no external keys: the health endpoint degrades gracefully (DB is the only hard dependency locally; Redis and R2 checks are guarded and report `skip`), the unit tests are pure and offline, and the whole monorepo continues to typecheck, lint, and build. CI workflows reference GitHub Secrets by their canonical names, but provisioning those secrets (and the Cloudflare Pages project, Neon API keys, BetterStack monitors) is a deploy-time ops step.

Out of scope (deferred): provisioning real infrastructure and secrets; 100% coverage; running k6 against a live pprd URL; Sentry runtime initialisation (Phase 10); visual regression, TestSprite, and mutation testing; activation of the backup-restore and prod→preprod replication crons (the files are delivered but ops-activated).

## Glossary

- **Test_Harness**: The Vitest + Playwright + MSW + coverage setup that runs unit, integration, and E2E tests.
- **Unit_Test**: A fast, offline Vitest test of pure logic (no network, no real DB), primarily targeting `packages/business` and `apps/web` pure modules.
- **Integration_Test**: A Vitest test of an API route with the database mocked and outbound HTTP intercepted by MSW.
- **E2E_Test**: A Playwright (chromium) black-box test against a built-and-started app.
- **PBT**: Property-based testing for deterministic pure logic (currency, GST, date windows, consent, sitemap exclusions).
- **Health_Endpoint**: `GET /api/health` returning the `HealthStatus` JSON contract.
- **Component_Health**: A single dependency check result `{ status: 'pass' | 'fail' | 'skip', latencyMs, message? }`.
- **CI_Pipeline**: The set of GitHub Actions workflows (`ci.yml`, `integration.yml`, `load-test.yml`, `deploy-prod.yml`, `weekly-backup.yml`).
- **Gate_Matrix**: The per-branch mapping (dev→test→pprd→prod) of which checks must pass before promotion, per `git-workflow.md`.
- **Lighthouse_Budget**: The asserted scores — performance ≥ 0.95; accessibility, SEO, best-practices = 1.0.
- **Load_Threshold**: The k6 pass criteria — p95 latency < 500ms and error rate < 1%.
- **Weekly_Backup**: The scheduled `pg_dump` → Cloudflare R2 workflow with verification and retention.

## Requirements

### Requirement 1: Test Harness & Representative Tests

**User Story:** As a developer, I want a working test harness with meaningful tests, so that regressions are caught automatically and the suite runs offline.

#### Acceptance Criteria

1. THE Test_Harness SHALL configure Vitest for the monorepo with a Node project for `packages/business` pure logic and a jsdom + React project for `apps/web`, with v8 coverage and MSW for API mocking, and SHALL expose `test:unit`, `test:integration`, `test:e2e`, and `test` scripts wired into `turbo.json`.
2. THE Unit_Test suite SHALL cover the deterministic pure logic — currency formatting, GST split, IST date/window helpers, SEO JSON-LD builders, and consent/CMS-client guards — using property-based assertions where the logic is deterministic.
3. THE E2E_Test suite SHALL include smoke specs verifying the homepage renders its booking CTA and that `/sitemap.xml`, `/robots.txt`, and `/llms.txt` return successful responses with the expected content type.
4. WHEN `test:unit` runs, THE Unit_Test suite SHALL pass with no environment variables and no network access, with every outbound HTTP call intercepted by MSW and every database-touching unit mocked.

### Requirement 2: Health Endpoint

**User Story:** As an uptime monitor and a deploy pipeline, I want a health endpoint, so that I can verify the app and its dependencies are live.

#### Acceptance Criteria

1. WHEN `GET /api/health` is requested, THE Health_Endpoint SHALL return a JSON `HealthStatus` with `status`, `timestamp`, `version`, `uptime`, and `checks` for database, redis, and r2, and SHALL set `Cache-Control: no-store`.
2. THE Health_Endpoint SHALL return status code `503` if and only if the database check fails, and `200` otherwise.
3. WHEN the Redis or R2 environment variables are absent, THE corresponding Component_Health SHALL be `skip`, and a `skip` SHALL NOT degrade the overall status, so a no-keys environment reports `healthy` with `200`.
4. WHILE any individual component check throws, THE Health_Endpoint SHALL still return a well-formed JSON response and SHALL NOT propagate the error.

### Requirement 3: CI Pipeline & Gate Matrix

**User Story:** As a maintainer, I want branch-gated CI workflows, so that only verified code is promoted toward production.

#### Acceptance Criteria

1. THE CI_Pipeline SHALL run lint+format, type check, unit tests, build, and dependency audit for pull requests targeting `dev`, `test`, `pprd`, and `prod`.
2. THE CI_Pipeline SHALL run integration tests, Playwright E2E, and Lighthouse CI for pull requests targeting `test`, `pprd`, and `prod`, asserting the Lighthouse_Budget.
3. THE CI_Pipeline SHALL run the k6 load test (enforcing the Load_Threshold) and security scans (Trivy + OWASP ZAP) for pull requests targeting `pprd` and `prod`.
4. WHEN code is pushed to `prod`, THE CI_Pipeline SHALL require all prior checks to have passed and SHALL gate production deployment behind manual approval.

### Requirement 4: Production Deployment

**User Story:** As an operator, I want an automated, self-verifying production deploy, so that releases are safe and reversible.

#### Acceptance Criteria

1. WHEN the production deploy runs, THE deploy workflow SHALL build the app, upload source maps, deploy to Cloudflare Pages, and run database migrations against the production unpooled connection.
2. WHEN the deploy completes, THE post-deploy job SHALL perform a retrying health check and smoke-test the critical paths (`/`, `/?book=1&utm_source=gmb`, `/services`, `/book`, `/api/health`).
3. IF the post-deploy health check fails, THEN THE deploy workflow SHALL roll back to the previous Cloudflare Pages deployment, AND SHALL notify the incident webhook.

### Requirement 5: Backup & Recovery

**User Story:** As an operator, I want an automated off-site backup, so that the database can be recovered beyond the provider's own retention.

#### Acceptance Criteria

1. WHEN the Weekly_Backup runs on schedule, THE workflow SHALL create a gzipped `pg_dump` of production, upload it to the Cloudflare R2 backups bucket, and verify the archive decompresses.
2. THE Weekly_Backup SHALL retain only the most recent eight weekly backups and SHALL ping the BetterStack backup heartbeat on success, and notify the incident webhook on failure.

### Requirement 6: Quality Gates Run Offline & Out of Runtime

**User Story:** As a developer, I want the local quality gates to run without secrets and without bloating the app, so that the harness is fast and safe.

#### Acceptance Criteria

1. WHEN `bun run typecheck`, `bun run lint`, and `bun run test:unit` run locally, THE monorepo SHALL pass with no environment keys configured.
2. THE test tooling (Vitest, Playwright, MSW, faker, coverage, wait-on) SHALL be declared as development dependencies only, AND the production build SHALL NOT import them.
