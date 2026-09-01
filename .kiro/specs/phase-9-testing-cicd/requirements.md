# Requirements Document

## Introduction

Phase 9 builds Royal Glow Salon & Spa's quality and delivery backbone: Vitest unit/integration tests, Playwright E2E, MSW mocking, coverage, fixtures, health endpoints, GitHub Actions quality workflows, SST production deployment, Lighthouse CI, k6, security scanning, and off-site backups.

Tests are an explicit exception to the project's default "no test files unless requested" rule because the harness is this phase's deliverable. The target is meaningful coverage of risky pure logic and critical smoke paths, not a fixed coverage percentage.

Local unit tests remain offline. Production deployment and migration behavior must match the committed workflows rather than aspirational documentation. Database migrations are deliberately separate from application deployment.

Out of scope: provisioning platform credentials, claiming untracked GitHub branch/environment settings, automatic SST rollback, explicit Sentry source-map upload, and adding broader production smoke checks that are not present in the current workflow.

## Glossary

- **Test_Harness**: Vitest + Playwright + MSW + coverage setup for unit, integration, and E2E tests.
- **Unit_Test**: Fast, offline Vitest test of pure logic with no real network or database.
- **Integration_Test**: Vitest test of an API route with database and outbound dependencies mocked.
- **E2E_Test**: Playwright black-box test against a built and started app.
- **PBT**: Property-based testing for deterministic pure logic.
- **Health_Endpoint**: `GET /api/health` returning the documented health response.
- **CI_Pipeline**: GitHub Actions quality workflows plus `deploy-aws.yml`, `migrate.yml`, and backup workflows.
- **Gate_Matrix**: Branch mapping of required checks, enforced by workflows plus external GitHub branch settings where configured.
- **Weekly_Backup**: Scheduled `pg_dump` to Cloudflare R2 with verification and retention.

## Requirements

### Requirement 1: Test Harness and Representative Tests

**User Story:** As a developer, I want meaningful automated tests, so regressions are caught without requiring live services.

#### Acceptance Criteria

1. THE Test_Harness SHALL configure Vitest for the monorepo with Node and jsdom projects, v8 coverage, MSW, and scripts for unit, integration, E2E, and aggregate test runs.
2. THE Unit_Test suite SHALL cover deterministic currency, GST, IST date/window, SEO, consent, and CMS-client logic, using property-based assertions where useful.
3. THE E2E_Test suite SHALL smoke-test the homepage booking entry point and core SEO routes.
4. WHEN unit tests run, outbound HTTP and database access SHALL be mocked so no real network or database is required.

### Requirement 2: Health Endpoint

**User Story:** As an operator, I want health endpoints, so deployment and uptime monitors can verify both applications.

#### Acceptance Criteria

1. WHEN `GET /api/health` is requested, THE endpoint SHALL return its documented JSON shape and `Cache-Control: no-store`.
2. THE endpoint SHALL return `503` when its hard database dependency fails and `200` for healthy/degraded states according to the implemented contract.
3. Optional Redis/R2 checks SHALL report `skip` when their configuration is absent.
4. Individual dependency-check exceptions SHALL be contained and represented in the health response.

### Requirement 3: CI Pipeline and Gate Matrix

**User Story:** As a maintainer, I want branch-specific quality workflows, so changes are checked before promotion.

#### Acceptance Criteria

1. THE CI_Pipeline SHALL run its configured lint, typecheck, unit, build, and dependency checks for the branches declared in `ci.yml`.
2. Integration, E2E, Lighthouse, load, and security workflows SHALL run only on the branch targets declared in their committed YAML.
3. Threshold breaches SHALL fail the owning workflow.
4. WHEN code is pushed to `prod`, `deploy-aws.yml` SHALL trigger subject to path filters and the `AWS_DEPLOY_ENABLED` kill switch. Required checks and production approval, when enabled, SHALL be enforced by GitHub branch/environment settings; this workflow SHALL NOT claim those external settings are implemented as jobs in the file.

### Requirement 4: Production Deployment

**User Story:** As an operator, I want an observable SST deployment with honest recovery steps.

#### Acceptance Criteria

1. WHEN `.github/workflows/deploy-aws.yml` runs, it SHALL check out the selected ref, install with Bun, assume the AWS role through OIDC, and execute `bunx sst deploy --stage production`, deploying web and admin through `sst.aws.Nextjs` to Lambda + CloudFront.
2. The workflow SHALL record `.sst/outputs.json` best-effort. WHEN `AWS_DOMAINS_LIVE` is true, it SHALL retry only the web and admin `/api/health` endpoints as implemented in the YAML.
3. IF deployment or health verification fails, the workflow SHALL fail and attempt the configured incident notification. An operator SHALL inspect SST/Pulumi logs, stack state, and public behavior before manually dispatching a known-good `git_ref` when redeployment is needed. Failure SHALL NOT be described as an atomic no-op or automatic rollback.
4. THE deploy workflow SHALL NOT apply database DDL. Committed migrations SHALL run through `.github/workflows/migrate.yml`, manually and forward-only over `DATABASE_URL_UNPOOLED`, in `dev → test → pprd → prod` order.
5. Source-map upload, broader customer-path smoke tests, backup verification, success notification, and automatic known-good redeployment SHALL remain documented as absent until executable workflow steps are added.

### Requirement 5: Backup and Recovery

**User Story:** As an operator, I want an off-site backup, so data has recovery coverage beyond provider retention.

#### Acceptance Criteria

1. WHEN the Weekly_Backup runs, it SHALL create a compressed production dump, upload it to Cloudflare R2, and verify the archive according to the committed workflow.
2. Retention, heartbeat, and failure notification behavior SHALL match the committed workflow rather than an aspirational runbook.

### Requirement 6: Quality Tooling Stays Out of Runtime

**User Story:** As a developer, I want test tooling isolated from production bundles.

#### Acceptance Criteria

1. Test tooling SHALL be development-only dependencies.
2. Production code SHALL NOT import Vitest, Playwright, MSW, faker, coverage, or wait-on packages.
