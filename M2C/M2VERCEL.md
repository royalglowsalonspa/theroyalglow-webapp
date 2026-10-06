# M2VERCEL — Move `apps/web` + `apps/admin` from AWS to Vercel

**Status: proposed, not deployed. Reviewed against repository source and official
provider documentation on 2026-09-28.** This is an alternative compute migration
plan; no deployment or DNS change has been performed.

| Decision | Proposed baseline |
|---|---|
| Scope | Two Vercel Next.js projects replacing SST web/admin compute |
| Region | Singapore (`sin1`) functions, near the existing Neon database |
| Plan | Paid hosting decided; Pro baseline with environment/protection costs itemized |
| Release unit | One reviewed Git SHA; two deployments built for each environment |
| DNS | Existing Cloudflare zone; production hostnames remain unchanged |
| Rollback | Retained, verified AWS origins plus previous Vercel deployments |

Follow the compute-only contract in [M2AWS §12](M2AWS.md#12-portability-contract).
The AWS document records an earlier rollout; manifests, source, and workflows
are the implementation record. This plan has not verified live provider state.

## 1. What runs where

| Component | Destination / retained host | Change |
|---|---|---|
| `apps/web` — `theroyalglow.in` | Vercel project `rgss-web` | Native Next.js build, functions, cache, CDN, TLS |
| `apps/admin` — `admin.theroyalglow.in` | Vercel project `rgss-admin` | Separate Next.js project, including signed job receivers |
| `www.theroyalglow.in` | Web project domain redirect | Preserve redirect to apex |
| `apps/cms` | Existing Render service | None |
| `apps/invoicing` | Existing Cloud Run service | None |
| Documentation | Existing Mintlify hosting | None |
| Database | Existing Neon environment branches | None |
| Assets | Existing Cloudflare R2 | None |
| Jobs / rate limiting | Existing QStash / Upstash Redis | None |
| Realtime / email | Existing Ably / Resend and other configured adapters | None |
| Telemetry | Existing Sentry, PostHog, Better Stack | Preserve; add Vercel operations signals |

Keep web and admin independently configured. Vercel's monorepo model supports a
project per application directory; shared packages remain in the repository.
[Vercel monorepos](https://vercel.com/docs/monorepos)

## 2. Why nothing else moves

Neon branching, Drizzle migrations, Payload catalogue synchronization, R2 object
URLs, QStash retries, Ably tokens, and invoice signing already cross hosting
boundaries. Replacing those services would add a separate data or product migration.
Do not provision Vercel database, Blob, queue, or cron replacements in this work.

Retain session authorization, customer ownership checks, integer-paise money,
IST business dates, and transactional writes. Keep Node server handlers and the
current edge-compatible middleware boundary; do not move database access or
Node cryptography into the Edge runtime to chase lower latency.

The target removes the SST/OpenNext deployment adapter for these two apps. It
does not promise zero configuration changes: project settings, environments,
deployment workflows, DNS ownership, and possibly measured route duration
settings require implementation. Shared domain logic should stay unchanged.

## 3. Region choice

Select `sin1` for both projects' server functions. The existing infrastructure
targets Singapore; verify the actual Neon branch location before provisioning.
Static content remains globally distributed. Mumbai is a benchmark candidate,
not an assumed improvement when SSR makes sequential Singapore database calls.
[Regions](https://vercel.com/docs/regions),
[function placement](https://vercel.com/docs/functions/configuring-functions/region)

Record placement from deployed function metadata, including any route overrides.
Collect cold/warm SSR p50/p95, database round trips, Indian-user TTFB/LCP, and
invoice-job duration against AWS using equivalent requests. Keep the AWS plan's
1.5 s SSR p95, 800 ms TTFB p75, and 2.5 s LCP p75 as investigation thresholds,
not claims of measured performance. Reduce sequential queries before relocation.

## 4. Cost model

Paid Vercel hosting is decided. Use Pro as the planning baseline and record the
seat count and current subscription rate with the deployment cost estimate.
[Vercel pricing](https://vercel.com/pricing)

Estimate monthly cost as subscription/seats + environments/protection add-ons +
CPU and provisioned memory + requests/transfer + image/cache/build consumption +
observability, less applicable included credits. Include two apps, all staging
builds, Singapore rates, taxes, and retained AWS during the rollback period.
[Regional pricing](https://vercel.com/docs/pricing/regional-pricing/sin1),
[Fluid compute billing](https://vercel.com/docs/functions/usage-and-pricing)

The baseline below uses `test` and `pprd` custom environments in each project.
At review, Pro includes one custom environment per project; additional packs of
five cost $50/month **per project**. Thus this topology needs a quoted environment
add-on for each app, unless a reviewed branch-preview mapping replaces it.
[Environment pricing](https://vercel.com/docs/deployments/environments#pricing-and-limits)

Set spend alerts and an incident response owner. Decide whether automatic spend
pausing is acceptable: stopping both apps is an availability decision, not merely
a billing notification. Measure a representative week before forecasting savings.

## 5. Phase 0 — Prerequisites

1. Inventory the exact deployed AWS SHA, SST state, CloudFront origins, aliases,
   certificates, DNS/CAA records, environment names, and existing job destinations.
2. Configure the paid team, project permissions, deployment credentials, domain
   access, and environment/protection settings. Do not reuse unrelated
   existing Vercel projects just because a zone record points to Vercel.
3. Build from the committed lockfile: current source uses Bun `1.4.2`, Next
   `16.3.5`, TypeScript `7.0.2`, and app `next build` scripts. Preserve
   `experimental.useTypeScriptCli` and `transpilePackages` in both Next configs.
4. Select Node `22.x` explicitly for an initial compatibility trial; installed
   Next requires Node `>=20.9.0`. Vercel currently offers Node 22 and controls its
   patch updates. Record actual Node/Bun versions in every build; do not silently
   upgrade Next, TypeScript, Bun, or use a floating CLI to make a build pass.
   [Supported Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
5. Create isolated non-production database and provider settings using the
   existing environment model. Use controlled test recipients and fixture data;
   deployment tests must not register production schedules or send customer mail.
6. Resolve or explicitly classify existing degraded integrations before comparing
   hosts. Historical Redis, R2 sentinel, OAuth, and optional invoice/telemetry gaps
   in M2AWS are unverified today, not evidence of a Vercel defect.

## 6. Phase 1 — Project and build configuration

| Setting | Web project | Admin project |
|---|---|---|
| Root Directory | `apps/web` | `apps/admin` |
| Framework preset | Next.js | Next.js |
| Build command from app directory | `bun run build` | `bun run build` |
| Install | Root workspace `bun install --frozen-lockfile` | Same |
| Output directory | Framework default | Framework default |
| Node / function region | `22.x` / `sin1` | `22.x` / `sin1` |
| Production branch identity | `prod`, deployment controlled by promotion workflow | Same |

Keep the full repository available to both builds, including root `bun.lock`,
workspace manifests, and `packages/*`. Enable inclusion of files outside the app
root where exposed by project settings; confirm the effective monorepo build
context and root install location in logs. An app-only upload cannot resolve the
workspace packages. Run Vercel CLI from the repository root, selecting the correct
project ID; do not run it from `apps/web` and accidentally double-apply Root Directory.
[Monorepo CLI setup](https://vercel.com/docs/monorepos#add-a-monorepo-through-vercel-cli),
[build configuration](https://vercel.com/docs/builds/configure-a-build)

Bun lockfile detection alone does not prove the exact Bun version. Verify 1.4.2
is selected; if the managed builder differs, implement a pinned install wrapper
or a validated external build pipeline before accepting it. Preserve the frozen
lockfile and root dependency overrides. Bun runs admin's `prebuild` lifecycle
hook automatically; verify the existing token-presence guard appears in logs.
Do not build CMS/invoicing in these projects.
[Package manager selection](https://vercel.com/docs/package-managers),
[Bun lifecycle hooks](https://bun.sh/docs/runtime)

Use native Next.js output; no static export, generic Node start command, Docker
image, or `.next/standalone` is required for this baseline. Exercise server
actions, middleware CSP/nonces, image optimization, redirects, private responses,
ISR and CMS-triggered `/api/revalidate`. Do not blanket-cache authenticated routes.
Keep current Sentry server initialization until a separate integration change is tested.

### Function limits and public job ingress

Enable and verify Fluid compute. Current Node function limits are 300 s default
and 800 s generally available maximum on Pro; an 1800 s extension is beta and is
not a dependency of this plan. Request/response payloads have a 4.5 MB limit.
Measure actual job and report payloads, memory, and execution time before acceptance.
[Function limits](https://vercel.com/docs/functions/limitations)

Set explicit duration budgets after measuring each job; use supported project
settings or route `maxDuration` where needed. The invoice receiver has 10-second
timeouts on individual external fetches, which do not bound its entire request.
Reconcile Vercel duration with QStash delivery timeout/retry settings. If a batch
cannot finish with headroom, stop cutover pending separately reviewed batching;
raising a timeout does not make partially completed external writes idempotent.

QStash must reach signed **POST** `/api/jobs/*` without a browser session.
Production admin protection must allow that ingress; application RBAC and raw-body
signature checks remain authoritative. For protected test hosts, provide a tested
automation bypass through QStash's forwarded header support, or budget/configure
a domain exception. Audit enqueue helpers and schedule registration before relying
on a bypass: current application code does not automatically add a Vercel header.
An OPTIONS allowlist does not permit POSTs. Keep bypass secrets out of URLs/logs
where possible, and test unsigned requests still fail inside the application.
[Protection bypass options and plan restrictions](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection)

## 7. Phase 2 — Secrets and environment

Provision each project and environment explicitly. Compare both `src/env.ts`
schemas, guarded direct `process.env` readers, root/admin examples, and
[`sst.config.ts`](../sst.config.ts); the typed schemas are not the full inventory.
Do not export secret values into plans, build logs, committed `.env` files, or
public variables. A setting change requires a deployment of the intended configuration.
[Environment variables](https://vercel.com/docs/environment-variables)

| Configuration group | Required treatment |
|---|---|
| Database | Matching Neon branch per web/admin pair; admin also requires the real direct `DATABASE_URL_UNPOOLED` |
| Shared authentication | Identical `BETTER_AUTH_SECRET`, compatible Google credentials; separate per-app `BETTER_AUTH_URL` |
| Cookie scope | Explicit `COOKIE_DOMAIN`; production `.theroyalglow.in` |
| Public origins | Per-app `NEXT_PUBLIC_APP_URL`; web `NEXT_PUBLIC_ADMIN_URL` points to its paired admin |
| Job delivery | `QSTASH_TOKEN`, both signing keys, configured internal token if used; keep signatures mandatory |
| CMS | Correct CMS/R2 public URLs; web `REVALIDATE_SECRET` identical to CMS |
| Notifications | `RESEND_API_KEY`, VAPID settings and configured report recipients on admin, not only web |
| Invoice / storage | Existing Cloud Run URL, HMAC secret, R2 endpoint/bucket/credentials where consumed |
| Realtime / limits | Server Ably private key and Upstash REST credentials; public values only as existing code expects |
| Monitoring | Separate web/admin Sentry DSNs; source-map upload credentials restricted to build use |

Leave absent optional settings absent. Keep `SKIP_ENV_VALIDATION` unset for real
acceptance builds: even the string `false` skips validation in current code.
Set `APP_ENV` deliberately; never set `NODE_ENV=development` on deployed builds
to bypass job verification or admin guards. No migrations run in app build hooks.

Use stable paired hosts for test and pprd under explicitly controlled, isolated
non-production cookie parents. Prefer a separate registrable staging domain so
the production parent cookie cannot collide with a same-name staging cookie.
Select actual names during implementation; this plan does not assume ownership.
The shared helper defaults to `.theroyalglow.in` under `NODE_ENV=production`, also
true for deployed previews. Random `*.vercel.app` hosts cannot exercise the shared
cookie contract. Never use `.vercel.app` as a shared cookie domain.

Register exact Google OAuth callbacks and allowed browser origins for the stable
hosts. Test sign-in, cross-app session recognition, logout, onboarding, RBAC,
and private-route redirects in a browser. Untrusted PR previews get no production
database, shared session secret, or live notification credentials.

Every `NEXT_PUBLIC_*` value is fixed during `next build`. Build each environment
with its final origins and public settings. Promoting a test deployment's alias
does not rewrite its JavaScript into a production build. Same validated commit
does not mean the same environment-specific build artifact.

## 8. Phase 3 — CI/CD

Retain `dev → test → pprd → prod` and
[`promote.yml`](../.github/workflows/promote.yml), including the production
maintainer confirmation. Add a proposed `deploy-vercel.yml` with an exact
`git_ref` input and target environment; it is not present as part of this plan.

| Repository environment | Proposed Vercel mapping | Configuration |
|---|---|---|
| `dev` | Restricted Preview | Development Neon branch and sandbox integrations |
| `test` | Custom `test` | Stable host pair, isolated test settings |
| `pprd` | Custom `pprd` | Stable host pair, production-like settings without customer sends |
| `prod` | Production | Final public domains and production services |

Custom environments provide scoped settings and persistent domains; confirm the
two-project add-on quote in §4. If branch-scoped Preview replaces a custom target,
prove branch variable selection and stable aliases in CI before adopting it.
[Environment configuration](https://vercel.com/docs/deployments/environments)

For each target, check out the validated SHA, run the existing relevant quality
gates, select separate project IDs, and deploy both apps using pinned tooling.
Record SHA, deployment IDs/URLs, runtime versions, target, and a non-secret
configuration fingerprint. Isolate per-project CLI state/output directories so
parallel jobs cannot deploy one app's output or settings into the other project.

Disable automatic production deployment paths that bypass promotion. The current
workflow explicitly dispatches `deploy-aws.yml` because `GITHUB_TOKEN` branch pushes
do not start push workflows. Replace that dispatch with the selected Vercel workflow
only when migration is ready; add explicit deploy-and-wait gates for earlier
environments if they are to validate deployed state. Preserve the release dispatch.
Updating a Git branch alone does not prove either Vercel deployment succeeded.

For production, run `vercel deploy --prod --skip-domain` for each selected project;
this builds with production settings while deferring domain assignment. Wait for
both ready deployments and verify their SHAs and configuration. Run read-only
readiness checks on staged URLs; the full auth flow is proven on the isolated
paired staging hosts and checked again immediately after production assignment.
Then use `vercel promote <deployment-url>` for each recorded production deployment.
This promotes the staged build without rebuilding it. Two projects cannot switch
atomically: preserve compatible contracts and record the mixed-version window.
[Staged deploy flag](https://vercel.com/docs/cli/deploy#skip-domain),
[production promotion](https://vercel.com/docs/deployments/promoting-a-deployment)

## 9. Cutover and rollback

1. Finish test/pprd validation: health JSON with database pass, customer booking,
   ownership denial, admin RBAC, real test OAuth, CMS revalidation, signed jobs,
   retries, invoice rendering/email, and secret-free logs. Record intentionally
   unavailable integrations; a green HTTP status is insufficient evidence.
2. Stage production-configured Vercel builds for the accepted SHA; confirm final
   public values, domain ownership, certificates, redirects, and readiness.
   Follow the domain verification values Vercel supplies rather than copying an
   old generic IP/CNAME. Keep authoritative DNS on Cloudflare.
   [Custom domains](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
3. Export current DNS and inspect SST/Pulumi ownership. Freeze competing AWS
   deploys; prepare a reviewed handoff of only apex/`www`/admin DNS resources.
   Retain CloudFront distributions, aliases, ACM validation, assets, and SST state.
   Do not remove Next.js components or run `sst remove` to transfer DNS ownership.
4. Lower TTL ahead of the window. Preserve CMS, R2, email, documentation and other
   records. Review CAA for the new certificate issuer without removing permissions
   needed by existing services. Use DNS-only records initially to avoid adding a
   second CDN layer; verify TLS issuance/renewal prerequisites before switching.
5. Change only the three intended records and verify production HTTPS, `www`
   redirect, both health payloads, OAuth, CSP, catalogue, booking and admin flows.
   Observe QStash delivery results and actual notification/invoice output.
6. Production QStash destination URLs stay unchanged. Do not re-register duplicate
   production schedules for Vercel. Let in-flight work drain and inspect existing
   idempotency behavior while DNS may deliver to either host.

Roll back immediately for broken auth/ownership, booking failures, signature
failures, persistent 5xx, or job loss; use recorded baseline thresholds for latency.
For a bad Vercel release, restore both known-good deployment IDs and their matching
configuration. Verify rollback behavior first; it does not undo database writes
or external messages. [Vercel rollback](https://vercel.com/docs/instant-rollback)

For a provider failure, restore the recorded Cloudflare values to the retained,
tested AWS origins and resume the reviewed AWS deployment path. DNS rollback is
not instantaneous and needs valid AWS certificates, credentials, and compatible
schema. Restore DNS ownership deliberately so SST and manual updates cannot race.
Keep AWS available for an agreed observation window, initially seven days, then
retire it only through a separate reviewed change with cost/state inventory.

## 10. Observability

Correlate Vercel build/runtime logs, deployment IDs, function errors/duration,
timeouts, cache behavior and billing with the existing Sentry and Better Stack
signals. Keep product analytics and consent unchanged. Scrub auth cookies, signed
request payloads, tokens, customer details, and invoice data from diagnostics.

Probe both `/api/health` payloads: HTTP 200 may mean `degraded`. Verify job
heartbeats plus QStash delivery history and actual test delivery; missing Resend
or push credentials can produce successful no-op jobs. Check that Sentry receives
a controlled error; an environment variable alone does not prove capture.

Record daily metrics during the first week and a one-month cost/latency review.
Do not quietly change client-IP trust: current rate-limit/audit code intentionally
ignores forwarded headers; a new trusted-header design needs its own review.

## 11. Known tradeoffs

- Native Next.js operations reduce adapter management, but function limits,
  environment add-ons, protection settings, cache costs and build behavior remain.
- Separate projects isolate configuration and deployments but require a paired
  release record and coordinated cross-app rollback.
- Stable staging domains and explicit cookie isolation are prerequisites for
  meaningful auth tests; a successful generated-URL homepage is not enough.
- QStash remains the durable scheduler; Vercel functions execute bounded handlers.
  Deployment Protection must not silently turn delivery into a login redirect.
- The platform move cannot repair missing provider credentials or unsafe business
  idempotency. Report such gaps separately and block only affected acceptance gates.

## 12. Portability contract

| Capability | Current AWS | Proposed Vercel |
|---|---|---|
| Next.js SSR | SST/OpenNext Lambda | Native Next.js functions |
| Static delivery / TLS | CloudFront/S3/ACM | Vercel CDN and managed domains |
| Runtime configuration | SST secrets and deployment environment | Per-project/environment settings |
| Operations | CloudWatch plus shared telemetry | Vercel logs/metrics plus shared telemetry |
| Rollback | Known-good SST deployment | Paired deployment rollback; retained AWS fallback |

Cloudflare DNS/R2, Neon, QStash, Redis, Ably, email, CMS and invoice contracts stay
provider-neutral. Future implementation should add only targeted project/config,
CI and DNS-handoff changes; do not introduce proprietary data dependencies merely
because they are offered in the Vercel dashboard.

## 13. Progress checklist

All execution items remain uncompleted; writing this plan is not execution.

- [ ] Phase 0: inventory live AWS state, deployment SHA, provider settings and gaps.
- [ ] Configure the selected paid plan, environment/protection settings and spend policy.
- [ ] Verify Node 22/Bun 1.4.2/Next 16.3.5/TS 7.0.2 builds for both projects.
- [ ] Confirm root workspace install, external shared files and admin prebuild guard.
- [ ] Provision isolated environment settings and stable cookie/OAuth host pairs.
- [ ] Measure function/job limits; prove signed POST ingress through protection.
- [ ] Verify authorization, booking, revalidation, images, invoice and notification flows.
- [ ] Implement exact-SHA paired deployment workflow and promotion dispatch/gates.
- [ ] Rehearse paired Vercel rollback and retained AWS DNS fallback.
- [ ] Review SST DNS ownership handoff, CAA/TLS, TTL and non-atomic cutover window.
- [ ] Cut over approved production deployments; observe both apps and QStash.
- [ ] Complete seven-day observation and separate AWS-retirement decision.
- [ ] Record one-month latency and cost results before further platform changes.
