# M2AWS — Move `apps/web` + `apps/admin` to AWS

> **M2AWS** = *Move to AWS*. Companion docs (planned): `M2AZURE.md`, `M2GCP.md`, following the
> same phase structure — see [§12 Portability contract](#12-portability-contract).

| | |
|---|---|
| **Scope** | `apps/web` and `apps/admin` → AWS Lambda + CloudFront. **Nothing else moves.** |
| **Region** | `ap-southeast-1` (Singapore) — co-located with Neon ([§3](#3-region-choice)) |
| **Tooling** | SST v3 (`sst.aws.Nextjs`, which wraps OpenNext) |
| **Application code changes** | **Zero** ([§2](#2-why-nothing-else-moves)) |
| **Cost** | ~$0–0.50/mo at launch. DNS stays on Cloudflare, so there is no Route 53 hosted-zone charge ([§4](#4-cost-model)) |
| **Status** | **LIVE on the real domains, 29/08/2026.** https://theroyalglow.in and https://admin.theroyalglow.in serve from CloudFront with ACM certificates; `www` 301-redirects to the apex. DNS stayed on Cloudflare ([§9](#9-cutover)) |
| **Rollback** | **No tested platform fallback.** Web/admin Render services are suspended out-of-band; recover by inspecting SST/Pulumi state and redeploying a known-good ref ([§8](#8-phase-3--cicd)) |

---

## 1. What runs where

| Deployable | Host | Change |
|---|---|---|
| `apps/web` — theroyalglow.in | **AWS** Lambda ARM64 + CloudFront + S3 | **new** |
| `apps/admin` — admin.theroyalglow.in | **AWS** Lambda ARM64 + CloudFront + S3 | **new** |
| `apps/cms` — cms.theroyalglow.in | Render (`rgss-cms`) | none |
| `apps/invoicing` — PDF service | Google Cloud Run | none |
| `docs` — docs.theroyalglow.in | Mintlify (hosted) | none — not part of this migration |

| Dependency | Stays as | Why it does not move |
|---|---|---|
| PostgreSQL | **Neon**, 4 branches | Free forever, HTTP driver needs no VPC, and the branch model underpins `migration-discipline.md`, `replicate-prod-to-pprd.yml` and the `neon-admin.ts` drift tooling. RDS has no branching. |
| Object storage | **Cloudflare R2** | S3-compatible, zero egress, already working. Nothing gained by moving it. |
| Rate limiting | **Upstash Redis** | `@upstash/ratelimit` talks REST; free tier is ample. Catalogue and availability reads do not use Redis. |
| 19 background jobs | **QStash** | They POST to `admin.theroyalglow.in`, which is unchanged by this migration. |
| Transactional email | **Resend** | Works; SES would mean a new provider and a sandbox-exit wait. |
| Realtime | **Ably** | 6M msg/mo free; IoT Core would be the single largest code change in the project. |
| Errors, analytics, uptime | Sentry, PostHog, BetterStack | No AWS equivalent worth building. |

**AWS surface used:** Lambda, CloudFront, S3, DynamoDB + SQS (both created and managed by SST for
ISR), ACM, SSM Parameter Store (SST secrets), CloudWatch Logs, IAM. Cloudflare remains the
authoritative DNS provider through `sst.cloudflare.dns()`.

---

## 2. Why nothing else moves

The earlier version of this document migrated everything: RDS, SES, EventBridge Scheduler,
Valkey + SRH, IoT Core, containers on EC2. It was written to satisfy "entirely in AWS" and it
rested on a claim that turned out to be false — that OpenNext could not run Next.js 16.

```
$ npm view @opennextjs/aws version         → 4.1.0
$ npm view @opennextjs/aws peerDependencies → { next: '>=15.5.21 <16 || >=16.2.11' }
$ repo                                      → next 16.2.12   ✅ supported
```

The AWS Amplify docs and the OpenNext compatibility page both lag the published package. With
Lambda available, the chain collapses:

1. Lambda + Neon needs **no VPC** (Neon speaks HTTP), so **no NAT Gateway** — the ~$32/mo trap
   that forced container compute in the first place.
2. With Neon staying, there is no "single vendor" goal left to justify replacing Upstash, QStash,
   Resend or Ably.
3. Therefore the ten-item application change inventory becomes **zero**, including the High-risk
   `DB_DRIVER` swap that touched every query path.

The rejected EC2 design is archived at
[`infra/aws/_ec2-path/`](infra/aws/_ec2-path/ARCHIVED.md) as historical design input only. It is
not deployed, tested as rollback, or part of current recovery. Adopting it would require a new
migration decision, refreshed infrastructure and security review, data/service migration planning,
validation, and a new cutover.

**Amplify Hosting was also rejected:** AWS documents its compute provider for Next.js 12–15, and
you are on 16.2.12 — the one target whose stated support boundary you would be outside. Its free
tier is also a 12-month grant rather than always-free.

---

## 3. Region choice — DECIDED: Singapore

**Everything runs in `ap-southeast-1` (Singapore): Lambda, Neon, and the Render CMS.**
Ratified 31/07/2026, to be reviewed after one month in production ([§3.1](#31-one-month-latency-review)).

Reasoning:

- **Neon has no Mumbai region** (verified), so an India compute region would put every query
  across the Bay of Bengal. SSR issues several *sequential* queries per request and the Neon HTTP
  driver has no persistent connection to amortise the round trip, so a 5-query page would pay
  ~300 ms instead of ~60 ms once on the document.
- **An India region would not deliver DPDP residency anyway.** The personal data lives in Neon;
  Lambda stores nothing at rest. Residency follows the database, not the compute.
- Singapore is where the CMS already runs on Render, so CMS↔DB stays local too and the current
  production latency profile is preserved rather than changed.
- Static assets and media are served from CloudFront's Indian edge locations regardless — that is
  where the byte weight is.

Hyderabad (`ap-south-2`) was considered and rejected: it is an **opt-in region** with 3 AZs, fewer
services and slower feature rollout than Mumbai, and it solves nothing that Mumbai would not. If
India ever becomes the answer, it is Mumbai — and it requires moving the *database* (which means
reopening RDS, since Neon has no Mumbai), not the compute.

### 3.1 One-month latency review

Do not let Singapore become permanent by default. Review after ~4 weeks of real traffic
(**due early September 2026**).

**Measure:**

| Metric | Source | Concern threshold |
|---|---|---|
| SSR Lambda duration, p50 / p95 | CloudWatch `AWS/Lambda` Duration | p95 > 1.5 s |
| TTFB for Indian users | PostHog / web-vitals | p75 > 800 ms |
| LCP for Indian users | PostHog / web-vitals, Lighthouse | p75 > 2.5 s (Lighthouse ≥95 requires headroom) |
| Queries per SSR request | app instrumentation / Neon dashboard | > 6 sequential on any hot page |
| Neon query latency | Neon dashboard | rules out the DB as the cause |

**Fix cheaply before relocating anything** — region is the expensive lever, and rarely the right
first one:

1. Collapse sequential queries into parallel `Promise.all` or single joined queries. This is
   usually the whole problem: 5 sequential 60 ms round trips become one.
2. Cache suitable hot reads in Upstash where measurements justify it. The service catalogue is a candidate for a future 5-minute cache; it reads Neon directly today.
3. Prefer static/ISR over dynamic rendering wherever the page is not per-user.

**Only if latency is still unacceptable**, escalate in this order:

1. Reduce DB round trips further (see above) — cheapest, no infrastructure change.
2. Add a read replica or heavier caching close to users.
3. Move the database to Mumbai — which means Neon → RDS, the `DB_DRIVER` factory, and losing the
   4-branch workflow. See [`infra/aws/_ec2-path/ARCHIVED.md`](infra/aws/_ec2-path/ARCHIVED.md).

Record the decision and the numbers here when the month is up, so the next person sees why.

---

## 4. Cost model

| Service | Free allowance | Expires? |
|---|---|---|
| Lambda | 1M requests + 400,000 GB-seconds / mo | **Never** |
| CloudFront | 1 TB out + 10M requests / mo | **Never** |
| DynamoDB (ISR tag cache) | 25 GB + 25 RCU/WCU | **Never** |
| SQS (ISR revalidation) | 1M requests / mo | **Never** |
| S3 (static assets) | 5 GB | 12 months, then cents |
| CloudWatch Logs | 5 GB ingest | **Never** |
| ACM certificates | unlimited | **Never** |

**Total: approximately $0–0.50/mo at launch.** DNS stays on Cloudflare, so there is no Route 53
hosted-zone fee. S3 can add cents after its 12-month free tier; request/compute charges remain
usage-dependent. Neon, Upstash, QStash, Ably, Resend and the Render CMS stay on their existing
tiers. Keep the **AWS Budgets** alarm at $5/mo — a runaway ISR loop or misconfigured cache is the
realistic failure mode, not steady-state traffic.

---

## 5. Phase 0 — Prerequisites

**Status: done except the identity fix in 5.1.** Account `343277178041`, region
`ap-southeast-1`, AWS CLI v2.36.13, `sst@4.17.1` installed with providers.

1. AWS account created. ✅
2. AWS CLI v2 installed and authenticated with **`aws login`** (browser sign-in). ✅
   This supersedes the older "create an IAM user and long-lived access keys" step — `aws login`
   issues short-lived credentials (valid 12 h, renewable for 90 days without re-authenticating
   in the browser), so there is no permanent secret sitting in `~/.aws/credentials`.
3. `bun add -d sst` + `bunx sst install` (generates `.sst/platform` types). ✅
4. **Outstanding:** enable Free Tier usage alerts and create the $5 budget (Billing → Budgets).
5. **Outstanding:** stop using the root user — see [§5.1](#51-do-not-deploy-as-root).

```bash
aws sts get-caller-identity        # must return your account id
```

Unlike the EC2 path, no Docker and no Linux host are required — SST builds from any OS, and
`sst deploy` runs fine from Windows.

### 5.1 Do NOT deploy as root — RESOLVED

Deploys now run as an IAM user:

```
"Arn": "arn:aws:iam::343277178041:user/rgss-admin"
```

`rgss-admin` holds `AdministratorAccess` (plus `AWSManagementConsoleBasicUserAccess` for console
CloudShell/Q, which grants no resource permissions of its own).

The original problem, kept for the record: the first `aws login` authenticated the **account root
user**, which cannot be constrained by IAM policy and can close the account or change billing.

**Gotcha worth remembering:** console sign-in and CLI credentials are independent. Signing into the
console as a different user does **not** change the CLI, which caches a session token from
`aws login` (visible as `TYPE: login` in `aws configure list`). The fix is:

```bash
aws logout                              # drop the cached session
aws login --region ap-southeast-1       # re-authenticate; use a private window if the
                                        # browser keeps reusing the root session
aws sts get-caller-identity             # ARN must NOT end in :root
```

Still worth doing to the root user itself, once: **enable MFA** and **confirm it has no access
keys**. Then leave root alone — it is needed only for closing the account, changing the payment
method, and a few support actions.

Why it matters:

- Root cannot be constrained by IAM policies. There is no least-privilege version of it.
- Root can close the account, change the payment method and alter billing — a compromise is
  unrecoverable, not just expensive.
- AWS's own guidance, and the Well-Architected security pillar, is to use root only for the
  handful of tasks that require it, then never again.

Fix, once:

1. Enable **MFA on the root user** (Account → Security credentials). Do this regardless.
2. Confirm root has **no access keys**. If any exist, delete them.
3. Create an administrative identity for daily work — either IAM Identity Center (preferred; it is
   what `aws login` is designed around) or an IAM user with `AdministratorAccess` + MFA.
4. `aws login` again as that identity and re-check `get-caller-identity` — the ARN must no longer
   end in `:root`.

Everything in this runbook works identically as a non-root administrator. Nothing below depends on
root, so switching now costs nothing; switching after cutover means re-checking every resource.

### 5.2 CloudFront account verification — RESOLVED

A brand-new AWS account cannot create CloudFront distributions until AWS verifies it. Three deploys
failed on this, *after* both Next builds and the OpenNext bundle had succeeded:

```
Web sst:aws:Nextjs → WebCdnDistribution aws:cloudfront:Distribution
CreateDistributionWithTags → 403 AccessDenied: Your account must be verified
before you can add new CloudFront resources. … contact AWS Support
```

Worth recognising, because it looks like a permissions bug and is not one: `rgss-admin` holds
`AdministratorAccess`, and read calls such as `cloudfront list-distributions` succeed throughout.
Only *creation* is gated. The fix is a Support case ("Account and billing", CloudFront), not an IAM
policy change.

Test whether the gate is lifted without deploying, and without creating anything:

```bash
aws cloudfront create-distribution --distribution-config \
  '{"CallerReference":"probe","Comment":"probe","Enabled":false,
    "Origins":{"Quantity":1,"Items":[{"Id":"none","DomainName":"invalid_domain"}]},
    "DefaultCacheBehavior":{"TargetOriginId":"none","ViewerProtocolPolicy":"allow-all",
      "CachePolicyId":"658327ea-f89d-4fab-a63d-7e88639e58f6"}}'
```

`AccessDenied` → still gated. **`InvalidOrigin` → gate lifted**: the request reached config
validation, and the deliberately malformed origin guarantees nothing is created.

Verified lifted 29/08/2026.

---

## 6. Phase 1 — SST configuration

[`sst.config.ts`](sst.config.ts) declares both apps. Key points:

- **One app, two components.** SST diffs infrastructure, so an admin-only change does not
  redeploy web.
- **`BETTER_AUTH_SECRET` is one shared `sst.Secret`**, guaranteeing the two apps hold identical
  bytes. Sessions are shared via a `.theroyalglow.in`-scoped cookie; cookie scope follows the
  domain, not the origin, so two separate CloudFront distributions are fine.
- **ARM64** — cheaper and faster than x86 for this workload.
- **Domains are added only at cutover** ([§9](#9-cutover)), so everything can be verified on the
  generated CloudFront URLs first.

Per app, SST provisions: an S3 bucket for static assets, a CloudFront distribution, an ARM64
Lambda for SSR, a CloudFront Function for routing, a DynamoDB table (ISR tag cache) and an SQS
queue (ISR revalidation).

---

## 7. Phase 2 — Secrets and environment

Two mechanisms, and conflating them is the classic way to ship a broken frontend.

### Server-side secrets → SST Secrets (SSM Parameter Store)

```bash
bunx sst secret set DatabaseUrl "postgresql://…neon…" --stage production
bunx sst secret set BetterAuthSecret "…" --stage production
bunx sst secret set GoogleOauthClientSecret "…" --stage production
# …Ably, Upstash, QStash, Resend, VAPID, invoicing HMAC
bunx sst secret list --stage production
```

### `NEXT_PUBLIC_*` → GitHub Actions **variables**

These are inlined into the client bundle by `next build`, so they must exist in the environment
when CI runs `sst deploy`. They are not secrets — they ship to the browser either way. Store them
as repo *variables*, not secrets, so they are readable in logs when debugging.

`NEXT_PUBLIC_APP_URL` differs per app (`https://theroyalglow.in` vs
`https://admin.theroyalglow.in`), and `apps/admin` reads `NEXT_PUBLIC_ADMIN_SENTRY_DSN` while
`apps/web` reads `NEXT_PUBLIC_SENTRY_DSN` — same key names as today, different values.

### Never default an unset variable to `''`

`sst.config.ts` omits optional variables that have no value instead of passing an empty string.
t3-env does **not** treat `''` as undefined, so `?? ''` converts an optional var into an invalid
one: `z.string().url()` rejects `''` and the whole `env.ts` module throws on the first import,
which on Lambda means a 500 on every request. It cannot be caught by the build either — during
`next build` the variable is genuinely absent, so validation passes and the fault surfaces only at
runtime. `INVOICING_SERVICE_URL` is the live example: unset on Render today, and it must stay
absent rather than empty on AWS.

### The admin app needs the delivery credentials, not just web

`apps/admin` owns every `/api/jobs/*` route and `lib/notifications/dispatch.ts`, so it needs
`RESEND_API_KEY` and `VAPID_PRIVATE_KEY` as well. Both are read from `process.env` and **no-op
silently** when absent: the job returns 200, pings its BetterStack heartbeat and sends nothing.
Omitting them produces a notification layer that monitors green while being completely mute.

---

## 8. Phase 3 — CI/CD

[`.github/workflows/deploy-aws.yml`](.github/workflows/deploy-aws.yml) — on push to `prod`, plus
manual dispatch. Authentication is **GitHub OIDC**; no long-lived AWS keys in secrets.

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```

Trust policy scoped to `repo:royalglowsalonspa/theroyalglow-webapp:ref:refs/heads/prod`.

Pipeline: `bun install` → `sst deploy --stage production` → poll `/api/health` on both apps →
notify on failure.

Migrations are unchanged: [`migrate.yml`](.github/workflows/migrate.yml), forward-only, per Neon
branch, per `.kiro/steering/migration-discipline.md`.

### Rollback — the honest weak spot

There is no single-command rollback like the EC2 path's `deploy.sh <previous-sha>`, and there is
no tested Render fallback. Options, fastest first:

| Failure | Action | Typical time |
|---|---|---|
| Bad feature / UI bug | Disable the PostHog feature flag | < 10 s |
| Bad release | `git revert` + push, or deploy a known-good tag with `bunx sst deploy --stage production` | 3–10 min |
| Failed or incomplete SST update | Inspect GitHub Actions and SST/Pulumi logs plus stack state; check both `/api/health` endpoints; redeploy a known-good ref if either app or stack is unhealthy | Depends on stack state |
| Bad migration | Apply a new forward-fix migration, or use Neon PITR under the migration runbook | < 10 min |
| AWS service degradation | Check AWS status, CloudWatch, and BetterStack; recover or redeploy after the dependency is healthy | Incident-dependent |

SST/Pulumi updates can partially apply. A failed command does **not** prove CloudFront, Lambda,
S3, DNS, or stack state remained on the previous release. Always inspect the update, verify both
public health endpoints, and redeploy a known-good ref when state or behavior is uncertain.
PostHog flags remain the primary instant kill switch. The dormant Render definitions are
reactivation templates only, not a supported rollback path.

---

## 9. Cutover

Order matters. Everything is verifiable before any customer traffic moves.

1. `bunx sst deploy --stage production` **with no `domain` block**. SST prints CloudFront URLs.
2. Verify on those URLs: `/api/health` reports `database: pass`; Google sign-in; create a booking;
   generate an invoice PDF; load the admin dashboard.
3. **Google OAuth** — add redirect URIs for both AWS-hosted origins in Google Cloud Console.
   Remove obsolete Render redirect URIs after production sign-in is verified.
4. Keep the authoritative zone on **Cloudflare**. Remove conflicting legacy apex, `www`, and
   `admin` records, then configure each SST domain with `sst.cloudflare.dns({ zone })`. Lower the
   affected TTLs to 60 s before cutover and wait out their previous TTLs.
5. Add the `domain` blocks to `sst.config.ts` and redeploy. SST requests and validates ACM
   certificates automatically.
6. Smoke test the list from `knowledge-base/deployment.md`: `/`,
   `/?book=1&utm_source=gmb`, `/services`, `/book`, `/api/health`, an OAuth sign-in, a booking, an
   invoice PDF, and one job triggered by hand.
7. **QStash needs no changes** — schedules POST to `admin.theroyalglow.in`, the same hostname.
8. ~~Leave Render's web + admin services running **7 days**. They are the rollback.~~
   **Void as of 29/08/2026:** the Render web service is suspended and
   `theroyalglow.in` returns 503, so there is nothing to fall back to and nothing
   to retire. AWS is the only working deployment, which also means the DNS
   cutover is now a fix rather than an optimisation. CMS stays on Render.

---

## 10. Observability

| Signal | Where |
|---|---|
| Lambda logs | CloudWatch Logs (SST creates the groups; set 14-day retention) |
| Errors | Sentry — unchanged, already wired into both apps |
| Uptime | BetterStack — unchanged; monitors already hit `/api/health` |
| Product analytics | PostHog — unchanged |
| Cost | AWS Budgets $5/mo alarm |
| Cold starts / duration | CloudWatch metrics on the SSR functions |

Worth adding once live: a CloudWatch alarm on Lambda `Errors` and on SQS
`ApproximateAgeOfOldestMessage` for the ISR queue, which is the least obvious failure mode in this
architecture.

---

## 11. Known tradeoffs

Stated plainly, because they are real:

- **OpenNext is community-maintained**, not an AWS product. A future Next.js release could outpace
  it. Mitigation: pin compatible versions and validate upgrades before production deployment. If
  OpenNext becomes unsuitable, evaluate the archived EC2 design as one input to a new migration;
  do not treat it as rollback or current recovery machinery.
- **Cold starts.** First request after idle is slower than a warm container. At pre-launch traffic
  this mostly affects you during testing. SST supports a warmer if it ever matters.
- **Rollback is minutes, not seconds** ([§8](#8-phase-3--cicd)).
- **Lambda payload and duration limits** — 6 MB response, 15 min execution. Invoice PDF rendering
  stays on Cloud Run, so the one heavy path is unaffected.
- **Not "entirely AWS."** Neon, Upstash, QStash, Resend, Ably, R2 and Render remain. That is the
  deliberate trade that buys zero code changes and a lower bill.

---

## 12. Portability contract

`M2AZURE.md` and `M2GCP.md` should mirror this structure. Because only compute moves, the port
surface is small:

| # | Capability | AWS | Azure | GCP |
|---|---|---|---|---|
| 1 | Next.js SSR hosting | Lambda + CloudFront (SST/OpenNext) | Container Apps or Static Web Apps | Cloud Run |
| 2 | Secret storage | SSM Parameter Store (SST Secrets) | Key Vault | Secret Manager |
| 3 | CDN + TLS | CloudFront + ACM | Front Door | Cloud CDN |
| 4 | Logs + metrics | CloudWatch | Monitor | Cloud Logging |

Everything else — authoritative DNS (Cloudflare), database, cache, jobs, email, realtime, object
storage, and CMS — is cloud-agnostic SaaS and does not move with the compute port. That is the
point of this architecture.

---

## 13. Progress checklist

Phase 0 and the production AWS deployment are complete; remaining entries are operational follow-ups.
The CloudFront distributions, ACM certificates, and real domains are live.

**Phase 0**
- [x] AWS account created (`343277178041`)
- [x] AWS CLI v2 installed, authenticated via `aws login`, region `ap-southeast-1`
- [x] `bun add -d sst` + `bunx sst install`
- [x] Agent Toolkit for AWS installed (16 skills + AWS MCP server; rules in `.kiro/steering/aws-agent-rules.md`)
- [x] Non-root admin identity: IAM user `rgss-admin` (`AdministratorAccess`) ([§5.1](#51-do-not-deploy-as-root--resolved))
- [x] $5 monthly budget `rgss-monthly-cost` (ACTUAL >80%, FORECASTED >100% → email)
- [x] IAM user/role access to Billing information activated
- [ ] Enable MFA on the root user; confirm root has no access keys
- [ ] Free Tier usage alerts (Billing → Billing preferences → Alert preferences) — console only
- [x] Region decided: `ap-southeast-1` (Singapore) — Neon has no Mumbai ([§3](#3-region-choice--decided-singapore))

**Phase 1–2**
- [x] `sst.config.ts` reviewed
- [x] All 16 SST secrets set for `production` (verified in SSM under
      `/sst/production/rgss/Secret/*`)
- [x] `NEXT_PUBLIC_*` set as GitHub Actions variables
- [x] GitHub OIDC provider + deploy role `rgss-github-deploy` created,
      `AWS_DEPLOY_ROLE_ARN` secret set (trust policy: `infra/aws/oidc-trust.json`)
- [x] Repo variable `AWS_DEPLOY_ENABLED=true` — the deploy job is gated on it
      and **skips** until then, so it does not fail on every `prod` push
- [x] SST state bootstrapped (`/sst/bootstrap`)
- [ ] Optional, currently unset and therefore omitted from the Lambda env:
      `INVOICING_SERVICE_URL` (invoice email sends without the PDF attachment),
      `SLACK_WEBHOOK_URL` + `DAILY_REPORT_EMAIL_RECIPIENTS` (daily/weekly report
      jobs run and log but deliver nowhere), `NEXT_PUBLIC_SENTRY_DSN` +
      `NEXT_PUBLIC_ADMIN_SENTRY_DSN` (Sentry disabled)
- [ ] Consider a dedicated `DatabaseUrlUnpooled` secret — `sst.config.ts`
      currently falls back to the **pooled** URL, which satisfies
      `apps/admin/src/env.ts` but is the wrong connection for any DDL
- [ ] After DNS cutover only: set `AWS_DOMAINS_LIVE=true` to enable the public
      health-check gate

**Phase 3 — verify before DNS**
- [x] `sst deploy` succeeds, no domains attached — green run 33214187275.
      Per app: S3 assets bucket, CloudFront distribution, ARM64 SSR Lambda
      (1024 MB, 20 s web / 30 s admin), image optimiser, ISR revalidation
      function + queue.
- [x] `/api/health` reports `database: pass` on both CloudFront URLs.
      Warm DB latency 82 ms, warm TTFB ~0.53 s from India, cold ~3.8 s.
      Homepage renders (158 KB HTML), `/services` and `/api/services` 200.
- [ ] **Web health is `degraded`, and neither cause is AWS:**
      - Upstash Redis is **gone** — `equal-doe-141923.upstash.io` no longer
        resolves in DNS, from Lambda or from a laptop. Create a new database and
        update `UpstashRedisRestUrl` / `UpstashRedisRestToken`. Distributed
        rate limiting and the Redis health probe are down until then. Catalogue
        and availability reads continue directly against Neon.
      - R2 has no `.health` sentinel object, so the probe's HEAD returns 404.
        R2 itself is reachable (the `r2.dev` host answers). Upload an empty
        `.health` key to `theroyalglow-uploads`.
- [ ] OAuth sign-in, booking creation, invoice PDF all verified
- [ ] Google OAuth redirect URIs added for both origins

**Cutover — done 29/08/2026**
- [x] DNS stayed on **Cloudflare**, not Route 53. The zone also serves `cms`
      (Render), `r2`, `app` (Vercel), `status` (BetterUptime), plus MX/SPF/DKIM
      for Brevo, Resend and SES — migrating it would have risked all of that for
      no gain. `sst.cloudflare.dns({ zone })` manages only what SST needs.
- [x] Three stale Render CNAMEs removed (apex, `www`, `admin`). Note the apex was
      a **CNAME**, not the A pair a resolver reports — that is Cloudflare
      flattening. `sst.cloudflare.dns()` has no override option, so the records
      had to be gone before the deploy.
- [x] `domain` blocks added, ACM certificates ISSUED for all three names in
      us-east-1. Records created DNS-only (`proxied: false`, TTL 60), so traffic
      reaches CloudFront directly rather than through a second CDN.
- [x] Verified: apex 200, `www` 301 → apex, admin 307 → sign-in, both
      `/api/health` responding, TLS issuer Amazon.
- [x] **CAA widened back out.** SST writes `0 issue/issuewild "amazonaws.com"`
      at the apex, which silently forbids every other CA in the zone. Measured
      issuers: `cms` + `r2` = Google Trust Services, `app` + `status` = Let's
      Encrypt. Live certificates keep working; *renewals* would have failed in
      ~60 days with no warning. Added `letsencrypt.org` and `pki.goog` for both
      tags (6 CAA records total). **Any future subdomain on a new CA needs its
      identifier added here.**
- [ ] Google OAuth redirect URIs for both origins — sign-in is broken until then
- [ ] CloudWatch retention + Lambda error alarm
- [x] ~~7-day Render window~~ — void, Render web + admin were already suspended

**One month after go-live (early September 2026)**
- [ ] Collect the [§3.1](#31-one-month-latency-review) metrics
- [ ] Audit sequential DB queries on hot pages; parallelise or join
- [ ] Record the region decision + numbers in §3.1

**Later**
- [x] `docs` site deployed — on Mintlify-hosted infrastructure, not AWS
- [ ] Move `apps/invoicing` off Cloud Run (optional — Lambda container image)
