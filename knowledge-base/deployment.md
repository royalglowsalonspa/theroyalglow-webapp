# Deployment Pipeline & DevOps Strategy

## Current Production Topology

Royal Glow uses several deployment platforms by design. Only the two Next.js applications run on AWS.

| Component | Current host | Deployment mechanism |
|---|---|---|
| `apps/web` | AWS Lambda + CloudFront + S3 | SST v3 through `.github/workflows/deploy-aws.yml` |
| `apps/admin` | AWS Lambda + CloudFront + S3 | SST v3 through `.github/workflows/deploy-aws.yml` |
| `apps/cms` | Render | Render service deployment |
| `apps/invoicing` | Google Cloud Run | Cloud Run source/container deployment |
| Documentation | Mintlify | Mintlify Git integration |
| Primary database | Neon PostgreSQL | Forward-only Drizzle migrations |
| Rate limiting and jobs | Upstash Redis + QStash | Redis stores distributed API rate-limit state; QStash schedule registration is separate from app deployment |
| Media, invoice PDFs, backups | Cloudflare R2 | S3-compatible API and backup workflows |
| Authoritative DNS | Cloudflare DNS | SST-managed DNS-only aliases for web and admin |

`apps/web` and `apps/admin` are live in AWS region `ap-southeast-1`. Each `sst.aws.Nextjs` component uses SST's AWS adapter, which wraps OpenNext and provisions the SSR Lambda, CloudFront distribution, S3 assets, routing, ISR support, and revalidation infrastructure. `sst.config.ts` is the infrastructure source of truth.

Cloudflare remains authoritative for DNS and R2. Production web/admin aliases are DNS-only (`proxied: false`), so requests go directly to CloudFront.

## Sources of Truth

| Concern | Authoritative file |
|---|---|
| AWS infrastructure | `sst.config.ts` |
| AWS deployment | `.github/workflows/deploy-aws.yml` |
| CI gates | `.github/workflows/ci.yml`, `.github/workflows/integration.yml`, `.github/workflows/load-test.yml` |
| Database migration | `.github/workflows/migrate.yml`, `.kiro/steering/migration-discipline.md` |
| QStash schedules | `.github/workflows/register-schedules.yml`, `apps/admin/src/lib/jobs/schedules.ts` |
| Weekly backup | `.github/workflows/weekly-backup.yml` |
| Backup restore test | `.github/workflows/monthly-backup-test.yml` |
| Pre-migration backup | `.github/workflows/pre-migration-backup.yml` |
| Production architecture | `M2AWS.md` |

Documentation must not duplicate workflow internals that can drift. When this guide and an executable file disagree, review the executable file and update this guide.

## Release Strategy

### Deploy is not release

A deployment makes code available in production. A release exposes a feature to users. PostHog feature flags separate those operations:

1. Deploy with the feature flag off.
2. Enable for the Developer role.
3. Enable for Owner and Manager roles.
4. Increase customer exposure while watching errors and business metrics.
5. Enable for everyone.
6. Remove the flag and dead branch after the feature remains stable.

Feature flags are the fastest recovery option for isolated feature defects. They do not replace application rollback for startup failures, broad regressions, security incidents, or incompatible schema changes.

### Branch progression

Code progresses in this order:

```text
dev -> test -> pprd -> prod
```

The matching Neon branches use the same order. `test` and `pprd` may be reset from canonical production under the ratified data-loss policy. `dev` and `prod` are never reset.

## AWS Deployment

### Production workflow

`.github/workflows/deploy-aws.yml` is the single deployment workflow for both Next.js applications. Production releases use:

```bash
bunx sst deploy --stage production
```

The workflow authenticates to AWS through GitHub OIDC. It does not store long-lived AWS access keys. SST deploys the web and admin components declared in `sst.config.ts`, including their CloudFront distributions, Lambda functions, assets, certificates, and DNS records.

A normal release is triggered from the production branch. A rollback uses the workflow's manual dispatch path with a known-good `git_ref`.

### Required GitHub deployment configuration

| Name | Type | Purpose |
|---|---|---|
| `AWS_DEPLOY_ROLE_ARN` | GitHub secret or environment secret | IAM role assumed through GitHub OIDC |
| `CLOUDFLARE_API_TOKEN` | GitHub secret | DNS automation only; scope is Zone:Read + DNS:Edit |
| `CLOUDFLARE_DEFAULT_ACCOUNT_ID` | GitHub Actions variable | Cloudflare account selected by SST's DNS provider |
| `NEXT_PUBLIC_*` values | GitHub Actions variables | Build-time values inlined into browser bundles |

Server-only application values are SST Secrets. Set them before deployment:

```bash
bunx sst secret set <SecretName> <value> --stage production
```

SST stores secret values in AWS Systems Manager Parameter Store and links them to application resources. Never commit values or print them in workflow logs.

### DNS and TLS

Cloudflare remains the authoritative DNS provider. SST manages the required records through the restricted DNS token:

- web and admin aliases are DNS-only and point to their CloudFront distributions;
- ACM validation records are created as required;
- CAA records must allow Amazon certificate issuance;
- Cloudflare proxying must remain disabled for AWS aliases.

CloudFront terminates public TLS with ACM certificates. AWS Shield Standard protects CloudFront at the network and transport layers. Application security controls, rate limiting, CSP, and authentication remain in the Next.js applications and managed dependencies.

### Deployment verification

After each production deployment:

1. Confirm the workflow completed for both Next.js applications.
2. Check `https://theroyalglow.in/api/health`.
3. Check `https://admin.theroyalglow.in/api/health`.
4. Smoke-test the homepage, services, booking deep link, sign-in, and admin login.
5. Confirm CloudFront serves current static assets and no old asset hashes return errors.
6. Check Sentry, BetterStack, and AWS logs for new failures.
7. Confirm scheduled endpoints and external callbacks still use production domains.

Health responses must not expose credentials, connection strings, stack traces, or customer data.

## Database Migrations

Database migration is a separate, controlled operation. Never hide DDL inside an application deployment.

Mandatory sequence:

```text
generate -> review -> commit -> migrate
```

1. Run `bun run generate` after a schema change.
2. Read and review generated SQL and metadata under `packages/db/migrations/`.
3. Run `bun run drift:reference` when the canonical snapshot changes.
4. Commit schema, migration, journal/snapshot, and fingerprint reference together.
5. Apply committed migrations with `bun run migrate` over `DATABASE_URL_UNPOOLED`.
6. Migrate environments in order: `dev`, `test`, `pprd`, then `prod`.

Use `.github/workflows/migrate.yml` for controlled shared-environment application. Do not use schema push against shared Neon branches. Fix migration mistakes with a new forward migration.

Take a targeted R2 backup before a destructive production migration using `.github/workflows/pre-migration-backup.yml`.

## QStash Schedule Registration

Application deployment and schedule registration are separate concerns. QStash schedules are registered through:

```text
.github/workflows/register-schedules.yml
```

The workflow uses the canonical schedule definitions in `apps/admin/src/lib/jobs/schedules.ts`. After job route or schedule changes, run the registration workflow and confirm the resulting QStash schedules and BetterStack heartbeats.

## CMS Deployment

`apps/cms` remains on Render at `cms.theroyalglow.in`. AWS deployment must not create, replace, or reconfigure this service.

Before a CMS release:

- verify Render environment values;
- confirm Payload migrations and service-catalogue sync behavior;
- keep `SERVICE_SYNC_ENABLED` enabled except during an intentional rollback or seed operation;
- smoke-test the CMS API and a web service-catalogue read;
- verify Payload sync updates `public.*`, `/api/revalidate` performs Next.js path revalidation, and the direct-Neon `/api/services` response reflects the change;
- do not expect Upstash invalidation: the five-minute catalogue cache is planned, not implemented.

## Invoicing Deployment

`apps/invoicing` remains on Google Cloud Run as service `rgss-invoicing` in `asia-south1`. It renders invoice PDFs and stores them in Cloudflare R2.

A source deployment uses the repository's Cloud Run build context:

```bash
gcloud run deploy rgss-invoicing --source . --region asia-south1
```

Required service values include:

- `INVOICE_PDF_HMAC_SECRET`
- `R2_BUCKET_NAME`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BASE_URL`

The calling admin workload uses `INVOICING_SERVICE_URL` and the matching HMAC secret. Verify `/healthz`, then send one signed test render and confirm the returned PDF URL resolves through R2.

## Backup and Recovery

### Backup layers

| Layer | Frequency | Storage | Purpose |
|---|---|---|---|
| Neon point-in-time recovery | Continuous within plan retention | Neon | Restore to a point before data corruption |
| Weekly `pg_dump` | Weekly | Cloudflare R2 `weekly/` prefix | Off-site database recovery |
| Restore drill | Monthly | Isolated Neon test target | Prove backup integrity and restore procedure |
| Pre-migration table backup | Before destructive migration | Cloudflare R2 `pre-migration/` prefix | Fast targeted recovery |

`.github/workflows/weekly-backup.yml` creates, uploads, and verifies compressed dumps. `.github/workflows/monthly-backup-test.yml` validates restorability. R2 backup credentials are independent of the DNS automation token.

### Recovery decision matrix

| Failure | First response | Expected recovery path |
|---|---|---|
| Isolated feature defect | Disable PostHog flag | No infrastructure change |
| Broad application regression | Redeploy known-good `git_ref` | Manual dispatch of `deploy-aws.yml`, usually 3-5 minutes |
| CloudFront cache still serves old assets | Verify deployment, then invalidate affected paths if necessary | Preserve immutable asset caching where possible |
| Bad migration without data corruption | Fix forward with a new migration | Follow full migration sequence |
| Data corruption | Stop writes and use Neon point-in-time recovery | Validate recovery branch before switching application URLs |
| Neon regional incident | Restore latest verified R2 dump to an emergency database | Update SST Secrets and redeploy |
| CMS regression | Roll back the Render service | Web/admin remain on AWS |
| Invoice renderer regression | Roll back or redeploy Cloud Run | Core booking flow can degrade without moving storage |

### Application rollback

Do not reverse infrastructure manually. Select the last known-good commit and dispatch `.github/workflows/deploy-aws.yml` with that `git_ref`. SST reconciles infrastructure and application artifacts from source. Run health checks and smoke tests after rollback.

A rollback does not reverse a database migration. Schema compatibility must be considered before redeploying older application code.

## Observability

| Signal | System | Action |
|---|---|---|
| Availability | BetterStack monitors | Alert on timeout or unhealthy response |
| Application errors | Sentry | Compare error rate and new issue fingerprints to pre-deploy baseline |
| Runtime logs | AWS logging for Lambda; Render and Cloud Run logs for their services | Correlate by request ID |
| Product behavior | PostHog | Watch conversion and feature-flag cohorts |
| Jobs | BetterStack heartbeats + QStash logs | Investigate missed or failed deliveries |
| Database | Neon metrics and query logs | Watch connection, latency, and compute behavior |
| CDN/runtime | CloudFront and Lambda metrics | Watch 4xx/5xx rates, duration, throttling, and cache behavior |

## Production Release Checklist

Before deployment:

- CI gates are green.
- Required review and production approval are complete.
- SST Secrets and build-time variables exist for production.
- Cloudflare DNS token has only Zone:Read and DNS:Edit permissions.
- A migration is committed and reviewed when schema changed.
- A pre-migration backup exists for destructive DDL.
- Feature flags and rollback commit are identified.

After deployment:

- web and admin health checks pass;
- critical customer and admin journeys pass smoke testing;
- Sentry and BetterStack remain green;
- CloudFront and Lambda show no abnormal error or throttle spike;
- QStash schedules still target valid routes;
- CMS remains healthy on Render;
- invoicing remains healthy on Cloud Run;
- R2 media, PDF, and backup access still works.
