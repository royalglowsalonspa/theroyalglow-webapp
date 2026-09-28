# M2RAILWAY — Move `apps/web` + `apps/admin` to Railway

> **M2RAILWAY** = *Move to Railway*. A proposed compute migration following
> [M2AWS §12](M2AWS.md#12-portability-contract). Planning date: **2026-09-28**.
> No Railway service, workflow, credential or DNS change is made by this plan.

| Item | Proposed decision |
| --- | --- |
| Scope | Two Railway services replacing AWS SST compute for web/admin |
| Runtime | Railpack-built Node/Next.js processes with Bun workspace tooling |
| Account fit | Paid Pro workspace proposed for production; meter actual resource use |
| Region | Singapore; verify current region ID and Neon placement before provisioning |
| Data/services | Keep Neon, R2, Upstash, QStash, Ably, Resend, Render CMS and Cloud Run invoices |
| Status | Planned; no verified Railway deployment or rollback rehearsal yet |

## 1. What runs where

| Component | Target after cutover |
| --- | --- |
| `apps/web` | Railway `rgss-web` service at `theroyalglow.in` |
| `apps/admin` | Railway `rgss-admin` service at `admin.theroyalglow.in` |
| `www.theroyalglow.in` | Verified canonical redirect to the customer apex |
| `apps/cms` | Existing Render service; no blueprint reactivation for web/admin |
| `apps/invoicing` | Existing Cloud Run target and signed PDF protocol |
| Database | Existing environment-specific Neon branches |
| Objects | Existing R2 media/PDF buckets |
| Integrations | Existing Redis rate limiting, QStash jobs, Ably, Resend and telemetry |
| Authoritative DNS | Existing Cloudflare zone |

Use one Railway project with separately configured web/admin services in isolated
`dev`, `test`, `pprd` and `prod` environments as required. Production should run one
replica per app initially, with capacity verified under load. Additional replicas are a
later scaling decision that must satisfy the cache requirements in §6.

Both services run full Next.js SSR and route handlers. Admin remains the public HTTPS
destination for authenticated signed QStash callbacks; do not make it private networking
only or place an interactive login challenge in front of job endpoints.

## 2. Why nothing else moves

The existing [database client](../packages/db/src/index.ts) uses Neon over HTTP, and
integrations already cross hosting boundaries. A compute migration can preserve them.

- Keep Neon connections and branch mapping; create no Railway Postgres service.
- Keep Drizzle and Payload schema ownership and migration histories unchanged.
- Keep Upstash rate limiting; do not replace it with process memory or Railway Redis.
- Keep R2 objects and public media URLs; do not add a volume for uploaded files.
- Keep QStash schedules and signing keys; do not create duplicate Railway cron services.
- Keep Ably realtime, Resend delivery and Cloud Run HMAC invoice rendering.
- Keep Render CMS and its catalogue synchronization and web cache invalidation.

This leaves runtime packaging, configuration, caching, ingress and deployment controls
as the migration surface. It does not promise zero application changes: self-hosted
cache coordination and deployment compatibility need explicit implementation and tests.

## 3. Region choice

Propose the Railway Singapore region, currently documented as
`asia-southeast1-eqsg3a`. Confirm availability for the project before configuring both
services. Railway also offers regions in the US and Europe; select deliberately rather
than inheriting a default region.
[Railway regions](https://docs.railway.com/deployments/regions)

SST specifies Singapore and historical notes place Neon there. Verify actual Neon and
CMS placement from current configuration before relying on co-location. No database
move is included, and a closer compute region alone does not establish data residency.

Measure Indian-user TTFB, SSR p95, booking/API latency, Neon query round trips and CMS
fetches against retained AWS. Define tolerable regression before rollout and record
results. Start in one region; multi-region app replicas would still depend on the same
database region and require coordinated cache invalidation.

## 4. Cost model

Select a paid production plan with service limits and team controls appropriate to
this business. **Pro is the proposal**, not a claim that Hobby cannot run the app.
Current documented subscription minimums are $5/month for Hobby and $20/month for Pro,
each including that amount of resource usage. Usage above the credit costs extra.
[Railway pricing plans](https://docs.railway.com/pricing/plans)

The published usage model meters RAM, CPU, egress and storage. Estimate all services,
environments and deployment overlap using actual measurements, not the selected resource
ceiling. For example, continuously averaging 1 GB RAM across each of two apps totals
about $20/month at the published $10/GB-month RAM rate, before CPU and network use.
This is an illustrative calculation, not the complete Pro bill.
[Railway pricing](https://railway.com/pricing)

Budget retained AWS, external cache capacity, build activity where billable, logs and
the unchanged SaaS services separately. Do not add the included subscription credit
twice when estimating totals. Set alerts and agree whether a spending limit that stops
services is acceptable; a cost guardrail is not an availability guarantee.

Verify rates and allowances again before implementation. Keep production services
continuously available for customer requests and signed jobs; do not base the design
on free credits, trial capacity or optional sleeping behavior.

## 5. Phase 0 — Prerequisites

1. Record the validated AWS release, both application origins, SST state and DNS records.
   Establish a secure inventory of secrets and a tested restoration procedure.
2. Create or select the Railway workspace/project and record ownership, billing,
   environment access controls and deployment token scope.
3. Read the [web README](../apps/web/README.md), [admin README](../apps/admin/README.md),
   environment validators, auth helpers and signed-job/delivery implementation.
4. Reconcile tooling: manifests currently specify Next.js **16.3.5** and Bun **1.4.2**.
   Existing AWS CI floats Bun; the implementation must align validation and builds to
   the chosen version instead of silently introducing two different toolchains.
5. Pin a maintained Node release compatible with installed Next.js and native packages.
   Verify Linux builds and production runtime, including image processing and signals.
6. Define isolated test data, OAuth configuration and allowed notification recipients.
   Ensure previews cannot use production cookies, schedules or credentials.
7. Define cache policy, latency/error thresholds, deployment owner and rollback window.

This is a planning inventory, not proof that accounts or optional provider integrations
are enabled. Treat comments in old migration documents as historical context.

## 6. Phase 1 — Railway configuration

Use **two services with the repository root as build context**. This monorepo shares
workspace packages outside each app directory; setting the service root to `apps/web`
or `apps/admin` without preserving those files is not the proposed setup.
[Railway monorepos](https://docs.railway.com/deployments/monorepo)

| Setting | Web service | Admin service |
| --- | --- | --- |
| Builder | Railpack | Railpack |
| Install | `bun install --frozen-lockfile` | `bun install --frozen-lockfile` |
| Build | `bun run --filter=@rgss/web build` | `bun run --filter=@rgss/admin build` |
| Start from root | `cd apps/web && bun run start:prod` | `cd apps/admin && bun run start:prod` |
| Healthcheck | `/api/health` | `/api/health` |
| Initial replicas | 1 | 1 |
| Volumes / scheduled starts | None | None |

Record per-service build/start overrides in separate configuration files during
implementation, for example future `infra/railway/web.json` and `admin.json`, and select
each service's config path explicitly. These files are proposed and are not present
because this task only writes plans. Keep GitHub autodeploy disabled.

Railpack understands Bun workspaces and reads `packageManager` for Bun version selection.
Set a tested `RAILPACK_NODE_VERSION`; inspect generated install/build/runtime plans to
verify the frozen lockfile command and both Node/Bun availability. If automatic Next
optimization/pruning drops shared packages or required scripts, use an explicit reviewed
Docker build instead of accepting incomplete output.
[Railpack Node/Bun support](https://railpack.com/languages/node)

Preserve admin's prebuild token assertion and verify its execution in the build log.
Bun workspace filtering does not invoke Turbo dependency builds automatically: inspect
package exports and build requirements. The production scripts consume Railway's
`PORT`; verify `0.0.0.0` binding, public target port and healthcheck port agree.

### Cache consistency and release overlap

Read the [Next self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting) and version-matched
`apps/web/node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`.
Neither current Next config implements a distributed cache. Railway's ephemeral
filesystem and multiple deployments do not reproduce SST/OpenNext's ISR infrastructure.

Implement a shared cache with distributed tag invalidation before enabling replicas,
or adopt a reviewed uncached strategy for content that requires immediate updates.
Cache namespaces must separate app/environment/build; invalidations must reach every
serving instance. Existing Upstash credentials alone do not implement a cache handler;
review capacity, eviction and rate-limit isolation before reusing that service.

Even one configured replica overlaps old/new deployment processes and may overlap AWS
during DNS cutover. Test CMS publication, `/api/revalidate`, restart/cache loss and
repeated requests through every serving version. Freeze CMS publication during the
AWS/Railway transition or provide authenticated invalidation to both platforms.

Use identical build artifacts for replicas of a release. Assess build-time
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, `deploymentId` and old-asset retention; test clients
opened before deployment for action/navigation failures. A stable encryption key alone
does not make changed action IDs or missing asset files compatible.

Configure a measured termination grace period, initially propose 30 seconds, and test
QStash requests during rollout. Railway exposes overlap and draining controls; defaults
must not be mistaken for a sufficient grace period.
[Deployment teardown](https://docs.railway.com/deployments/deployment-teardown)

Do not attach a volume as a distributed-cache shortcut. Begin without additional HTML
edge caching; preserve private/no-store semantics for auth, account, job and mutation
routes. Verify RSC variants, image optimization, streaming and request limits in staging.

## 7. Phase 2 — Secrets and environment

Create separate variable sets for each environment and app; use shared variable references
only for credentials that must be identical. Protect Railway deployment tokens in GitHub
environment secrets. Record variable names and owners, never values, in source control.

| Category | Required mapping |
| --- | --- |
| Database | Existing branch `DATABASE_URL`; real direct `DATABASE_URL_UNPOOLED` for admin |
| Auth | Identical `BETTER_AUTH_SECRET`, Google OAuth credentials and cookie policy |
| App origins | Different `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` for web/admin |
| QStash | Token, current/next signing keys, internal-job secret and unchanged targets |
| Delivery | Admin Resend key, VAPID key pair/subject, configured sender/report destinations |
| Content/storage | R2 configuration, CMS URL, public media URL and web revalidation secret |
| Invoices | Existing Cloud Run URL/HMAC where configured; verify actual PDF behavior |
| Monitoring | App-specific DSNs, release SHA, existing heartbeats and analytics variables |

Inventory direct `process.env` reads in addition to the validators. Admin notification
providers can skip delivery when Resend/VAPID are absent even when jobs return success.
Web's `REVALIDATE_SECRET` must match CMS. Do not trust the dormant Render templates as
the complete variable list or change them for a Railway migration.

Supply browser-safe `NEXT_PUBLIC_*` variables before each production build. They are
compiled into assets; runtime changes do not rewrite bundles. Web/admin origins differ,
as do the web `NEXT_PUBLIC_SENTRY_DSN` and optional admin `NEXT_PUBLIC_ADMIN_SENTRY_DSN`.
Both current validators normalize empty strings; absent optional values remain preferable
because integrations also read the environment directly.

Do not leave `SKIP_ENV_VALIDATION` enabled in the running service. Use a build-only bypass
only when justified and verify the runtime with all required values. If build code fetches
CMS content, make that access deliberate and protect any build credentials.

Production auth shares `.theroyalglow.in` cookies and the existing database across both
apps and retained AWS. Set staging `COOKIE_DOMAIN` explicitly on both apps and use sibling
hosts under a separate registrable parent with approved OAuth callbacks. Nested production
subdomains still receive parent-domain production cookies. Provider preview URLs cannot
prove cross-app sessions; never expose production cookies/data to untrusted previews.

## 8. Phase 3 — CI/CD

Retain **`dev → test → pprd → prod`** through
[`promote.yml`](../.github/workflows/promote.yml), including maintainer confirmation.
Add a future Railway deployment workflow accepting an exact `git_ref`, with environment
gates, deployment serialization, a kill switch and recorded project/environment/service IDs.
Add explicit test/pprd deploy-and-wait gates before advancing environments; promoting a
branch alone does not validate either service. Build the same source SHA with environment-
specific public variables, record each artifact, and reuse it for replicas in that environment.

The promotion workflow currently dispatches `deploy-aws.yml` explicitly after advancing
`prod` with `GITHUB_TOKEN`. Update that dispatch deliberately when Railway is selected;
a branch push alone is not the new deployment trigger. Coordinate the AWS enable switch
and DNS ownership so the old workflow cannot undo cutover.

Disable service GitHub autodeploys, including deployment on unvalidated branch updates.
Railway has “Wait for CI”, but a separate exact-commit workflow is the proposed control.
[Autodeploy controls](https://docs.railway.com/deployments/github-autodeploys)

Run applicable lint, types, unit tests, audit and both app builds; use disposable resources
for live checks. Check out the approved SHA in a clean CI workspace, then deploy that
root workspace to explicit service/environment IDs with a pinned Railway CLI and scoped
project token. Exclude local secrets and unrelated generated artifacts from uploads.
Record the source SHA and resulting deployment IDs for both services.

`railway up --ci` finishes after the build stage; it does not prove the new service is
healthy or receiving traffic. Poll deployment state and inspect service-specific health
and functional results afterward. Do not use “Deploy Latest Commit” for this release path.
[CLI deployment behavior](https://docs.railway.com/cli/deploying)

Deploy and validate a compatible web/admin pair. A partial rollout must halt and restore
the previous compatible pair if needed. Database migrations remain in their existing
forward-only workflow; do not add migration or schedule-registration startup commands.

## 9. Phase 4 — Cutover and rollback

### Rehearsal

1. Deploy to an isolated environment and verify health bodies, both application routes,
   role restrictions, booking conflicts and cross-app session continuity.
2. Exercise controlled signed QStash calls, invalid signatures, retries and idempotency.
   Verify actual notification receipt and invoice attachment behavior with test recipients.
3. Verify CMS publication across cache loss, replica/release overlap and image rendering.
4. Configure custom domains and confirm provider-issued targets, TLS and required CAA
   authorization. Test the `www` canonical redirect explicitly.
5. Rehearse routing back to retained AWS at the last compatible release and secret versions.
   Validate user flows and signed-job delivery through that fallback.

### DNS ownership and switch

Cloudflare stays authoritative. Export apex, `www`, admin and relevant certificate records;
reduce applicable TTLs in advance. SST currently owns the application aliases and some
certificate-related records. Implement a reviewed SST/Pulumi ownership handoff that
preserves retained AWS resources and prevents future reconciliation overwriting Railway.
Keep CMS, R2, mail and unrelated validation records unchanged.

Freeze deployment changes, attach and verify Railway custom domains, then change only
the application records to current dashboard-provided targets. Verify Cloudflare proxy,
TLS and caching behavior intentionally; do not change nameservers or apply blanket HTML
caching. Preserve canonical URLs, Google OAuth callbacks and QStash target URLs.
[Railway public networking](https://docs.railway.com/networking/public-networking)

Observe both providers during DNS convergence. Shared Neon/auth credentials permit
overlap, but verify application compatibility, active sessions and cache freshness.
Record the exact switch time, both SHAs and DNS values for incident response.

### Rollback

Set thresholds for errors, latency, auth, booking and delivery before the switch. On a
breach, halt further deployment, restore saved DNS records to the tested AWS targets,
verify TLS and both application flows, then reconcile signed-job retries without adding
duplicate schedules. Routine compute rollback never restores the shared database.

Railway release rollback is a separate tool for a bad build and is constrained by plan
image retention. Keep source, tested toolchain and configuration available for rebuilding;
check the retained deployment before relying on a rollback button. A platform outage
requires the AWS fallback, not a redeploy on the same platform.

Retain AWS through an agreed observation window, proposed seven days and at least one
scheduled-job cycle, then retire it in a separate reviewed change. Dormant Render services
are not an additional tested fallback and must not be activated opportunistically.

## 10. Observability and verification

Railway healthchecks wait for a successful 2xx response before activating a deployment;
they are **not continuous monitoring after activation**. Configure `/api/health`, verify
the injected `PORT`, and confirm the healthcheck hostname is accepted by routing.
[Railway healthchecks](https://docs.railway.com/deployments/healthchecks)

Web reports HTTP 200 even if optional Redis/R2 checks are degraded; admin only pings
Neon. Inspect web JSON and configured dependency results, not just the HTTP code.
Neither endpoint proves OAuth, role enforcement, email/push delivery, invoice rendering
or the freshness of CMS content.

Keep external Better Stack uptime checks, configured Sentry, structured logs and QStash
heartbeats. Track source/deployment ID, service, environment, replica, region, memory,
CPU, restarts, 5xx, p95 latency and delivery outcomes. Validate current Sentry server
initialization on the new runtime before rewriting instrumentation.

Alert on an unhealthy public endpoint, job/delivery failures, repeated OOM/restarts and
unexpected spending. Test notification routing and log retention; provider dashboards
and “build succeeded” are not substitutes for user-facing checks.

## 11. Tradeoffs and decision gate

Railway gives two independently managed Node services and usage-based resource billing.
Operational work still includes cache coordination, release compatibility, external
uptime checks and expense controls. Multi-region replicas would increase the surface
without moving the shared database closer to every region.

Proceed only after measured runtime costs and performance, signed jobs, shared auth,
cache freshness and the AWS rollback rehearsal meet agreed requirements. Resolve
observed provider outages separately; do not inherit old AWS-plan incident descriptions
as current facts or enlarge this task into a data/service migration.

## 12. Portability contract

| Capability | AWS baseline | Railway replacement |
| --- | --- | --- |
| Next.js hosting | SST/OpenNext Lambda | Two separately configured Node services |
| Secret delivery | SST secrets | Scoped Railway variables and CI deployment token |
| TLS/ingress | CloudFront + ACM | Railway public ingress/TLS; reviewed caching policy |
| Logs/metrics | CloudWatch | Railway logs/metrics plus retained external monitoring |
| Cache/invalidation | OpenNext-managed infrastructure | Explicit tested self-hosted policy |

Preserve public URLs, cookie contracts, Neon schema/data, R2 object keys, QStash signatures,
CMS hooks and invoice HMAC requests. Keep provider-specific settings outside business
logic. Recheck features, pricing and account limits during implementation preflight.

## 13. Progress checklist

- [ ] Inventory AWS state, source SHA, DNS and secrets; verify actual dependency health.
- [ ] Select paid plan, project ownership, region, runtime pins and budget controls.
- [ ] Configure separate root-context services and isolated environments.
- [ ] Validate full build/runtime variable inventories and cross-app sessions.
- [ ] Implement/test cache coordination, release overlap, signals and asset compatibility.
- [ ] Add exact-SHA CI deployment and update explicit promotion dispatch.
- [ ] Pass app builds and relevant checks; verify actual delivery with isolated test data.
- [ ] Verify external monitoring, TLS, redirects and health-body interpretation.
- [ ] Rehearse DNS ownership handoff and retained AWS restoration.
- [ ] Cut over, observe and separately review AWS retirement after the rollback window.
