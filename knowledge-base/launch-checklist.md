# Launch Checklist - Production Readiness Review

Use this checklist for a production launch, major relaunch, or high-risk release. `apps/web` and `apps/admin` are hosted on AWS Lambda + CloudFront through SST in `ap-southeast-1`; AWS is the current platform.

`apps/cms` remains on Render, `apps/invoicing` remains on Google Cloud Run, and Cloudflare remains authoritative DNS plus R2 object storage.

## Release Timeline

| Time | Gate |
|---|---|
| T-72h | External services, secrets, DNS permissions, backups, and production data are ready |
| T-48h | Monitoring, certificates, migrations, scheduled jobs, and recovery paths are verified |
| T-24h | CI, integration, E2E, performance, accessibility, load, and security gates pass |
| T-2h | Final pprd smoke test and go/no-go review |
| T-0 | Deploy known production ref and enable approved feature flags |
| T+1h | Golden-path booking and admin completion flow verified |
| T+24h | Jobs, analytics, email delivery, backups, and incident review verified |

## T-72h - Platform and Service Readiness

### AWS web and admin

- [ ] `sst.config.ts` declares both `sst.aws.Nextjs` applications and production domains.
- [ ] Region is `ap-southeast-1`.
- [ ] GitHub OIDC role exists and `AWS_DEPLOY_ROLE_ARN` is configured.
- [ ] Required SST Secrets exist for stage `production`.
- [ ] Required `NEXT_PUBLIC_*` build values exist as GitHub Actions variables.
- [ ] `.github/workflows/deploy-aws.yml` can assume the deployment role.
- [ ] A known-good rollback `git_ref` is recorded before release.
- [ ] Web and admin Better Auth values are compatible and use the shared `.theroyalglow.in` session contract.

Set or rotate a server secret with:

```bash
bunx sst secret set <SecretName> <value> --stage production
```

Do not store browser `NEXT_PUBLIC_*` values only in a runtime secret store. Next.js inlines them during the build.

### Cloudflare DNS

Cloudflare remains authoritative DNS. SST manages the AWS aliases using DNS automation credentials.

- [ ] `CLOUDFLARE_API_TOKEN` is a GitHub secret with only Zone:Read + DNS:Edit.
- [ ] `CLOUDFLARE_DEFAULT_ACCOUNT_ID` is a GitHub Actions variable.
- [ ] Web and admin aliases are DNS-only (`proxied: false`).
- [ ] Root, `www`, and `admin` resolve to the CloudFront destinations managed by SST.
- [ ] CAA records permit Amazon to issue ACM certificates.
- [ ] `cms` still points to Render.
- [ ] `docs` still points to Mintlify.
- [ ] `status` still points to BetterStack.
- [ ] Resend SPF, DKIM, and DMARC records remain valid.

Do not add an independent Route 53 hosted zone for the production domain. Cloudflare is authoritative.

### Neon database

- [ ] `dev`, `test`, `pprd`, and `prod` branches exist.
- [ ] Pooled application URLs and direct migration URLs are stored separately.
- [ ] Point-in-time recovery is available under the current Neon plan.
- [ ] Latest weekly R2 backup succeeded and passed integrity verification.
- [ ] Monthly restore drill is current.
- [ ] Production seed/reference data contains no demo customers or bookings.
- [ ] First Owner/Developer account and role assignment are verified.

### Authentication

- [ ] Google OAuth production consent configuration is approved.
- [ ] Authorized origins include `https://theroyalglow.in` and `https://admin.theroyalglow.in` where required.
- [ ] Redirect URIs match Better Auth routes exactly.
- [ ] Session cookie uses `Secure`, `HttpOnly`, `SameSite=Lax`, and domain `.theroyalglow.in`.
- [ ] First sign-in routes incomplete customer profiles to onboarding.
- [ ] Admin role gates reject Customer and Staff roles.

### Transactional and marketing email

- [ ] Resend domain verification is green.
- [ ] `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are configured for calling workloads.
- [ ] Booking confirmation and invoice messages deliver to a real test mailbox.
- [ ] Resend webhook signature verification is enabled where webhooks are consumed.
- [ ] Brevo sender domain and templates are approved.
- [ ] Marketing consent gates Brevo enrolment and sends.
- [ ] Unsubscribe and suppression behavior is verified.

### Realtime and notifications

- [ ] Ably server key and browser subscription key are correctly scoped.
- [ ] Channel capabilities prevent customers from publishing privileged events.
- [ ] VAPID key pair and subject are configured.
- [ ] Web Push subscription, send, unsubscribe, and expired-subscription cleanup work.
- [ ] AiSensy API and webhook verification values are configured.
- [ ] WhatsApp templates required at launch are approved.

### Rate limiting and queue

- [ ] Upstash Redis production database is reachable from web and admin.
- [ ] `/api/services` returns the current Neon-backed catalogue without relying on Redis.
- [ ] Rate-limit keys and windows are production-safe.
- [ ] QStash token and both signing keys are configured.
- [ ] `.github/workflows/register-schedules.yml` registers the canonical schedule set.
- [ ] QStash callbacks target current production web/admin domains.
- [ ] Every scheduled job has the expected BetterStack heartbeat.

### Cloudflare R2

- [ ] Media/invoice and backup buckets exist.
- [ ] Workload credentials use least-privilege bucket access.
- [ ] Backup credentials are separate from DNS automation credentials.
- [ ] Public media/invoice hostname resolves and serves expected objects.
- [ ] CORS allows only required Royal Glow origins and methods.
- [ ] Lifecycle rules preserve required invoice and backup retention.
- [ ] `R2_PUBLIC_BASE_URL` is configured for `apps/invoicing`.

### Payload CMS on Render

- [ ] `apps/cms` Render service is healthy at `cms.theroyalglow.in`.
- [ ] `PAYLOAD_SECRET`, Neon URL, and R2 values are present in Render.
- [ ] `SERVICE_SYNC_ENABLED` is enabled after any seed or rollback operation.
- [ ] CMS CORS/CSRF origins include the customer site as required.
- [ ] Publishing a service updates the application catalogue.
- [ ] Payload sync updates `public.*`, `/api/revalidate` performs Next.js path revalidation, and direct-Neon `/api/services` reads reflect the change.
- [ ] Deferred cache note remains explicit: no Upstash catalogue invalidation exists until the planned five-minute cache is implemented.

### Invoicing on Google Cloud Run

`apps/invoicing` remains service `rgss-invoicing` in `asia-south1`. Deploy from the repository's configured source context:

```bash
gcloud run deploy rgss-invoicing --source . --region asia-south1
```

- [ ] Service scales to zero only if cold-start behavior is acceptable.
- [ ] `/healthz` returns healthy.
- [ ] `INVOICE_PDF_HMAC_SECRET` matches the admin caller.
- [ ] `R2_BUCKET_NAME`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` are configured.
- [ ] `R2_PUBLIC_BASE_URL` has no accidental path duplication or trailing-slash issue.
- [ ] Admin uses `INVOICING_SERVICE_URL`.
- [ ] A signed test request renders a PDF and returns a working R2 URL.

## T-48h - Operations Readiness

### Monitoring

- [ ] BetterStack monitors `https://theroyalglow.in/api/health`.
- [ ] BetterStack monitors `https://admin.theroyalglow.in/api/health`.
- [ ] BetterStack status page is reachable at `status.theroyalglow.in`.
- [ ] Sentry receives web and admin test errors in the correct projects/environment.
- [ ] Source maps resolve stack traces to application source.
- [ ] AWS logs are available for both Lambda applications.
- [ ] CloudFront/Lambda dashboards show 4xx, 5xx, duration, throttling, and cache signals.
- [ ] Render logs cover CMS; Cloud Run logs cover invoicing.
- [ ] Request IDs can correlate application errors and logs.
- [ ] Alert destinations and escalation path are tested.

Health endpoints must not expose secrets, database URLs, stack traces, or PII.

### Backup and recovery

- [ ] `.github/workflows/weekly-backup.yml` last run is green.
- [ ] Latest compressed dump exists in Cloudflare R2.
- [ ] Backup download and gzip integrity check succeeded.
- [ ] `.github/workflows/monthly-backup-test.yml` proved a recent restore.
- [ ] Pre-migration backup workflow is ready for destructive DDL.
- [ ] Neon point-in-time recovery steps are documented and accessible.
- [ ] Known-good application rollback ref is recorded.
- [ ] Owner knows feature-flag kill switches and incident contacts.

### Security and privacy

- [ ] CSP is delivered from the Next.js applications through CloudFront.
- [ ] CORS uses exact approved origins.
- [ ] HSTS and secure redirect behavior are correct.
- [ ] All API inputs use Zod validation.
- [ ] Rate limiting returns expected `429` responses without blocking normal traffic.
- [ ] Webhooks reject invalid signatures.
- [ ] File upload type and size restrictions are enforced.
- [ ] No secrets appear in client bundles, logs, source maps, or Git history.
- [ ] Cookie consent blocks PostHog, Clarity, and Meta until consent.
- [ ] Privacy, terms, and refund pages are published.
- [ ] DPDP consent records and deletion/export procedures are ready.

## Database Change Gate

When schema changes are part of the release, use this exact order:

```text
generate -> review -> commit -> migrate
```

- [ ] `bun run generate` produced the migration.
- [ ] Generated SQL was read and reviewed.
- [ ] Snapshot/journal and migration are committed with schema changes.
- [ ] `bun run drift:reference` updated the canonical reference when required.
- [ ] Destructive changes have a verified targeted R2 backup.
- [ ] Migration passed on `dev`.
- [ ] Migration passed on `test`.
- [ ] Migration passed on `pprd`.
- [ ] Production approval is recorded.
- [ ] Migration is applied to `prod` over `DATABASE_URL_UNPOOLED`.
- [ ] Post-migration fingerprint and business row-count checks pass.

Never use schema push against shared Neon branches. Never edit a committed migration; fix forward.

## T-24h - Quality Gates

### CI and automated validation

- [ ] `.github/workflows/ci.yml` is green.
- [ ] Type checks, lint, unit tests, and builds pass.
- [ ] Integration and Playwright suites pass against the intended environment.
- [ ] Lighthouse meets project thresholds: performance at least 95; accessibility, best practices, and SEO at 100.
- [ ] Load test meets latency and error-rate thresholds.
- [ ] Dependency and application security scans have no unaccepted high/critical findings.
- [ ] No pending migration or drift-gate failure exists.

### Critical customer journeys

- [ ] Homepage loads on mobile and desktop.
- [ ] `/?book=1&utm_source=gmb` opens the booking dialog and preserves attribution.
- [ ] `/book` remains the Meta lead form, not the normal booking route.
- [ ] Service catalogue reads current Payload-managed data.
- [ ] Availability returns valid slots.
- [ ] Google sign-in and onboarding work.
- [ ] Booking creation sends confirmation and appears in admin.
- [ ] Customer cancel and reschedule paths work.
- [ ] Profile and booking history enforce authentication.

### Critical admin journeys

- [ ] Admin login works at `admin.theroyalglow.in`.
- [ ] Role-based navigation and direct-route guards work.
- [ ] Receptionist can approve, assign, and progress a booking.
- [ ] Walk-in creation skips pending as designed.
- [ ] Completion creates invoice items with correct paise/GST math.
- [ ] Invoice renderer stores the PDF in R2 and Resend delivers it.
- [ ] Gems are awarded only for eligible service invoices.
- [ ] Membership sessions deduct hours and award no gems.
- [ ] Offer and gems combination rules are enforced.

### Performance verification

Measure real AWS paths. CloudFront accelerates static assets; SSR/API latency still includes Lambda and external services.

- [ ] LCP < 2.5 seconds at the target percentile.
- [ ] INP < 200 ms.
- [ ] CLS < 0.1.
- [ ] Lambda cold-start and warm duration are acceptable.
- [ ] CloudFront cache behavior matches static/dynamic route intent.
- [ ] Neon, Upstash, Payload, and Cloud Run calls stay within request budgets.
- [ ] No performance claim depends on Cloudflare proxying; production aliases are DNS-only.

## T-2h - Go/No-Go Review

### Final pprd smoke test

- [ ] Home, services, offers, contact, legal pages, and lead form load.
- [ ] Booking deep link opens the correct flow.
- [ ] Test booking reaches admin and can be completed.
- [ ] Confirmation and invoice emails arrive.
- [ ] Invoice PDF is readable from R2.
- [ ] QStash signature verification succeeds.
- [ ] Sentry has no unexplained new issues.
- [ ] BetterStack monitors and heartbeats are green.
- [ ] PostHog receives consented events.

### Go criteria

Proceed only if:

- CI and required quality gates pass;
- database migration and rollback implications are understood;
- web/admin SST Secrets and build variables are complete;
- DNS and certificates are healthy;
- CMS, invoicing, Neon, Upstash, QStash, Ably, Resend, and R2 are healthy;
- rollback ref and feature-flag kill switches are ready;
- no unresolved critical security, data-integrity, or booking-flow defect exists.

If any criterion fails, record owner and resolution. Do not launch on an undocumented exception.

## T-0 - Production Deployment

Production deployment runs through `.github/workflows/deploy-aws.yml`.

```text
1. Merge approved pprd changes into prod.
2. Confirm required CI and production approval gates.
3. Monitor deploy-aws.yml.
4. SST deploys web and admin with stage production.
5. Verify health and smoke tests.
6. Enable only approved PostHog flags.
```

Equivalent deployment command used by the workflow:

```bash
bunx sst deploy --stage production
```

Do not manually replace CloudFront, Lambda, S3, ACM, or DNS resources. Change `sst.config.ts`, review the diff, and deploy through SST.

### Immediate checks

- [ ] `https://theroyalglow.in` loads current release.
- [ ] `https://theroyalglow.in/api/health` returns healthy.
- [ ] `https://admin.theroyalglow.in` loads current release.
- [ ] `https://admin.theroyalglow.in/api/health` returns healthy.
- [ ] Google OAuth works on both expected entry points.
- [ ] No spike appears in CloudFront 5xx or Lambda errors/throttles.
- [ ] Sentry shows no release-blocking regression.
- [ ] BetterStack monitors remain green.
- [ ] CMS is healthy on Render.
- [ ] Invoicing is healthy on Cloud Run.
- [ ] Media and invoice objects remain accessible from R2.

No routine DNS cutover is required for a normal SST application release. If a domain record changed, verify Cloudflare DNS propagation and confirm the record remains DNS-only.

## Rollback

### Feature-only defect

Disable the relevant PostHog flag. Confirm the defect is no longer exposed, then prepare a normal fix.

### Application or infrastructure regression

Dispatch `.github/workflows/deploy-aws.yml` with the last known-good `git_ref`. Expected recovery is approximately 3-5 minutes. Re-run web/admin health checks and critical smoke tests.

Do not try to reverse SST-managed resources by hand.

### Database incident

An application rollback does not undo DDL. Stop harmful writes, assess compatibility, and use one of:

- a new forward migration;
- Neon point-in-time recovery to a validated branch;
- latest verified R2 dump for disaster recovery.

Require explicit approval before switching production database URLs.

### CMS or invoicing incident

Roll back the affected Render or Cloud Run service independently. Do not move those workloads during an incident.

## T+1h - Golden Path

Perform one controlled end-to-end transaction:

1. Open the site on a real mobile device.
2. Launch booking through the homepage dialog.
3. Select one service and valid slot.
4. Sign in and submit the booking.
5. Confirm email and admin visibility.
6. Approve, assign, start, and complete the booking in admin.
7. Record payment method.
8. Verify GST and total in paise.
9. Verify invoice PDF in R2 and email delivery.
10. Verify eligible gems transaction.
11. Verify Ably update and consented analytics events.

Then review BetterStack, Sentry, AWS logs/metrics, Neon, Upstash, QStash, Render, and Cloud Run.

## T+24h - Day-After Review

- [ ] Appointment reminder schedule ran and heartbeat arrived.
- [ ] Membership, offer, gems, cleanup, and reporting schedules ran as expected.
- [ ] No QStash endpoint targets a stale domain.
- [ ] Resend delivery and bounce metrics are acceptable.
- [ ] Brevo automation honors consent.
- [ ] PostHog booking funnel matches database counts within expected attribution differences.
- [ ] CloudFront/Lambda errors, durations, throttles, and costs are normal.
- [ ] Neon query latency and connections are normal.
- [ ] Upstash command usage and rate limiting are normal.
- [ ] CMS service sync has no drift.
- [ ] Cloud Run invoice success rate is normal.
- [ ] R2 object writes and reads are normal.
- [ ] Any incident or manual workaround is documented.

## Final Sign-Off

| Area | Required evidence |
|---|---|
| Product | Critical customer/admin journeys pass |
| Data | Migration, backup, and restore evidence exists |
| Security | No unaccepted critical finding; secrets and signatures verified |
| Reliability | Health checks, monitors, heartbeats, and rollback path verified |
| Performance | Lighthouse and runtime metrics meet targets |
| Compliance | Consent and legal pages verified |
| Operations | Owner accepts go/no-go result and rollback ref |

Record release SHA, workflow URL, migration version, approving person, feature-flag state, and any accepted risk in the release notes.
