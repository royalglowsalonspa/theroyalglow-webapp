# M2AZURE — Move `apps/web` + `apps/admin` to Azure

> **M2AZURE** = *Move to Azure*. This is an alternative to the existing AWS
> deployment, following [M2AWS §12](M2AWS.md#12-portability-contract).

| Item | Proposal |
|---|---|
| Scope | Web and admin compute only: AWS SST/OpenNext → Azure Container Apps |
| Status | **Proposed / not deployed** |
| Reviewed | **2026-09-28**; repository inspection and official documentation, no live account audit |
| Region | `southeastasia` (Singapore), subject to availability, quota and latency gates |
| Edge / secrets | Front Door Standard / Key Vault; authoritative DNS stays on Cloudflare |
| Required work | Container packaging, cache coordination, Azure infrastructure and deployment workflow |
| Recovery | Retained Azure revisions plus a rehearsed return to the existing AWS stack |

Historical completion notes, outage reports and prices in [M2AWS](M2AWS.md) are
context, not proof of today's live state. Current implementation starts with
[SST](../sst.config.ts), [web](../apps/web/README.md), [admin](../apps/admin/README.md)
and [deployment workflow](../.github/workflows/deploy-aws.yml).

## 1. What runs where

| Component | Target | Change |
|---|---|---|
| `apps/web` | Separate Container App, behind Front Door | Move customer SSR, APIs and assets |
| `apps/admin` | Separate Container App, behind Front Door | Move staff SSR, APIs and signed job receivers |
| `apps/cms` | Existing Render deployment | None |
| `apps/invoicing` | Existing Cloud Run service | None |
| Database | Existing Neon environment branches | None |
| Media / invoice objects | Cloudflare R2 | None |
| Rate limits / jobs | Upstash Redis / QStash | None; validate existing integrations |
| Realtime / email | Ably / Resend | None |
| Analytics / monitoring | Existing PostHog, Sentry, Better Stack and other configured providers | Preserve wiring |
| DNS / documentation site | Cloudflare authoritative zone / existing docs host | None |

Proposed Azure resources are a Container Apps environment per deployment
environment, two apps per environment, ACR image storage, Key Vault, managed
identities and Monitor/Log Analytics. Production adds Front Door Standard with
separate web/admin routes; `www` redirects to the apex. These resources do not
exist merely because this plan names them.

## 2. Why nothing else moves

Neon HTTP access, R2's S3 interface and the HTTP provider integrations do not
require their compute host to be AWS. Preserve current database adapters,
transactions, integer-paise calculations, IST dates, idempotency and signatures.
Azure PostgreSQL, Blob Storage, Service Bus, Communication Services and SignalR
would expand this into separate data or product migrations and are outside scope.

Use a regular Node.js Next.js server in containers. Static export is unsuitable
for authentication, dynamic booking APIs and admin jobs. Container Apps avoids
depending on a managed Next.js adapter's version support, but transfers packaging
and distributed-cache responsibility to this repository.

This is **not a zero-change deployment**: neither current
[web config](../apps/web/next.config.ts) nor
[admin config](../apps/admin/next.config.ts) declares standalone output or a shared
cache handler. SST's ISR support must be replaced deliberately; the existing
Upstash rate limiter is not already a Next.js cache implementation.

## 3. Region choice

Start the proof of concept in Singapore (`southeastasia`). The repository records
Neon and Render CMS in Singapore; verify the actual target resources before
provisioning. Cross-cloud Singapore traffic still crosses provider networks and
is not equivalent to AWS co-location. Check regional Container Apps support,
subscription quota, registry placement and any availability-zone requirements.

Benchmark Azure against AWS on the same application SHA, representative data and
cache state: Indian-user p75 TTFB/LCP, p95 SSR/API duration, Neon round-trip latency,
CMS fetch latency, image optimization and cold starts. Provisional gates are no
more than 10% p95 regression against the measured AWS baseline, p75 TTFB ≤800 ms
and p75 LCP ≤2.5 s on agreed mobile profiles. Record exceptions before cutover.
Investigate query waterfalls before selecting another compute region; moving
compute does not move the database or establish India-only data residency.

## 4. Cost model

Prepare a dated estimate in the subscription's billing currency, with taxes and
all four environments shown separately. Do not reuse the AWS plan's launch bill.

| Cost driver | Budget input |
|---|---|
| Container Apps Consumption | Allocated vCPU/GiB seconds, active versus eligible idle time, requests and overlap during deployments |
| Front Door Standard | Profile base charge, edge requests, outbound transfer, origin traffic and optional WAF features |
| ACR | Registry tier, image storage, retained rollback digests and transfer |
| Key Vault | Secret operations and certificate choices |
| Monitor / Log Analytics | Ingestion, retention, queries and alert rules |
| Existing providers | Additional Neon load, Upstash cache requests/storage, QStash retries and provider traffic |
| Transition | Azure and retained AWS running simultaneously; CI image build/storage usage |

Consumption grants are shared at subscription level, not multiplied by apps.
Scaling to zero removes replica resource charges; keeping minimum replicas
incurs active or eligible idle charges. Registry, edge and logs remain separate.
See [Container Apps billing](https://learn.microsoft.com/en-us/azure/container-apps/billing),
[compute pricing](https://azure.microsoft.com/en-us/pricing/details/container-apps/)
and [Front Door pricing](https://azure.microsoft.com/en-us/pricing/details/frontdoor/).

Estimate low, expected and burst traffic using measured SSR time and cache hit
rates. Start production sizing experiments at 0.5 vCPU / 1 GiB per replica,
minimum one per app; load-test before fixing limits. Front Door probes can keep
origins active and increase database traffic. Budget alerts are notifications,
not spending caps; set replica ceilings and log retention as additional controls.

## 5. Phase 0 — Prerequisites

1. Capture AWS deployment SHA, stack/state status, CloudFront origins, certificate
   status and actual Cloudflare records. Record dependency health separately from
   host health; do not inherit historical claims that Redis or R2 is broken.
2. Establish Azure subscription/resource groups, billing owner, region/quota,
   recovery owner and service-specific permissions. Keep production isolated from
   development secrets, Neon branches and outbound notification destinations.
3. Create environment-scoped federated GitHub identity with least-privilege Azure
   roles. Use [OIDC](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect),
   not long-lived subscription credentials. Give app identities only required
   registry-pull and Key Vault-read access.
4. Inventory runtime and build variables from both env validators, guarded
   `process.env` readers, SST and existing CI. Compare names without logging values.
5. Read the installed Next.js self-hosting/output guides before implementation.
   Current manifests pin **Next.js 16.3.5** and **Bun 1.4.2**; preserve the lockfile,
   choose and pin a compatible supported Node runtime, and validate Linux images.
6. Agree on test accounts, disposable test data, callback hosts, acceptance metrics
   and the rollback window. Preparing this plan authorizes no provisioning.

## 6. Phase 1 — Azure configuration

### Container packaging and lifecycle

Create reviewed Dockerfiles and Azure IaC in a subsequent implementation change.
Build from the repository root with `bun install --frozen-lockfile`; build each
app separately using its existing workspace build script. Add standalone output
and monorepo tracing coverage, then copy the traced server, required workspace
files, `.next/static` and `public` into each runtime image. Verify generated
server paths rather than assuming the monorepo output layout. If prerendering
needs credentials, use temporary build secret mounts, never ARG/ENV or layers;
check for secrets/prerendered customer data. Exclude `.env`, credentials and source.

Run the generated server under Node as a non-root user, bind `0.0.0.0` and an
explicit port matching Container Apps ingress, and verify native image libraries.
Use graceful shutdown and a tested drain period. Configure startup/readiness and
liveness separately: a Neon outage must not cause an endless liveness restart
loop. Use the existing deep `/api/health` for release checks; design an inexpensive
process probe for platform/edge polling if the existing check is too costly.

Use Consumption replicas with explicit min/max and tested HTTP concurrency.
External ingress must reach both apps. Container Apps documents a 240-second
HTTP request timeout; the effective budget is the shortest of Front Door,
ingress, application and QStash limits. Measure report/invoice jobs against it;
PDF rendering remains on Cloud Run. [Ingress documentation](https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview).

### Shared cache and deployment consistency

Production requires a tested cache adapter for the repository's actual Next.js
cache APIs. Use an isolated Upstash namespace, with measured payload/command
limits, bounded TTLs, eviction and outage behavior; approve extra capacity if
needed. Entry keys separate environment, app and build; invalidation metadata
must reach every relevant build/replica. Do not silently mix cache eviction with
rate-limit state. Disable local memory caching where required by that adapter.

Exercise the CMS → web `/api/revalidate` path: edit a canary document, verify
tag/path invalidation on two replicas and both active revisions, restart one,
then repeat under cache-provider failure. Local ephemeral disk, sticky sessions
and `maxReplicas: 1` do not solve rolling-revision invalidation. Block production
until this contract passes; a single-replica proof of concept is only provisional.

All replicas of one release use the same image digest. Plan compatible deployment
identifiers, asset retention and Server Action encryption keys where applicable;
test navigation from an already-open browser across a release and rollback.
The [Next.js self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting)
explains the underlying per-instance cache and version-skew constraints; follow
the installed guide for this repository's pinned version.

### Front Door and origin behavior

Use Front Door **Standard**, with HTTPS to the Container Apps default hostname
and certificate-name verification enabled. Set origin Host explicitly for ACA
routing; validate canonical redirects and forwarded host/protocol behavior using
the real public origins. Do not allow wildcard auth/Server Action origins to
compensate for a proxy mismatch. See [origin configuration](https://learn.microsoft.com/en-us/azure/frontdoor/origin).

Initially cache only fingerprinted `/_next/static/*` assets at the edge. Bypass
HTML, RSC, APIs, auth, account/admin pages, jobs, revalidation and responses with
cookies. Preserve nonce CSP, private/no-store responses, query strings and image
optimization behavior. Test streaming through both proxy hops.

Standard uses public ACA origins in this design. Direct-origin access still
needs all existing authentication, authorization and webhook signatures; an edge
rule is not a substitute. Preserve the current untrusted-client-IP behavior.
If origin isolation is required, design supported IP restrictions plus Front Door
identity validation, or price Premium/Private Link as a separate topology change.
See [Front Door origin security](https://learn.microsoft.com/en-us/azure/frontdoor/secure-front-door).

## 7. Phase 2 — Secrets and environment

| Surface | Required treatment |
|---|---|
| Both server runtimes | Correct Neon branch, byte-identical `BETTER_AUTH_SECRET` within an environment, Google OAuth, Ably private key, Upstash and QStash credentials |
| Per-app identity | Distinct `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL`; web's `NEXT_PUBLIC_ADMIN_URL` points to its matching admin |
| Admin | Real `DATABASE_URL_UNPOOLED` as validator requires; Resend/VAPID, job tokens, heartbeat/report settings and invoice URL/HMAC from actual readers |
| Web | R2 settings, Resend/VAPID and `REVALIDATE_SECRET` identical to the retained CMS setting |
| Browser build | App/admin/CMS/R2 origins and public OAuth, analytics, Ably, VAPID and per-app Sentry settings; no private credentials |

Map Key Vault references into Container Apps secrets/environment using app managed
identity. Version release-sensitive secret references and record their versions;
secret changes are application-scoped, so rolling back a revision alone does not
restore old secrets. Test rotation/restart behavior. [Secret management](https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets).

Preserve [shared cookie handling](../packages/business/src/auth/cookie-domain.ts).
Production keeps `.theroyalglow.in`; preview hosts need an explicitly isolated
cookie domain and separate database/secret, not the production cookie scope.
Verify Google authorized origins/callback URIs, Better Auth accepted origins,
cross-app session recognition/logout and secure cookie attributes. Generic
`azurecontainerapps.io` URLs are insufficient evidence of production SSO.

Omit unset optional values; check both validators and direct readers. Unset
`SKIP_ENV_VALIDATION` during runtime verification (`"false"` still skips it).
Admin notification adapters can succeed without delivering when credentials are
missing; require controlled delivery evidence, not just job HTTP 200.

## 8. Phase 3 — CI/CD

Preserve [promotion](../.github/workflows/promote.yml): reviewed work enters `dev`
once, then the same validated SHA advances through `test → pprd → prod`, retaining
existing CI, CodeQL, integration, load/security and maintainer production gates.
No promotion PRs, cherry-picks or new environment commits.

Implement a dedicated Azure workflow with explicit SHA and target environment,
OIDC, environment concurrency, pinned tooling, image scan, ACR push and immutable
digest deployment. Build once per app/environment configuration and keep its
manifest: source SHA, dependency lock hash, public-config hash, image digest,
secret versions and revision identifiers. Azure supports deployment of an
[existing image](https://learn.microsoft.com/en-us/azure/container-apps/github-actions).

**Same SHA does not mean one image across environments.** `NEXT_PUBLIC_*` is
inlined during build, and current apps have environment-specific origins.
Build each environment's artifacts from that same SHA unless runtime public
configuration is separately implemented and validated. Never promote a preview
image whose client bundle points at the wrong database-facing applications.

`promote.yml` currently explicitly dispatches `deploy-aws.yml` because its
`GITHUB_TOKEN` branch pushes do not trigger push workflows. Add explicit Azure
deployment dispatch/wait gates at the relevant promotion stages and replace the
production AWS dispatch only at cutover. A moved Git ref is not deployed code.
Keep release processing intact; make AWS deployment manual/recovery-only during
the overlap so it cannot unexpectedly change DNS.

Use multiple-revision mode for candidate validation, then switch traffic after
both apps pass. Avoid arbitrary Next.js traffic splitting until cache/assets and
old-client behavior pass. Retain old image digests and revisions with compatible
configuration. [Azure revisions](https://learn.microsoft.com/en-us/azure/container-apps/revisions).
Database migration stays in [migrate.yml](../.github/workflows/migrate.yml), using
explicit direct Neon URLs and forward migration discipline, never container boot.

## 9. Cutover

1. Validate test/pprd on isolated custom domains: real Google sign-in, role/ownership
   denial, booking, invoice PDF plus delivery, Ably, rate limits and one signed job.
   No production schedules or customer notifications during preview checks.
2. Rehearse recovery before DNS changes: deploy the recorded known-good SHA through
   the retained AWS path, inspect SST/Pulumi state, test both AWS origins with
   production Host/TLS semantics, and record elapsed restoration time. Suspended
   Render web/admin definitions are not rollback infrastructure.
3. Export Cloudflare record IDs/values/TTLs/proxy states and SST ownership. Freeze
   competing DNS writers; review a retain/import/state-transfer procedure for
   only apex, `www`, admin and related certificate records. Removing SST domain
   blocks blindly may delete records or detach the AWS aliases needed for rollback.
4. Prevalidate Front Door domains with its TXT records and provision certificates;
   inspect CAA authorization for the selected issuer without removing existing
   AWS/CMS/R2/mail issuers. Keep the zone on Cloudflare and preserve unrelated
   records. [Domain onboarding](https://learn.microsoft.com/en-us/azure/frontdoor/standard-premium/how-to-add-custom-domain).
5. Prepare Cloudflare apex-flattening and DNS-only subdomain record values for the
   actual Front Door endpoint; apply only in step 6. Validate certificate renewal:
   [Azure's apex guidance](https://learn.microsoft.com/en-us/azure/frontdoor/front-door-how-to-onboard-apex-domain)
   calls out renewed domain validation for managed certificates. Document the
   renewal procedure/alerts or use a reviewed BYOC lifecycle before launch.
6. Lower affected TTLs and wait out their former values. With TLS ready, change
   only the agreed records; verify apex, `www` redirect, admin, auth callbacks,
   health JSON, assets, CMS invalidation and provider reachability through Front Door.
   Pause CMS publishing or invalidate both hosts during DNS convergence; QStash URLs stay unchanged.
7. Keep AWS deployable, certificates/aliases valid and recovery secrets available
   for at least seven days and one full business/report cycle. Ensure only one
   set of QStash schedules exists. Do not re-register unchanged schedules as a
   smoke test; production job tests must use controlled, idempotent work.

Rollback immediately for auth/authorization failure, incorrect booking/billing,
unrecoverable job delivery or sustained release-gate regression. Route back to
the last verified Azure revision for a release fault; for a platform fault,
restore captured Cloudflare records to verified AWS distributions under the same
single DNS owner. Recheck sessions, health, jobs and content; DNS caches mean a
mixed-host interval. Refresh/invalidate AWS content caches before serving traffic.
Writes remain in Neon, so compatible code sees current data; irreversible schema
changes need a separate forward-fix/PITR decision, not a DNS rollback.

## 10. Observability

Correlate source SHA, image digest, app, environment and revision in release
records and structured logs. Monitor replica restarts/OOM, scale events, requests,
p95 latency, 5xx, Front Door origin failures, cache errors and certificate expiry.
Keep Sentry, consent-aware analytics and Better Stack monitors/heartbeats wired.

Parse `/api/health` JSON: HTTP 200 may be `degraded`; require database pass and
explicit disposition of optional dependency failures. Alert on missed QStash
heartbeats, retries and actual delivery failures. Confirm redaction and retention
before shipping logs; do not duplicate sensitive payloads into Log Analytics.
After one billing cycle compare measured spend and Indian-user performance with
the baseline and decide whether Azure's operational benefits justify its cost.

## 11. Known tradeoffs

- Container portability removes the OpenNext adapter requirement but adds image
  maintenance, cache correctness, replica sizing and release-skew ownership.
- Front Door and ACR introduce baseline costs even when customer traffic is low.
  A direct-ingress variant is cheaper infrastructure but changes edge/TLS behavior.
- Minimum replicas reduce cold starts but cost money; one replica is not a
  high-availability guarantee. Multi-replica production depends on the cache gate.
- Regional compute remains dependent on cross-cloud Neon/CMS availability and
  network latency. This proposal adds no database disaster-recovery capability.
- Revision rollback cannot undo secret/ingress changes, sent notifications or
  database mutations; AWS recovery is credible only after the rehearsal passes.

## 12. Portability contract

| Capability | Current AWS implementation | Proposed Azure implementation |
|---|---|---|
| Next.js SSR | SST/OpenNext Lambda | Node standalone containers in Container Apps |
| Secret delivery | SST Secrets / SSM | Key Vault references and managed identity |
| CDN / TLS | CloudFront / ACM | Front Door Standard / validated certificates |
| Logs / metrics | CloudWatch | Monitor / Log Analytics |
| Next.js cache coordination | SST-managed ISR resources | Tested shared cache adapter and invalidation protocol |
| Rollback artifact | Known-good SHA plus retained SST state | Immutable images/revisions plus rehearsed AWS fallback |

Cloudflare DNS, Neon, R2, Upstash, QStash, Ably, Resend, Render CMS and Cloud Run
invoicing retain their current service boundaries. Do not embed Azure SDK calls
in business/domain packages. Keep the container and environment contract usable
by the other [M2C plans](M2AWS.md#12-portability-contract).

## 13. Progress checklist

All execution items remain pending; documentation research is not deployment.
- [ ] Record live AWS/dependency baseline, intended region/quota and cost estimate.
- [ ] Implement reviewed IaC, OIDC, managed identities and secret inventory.
- [ ] Build/test Linux images from the pinned workspace; scan and retain digests.
- [ ] Pass replica/revision CMS invalidation, restart and cache-outage tests.
- [ ] Pass old-browser navigation, auth, RBAC, booking and invoice delivery gates.
- [ ] Verify jobs, CMS webhook, Ably, R2 and external reachability through the edge.
- [ ] Wire exact-SHA deployments and environment gates into existing promotion flow.
- [ ] Rehearse Azure revision rollback and real AWS recovery; record measured time.
- [ ] Transfer DNS ownership, validate TLS/CAA and document apex certificate renewal.
- [ ] Cut over, observe a full business cycle and retain AWS for the agreed window.
- [ ] Review performance/cost; retire AWS compute only after recovery sign-off.
