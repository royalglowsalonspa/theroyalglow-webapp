# RGSS Technical Glossary — Open Issues Reference (#187–#208)

This glossary exists so that any collaborator — human or AI coding agent (Claude Code, Cursor, OpenCode, Kiro, or otherwise) — picking up any of the currently open issues in `royalglowsalonspa/theroyalglow-webapp` can understand the vocabulary on sight, without having to re-derive it from source code, provider docs, or tribal knowledge. It is a **reference**, not a summary of the issues themselves: look things up here, then go read the actual issue for the specific defect, evidence, and fix. Terms are grouped by domain; a few terms that are easy to confuse with something else (same name, different meaning) are flagged explicitly.

---

## Infrastructure & Cloud (AWS / SST / Neon / Cloudflare)

| Term | Definition | Where it applies |
|---|---|---|
| **AWS Lambda** | Serverless compute — code runs only on request, in an ephemeral "execution environment," and the platform scales instances up/down automatically. No persistent local filesystem between invocations. | Hosts SSR for both `apps/web` and `apps/admin` via SST. Central to #189, #190, #191 (in-memory state doesn't survive across instances or cold starts), #201, #206. |
| **Cold start** | The latency penalty when a Lambda function is invoked with no warm execution environment available, so the runtime has to initialize from scratch. On a cold start, anything held in process memory (counters, caches) starts empty. | Root cause of why in-memory rate-limit counters in #189 don't provide real protection; measured as ~3.8s in #206's one-off sample. |
| **CloudFront** | AWS's CDN/edge network. Sits in front of the Lambda origins, caches static assets, and is the only "front door" traffic is supposed to go through. | Distributes both apps; central to the client-IP trust problem in #191 (appends rather than overwrites `X-Forwarded-For`); alarm target in #197. |
| **SST (Serverless Stack)** | The Pulumi-based infrastructure-as-code framework used to declare all AWS resources in `sst.config.ts`. Deploys are `bunx sst deploy`; secrets are `bunx sst secret set`. | Declares the `Web` and `Admin` components; referenced throughout #189–#203, #207. |
| **`sst.aws.Nextjs`** | The specific SST "component" type that takes a Next.js app and provisions everything needed to run it on Lambda + CloudFront (S3 bucket, SSR Lambda, image-optimizer Lambda, CloudFront distribution, ISR plumbing). | Used for both `Web` and `Admin` in `sst.config.ts`. |
| **`sst.aws.StaticSite`** | A lighter SST component for sites with no server-rendering needs (just static files behind CloudFront/S3). No Lambda, no ISR machinery. | Proposed in #207 as a better fit than `Nextjs` for the docs site if it moves to AWS. |
| **OpenNext** | The open-source adapter that translates a Next.js build into the Lambda/CloudFront/SQS/DynamoDB primitives SST actually provisions. SST's `Nextjs` component uses it internally — it's *why* an SSR Lambda, an image-optimizer Lambda, and an ISR queue all exist per app. | Underlies every Lambda-related issue (#197, #201, #206). |
| **`sst.Secret`** | SST's typed wrapper for a value stored in AWS SSM Parameter Store. `new sst.Secret('Name')` fails the *deploy* if the value was never set — a deliberate loud failure instead of a silent wrong default. | Proposed fix in #202 for `DATABASE_URL_UNPOOLED`. |
| **`passthrough(...)`** | An SST config helper that forwards a value into a Lambda's environment **only if it has a real value** — unset variables are omitted from the environment entirely rather than passed through as `''`. | Referenced in #199 and #200 (why `INVOICING_SERVICE_URL`/Slack webhook must be added to the `Admin` component's passthrough block). |
| **SST "nodes"** | The lower-level, raw AWS resources (the actual Lambda function, the actual SQS queue) that a high-level SST component creates under the hood. Components expose them as an escape hatch for things SST doesn't wrap directly, like attaching a CloudWatch alarm. | Used in #197's proposed fix to attach alarms to the SSR function and ISR queue. |
| **ARM64** | The Graviton (ARM) CPU architecture AWS Lambda can run on instead of x86 — generally cheaper and often faster for Node.js workloads. | The SSR Lambdas for both apps run on ARM64 (noted in #197). |
| **ISR (Incremental Static Regeneration)** | A Next.js rendering mode: pages are served from a cache and regenerated in the background after a TTL expires, rather than rendered fresh on every request. On the Lambda/OpenNext architecture this needs supporting infrastructure — see next two rows. | Referenced in #197, #201, #206 as a rendering strategy to prefer for non-per-user pages. |
| **ISR tag cache (DynamoDB)** | A DynamoDB table SST/OpenNext provisions per app to track which cached pages are stale and need regeneration. | Part of the "never expires" free-tier resource list in the cost model; referenced in #197. |
| **ISR revalidation queue (SQS)** | An SQS queue that carries "please regenerate this page" jobs. **If this queue stalls, CloudFront keeps serving stale pages forever with no visible error anywhere** — described in #197 as the least obvious failure mode in this architecture. | Central concern of #197's proposed `ApproximateAgeOfOldestMessage` alarm. |
| **`ApproximateAgeOfOldestMessage`** | A specific CloudWatch metric for SQS: how long the oldest unconsumed message has been sitting in the queue. A rising value means consumers have stopped draining the queue. | The proposed alarm metric for detecting a stalled ISR queue in #197. |
| **Image optimizer (Lambda)** | A second, separate Lambda function OpenNext provisions per app specifically to resize/transform images requested via Next.js's `next/image`. Has its own (shorter) log retention. | Mentioned in #197's log-retention table (3 days vs. 30 days for the SSR function). |
| **Lambda execution timeout** | The maximum wall-clock time AWS allows a single Lambda invocation before it's killed. Configured per app: 20s for `Web`, 30s for `Admin`. | Relevant to #201 — write paths (booking, invoice) have never been timed against this ceiling in production. |
| **Lambda response size limit** | A hard AWS ceiling (6 MB) on the size of a synchronous Lambda response. Exceeding it fails the request regardless of application code. | Named in #201 as one of the ways the Lambda runtime differs from the old Render hosting for write-heavy responses. |
| **S3** | AWS's object storage. Here, holds each app's static build assets (JS/CSS bundles) served through CloudFront — unrelated to Cloudflare R2, which is a separate bucket for a separate purpose (see below). | Provisioned per app by `sst.aws.Nextjs`. |
| **AWS Budgets** | AWS's spend-threshold alerting service — fires when *actual or forecasted dollar spend* crosses a configured amount. | The existing `rgss-monthly-cost` $5 budget, discussed in #204 as a *lagging* signal (fires after money is already being spent). |
| **AWS Free Tier usage alerts** | A separate, *earlier* warning signal from Free Tier alerting when a specific free allowance (e.g., Lambda GB-seconds, CloudFront requests) is being consumed — before it necessarily produces a dollar charge. | Not yet enabled; the actual ask in #204, contrasted with the budget alarm above. |
| **AWS root user** | The original, un-constrainable account identity created when an AWS account is opened. Cannot be limited by IAM policy — it can close the account or change billing. Should never be used for day-to-day work once an IAM user exists. | Subject of #204 (MFA + access-key hygiene) — day-to-day work already correctly runs as IAM user `rgss-admin`. |
| **IAM (Identity and Access Management)** | AWS's permissions system: roles, policies, and users that control who/what can do what. | Central to #203 (the GitHub deploy role) and #204 (root user). |
| **`AdministratorAccess`** | An AWS-managed IAM policy granting unrestricted access to virtually everything in the account. The opposite of least-privilege. | Currently attached to the `rgss-github-deploy` role — the problem #203 exists to fix. |
| **Least privilege** | The security principle of granting only the specific permissions a role actually needs, nothing more — usually derived empirically (e.g., from CloudTrail history) rather than guessed upfront. | The target end-state for `rgss-github-deploy` in #203. |
| **GitHub OIDC (OpenID Connect)** | A federation mechanism letting a GitHub Actions workflow assume an AWS IAM role by presenting a short-lived, cryptographically verifiable token — no long-lived AWS access keys stored as GitHub secrets. | How `deploy-aws.yml` authenticates to AWS; the trust relationship lives in `infra/aws/oidc-trust.json`, discussed in #203. |
| **CloudTrail** | AWS's audit log of every API call made against the account (who called what action, when). | Proposed in #203 as the empirical source for deriving the deploy role's actual permission needs, rather than guessing. |
| **ACM (AWS Certificate Manager)** | AWS's free TLS certificate issuance/renewal service, used automatically by CloudFront distributions. | One of the three CAs allowlisted in the zone's CAA records (#205); already covered for `sst deploy`, so it needs no CAA change if the docs site moves to AWS (#207). |
| **OAC (Origin Access Control)** | A CloudFront feature that lets CloudFront authenticate to an origin (S3, or via a Lambda function URL) using AWS IAM credentials, so the origin can reject any request that didn't come through CloudFront. Successor to the older, more limited OAI (Origin Access Identity). | Proposed in #191 as part of blocking direct-to-Lambda requests that bypass CloudFront, so a trusted client-IP header can't be forged by calling the origin directly. |
| **SNS (Simple Notification Service)** | AWS's pub/sub notification service — one topic can fan out to multiple subscribers (email, webhook, SMS, etc.). | Proposed in #197 as the single fan-out point for all new CloudWatch alarms (email subscription, optionally a BetterStack webhook subscription too). |
| **SQS (Simple Queue Service)** | AWS's managed message queue. In this codebase it appears specifically as the ISR revalidation queue (see above) — not to be confused with any application-level job queue (background jobs here run on QStash, not SQS). | See "ISR revalidation queue" above; #197, #206. |
| **DynamoDB** | AWS's managed NoSQL database. Used narrowly here as OpenNext's ISR tag-tracking table — **not** the application's primary database (that's Neon Postgres). | See "ISR tag cache" above. |
| **`ap-southeast-1`** | The AWS region (Singapore) all Lambda compute runs in. Chosen because Neon has no Mumbai region, and co-locating compute with the database matters more than co-locating compute with end users. | Region for all AWS resources; under a scheduled one-month latency review in #206. |
| **Region review / one-month latency review** | A pre-committed checkpoint (per `M2AWS.md` §3.1) to look at real production latency data ~4 weeks after cutover and explicitly decide whether Singapore is still the right region, rather than letting the choice become permanent by default. | The entire subject of #206. |
| **Read replica** | A read-only copy of a database kept in sync with the primary, used to scale read throughput or reduce latency for geographically distant readers. | Named in #206 as an escalation option *after* query optimization and caching — and only before ever considering a full region move. |
| **Neon** | The managed, serverless Postgres provider used as the primary database. Supports instant copy-on-write "branches" (see below) and separate pooled/direct connection strings. | Referenced constantly; see Database & Migrations section for connection-string specifics. |
| **Neon branch / fork** | A near-instant, copy-on-write clone of a Neon database at a point in time. Cheap to create, consumes part of the account's branch quota, and diverges from its parent over time as writes continue on both sides. | `restore-point-better-auth-1-7` in #194 is exactly this — a pre-migration safety snapshot, explicitly *not* a substitute for real offsite backups. |
| **`NEON_API_KEY`** | The credential used by tooling (`packages/db/scripts/drift/neon-admin.ts`) to manage Neon branches programmatically (list, delete, fork) via Neon's control-plane API — distinct from a database connection string. | Used in #194's proposed branch-deletion script. |
| **Cloudflare R2** | Cloudflare's S3-compatible object storage, used for file uploads (e.g., invoice PDFs) and the weekly database backup archive. Zero egress fees. Distinct from AWS S3 (which only holds each app's own static build assets). | Health-checked in #192; backup upload target in #188. |
| **Upstash Redis** | A serverless, REST-API-driven Redis provider (no persistent TCP connection needed, which suits Lambda). Used here for distributed rate-limit counters and a planned service-catalogue read cache. | Unreachable in production per #190; blocks the preferred fix for #189 and partially affects #191. |
| **QStash** | Upstash's HTTP-based message queue/scheduler. Used for all cron-style and triggered background jobs (reminders, expiry sweeps, reports) because it can wake a scaled-to-zero Neon compute with an HTTP POST, unlike `pg_cron` which only fires while the database happens to be awake. | The delivery mechanism behind the report jobs in #200 and #199's invoicing flow context. |
| **Google Cloud Run** | Google Cloud's serverless container platform. Hosts `apps/invoicing`, a separate microservice *outside* the AWS footprint. | Subject of #199 — its URL was never configured (or possibly never deployed) in production. |
| **CAA record (Certification Authority Authorization)** | A DNS record type that restricts which Certificate Authorities are allowed to issue TLS certificates for a domain/zone. Applies to the **whole zone**, not just one subdomain. | Central to #205: SST only manages the AWS/ACM CAA pair, while two other manually-added pairs (Let's Encrypt, Google Trust Services) exist only in Cloudflare, undocumented. |
| **ACME protocol** | The standard protocol (used by Let's Encrypt and others) for automating certificate issuance/renewal without a human — a domain proves it controls the hostname (e.g., via a DNS challenge record) and gets a cert issued automatically. | The `_acme-challenge.docs` orphaned TXT record in #207 is a leftover ACME domain-validation artifact from the old (Sevalla) hosting. |
| **Route 53** | AWS's DNS service. **Explicitly rejected** as a migration target here — Cloudflare stays the authoritative DNS provider for `theroyalglow.in` even though compute moved to AWS. | Named only to rule it out, in #205 and #206. |
| **Well-Architected Framework** | AWS's set of published best-practice pillars (security, reliability, cost, etc.) for designing cloud systems. | Cited in #203 as the standard the over-broad `AdministratorAccess` deploy role violates. |

> **Naming collision to watch for:** "SPA" elsewhere in this codebase's business vocabulary means **spa** (the wellness service line — see Business Domain section), **not** "Single-Page Application." Context always disambiguates, but it's worth flagging for anyone pattern-matching on the acronym.

---

## Authentication & Security

| Term | Definition | Where it applies |
|---|---|---|
| **Better Auth** | The authentication library used by both apps (`apps/web/src/lib/auth-server.ts`, `apps/admin/src/lib/auth-server.ts`). Configured with a Google-only social provider, a Drizzle database adapter, and (per-app) plugins. | Subject of #189, #196; recently upgraded 1.6.26 → 1.7.2, reviewed in the #195 tracker. |
| **`secondaryStorage`** | A Better Auth configuration option that points internal state (sessions, rate-limit counters) at an external key-value store instead of the default in-process memory or the primary database. | Proposed fix in #189 — wiring Upstash Redis in as `secondaryStorage` so rate-limit counters are shared across Lambda instances. |
| **Rate limiting / sliding window** | Throttling requests per identity over a rolling time window (e.g., "5 requests per 60 seconds"), instead of a fixed window that resets abruptly at a boundary. | Both Better Auth's built-in limiter (#189) and the app-level limiter in `rate-limit.ts` (#190, #191) use this model. |
| **Rate-limit "bucket" / key** | The identity string a rate limiter counts against (e.g., `leads:unknown`, or `session.user.id` for authenticated calls). Everyone sharing the same key shares the same budget. | #191 is entirely about the anonymous bucket key collapsing to the literal string `'unknown'` for every visitor. |
| **`429` (Too Many Requests)** | The HTTP status code returned when a caller has exceeded their rate-limit budget. Often paired with a `Retry-After` header telling the caller how long to wait before trying again. | Expected behavior once rate limiting works correctly in #189 and #191. |
| **`getClientIp()`** | A function in `apps/web/src/lib/api/rate-limit.ts` (and its `apps/admin` mirror) meant to resolve the real visitor IP address for use as a rate-limit key. Currently hard-coded to return the string `'unknown'` for everyone. | The entire subject of #191. |
| **`X-Forwarded-For`** | A de facto standard HTTP header that proxies use to record the chain of client IPs a request passed through. **Not trustworthy as-is here** because CloudFront currently *appends* to it rather than overwriting it, so a client can plant whatever value they like at the front of the chain. | Explains why #191's fix requires CloudFront to *overwrite* a dedicated header instead of trusting this one. |
| **OAuth (Google OAuth)** | The authorization protocol used for "Sign in with Google." The app requests an authorization URL from Better Auth, redirects the user to Google, and Google redirects back to a registered callback URL with a code. | Broken specifically for the admin subdomain in #196. |
| **`redirect_uri_mismatch`** | Google's specific OAuth error, returned when the `redirect_uri` param in the auth request doesn't exactly match one of the URIs pre-registered on the OAuth client in Google Cloud Console. Exact string match — no wildcards. | The precise error blocking all admin sign-ins in #196. |
| **Authorised redirect URIs / Authorised JavaScript origins** | Two separate allowlists configured per OAuth client in Google Cloud Console: the first gates where Google will redirect back to after login; the second gates which origins may render Google's client-side sign-in UI (needed for One Tap/GSI, see below). | The two settings #196 requires an update to (add `admin.theroyalglow.in` to both). |
| **Google One Tap / GSI (Google Identity Services)** | Google's client-side "one-tap" sign-in widget, distinct from the server-side redirect OAuth flow — it renders inline on the page and requires the origin to be in the "Authorised JavaScript origins" list specifically (not just the redirect URIs list). | Mentioned in #196 as a reason to also register the admin origin as a JS origin; part of the still-outstanding browser sign-in verification matrix in #189, #194, #201. |
| **`BETTER_AUTH_URL`** | The env var Better Auth uses to derive its own base URL — and therefore the OAuth callback path it constructs (`{BETTER_AUTH_URL}/api/auth/callback/google`). Set per-component in `sst.config.ts`. | Root cause of #196: the admin app correctly builds a URL for `admin.theroyalglow.in`, but Google never had that URL allowlisted. |
| **Session cookie (`.theroyalglow.in` scoped)** | The auth session cookie is scoped to the parent domain (not a specific subdomain), so a single sign-in on either `theroyalglow.in` or `admin.theroyalglow.in` is honored by both apps. | Verified as a precondition in #196 and #201. |
| **RBAC (Role-Based Access Control)** | Access control where permissions are granted based on a user's assigned role rather than per-user. This codebase uses a 6-level hierarchy (Developer > Owner > Manager > Receptionist > Staff > Customer). | Gates every admin route; referenced directly in #196's acceptance criteria ("an RBAC-gated admin route... renders for a Manager or Owner account"). |
| **DPDP Act (Digital Personal Data Protection Act, 2023)** | India's comprehensive personal-data-protection statute — establishes obligations around lawful processing, data minimization, and stewardship of personal data, enforced by the Data Protection Board of India. | Cited as a compliance concern in #188 (no working backup = can't evidence data stewardship) and #194 (retaining a stale snapshot of customer PII indefinitely cuts against data minimization). |
| **HMAC (Hash-based Message Authentication Code)** | A cryptographic technique for verifying both the integrity and authenticity of a message using a shared secret key — the sender and receiver each compute a hash over the message plus the secret, and compare. | Used for the handshake between the main app and the separate invoicing microservice (`InvoicePdfHmacSecret` / `INVOICE_PDF_HMAC_SECRET`) in #199 — the secret must be byte-identical on both sides or requests are rejected. |
| **`getAuthTables()` / auth schema contract test** | A Better Auth API that reports which database tables/fields/indexes its currently-configured plugins require. `apps/web/src/lib/auth-schema-contract.test.ts` calls this and asserts the actual Drizzle schema satisfies it — a self-updating gate that fails automatically if a plugin (like database-backed rate limiting) needs a table that doesn't exist yet. | Would fail on purpose if Option B (database-backed rate limiting) is chosen in #189. |

---

## Database & Migrations

| Term | Definition | Where it applies |
|---|---|---|
| **Drizzle ORM** | The TypeScript ORM used for all database schema definitions and queries — pure TypeScript, no native binary, works well in edge/serverless runtimes. | `packages/db/src/schema/`; referenced in #189 (needing a new `rateLimit` model). |
| **`drizzle-kit generate` / `migrate` / `push`** | Three different drizzle-kit commands: `generate` diffs the schema against the last snapshot and writes new SQL migration files; `migrate` applies committed migration files to a real database; `push` directly syncs schema to a database with no migration file at all (local experimentation only — never against shared branches, per this repo's migration discipline). | Not directly the subject of any single issue here, but the underlying discipline #189's "Option B" would have to follow. |
| **Migration drift** | The situation where a database's actual schema no longer matches what the committed migration history says it should be — usually from an ad-hoc `push` against a shared branch. Detected here via a schema "fingerprint" comparison. | Referenced in #189 (adding a table means regenerating "the drift fingerprint reference") and underlies why `push` is banned against shared branches project-wide. |
| **Fingerprint (schema fingerprint)** | A deterministic hash/summary computed from the committed schema snapshot, used to detect drift without needing a live database connection (important in CI, which has no Neon branch of its own). | Regeneration is called out as a required step if #189's Option B (new `rateLimit` table) is taken. |
| **`DATABASE_URL_UNPOOLED` vs. pooled `DATABASE_URL`** | Two different connection strings to the same Neon database: the **pooled** one goes through Neon's connection pooler (pgBouncer, see below) and is for normal app queries; the **unpooled/direct** one bypasses the pooler and is required for migrations and any session-level SQL construct. | #202: `sst.config.ts` was silently defaulting the admin app's "unpooled" variable to the *pooled* URL whenever the real one wasn't present at deploy time — wrong value, but still a syntactically valid URL, so validation never caught it. |
| **pgBouncer / transaction pooling mode** | pgBouncer is the connection pooler Neon uses for pooled connections. In "transaction pooling" mode, a database session is only borrowed for the duration of a single transaction, so anything that needs a stable session across statements — advisory locks, `SET` statements — doesn't work reliably. This is *why* migrations and drift tooling must use the unpooled connection. | The mechanical reason #202's misconfiguration is dangerous even though nothing has broken yet. |
| **Advisory lock** | A Postgres locking primitive an application can take out manually (not tied to a specific row/table) — commonly used by migration tools to prevent two processes from migrating the same database concurrently. Requires a stable session, so it doesn't survive transaction-mode pooling. | Named in #202 as an example of what silently breaks if migration tooling is accidentally pointed at the pooled connection. |
| **`pg_dump`** | PostgreSQL's standard command-line utility for producing a logical backup (SQL dump) of a database. | The core of the weekly backup job in #188 — fails silently when piped without `pipefail` (see below). |
| **`pipefail` (`set -o pipefail` / `set -euo pipefail`)** | A shell option that makes a pipeline (`a \| b`) report failure if **any** stage fails, not just the last one. Without it, `pg_dump ... \| gzip > file` reports success (gzip's exit code) even if `pg_dump` itself failed and produced nothing. Bash's default `-e` flag does **not** imply this. | Root cause of #188 — a completely empty backup archive was reported as a successful 4.0 KB backup for months. |
| **Forward-only migrations / expand-contract** | The discipline of only ever adding new migration files — never editing, reordering, or deleting a committed one. "Expand-contract" is the pattern for schema changes that need to stay backward-compatible mid-rollout: first add the new shape ("expand"), migrate usage, then later remove the old shape in a separate migration ("contract"). | Referenced in #189 for Option B (add `rateLimit` table now; a future removal would need its own forward migration, not an edit to this one). |
| **`neon-admin.ts` / Neon control-plane API** | An internal script (`packages/db/scripts/drift/neon-admin.ts`) wrapping Neon's management API for branch operations (list, create, delete) — separate from any database connection string, authenticated via `NEON_API_KEY`. | Used in #194's proposed one-off branch-deletion script; note its constructor takes an environment-variable record, not a config object. |

---

## Configuration, Secrets & Environment Variables

This is a cross-cutting theme across many of these issues: a capability is declared **required** by a strict schema, but is silently non-functional or absent at runtime, and nothing distinguishes "intentionally off" from "broken."

| Term | Definition | Where it applies |
|---|---|---|
| **`env.ts` (per-app Zod-validated environment module)** | Each app (`apps/web/src/env.ts`, `apps/admin/src/env.ts`) declares its expected environment variables as a Zod schema (built on a t3-env-style helper, per project convention) and validates them at build/startup time. A required variable that's missing or malformed fails the build outright — which is exactly why several of these issues involve variables that pass validation but are still functionally wrong (see #202) or point at something that no longer exists (see #190). | Central to #187, #189, #190, #193, #198, #199, #202. |
| **Zod** | The TypeScript schema-validation library used for both environment variables and API request bodies. `.safeParse()` returns a result object instead of throwing, so callers can handle invalid input without a try/catch. `z.string().url()` validates that a string is a syntactically well-formed URL — but says nothing about whether that URL actually resolves to anything real. | The `z.string().url()` gap is exactly why #202's wrong-but-valid pooled URL sailed through validation. |
| **`emptyStringAsUndefined`** | A t3-env/env-validation option that treats an empty string as if the variable were entirely absent (`undefined`) rather than as a present-but-empty value. Matters because GitHub Actions renders an unset `vars.FOO` reference as `''` rather than omitting it. | Explains why builds succeed instead of hard-failing on a missing `NEXT_PUBLIC_SENTRY_DSN` in #198 — the failure becomes silent by design, not by accident. |
| **`NEXT_PUBLIC_*` prefix** | Next.js's convention for environment variables that get **inlined directly into the client-side JavaScript bundle at build time**. Critically, setting or changing one of these *after* a build has already run has zero effect on already-built bundles — a rebuild is mandatory. | The crux of #198 (Sentry DSNs must exist in CI *at build time*, not just at runtime) and part of why R2/VAPID/analytics vars are treated specially throughout. |
| **Optional-dependency dynamic-import pattern** | A recurring code idiom in this repo: `await import('some-package' as string).catch(() => null)`, used to make a heavy or paid SDK genuinely optional so its *absence* doesn't break the build. The failure mode: this converts a missing-dependency **build error** into a silent **runtime no-op**, especially when combined with `debug`-level logging on the failure branch. | The exact mechanism behind both #187 (`resend` missing from `apps/web`) and #193 (`web-push` missing everywhere) — called out explicitly as a cross-cutting theme in the #195 tracker. |
| **Repository secret vs. repository variable (GitHub Actions)** | GitHub Actions has two similar-but-distinct stores for configuration: **secrets** are encrypted, never shown in logs, and appropriate for credentials; **variables** are plain text and appropriate for non-sensitive values (including things like a Sentry DSN, which ships to the browser anyway and benefits from being visible in logs for debugging). | The precise distinction #198 relies on (DSNs as variables) and #200 relies on (Slack webhook as a secret, recipient list as a variable). |
| **Environment-scoped secret** | A GitHub Actions secret/variable scoped to a named deployment "environment" (e.g., `production-aws`) rather than the whole repository — only available to workflow runs targeting that environment. | #188 found both relevant environments (`production-aws`, `staging - docs`) had **zero** environment-scoped secrets configured, unlike the repo-level secrets that did exist. |
| **SSM Parameter Store** | The AWS service SST uses under the hood to store values set via `bunx sst secret set` — server-side secrets never touch GitHub Actions at all; they're injected into the Lambda environment directly from SSM at deploy time. | Contrasted with `NEXT_PUBLIC_*` GitHub Actions variables throughout the secrets-related issues; the over-broad deploy role in #203 can read "every SSM secret" in the account. |
| **`packageManager` pin (`bun@1.3.13`)** | A field in the root `package.json` (and honored by `deploy-aws.yml`) pinning the exact Bun version the project is built with, so a locally-installed newer Bun doesn't produce a different lockfile/build than CI. | Explicitly called out in #187 and #193's fix steps — reinstall with `bunx bun@1.3.13 install`, not whatever Bun happens to be on `PATH`. |

---

## Business Domain (India-specific)

| Term | Definition | Where it applies |
|---|---|---|
| **GST (Goods and Services Tax)** | India's consumption tax, applied here at a flat **18%**, always **inclusive** in displayed prices (the tax is backed out of the total rather than added on top). | Verification criterion in #199 and #201 (invoice PDF/completion must show the correct GST split). |
| **SAC (Services Accounting Code)** | The classification code used under India's GST regime to categorize a *service* for tax purposes (the services equivalent of an HSN code for goods). This business's salon/spa services are filed under SAC `999721`. | Named specifically in #199's PDF-correctness acceptance criteria. |
| **Paise** | The smallest unit of Indian currency (1 rupee = 100 paise). All money in this codebase is stored as an integer number of paise — never a float — to avoid floating-point rounding errors in financial math. | Verification criterion in #201 ("money verified in paise with no floating-point drift"). |
| **Indian numbering (currency formatting)** | India's digit-grouping convention for large numbers — groups after the first three digits from the right use pairs, not triples (e.g., ₹1,00,000.00, not ₹100,000.00). | Acceptance criterion in #199 and #201 for the invoice PDF and email. |
| **Financial Year (FY)** | India's tax/accounting year, running April 1 to March 31 (not calendar-year). Encoded into invoice numbers. | Part of the invoice number format `INV-{branch}-{FY}-{5 digits}` referenced in #199. |
| **Gems (loyalty points)** | The loyalty-points currency customers earn on completed **service** bookings — 1 gem per ₹100 invoiced, rounded down. Never awarded on membership purchases or membership sessions. | Verification step in #201 (booking completion should award gems correctly, and *not* award them for a membership session). |
| **SPA membership** | An hours-based subscription tier (Silver/Gold/Platinum) giving a customer access to spa services, metered in hours rather than by visit count. (Note: "SPA" here means the wellness service line, not "Single-Page Application.") | Referenced in #201's end-to-end verification checklist. |
| **Booking lifecycle** | The state machine a booking moves through: `pending → confirmed/rejected → in_progress → completed`, with `cancelled`/`no_show`/`rescheduled` as side-exits. Walk-ins skip `pending` and start at `confirmed`. | Exercised (or rather, *not yet* exercised on AWS) in #201's smoke-test checklist. |
| **Booking number format** | `BK-{branch_code}-{YYMM}-{H\|S}-{5-digit random}[-M]` — e.g., `H`/`S` distinguishes salon (hair) from spa services, and a `-M` suffix marks a membership session. | A concrete check item in #201 ("confirm the `BK-RS-YYMM-H-NNNNN` number format"). |
| **Invoice number format** | `INV-{branch number}-{financial year}-{5-digit random}`. | Verification criterion in #199. |
| **Invoicing microservice (`apps/invoicing`)** | A separate service, *outside* the main AWS/Next.js apps, built on **Hono** (a small, fast web framework) and **`@react-pdf/renderer`** (renders PDF documents using React component syntax), deployed to Google Cloud Run. Talks to the main apps over HTTP, authenticated via the HMAC handshake described above. | The entire subject of #199 — its URL was never configured (and possibly the service itself was never deployed) in production. |
| **Service catalogue** | The list of service categories/services the business offers, served via `GET /api/services`. Currently read directly from Neon on every request; a 5-minute Upstash-backed cache is planned but not yet implemented (blocked on Redis being reachable). | Referenced in #190 (its cache is one of the two things silently degraded by the Redis outage) and #206 (a caching escalation step, itself blocked by #190). |
| **Walk-in** | A booking created directly by staff in the admin portal for a customer physically present, bypassing the normal `pending` approval step. | Named in #196 as one of the operational capabilities blocked while admin sign-in is broken. |

---

## Observability & Monitoring

| Term | Definition | Where it applies |
|---|---|---|
| **Sentry** | An error-tracking/monitoring SDK. Both apps have it installed and initialized, but capture events go nowhere without a **DSN** configured. | Entirely inert in production per #198; also named as a missing error-rate signal in #197 and #206. |
| **DSN (Data Source Name)** | The per-project connection string/identifier a Sentry SDK needs to know *which* Sentry project to send captured errors to. Without it, the SDK runs but every event is silently discarded. | `NEXT_PUBLIC_SENTRY_DSN` (web) and `NEXT_PUBLIC_ADMIN_SENTRY_DSN` (admin) — neither was ever set, per #198. Note the `NEXT_PUBLIC_` prefix means it must exist **at CI build time** (see above), not just at runtime. |
| **Source maps (Sentry)** | Files mapping minified/bundled production JavaScript back to original source lines, so a captured stack trace is human-readable instead of a wall of minified gibberish. Uploading them requires a separate `SENTRY_AUTH_TOKEN`. | An open decision item in #198. |
| **BetterStack** | An observability platform (the product formerly known as Better Uptime, now merged with Logtail into a unified "Better Stack" brand) providing uptime monitors, heartbeats, and incident alerting/webhooks. | Referenced throughout as `BETTER_STACK_*` secrets in #188, #190, #192, #200. |
| **BetterStack heartbeat** | A **push-based** ("dead man's switch") check: a background job pings a heartbeat URL after it finishes successfully; if a ping doesn't arrive within the expected interval, BetterStack raises an alert. Different from a monitor (below), which actively polls from the outside. | `BETTER_STACK_HEARTBEAT_BACKUP` (missing, #188) confirms the weekly backup job actually ran; jobs in #200 ping their heartbeats even when they deliver their report to nobody. |
| **BetterStack monitor** | A **pull-based** check: BetterStack itself polls a URL (e.g., `/api/health`) on a schedule from the outside and alerts if it stops responding correctly. | The only current failure signal in production per #197; proposed as the trust mechanism for the health endpoint in #192. |
| **BetterStack incident webhook** | An outbound HTTP call BetterStack (or the workflow itself) fires when something fails, used to page/alert a human. | `BETTER_STACK_INCIDENT_WEBHOOK` — missing in #188, so the backup job's own failure-notifier couldn't fire even when the underlying job failed. |
| **PostHog** | A product-analytics platform (event tracking, session data, web-vitals). Only collects data when a visitor has granted analytics consent. | Named as a data source for latency/performance metrics in #206, and for release-health correlation in #198. |
| **`/api/health` endpoint** | Each app's own health-check route, returning a status per dependency (`database`, `redis`, `r2`, etc.) as `pass` / `fail` / `skip`, and an overall status of `ok` / `degraded` / `unhealthy`. `skip` means "intentionally not configured"; `fail` means "configured but not working." | Central to #190 and #192; overall status has been stuck at `degraded` continuously, which #192 notes has eroded the signal's value ("a real outage would look identical to today"). |
| **CloudWatch Logs** | AWS's log-aggregation service. Retention (30 days for SSR functions, 3 days for image optimizers) is already configured by SST. | Distinguished from CloudWatch *alarms* (below) in #197 — logs existing doesn't mean anyone gets notified of anything. |
| **CloudWatch alarms** | Threshold-based alerts on a CloudWatch metric (e.g., "Lambda `Errors` ≥ 5 in 5 minutes"). `AWS/Lambda` is the metric *namespace*; `Errors`/`Throttles`/`Duration` are metric *names* within it; `p95`/`p50` are percentile statistics over a duration metric (p95 = 95% of observed values fall below this number). **Zero alarms currently exist** in the account. | The entire subject of #197. |
| **Synthetic metric** | A manually-published, fake CloudWatch metric data point used purely to test that an alarm's notification path works end-to-end, without needing to wait for (or fake) a real production fault. | Proposed test technique in #197's acceptance criteria. |
| **TTFB (Time to First Byte)** | A web-performance metric: time from request start to the first byte of the response arriving. | One of the five metrics #206 wants collected before the region review decision. |
| **LCP (Largest Contentful Paint)** | A Core Web Vitals metric: time until the largest visible content element has rendered — a proxy for perceived page-load speed. | Same context as TTFB, in #206. |
| **p50 / p75 / p95** | Percentile statistics over a distribution of measurements (e.g., latency). "p95 of 1.5s" means 95% of requests were faster than 1.5 seconds — a way of describing the *tail* experience, not just the average. | Used throughout #197 and #206's metric tables. |

---

## Notifications & Marketing Integrations

| Term | Definition | Where it applies |
|---|---|---|
| **Resend** | The transactional email provider/SDK used for immediate, code-triggered emails (contact form replies, booking confirmations, invoices). | Missing as a dependency from `apps/web` entirely in #187 (present only in `apps/admin`). |
| **Brevo** | The marketing-email provider (birthday offers, re-engagement campaigns) — a separate concern from Resend's transactional email. | Named only as out-of-scope context in #187. |
| **`web-push` (npm package)** | The Node.js library that implements the actual Web Push protocol send — signing and delivering a push message to a subscribed browser's push service. | Declared in **no** workspace's `package.json` and installed nowhere, per #193. |
| **VAPID (Voluntary Application Server Identification)** | A standardized way (RFC 8292) for a server to identify itself to a browser's push service when sending a Web Push notification, using a public/private key pair (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`) plus a contact identifier (`VAPID_SUBJECT`). The public key is the only one safe to expose to the client. | `apps/admin` (which contains the only push dispatcher) is deliberately denied these keys by requirement, while `apps/web` (which owns them) has no dispatcher — the structural gap at the heart of #193. |
| **Push subscription lifecycle (404/410 pruning)** | When a push service responds `404` or `410` (Gone) to a delivery attempt, it means that specific subscription endpoint is dead and will never work again — the corresponding stored subscription record should be deleted rather than retried. | An acceptance criterion in #193. |
| **Meta Pixel** | Meta's client-side (browser) tracking snippet for attributing ad conversions — the customer-facing half of Meta's ad-tracking pair. | Named in #193 as one of the customer-only tracking variables intentionally excluded from the admin app. |
| **Meta CAPI (Conversions API)** | Meta's **server-side** counterpart to the Pixel — sends conversion events directly from a backend to Meta over HTTPS, bypassing the browser (needed because browser-based tracking increasingly fails due to ad blockers, ITP, and cookie restrictions). Enriching these events with a real visitor IP improves match quality. | Currently omits the visitor's address entirely per #191, because no trustworthy client IP exists yet. |
| **Slack webhook** | An incoming-webhook URL that lets any process post a message directly into a Slack channel with a simple HTTP POST — no bot framework needed. | `SLACK_WEBHOOK_URL`, unset, per #200 — should be stored as a **secret** (it's a bearer credential), not a variable. |

---

## CI/CD & Tooling

| Term | Definition | Where it applies |
|---|---|---|
| **GitHub Actions** | The CI/CD platform running this repo's workflows (`.github/workflows/*.yml`) — builds, deploys, backups, scheduled jobs, and lockfile hygiene all run here. | The setting for #188, #197, #198, #200, #203. |
| **Turborepo (`turbo`)** | The monorepo task-runner/build-orchestrator that understands the dependency graph between `apps/*` and `packages/*` and can cache/parallelize tasks like `build`, `lint`, `typecheck`. Invoked as `turbo run <task>` (often via `bun run <task>` which is aliased to it). | Subject of #208 — a local binary-version mismatch causes every turbo-driven task to hard-fail with no diagnostic. |
| **Turbopack** | **Not the same tool as Turborepo**, despite the shared branding and both coming from Vercel. Turbopack is Next.js's own Rust-based bundler (the thing that actually compiles a Next.js app, replacing Webpack), invoked internally during `next build`. A "Turbopack build encountered 1 warning" message is Next.js talking, not Turborepo. | The `Module not found: Can't resolve 'resend'` / `'web-push'` build warnings in #187 and #193 come from Turbopack, surfaced while Turborepo (`turbo run build`) orchestrates the overall build. |
| **Exit code 9** | The specific process exit code `turbo` was returning locally in #208 — undocumented and unhelpful on its own, which is why the issue frames it as "reads as a broken repository rather than a stale binary" for a newcomer or agent. | #208. |
| **`bun.lock` / `--frozen-lockfile`** | Bun's lockfile, pinning exact dependency versions. `bun install --frozen-lockfile` (used in CI) fails the install outright if the lockfile is out of sync with `package.json`, rather than silently regenerating it. | An explicit acceptance criterion in #187 (adding the `resend` dependency must not leave CI's frozen-lockfile install broken). |
| **`bun audit`** | Bun's dependency vulnerability scanner, checking installed packages against known-vulnerability databases. | Cited in the #195 tracker as evidence the Better Auth upgrade introduced no new vulnerabilities ("0 vulnerabilities across 1366 packages"). |
| **Workspace filter (`--filter=@rgss/web`)** | Turborepo/Bun's syntax for scoping a command to one specific package in the monorepo by its internal package name, rather than running it everywhere. | Used in #187/#193's verification commands (`bunx turbo run build --filter=@rgss/web`) and #208's workaround (`bun run --filter='*' typecheck`). |
| **Lighthouse CI** | Automated, CI-driven Lighthouse audits (performance/accessibility/SEO/best-practices scoring) run against a deployed or built site, gated by a `lighthouserc.json` config. | Runs against the docs site in #207 via the "Docs Lighthouse" workflow — currently spending CI minutes auditing a site nobody can reach. |
| **k6** | An open-source load-testing tool, scriptable in JavaScript. | Named in #201 as a load-testing tool that currently skips by design because `PPRD_URL` is unset. |
| **OWASP ZAP** | An open-source web-application security scanner, commonly run in CI against a staging/pre-prod URL to catch common vulnerabilities before release. | Same context as k6 above, in #201. |
| **`gh` (GitHub CLI)** | The official command-line tool for interacting with GitHub — used throughout these issues for inspecting/setting secrets and variables (`gh secret list`, `gh variable set`). | Used in the evidence/fix sections of #188, #198, #199, #200. |

---

## Cross-cutting AWS/Infra Vocabulary Worth Double-Checking

A few terms recur across many issues and are easy to skim past without fully registering the distinction being drawn:

- **"Configured" vs. "functional."** Several issues (#187, #189, #190, #193, #202) hinge on the difference between a value/dependency that *passes validation* (present, syntactically correct) and one that actually *works* at runtime. This is the single most repeated failure shape in the tracker (#195 names it explicitly as the cross-cutting theme).
- **"Required" (build-time) vs. "optional" (runtime).** `env.ts` schemas force a variable to exist before the app will even boot, but application code sometimes treats the same capability as best-effort/skippable at runtime — the mismatch is where several of these bugs live.
- **`debug` vs. `error` log level on a failure branch.** Multiple issues (#187, #193, #195) propose the same fix: a failure branch that's correct to log quietly when a feature is *intentionally* absent becomes wrong to log quietly the moment its required credential/config *is* present — that combination is unambiguously a misconfiguration and should be loud.

---

## Acronyms & Abbreviations (Quick Reference)

For fast lookup — expansions only; see the sections above for full context on ones marked with a section reference.

| Acronym | Stands for | See also |
|---|---|---|
| SDK | Software Development Kit | Configuration section (optional-dependency pattern) |
| DSN | Data Source Name | Observability & Monitoring |
| VAPID | Voluntary Application Server Identification | Notifications & Marketing |
| HMAC | Hash-based Message Authentication Code | Authentication & Security |
| CAPI | (Meta) Conversions API | Notifications & Marketing |
| ISR | Incremental Static Regeneration | Infrastructure & Cloud |
| GSI | Google (Identity) Sign-In / Google Identity Services | Authentication & Security |
| OAC | Origin Access Control (CloudFront) | Infrastructure & Cloud |
| ACM | AWS Certificate Manager | Infrastructure & Cloud |
| CAA | Certification Authority Authorization (DNS record) | Infrastructure & Cloud |
| ACME | Automatic Certificate Management Environment | Infrastructure & Cloud |
| OIDC | OpenID Connect | Infrastructure & Cloud |
| MFA | Multi-Factor Authentication | Infrastructure & Cloud |
| RBAC | Role-Based Access Control | Authentication & Security |
| DPDP | Digital Personal Data Protection (Act, India) | Authentication & Security |
| GST | Goods and Services Tax (India) | Business Domain |
| SAC | Services Accounting Code (India GST) | Business Domain |
| FY | Financial Year (India: April–March) | Business Domain |
| TTFB | Time To First Byte | Observability & Monitoring |
| LCP | Largest Contentful Paint | Observability & Monitoring |
| SNS | (AWS) Simple Notification Service | Infrastructure & Cloud |
| SQS | (AWS) Simple Queue Service | Infrastructure & Cloud |
| SSM | (AWS) Systems Manager (Parameter Store) | Configuration section |
| TLS | Transport Layer Security | — (generic; "certificate," "HTTPS" encryption) |
| DNS | Domain Name System | Infrastructure & Cloud |
| CNAME / TXT | DNS record types (alias record / arbitrary text record) | Infrastructure & Cloud (#207) |

---

## Severity & Priority Reference

Two independent label dimensions are applied to every issue: **severity** (how bad is the problem) and **priority** (how soon must it be worked). These are the verbatim definitions from the repository's GitHub label descriptions:

| Label | Meaning |
|---|---|
| **S1 — Critical** | Data loss, security exposure, or a core flow is broken |
| **S2 — Major** | Degraded protection or reliability; a workaround exists |
| **S3 — Minor** | Cosmetic or low blast radius |
| **P0** | Fix immediately |
| **P1** | Fix in current cycle |
| **P2** | Scheduled / backlog |

Two other issue-title tags appear that are **not** severity/priority labels:

- **`[Chore]`** — routine maintenance/cleanup work with no user-facing defect (e.g., deleting a stale resource). No S/P label because it isn't describing a bug.
- **`[Tracker]`** — a meta/index issue that links and summarizes a set of child issues rather than describing a defect itself.
- **`agent-ready`** (mentioned inside #195, not a title tag) — a label indicating a child issue is self-contained enough (evidence, root cause, fix, acceptance criteria all included) that an engineer or AI agent can start implementing it without further investigation first.

### All 22 open issues at a glance

| # | S | P | Title |
|---|---|---|---|
| 187 | S1 | P0 | Contact form silently discards every enquiry — resend SDK missing from apps/web |
| 188 | S1 | P0 | Weekly backup produces empty archives — no offsite production backup exists |
| 189 | S2 | P1 | Better Auth rate limiting is memory-backed on Lambda — /api/auth/* effectively unthrottled |
| 190 | S2 | P1 | Upstash Redis unreachable in production — distributed rate limiting and catalogue cache degraded |
| 191 | S2 | P1 | All anonymous callers share one rate-limit bucket — getClientIp returns a constant |
| 192 | S3 | P2 | Production health permanently degraded — R2 probe expects a .health sentinel that does not exist |
| 193 | S3 | P2 | Web Push has no delivery path — web-push uninstalled and VAPID excluded from the dispatching app |
| 194 | — | — | [Chore] Delete Neon restore-point branch restore-point-better-auth-1-7 after the rollback window |
| 195 | — | — | [Tracker] Post-Better-Auth-1.7.2 review — 8 defects found (index and recommended order) |
| 196 | S1 | P0 | Admin portal sign-in is impossible — Google OAuth redirect URI not registered for admin.theroyalglow.in |
| 197 | S2 | P1 | Production has no CloudWatch alarms — Lambda faults and ISR queue backlog are invisible |
| 198 | S2 | P1 | Sentry is inert in production — DSNs were never configured for either app |
| 199 | S2 | P2 | Invoice emails are sent without the PDF — INVOICING_SERVICE_URL is unset in production |
| 200 | S3 | P2 | Daily and weekly report jobs deliver nowhere — Slack webhook and recipient list unset |
| 201 | S2 | P1 | Post-cutover functional verification is incomplete — no booking or invoice has been exercised on AWS |
| 202 | S3 | P2 | Admin DATABASE_URL_UNPOOLED silently falls back to the pooled connection |
| 203 | S2 | P2 | Rotate the Cloudflare API token and scope the GitHub deploy role down from AdministratorAccess |
| 204 | S3 | P2 | AWS account hygiene outstanding — root MFA unverified and Free Tier alerts not enabled |
| 205 | S3 | P2 | CAA records restrict the zone to three CAs — any new subdomain on a different CA will fail issuance |
| 206 | — | P2 | Region review due for ap-southeast-1 — collect the one-month latency evidence before it lapses |
| 207 | S3 | P2 | docs.theroyalglow.in is not deployed — the Fumadocs site has no hosting target |
| 208 | S3 | P2 | turbo resolves to a stale 2.10.7 binary — local typecheck and lint exit 9 with no diagnostic |

---

## Maintaining this document

This glossary was generated against issues #187–#208. When new issues are opened with unfamiliar terms:

1. Add the term to the relevant section above (or create a new section if none fits).
2. Add the issue number to the "Where it applies" column of any existing term it also touches.
3. Add a row to the "All open issues at a glance" table with its number, severity, priority, and title.
4. This doc is *not* auto-regenerated — it's a manually curated reference, so keep entries dense and skip narrative/summary content (that belongs in the issue itself).
