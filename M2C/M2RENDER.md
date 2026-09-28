# M2RENDER — Move `apps/web` + `apps/admin` to Render

> **M2RENDER** = *Move to Render*. A proposed compute migration following
> [M2AWS §12](M2AWS.md#12-portability-contract). Planning date: **2026-09-28**.
> This document does not deploy services or establish current account state.

| Item | Proposed decision |
| --- | --- |
| Scope | Replace AWS SST hosting for web/admin with two paid Render web services |
| Runtime | Native Node runtime; Bun workspace installation; `next start` |
| Region | Singapore, subject to measured latency and actual Neon region verification |
| Data/services | Existing Neon, R2, Upstash, QStash, Resend, Ably, CMS and invoicing stay |
| Status | Planned; dormant Render definitions are inputs, not a tested fallback |
| Release gate | Exact validated commit, functional verification and rehearsed AWS rollback |

## 1. What runs where

| Component | Target after cutover |
| --- | --- |
| `apps/web` | Dedicated paid web service; `theroyalglow.in` and apex redirect from `www` |
| `apps/admin` | Separate paid web service; `admin.theroyalglow.in`, including signed jobs |
| `apps/cms` | Existing Render service and Payload migration ownership |
| `apps/invoicing` | Existing Google Cloud Run target; verify live configuration separately |
| Database | Existing environment-specific Neon branches and Drizzle/Payload schemas |
| Media/PDF objects | Existing Cloudflare R2 buckets |
| Other dependencies | Existing Upstash Redis, QStash, Ably, Resend and monitoring providers |
| DNS | Cloudflare remains authoritative; application record ownership changes explicitly |

Render hosts the complete Next.js applications, including SSR, route handlers,
image optimization and assets. These are web services, not static exports.
Use independent service identities, configuration and deployment results for the two apps.

The implementation baseline is [SST](../sst.config.ts), the
[Render blueprint](../infra/render/render.yaml), and the app manifests.
The blueprint describes CMS plus dormant `rgss-web`/`rgss-admin` templates with
automatic deployment disabled. Confirm dashboard suspension and service IDs before reuse.

## 2. Why nothing else moves

This change replaces compute and its deployment controls. Keeping provider contracts
reduces the change to request handling, build output, cache behavior and operations.

- Keep `@rgss/db` on its existing Neon HTTP driver. No schema, data copy or database restore
  belongs in the normal migration or rollback path.
- Keep R2 endpoints and object keys; do not move uploads to a Render filesystem.
- Keep Upstash rate limiting and QStash delivery. Do not create Render cron jobs for the
  same schedules or run schedule registration on every application start.
- Keep Ably and Resend credentials and application integrations.
- Keep CMS catalogue synchronization and its authenticated web revalidation callback.
- Keep Cloud Run PDF rendering and HMAC verification, including current optionality.

Existing templates reduce setup work; they do not prove compatibility, complete secrets,
runtime capacity or recovery. In particular, do not copy the CMS migration-at-start
command into web/admin, or alter CMS service settings as part of reactivating these apps.

## 3. Region choice

Propose **Singapore** for both services. Render lists Singapore among its supported
regions, and changing an existing service's region requires creating a new service.
Confirm region before deciding whether to reuse dormant services.
[Render regions](https://render.com/docs/regions)

SST currently specifies `ap-southeast-1`; the Render template specifies `singapore`.
The historical AWS plan says Neon is in Singapore, but verify the actual project region
without exposing its connection string before treating that as evidence.

Compare Indian-user p50/p95 TTFB, warm SSR, Neon round-trip latency and CMS fetch latency
against an AWS baseline. Proposed acceptance: no material regression in booking/admin
latency and error rate under representative load. Record thresholds before rehearsal.
Keeping the database means this compute move is not a data residency migration.

## 4. Cost model

Use paid, continuously available instances for customer traffic and QStash receivers.
Free web services can sleep after 15 minutes and share a workspace allowance of 750
instance hours; that is not the production design here.
[Free service limitations](https://render.com/docs/free)

Illustrative list-price snapshot checked **2026-09-28**, excluding tax and other vendors:

| Configuration | Monthly compute before extras | Use |
| --- | --- | --- |
| Two `0.5c-512mb` services | $14 | Lowest paid sizing candidate; memory/load validation required |
| Two `1c-2g` services | $50 | Initial production sizing proposal with more memory headroom |
| Additional replicas or environments | Add each service's running compute | Budget explicitly |

Render's current IDs correspond to legacy Starter and Standard respectively. Workspace
subscription, bandwidth, build minutes and domain allowances are separate cost dimensions.
The listed Pro workspace fee is $25/month; select workspace features deliberately.
[Compute plans](https://render.com/docs/compute-plans),
[Render pricing](https://render.com/pricing)

Budget also for cache coordination, retained AWS during the rollback window, dependency
charges and log retention. These figures are sizing examples, not measured workload bills.
Set billing alerts and review one week of CPU, memory, egress and build consumption.

## 5. Phase 0 — Prerequisites

1. Inventory the current AWS release, SST/Pulumi state, CloudFront aliases, TLS and Cloudflare
   records. Capture a restoration procedure and current secret versions securely.
2. Inspect Render ownership, billing, service suspension, region, custom domains and
   blueprint linkage. Do not create duplicate services accidentally.
3. Read [web](../apps/web/README.md) and [admin](../apps/admin/README.md), their environment
   validators, auth setup and signed-job handlers. Inspect real delivery dependencies.
4. Record the source commit and toolchain: current manifests use Next.js **16.3.5** and
   root `packageManager` specifies Bun **1.4.2**. Resolve the current CI floating-Bun
   behavior in the implementation PR so validation and deployment use the same version.
5. Select and pin a compatible maintained Node version; verify it against the installed
   Next package and Linux native dependencies before rollout.
6. Create isolated staging configuration and test recipients. Restrict staging access;
   never let duplicate environments consume production schedules or send production mail.
7. Agree availability thresholds, rollout owner, rollback window and cache design.

All implementation tasks below remain future work. A green historical AWS build or an
existing Render service entry is not a completed prerequisite for this migration.

## 6. Phase 1 — Render configuration

Review a narrowly scoped update of the web/admin entries in
[`infra/render/render.yaml`](../infra/render/render.yaml), retaining CMS configuration.
Confirm its custom Blueprint Path before syncing. Keep `autoDeployTrigger: off` for both
apps. Retain repository root as the build root so shared packages and `bun.lock` are available;
Render excludes files outside an explicitly selected root directory.
[Monorepo support](https://render.com/docs/monorepo-support)

| Setting | Web | Admin |
| --- | --- | --- |
| Runtime | `node` | `node` |
| Root | Repository root | Repository root |
| Region / initial replicas | `singapore` / 1 | `singapore` / 1 |
| Compute proposal | `1c-2g` | `1c-2g` |
| Build | `bun install --frozen-lockfile && bun run --filter=@rgss/web build` | `bun install --frozen-lockfile && bun run --filter=@rgss/admin build` |
| Start | `cd apps/web && bun run start:prod` | `cd apps/admin && bun run start:prod` |
| Health path | `/api/health` | `/api/health` |

Set `BUN_VERSION=1.4.2` rather than inheriting the template's `latest`, and record the
tested Node pin. Render supports an explicit Bun version.
[Bun version configuration](https://render.com/docs/bun-version)

The existing `start:prod` scripts consume `$PORT`; verify binding to `0.0.0.0` and signal
propagation. Preserve admin's `prebuild` token assertion. Bun's filtered script call does
not itself run Turbo's dependency graph: inspect shared package exports and any build
scripts instead of copying the blueprint comment that implies it does.

### Next.js cache, deployment overlap and assets

Neither current Next config defines shared cache coordination. SST/OpenNext's DynamoDB/SQS
cache machinery does not transfer to `next start`. Read the [Next self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting)
and the version-matched `apps/web/node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`.

Before production, implement and test one explicit policy: a shared external Next cache
with distributed tag invalidation, or a reviewed uncached strategy for affected content
reads. Reusing Upstash requires capacity and eviction isolation from rate limiting; it
is not configured merely because Redis credentials already exist.

Use cache namespaces for app/environment/build, shared invalidation state, and controlled
memory caching. Verify CMS `/api/revalidate` updates every serving instance and survives
restart. One steady-state replica does not remove old/new deployment overlap or AWS/Render
DNS overlap. During initial cutover, pause content publication or invalidate both platforms
until old traffic drains. Rehearse both invalidation and recovery after cache loss.

Replicas of one release must serve identical build output. Assess a stable build-time
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` and `deploymentId`, retain required old assets, and
test a browser opened before deployment. Do not promise uninterrupted Server Actions
merely because the load balancer has switched successfully.

Do not attach a persistent disk to solve distributed caching. Start without HTML edge
caching; preserve Next.js cache headers and never cache authenticated routes, mutations,
QStash callbacks or health responses. Validate images, RSC navigation and streaming.

## 7. Phase 2 — Secrets and environment

Build a per-app variable inventory from both `env.ts` files, direct `process.env` reads,
SST configuration and notification providers. Use Render secret environment configuration
and GitHub environment secrets for deployment credentials; commit names, never values.

| Category | Required treatment |
| --- | --- |
| Database | Same environment's `DATABASE_URL`; admin also needs real direct `DATABASE_URL_UNPOOLED` |
| Sessions | Byte-identical `BETTER_AUTH_SECRET` across web/admin and retained AWS |
| Origins | App-specific `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL`; correct admin link URL |
| OAuth | Same Google client settings and authorized callback/origin configuration |
| Jobs | QStash publishing token, current/next signing keys and internal-job credentials |
| Delivery | Admin `RESEND_API_KEY`, VAPID pair/subject and configured report destinations |
| CMS | Web `REVALIDATE_SECRET` must match existing CMS; retain CMS/public media URLs |
| Invoicing | Existing service URL and matching HMAC secret, if configured |
| Observability | App-specific DSNs, release SHA, heartbeats and existing analytics variables |

`NEXT_PUBLIC_*` values are build inputs and browser-visible; supply the correct values
before building each service. Rebuild when these change. Web uses `NEXT_PUBLIC_SENTRY_DSN`;
admin uses optional `NEXT_PUBLIC_ADMIN_SENTRY_DSN`. The dormant template's required-Sentry
comment is stale. Both validators now use `emptyStringAsUndefined`, but leave unused
optional values absent because some integrations read the environment directly.

Never keep `SKIP_ENV_VALIDATION` enabled at runtime. If a build-only bypass is needed,
scope it to that build command and test the production process with validation enabled.
Build-time CMS reads require deliberate credentials and trusted build infrastructure.

Production cookie scope must remain `.theroyalglow.in` through the shared auth helper.
For staging, set explicit `COOKIE_DOMAIN` on both apps and use sibling hosts under a
separate registrable parent with approved OAuth callbacks. Nested production subdomains
still receive parent-domain production cookies. Provider preview URLs alone cannot prove
shared sessions; exclude untrusted previews from production cookie scope and data.

## 8. Phase 3 — CI/CD

Preserve **`dev → test → pprd → prod`** through
[`promote.yml`](../.github/workflows/promote.yml), including its production confirmation.
Implement a separate Render deployment workflow with exact `git_ref`, environment-scoped
credentials, serialized deployments, an enable switch and recorded service/deploy IDs.
Add explicit test/pprd deploy-and-wait verification gates before advancing to the next
environment; a branch promotion alone does not deploy or validate either app. Build the
same source SHA with each environment's public variables and record its artifact identity;
replicas within that environment share the artifact, while environment builds can differ.

The existing promotion uses a `GITHUB_TOKEN` push and explicitly dispatches
`deploy-aws.yml`; it will not automatically dispatch the new workflow. Update that explicit
dispatch when the target is selected, and coordinate the AWS enable switch so competing
workflows cannot reclaim DNS or advance the old platform during cutover.

Run relevant lint, types, unit checks, audit and both production builds before deployment.
Use Render's API or CLI to deploy each service by the validated commit SHA, keep automatic
deploys off, and poll actual deployment status. Avoid a deploy-latest operation or an
unqualified deploy hook. Render's “After CI Checks Pass” also accepts skipped/neutral
GitHub conclusions, so it is not the proposed release gate.
[Deployment controls](https://render.com/docs/deploys)

Record separate web/admin outcomes. If one service fails, halt promotion and use the
tested compatible pair. Keep database migration workflows separate; this compute change
requires no new schema migration. Do not execute DDL or seeds in build/start commands.

## 9. Phase 4 — Cutover and rollback

### Before changing customer DNS

1. Deploy the validated pair to staging and verify health bodies, login, role guards,
   booking conflicts, staff updates, R2 images and cross-app session continuity.
2. Verify a controlled signed-job delivery, rejected invalid signatures, retries and
   idempotency using isolated test data. Check actual email/push receipt and invoice
   attachment behavior; do not infer delivery from HTTP 200 or heartbeat success.
3. Publish a CMS test edit and verify cache invalidation across overlap/restarts.
4. Test domains, managed TLS and the `www` redirect using provider instructions. Review
   existing CAA authorization; preserve unrelated certificate validation records.
5. Rehearse rollback to retained AWS at the last compatible SHA with current secrets.
   Verify both AWS origins and application behavior, not only stored infrastructure.

### Switch traffic

Freeze deployments, reduce applicable DNS TTLs in advance, and export exact records.
SST currently owns Cloudflare application aliases and certificate-related records.
Implement and review a Pulumi/SST ownership handoff that preserves resources while
preventing later AWS deployments from restoring old aliases. Do not edit DNS underneath
an actively reconciling stack. Keep the CMS, R2 and mail records untouched.

Attach and verify Render domains, then update only apex, `www` and admin records using
Render's current dashboard-provided targets. Cloudflare proxy/TLS mode must be tested;
do not enable broad caching or change nameservers. Keep canonical URLs and QStash target
URLs stable, verify real OAuth callbacks, and monitor both providers during DNS convergence.
[Custom domains](https://render.com/docs/custom-domains)

### Rollback trigger and action

Before launch, define error, latency, auth, booking and delivery thresholds. If breached,
stop further rollout, restore the saved Cloudflare records to the tested AWS targets,
verify TLS and both apps, and prevent Render from automatically replacing releases.
Keep the shared database and credentials compatible while both stacks serve traffic.
Reconcile pending QStash retries without duplicating schedules or notifications.

Retain AWS and its known-good release through the agreed observation window, proposed
seven days plus at least one scheduled-job cycle. A Render rollback is useful for a bad
release but does not replace a tested platform fallback. Never roll back the database as
part of a routine compute rollback. Retire AWS only in a separate reviewed change.

## 10. Observability and verification

Render checks HTTP health continuously and before switching deployments, accepting
2xx/3xx. It can restart failing running instances; a failed new release leaves the old
instances serving if readiness never succeeds.
[Health checks](https://render.com/docs/health-checks)

Web health returns HTTP 200 for degraded Redis/R2 and reports skips for missing optional
probes; admin health only checks Neon. Require `database: pass` on web and inspect all
configured components. These endpoints do not verify OAuth, billing or notification delivery.
Frequent probes can also affect database idle behavior; measure that cost.

Keep Better Stack external checks, Sentry where configured, structured logs and job
heartbeats. Record source SHA, latency, 5xx, memory/OOM, restart counts, deployment time,
cache freshness and job delivery outcomes. Verify Sentry's existing server initialization
on Node before changing instrumentation. Set actionable alerts and log retention.

## 11. Tradeoffs and decision gate

Render offers a familiar operational model alongside CMS and straightforward long-lived
Node processes. Paid instances introduce a compute floor; replicas and cache coordination
add costs. The existing free templates cannot establish production capacity or readiness.

Proceed only when measured performance, budget, release controls, shared auth, cache
freshness and rollback meet agreed targets. DNS, caching and session failures can occur
even when both deployments are marked healthy. Any existing dependency outage remains
a separate issue to verify; historical AWS incident notes are not current evidence.

## 12. Portability contract

| Capability | AWS baseline | Render replacement |
| --- | --- | --- |
| Next.js hosting | SST/OpenNext Lambda | Two paid Node web services |
| Secret delivery | SST secrets | Service-scoped Render environment configuration |
| TLS/ingress | CloudFront + ACM | Render managed TLS/ingress; reviewed caching policy |
| Logs/metrics | CloudWatch | Render logs/metrics plus retained external monitoring |
| Next cache | OpenNext-managed infrastructure | Explicit tested self-hosted cache policy |

Cloudflare DNS, Neon data/contracts, R2 keys, public URLs, auth cookies, QStash signatures
and delivery providers remain the compatibility boundary. This plan adds no new database,
queue, mail service or CMS migration. Provider rates and features require a preflight recheck.

## 13. Progress checklist

- [ ] Verify live inventory, source SHA, dashboard suspension and Blueprint Path.
- [ ] Confirm paid workspace/compute selection, region, budget and toolchain pins.
- [ ] Review only web/admin template changes; leave CMS configuration intact.
- [ ] Reconcile complete runtime/build variables and shared session credentials.
- [ ] Implement/test cache coordination, deploy overlap, asset and action compatibility.
- [ ] Add exact-SHA deployment workflow and update explicit promotion dispatch.
- [ ] Pass builds, applicable checks and isolated end-to-end rehearsals.
- [ ] Verify delivery and CMS invalidation beyond health endpoint status.
- [ ] Complete SST DNS ownership handoff and rehearse retained AWS rollback.
- [ ] Cut over, observe through the rollback window, then separately review AWS retirement.
