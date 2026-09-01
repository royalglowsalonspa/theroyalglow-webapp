# Launch Runbook — Royal Glow Salon & Spa

A condensed, code-aware production release procedure derived from `launch-checklist.md`. AWS is already the active host for the customer and admin apps; this runbook covers subsequent production releases.

## Current deployment map

| Deployable | Current host | Release mechanism |
|---|---|---|
| `apps/web` | AWS Lambda + CloudFront + S3 via SST | `.github/workflows/deploy-aws.yml` |
| `apps/admin` | AWS Lambda + CloudFront + S3 via SST | `.github/workflows/deploy-aws.yml` |
| `apps/cms` | Render (`rgss-cms`) | Render service deployment |
| `apps/invoicing` | Google Cloud Run (`rgss-invoicing`) | Cloud Run deployment from repository root |
| `docs/` | Mintlify | Mintlify-hosted deployment |

Cloudflare remains authoritative DNS and R2 object storage. It does not run application compute. Neon, Upstash Redis, QStash, Resend, Ably, Sentry, PostHog, and BetterStack remain external managed services.

## Configuration ownership

- Web/admin server secrets: SST Secrets, stored in SSM Parameter Store and injected into Lambda.
- Web/admin `NEXT_PUBLIC_*`: GitHub Actions variables, present during `next build`.
- AWS authentication: GitHub OIDC through `AWS_DEPLOY_ROLE_ARN`.
- Cloudflare DNS automation: `CLOUDFLARE_API_TOKEN` secret plus `CLOUDFLARE_DEFAULT_ACCOUNT_ID` variable, used only by SST DNS integration.
- CMS variables: Render service Environment tab.
- Invoicing variables: Cloud Run variables and Google Secret Manager. R2 values include `R2_ENDPOINT`, `R2_BUCKET_NAME`, and `R2_PUBLIC_BASE_URL`; credentials remain secrets.

## Pre-release gates

1. Promote changes through `dev → test → pprd → prod`.
2. Require CI, integration, E2E, Lighthouse, load, and security gates defined for the target branch.
3. For schema changes, follow `generate → review → commit → migrate`; apply committed migrations over `DATABASE_URL_UNPOOLED` in branch order.
4. Verify latest R2 database backup and BetterStack health monitors.
5. Confirm PostHog kill switches and previous known-good Git ref.

## Production release

1. Merge approved `pprd` into `prod`.
2. If committed DB migrations exist, run `.github/workflows/migrate.yml` for the production Neon branch according to migration discipline.
3. `.github/workflows/deploy-aws.yml` deploys both Next.js apps with `bunx sst deploy --stage production`.
4. Monitor the workflow health gate for:
   - `https://theroyalglow.in/api/health`
   - `https://admin.theroyalglow.in/api/health`
5. Smoke-test homepage, booking deep link, services, sign-in, admin dashboard, and one invoice path.
6. Confirm CloudFront serves web/admin, Cloudflare DNS resolves the production domains, CMS remains healthy on Render, and invoicing remains healthy on Cloud Run.
7. Record release SHA and monitor Sentry, BetterStack, and PostHog for at least 15 minutes.

## Rollback and recovery

| Scenario | Action | Expected time |
|---|---|---|
| Feature/UI defect behind a flag | Disable PostHog flag | < 10 seconds |
| Bad web/admin release | Dispatch `deploy-aws.yml` with the previous tag/SHA | 3–5 minutes |
| Deploy job fails | Inspect SST/Pulumi logs and stack state, verify both health endpoints, then redeploy the known-good ref if needed | Depends on partial update state |
| Bad forward migration without data corruption | Add a forward fix, migrate, then redeploy | Depends on fix |
| Data corruption | Create a Neon PITR recovery branch, validate, and repoint the app | < 30 minutes target |
| Neon outage | Restore the latest verified R2 backup to an emergency Neon target | < 30 minutes target |

There is no Render fallback for web/admin. Roll back only through the AWS workflow with a known-good ref. R2 backup and restore workflows remain active.

## Post-release verification

- Web and admin health endpoints return 200.
- Google OAuth and shared `.theroyalglow.in` session work across both subdomains.
- Booking and admin status changes publish through Ably.
- Service catalogue endpoints return current data read directly from Neon through Drizzle; Redis-backed rate limiting remains healthy.
- Invoice PDF generation reaches Cloud Run and stores the PDF in Cloudflare R2.
- No new critical Sentry errors; BetterStack monitors and job heartbeats remain green.

## References

- `deployment.md` — AWS pipeline, rollback, backups, and operational controls.
- `git-workflow.md` — branch gate matrix.
- `environment-variables.md` — canonical variable names and ownership.
- `observability.md` — monitoring layers.
- `launch-checklist.md` — exhaustive service checklist.
- `../M2AWS.md` — live AWS architecture and cutover record.
