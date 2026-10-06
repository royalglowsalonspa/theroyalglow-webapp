# M2GCP — Move `apps/web` + `apps/admin` to Google Cloud

> **M2GCP** = *Move to Google Cloud*. A compute-only alternative to
> [M2AWS](M2AWS.md), following its portability contract and phase structure.

| Item | Plan |
|---|---|
| Scope | Move web and admin from AWS SST to two Cloud Run services |
| Region | Proposed: `asia-southeast1` (Singapore), subject to latency validation |
| Edge | Global external Application Load Balancer, managed TLS; optional static-only Cloud CDN |
| Tooling | Docker, Artifact Registry, Terraform, GitHub Actions with Workload Identity Federation |
| Application changes | Container packaging and cache coordination required; preserve business contracts |
| Status | **Proposed; not implemented or deployed.** Repository and official documentation reviewed 2026-09-28 |
| Rollback | Retained, verified AWS deployment plus previous Cloud Run revisions; both must be rehearsed |

This document does not establish live account configuration, service health, cost, or
readiness. Historical status in M2AWS must be rechecked before implementation.

## 1. What runs where

| Component | Proposed location | Change |
|---|---|---|
| Web: `theroyalglow.in` | Cloud Run `rgss-web-<environment>` | Replace Lambda/OpenNext compute |
| Admin: `admin.theroyalglow.in` | Cloud Run `rgss-admin-<environment>` | Replace Lambda/OpenNext compute |
| `www.theroyalglow.in` | HTTPS redirect at the load balancer | Preserve path/query and apex redirect |
| CMS: `cms.theroyalglow.in` | Existing Render service | No move |
| Invoicing | Existing Cloud Run target | No move; verify actual deployment separately |
| Documentation | Existing hosted documentation | No move |
| DNS / media / invoice objects | Cloudflare DNS and R2 | Preserve zone and object URLs |
| Application database / CMS schema | Neon and existing environment branches | No export, restore, or driver swap |
| Rate limits / jobs / realtime / email | Upstash Redis, QStash, Ably, Resend | Preserve integrations |
| Errors / analytics / uptime | Sentry, PostHog, Better Stack | Preserve integrations |

One load balancer routes the web and admin hostnames to separate regional serverless
NEGs and Cloud Run services. The NEG and its Cloud Run service belong in the same
region. Cloud Run custom domain mapping remains a preview with production limitations;
use the recommended load-balancer path. Cloud CDN is a separate optional capability,
not something enabled by creating a Cloud Run service.
[Custom domains](https://docs.cloud.google.com/run/docs/mapping-custom-domains),
[serverless load balancing](https://docs.cloud.google.com/load-balancing/docs/https/setup-global-ext-https-serverless).

## 2. Why nothing else moves

Neon branching, Drizzle migrations, Payload's separate schema, QStash signatures,
R2 URLs, and shared authentication are application contracts. Replacing them with
Cloud SQL, Cloud Scheduler, Pub/Sub, or Cloud Storage would be separate migrations.
Keep external HTTPS connectivity; this design does not need a VPC connector or NAT
gateway merely to reach these providers.

The current implementation is [SST](../sst.config.ts) plus
[deploy-aws.yml](../.github/workflows/deploy-aws.yml). Both apps now declare Next.js
`16.3.5`; the root declares Bun `1.4.2`. Older AWS-plan versions are historical.
Neither current Next config enables standalone output, and there is no active
web/admin Dockerfile. Archived EC2 packaging is design input, not a working GCP build.
See [web configuration](../apps/web/next.config.ts),
[admin configuration](../apps/admin/next.config.ts), and [root manifest](../package.json).

## 3. Region choice — proposed Singapore

Use `asia-southeast1`, which Cloud Run lists as Singapore. Verify the actual Neon
branch and CMS locations before provisioning; proximity is a starting hypothesis,
not a measured latency guarantee. An India compute region alone does not relocate
stored customer data. [Cloud Run locations](https://docs.cloud.google.com/run/docs/locations).

Record AWS and candidate GCP p50/p95 server duration, cold/warm TTFB, database
round-trip latency, and Indian-user LCP on comparable requests. Proposed acceptance:
no more than 10% warm p95 regression and no failed booking/auth flows under the
agreed load. Reassess with four weeks of traffic before changing region or database.

## 4. Cost model

Do not carry over M2AWS's historical near-zero estimate. Price these items for the
selected region, traffic, retention, and billing account before provisioning:

| Cost driver | Budget input |
|---|---|
| Two Cloud Run services | CPU, memory, requests, startup time, minimum instances, concurrency |
| Global load balancer | Forwarding rules and traffic processing even at low request volume |
| Optional Cloud CDN | Cache egress, lookups, fills; compare against uncached delivery |
| Artifact Registry / builds | Stored image generations, build minutes, transfer |
| Logging / secrets / certificates | Retention, access volume, selected certificate resources |
| Parallel migration window | Retained AWS plus GCP and non-production environments |

The proposal starts with request-based billing and minimum instances zero in test;
measure cold starts before choosing production minimums. Minimum instances can
incur idle charges. If work must continue after a response, evaluate instance-based
billing and lifetime requirements rather than assuming request CPU stays allocated.
[Billing modes](https://docs.cloud.google.com/run/docs/configuring/billing-settings),
[minimum instances](https://docs.cloud.google.com/run/docs/configuring/min-instances).

Save estimates for idle, measured launch traffic, and 10x traffic using current
[Cloud Run rates](https://cloud.google.com/run/pricing),
[load-balancer rates](https://cloud.google.com/load-balancing/pricing), and
[Cloud CDN rates](https://cloud.google.com/cdn/pricing). Establish alerts at 50%,
80%, and 100% of the agreed monthly budget; alerts are not spending caps.

## 5. Phase 0 — Prerequisites

1. Confirm project, billing, regional quotas, operator access, and the existing invoice
   service's ownership. Keep new web/admin resources and permissions separately scoped.
2. Provision separate production and non-production boundaries, environment-specific
   Neon branches, secrets, domains, and external-service test credentials. No production
   notifications or schedule registration during candidate smoke tests.
3. Capture current AWS versions, SST state location, CloudFront origins/certificates,
   Cloudflare record IDs/values/TTL/proxy status/CAA, and a known-good source SHA.
4. Define Terraform remote state and locking, scoped deploy identities, Artifact Registry,
   required APIs, image retention, cost alerts, and an owner for rollback.
5. Set up GitHub OIDC through Workload Identity Federation with repository and
   environment/ref restrictions. Grant deployment and runtime identities separate
   permissions; do not use service-account JSON keys in CI.
   [Federated deployment pipelines](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines).
6. Read both app AGENTS files before later implementation. Use the installed Next.js
   `dist/docs/01-app/02-guides/self-hosting.md` guide for the pinned release.

Exit gate: cost estimate, resource ownership, environment mapping, and recovery
inventory recorded; no production DNS changes yet.

## 6. Phase 1 — Container and Cloud Run configuration

### Packaging

Create a reviewed root-context multi-stage Docker build for each app. Pin Bun to
the root `packageManager`, choose a compatible supported Node runtime, and record
base image digests. The current CI floats Bun; reconcile that difference in the new
pipeline instead of silently upgrading dependencies.

The build uses existing scripts from the repository root:

```bash
bun install --frozen-lockfile
bun run --filter=@rgss/web build
bun run --filter=@rgss/admin build
```

Each service builds its own app; the commands above show both targets. Preserve
admin's `prebuild` token check and the root lockfile/workspace dependency graph.
For compact production images, add and validate `output: 'standalone'` and monorepo
tracing in each app configuration as follow-up work. Copy the traced workspace tree,
each app's `public` and `.next/static`, and run the generated app server with Node.
Do not assume those artifacts already exist or copy only the app manifest.

Build Linux AMD64 images with compatible native dependencies; Cloud Run's runtime
contract specifies Linux x86_64. Run as a non-root user, bind `0.0.0.0:$PORT`, and
permit writable ephemeral cache space. Do not rely on that filesystem for durable
content. Exclude `.env*`, credentials, and local build output from the Docker context.
[Container contract](https://docs.cloud.google.com/run/docs/container-contract).

### Runtime and edge

Initial **test values**, to tune from measurements: 1 vCPU, 1 GiB memory, concurrency
8, minimum 0, maximum 3 instances per service, and a 60-second request timeout.
Bound external calls and verify the full QStash/invoice deadline chain. A provider
timeout does not undo completed writes; retain retry/idempotency behavior.

Configure a startup probe with a measured boot allowance and dependency-free
liveness. If an HTTP process probe is needed, add it as explicit implementation
work; the existing `/api/health` checks dependencies. Keep that deep endpoint for
release verification and monitoring so a Neon outage does not cause restart storms.
[Cloud Run probes](https://docs.cloud.google.com/run/docs/configuring/healthchecks).

Configure ingress as `internal-and-cloud-load-balancing` with public invocation
through the load balancer. Browsers and QStash do not supply Google IAM tokens;
retain Better Auth/RBAC and QStash signature verification inside the apps. Do not
put an interactive identity gateway in front of job endpoints. Verify direct
internet requests to the `run.app` origin cannot bypass the edge.
[Ingress](https://docs.cloud.google.com/run/docs/securing/ingress),
[public invocation](https://docs.cloud.google.com/run/docs/authenticating/public).

Keep CDN caching disabled initially. If added, use a distinct cache-enabled backend
and path rule limited to `/_next/static/*`; route everything else to uncached
backends. Never force-cache admin, APIs, auth, nonce-bearing HTML, cookies, or RSC
responses. Test host/protocol forwarding, redirects, CSP, image optimization,
streaming, and old browser tabs across deploys.
[Cloud CDN behavior](https://docs.cloud.google.com/cdn/docs/caching).

### Cache coordination is a release blocker

[CMS fetches](../apps/web/src/lib/cms/config.ts) use a one-hour tagged Next Data Cache;
[revalidation](../apps/web/src/app/api/revalidate/route.ts) invalidates tags and paths.
Ephemeral replicas do not automatically share this state. Implement and test a
shared cache/invalidation handler, namespace it by app/environment/build, and prevent
stale process-local entries. The existing Redis rate limiter is not already such a
handler. Reuse a suitable external backend only after checking limits and isolation.

Verify CMS changes across two warm replicas, replacement instances, and overlapping
revisions before production. A maximum of one instance alone does not prove safety
during revision overlap. Evaluate deployment IDs, retained static assets, and shared
Server Action encryption keys where applicable. This is why the plan does not
promise zero application changes. [Next self-hosting](https://nextjs.org/docs/app/guides/self-hosting).

## 7. Phase 2 — Secrets and environment

Derive the complete inventory from [web env](../apps/web/src/env.ts),
[admin env](../apps/admin/src/env.ts), and direct `process.env` consumers.
Map each variable to its app, environment, build/runtime phase, and owner.

| Group | Required handling |
|---|---|
| Database | Preserve pooled `DATABASE_URL`; supply a genuinely direct `DATABASE_URL_UNPOOLED` for admin and migration jobs |
| Shared auth | Identical `BETTER_AUTH_SECRET` and database within a web/admin environment pair; preserve Google credentials |
| Origins | App-specific `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL`; web's `NEXT_PUBLIC_ADMIN_URL` points to its paired admin |
| Cookies | Explicit `COOKIE_DOMAIN`; production remains `.theroyalglow.in` |
| Jobs | Preserve QStash token and current/next signing keys in admin; retain all variables required by web's validator too |
| Delivery | Configure admin `RESEND_API_KEY`, sender, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and intended report recipients |
| PDF | Admin `INVOICING_SERVICE_URL` and `INVOICE_PDF_HMAC_SECRET` must match the retained renderer |
| CMS | Web `NEXT_PUBLIC_CMS_URL` and `REVALIDATE_SECRET`; CMS `WEB_APP_URL`/revalidation secret stay consistent |
| Other services | Preserve Ably, Redis, R2, analytics, web/admin-specific Sentry DSNs, and enabled integrations |

Store runtime secrets in Secret Manager with per-service access. Reference explicit
secret versions so a revision rollback has predictable configuration; preserve old
versions through the recovery window. Never bake runtime secrets into Docker ARGs,
layers, or public variables. [Cloud Run secrets](https://docs.cloud.google.com/run/docs/configuring/services/secrets).

`NEXT_PUBLIC_*` values are build inputs. Build separate environment-specific images
from the **same validated commit** when origins or public keys differ; record both
SHA and image digest. An unchanged image cannot acquire new public values at startup.
Use secret mounts for any genuine build credentials and verify that no production
data is prerendered into artifacts. Keep `SKIP_ENV_VALIDATION` absent at runtime.

The [cookie helper](../packages/business/src/auth/cookie-domain.ts) defaults production
builds to `.theroyalglow.in`, including staging containers. Test shared login using
paired stable hosts on a separately controlled non-production parent domain, with
explicit cookie scope, isolated sessions and OAuth callbacks. Provider-generated
`run.app` URLs are insufficient for the real cross-subdomain login test.

## 8. Phase 3 — CI/CD

Proposed implementation files: `infra/gcp/` Terraform and container definitions,
`.github/workflows/deploy-gcp.yml`, and small Next packaging/cache changes. These
do not exist as a completed deployment as a result of this plan.

1. Preserve [promotion](../.github/workflows/promote.yml): merge reviewed work into
   `dev` once; advance the same SHA through `test → pprd → prod`. Production retains
   the workflow's maintainer confirmation. No promotion PRs or cherry-picks.
2. Add a deployment workflow accepting an exact `git_ref`, environment, and a deploy
   enable switch. Authenticate through OIDC, run relevant lint/types/unit checks and
   app builds, then publish immutable image digests labeled with the source SHA.
3. Explicitly dispatch candidate deployments for test/pprd and wait for their health
   and functional gates. Branch movement alone does not deploy a service.
4. Update the production dispatch to call the chosen GCP workflow with the validated
   SHA. It currently calls `deploy-aws.yml`; `GITHUB_TOKEN` pushes do not themselves
   start other push workflows. Preserve the separate release-processing dispatch.
5. Deploy candidates with no production traffic, probe them through an approved
   load-balancer test route, and promote the verified web/admin pair together. Save
   image digests, revisions, secret versions, and verification results. Serialize
   releases and retain the prior pair for rollback.
6. Keep Drizzle DDL in [migrate.yml](../.github/workflows/migrate.yml), using direct
   `DATABASE_URL_UNPOOLED` and forward migrations. Keep Payload migrations in their
   own workflow. No migrations on container startup or as a health check.

Cloud Run revision traffic controls support staged releases and rollback. Avoid
percentage splits until mixed-version assets, sessions, and cache behavior pass.
[Revision traffic management](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration).

## 9. Cutover and rollback

1. Complete disposable-environment tests: `/`, `/services`, `/book`, booking dialog,
   OAuth/One Tap, shared session/logout, admin role denials, availability and booking
   concurrency, actual invoice attachment, signed job plus invalid-signature rejection,
   CMS publish/revalidation, and media. Use controlled recipients and test records.
2. Inspect health **bodies**, not only status codes. Web can return HTTP 200 with
   `degraded` Redis/R2 checks; admin checks only database access. A successful job
   can also omit delivery or a PDF. Resolve or explicitly document baseline gaps.
3. Prepare certificates for apex, `www`, and admin using DNS authorization; validate
   TLS before routing users. Preserve CAA issuers needed by CMS, R2, mail-related and
   other existing hosts. [DNS-authorized certificates](https://docs.cloud.google.com/certificate-manager/docs/deploy-google-managed-dns-auth).
4. Freeze AWS automatic deployment before changing records. SST currently owns the
   production Cloudflare records: review a retain/import/state handoff so one owner
   controls each record. Do not remove SST domain blocks or destroy the stack as an
   improvised handoff; that can remove certificates, aliases, and recovery resources.
5. Rehearse AWS fallback with correct Host/SNI and production-compatible configuration.
   Keep its CloudFront aliases, certificates, deploy artifacts/state, and secrets
   viable. Lower TTL using the permitted value and wait out the old TTL; save exact
   restoration records. Keep Cloudflare authoritative and DNS-only for these hosts.
6. Switch only apex, `www`, and admin to the prepared load balancer. Preserve mail,
   CMS, R2, documentation, and other records. Confirm TLS, `www` redirect, cookies,
   health, real content, and signed delivery through the actual domains.
   Pause CMS publication during DNS convergence or authenticate invalidation to both
   platforms; the new GCP cache handler does not invalidate retained AWS caches.
7. QStash destinations stay the same when the admin hostname stays the same. Verify
   delivery/signatures/retries; do not create duplicate schedules. Allow for in-flight
   work and DNS propagation reaching both hosts.

Rollback immediately for broken auth, authorization bypass, duplicate/failed writes,
missing job delivery, stale published content, or sustained agreed latency/error
regression. For a GCP release defect, route both services to their previous verified
revisions. For platform/cutover failure, restore saved Cloudflare records to retained
AWS, stop candidate promotion, and verify the same functional gates. Reconcile
in-flight jobs and refresh AWS content caches before returning users; never restore
the database merely to roll back compute.

Retain AWS for a proposed seven-day observation period **and** a successful rollback
drill, whichever is later. Record measured recovery time; DNS recovery is not instant.
Only then plan retirement of AWS resources and resolve final infrastructure ownership.

## 10. Observability

Record app/environment/SHA/revision in structured logs; redact customer and credential
data. Collect Cloud Run errors, latency, instance count, memory and startup behavior,
load-balancer errors, cache effectiveness, QStash failures/retries, invoice/email
delivery outcomes, and costs. Keep Sentry and Better Stack monitors on stable domains.
Set log retention and alerts before launch. A test exception, controlled delivery,
and failed probe must reach the intended monitoring channel.

## 11. Known tradeoffs

- Load-balancer baseline costs can dominate low traffic despite scale-to-zero compute.
- Container ownership includes base-image patching, native dependencies, tracing,
  cache coordination, and rollout skew; SST previously supplied AWS-specific machinery.
- Cold starts and cross-provider calls require measurement. More replicas can overload
  a dependency faster; tune concurrency and maximum scale together.
- Invoicing already targeting Cloud Run does not validate these Next.js deployments.
- Provider rollback cannot reverse database writes, queued jobs, or sent notifications.

## 12. Portability contract

| Capability | AWS baseline | GCP proposal |
|---|---|---|
| SSR/API compute | SST/OpenNext Lambda | Two Node/Next Cloud Run containers |
| Secrets | SST-managed secrets | Secret Manager, explicit versions |
| Edge/TLS | CloudFront + ACM | External load balancer + Certificate Manager |
| Static caching | CloudFront | Optional narrowly scoped Cloud CDN |
| Next cache | SST/OpenNext-managed infrastructure | Explicit shared handler and invalidation design |
| Logs/metrics | CloudWatch | Cloud Logging / Cloud Monitoring |
| Unchanged contracts | Neon, R2, QStash, Ably, Resend, CMS, auth | Same services, URLs, units, and authorization |

Compare the same gates with [Azure](M2AZURE.md), [Render](M2RENDER.md),
[Railway](M2RAILWAY.md), and [Vercel](M2VERCEL.md). Provider features and prices linked
above were consulted on 2026-09-28 and must be rechecked at implementation time.

## 13. Progress checklist

- [ ] Confirm region, resource boundaries, quotas, budget, and current live baseline.
- [ ] Provision scoped OIDC, runtime identities, registry, state, and secret mappings.
- [ ] Build and verify both monorepo containers using the declared toolchain.
- [ ] Prove cache invalidation, scaling, revision overlap, assets, and graceful shutdown.
- [ ] Validate isolated paired domains, OAuth, shared cookies, jobs, and PDF delivery.
- [ ] Implement exact-SHA workflow dispatch and explicit environment deployment gates.
- [ ] Verify migration separation, runtime validation, health bodies, and monitoring.
- [ ] Prepare load balancer, certificates, CAA, and safe SST/DNS ownership handoff.
- [ ] Rehearse retained AWS rollback and record recovery time.
- [ ] Cut over stable domains and observe end-to-end behavior.
- [ ] Complete observation and recovery gates before separately retiring AWS.
