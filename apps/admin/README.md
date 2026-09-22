# Royal Glow Admin

The private operations portal for Royal Glow Salon & Spa, served at
[admin.theroyalglow.in](https://admin.theroyalglow.in). This app gives salon teams
booking, CRM, staff, membership, billing, reporting, and administration workflows.
It also hosts the signed HTTP background jobs used by the wider platform.

The workspace package is `@rgss/admin`. It uses Next.js App Router, React,
TypeScript, Tailwind CSS, Radix-based components, Better Auth, and shared Drizzle
queries against Neon PostgreSQL. Exact dependency versions and runnable scripts
are maintained in [package.json](package.json).

This is separate from the [Payload CMS](../cms/README.md), which manages editorial
content, media, and service catalogue authoring. The [customer website](../web/README.md)
owns public browsing and sign-in; the [invoicing service](../invoicing/README.md)
renders PDFs requested by admin jobs.

## What lives here

| Area | Routes | Purpose | Minimum page role |
| --- | --- | --- | --- |
| Dashboard | `/` | Operational overview | Receptionist |
| Bookings and waitlist | `/bookings`, `/bookings/new`, `/bookings/[id]`, `/waitlist` | Booking review, walk-ins, completion/no-show actions, and waitlist management | Receptionist |
| Customer relationships | `/customers`, `/customers/[id]`, `/leads`, `/leads/[id]` | Customer records, tags/notes, lead tracking, and follow-up information | Receptionist |
| Memberships | `/memberships`, `/memberships/new`, `/memberships/[id]` | Membership creation, usage, and lifecycle management | Receptionist |
| Billing | `/billing`, `/billing/[id]` | Invoice lists and details | Receptionist |
| Team operations | `/staff`, `/schedule` | Staff management and scheduling | Manager |
| Leave queue | `/leave` | Review staff leave requests | Receptionist |
| Self-service | `/me/schedule`, `/me/leave` | The signed-in staff member's schedule and leave | Staff |
| Offers and business settings | `/offers`, `/settings`, `/reports` | Offers, settings, and business reporting | Manager |
| Organization and access | `/branches`, `/users` | Branch and user management | Owner |
| Diagnostics | `/integrations`, `/logs` | Integration status and audit-log views | Developer |
| Catalogue handoff | `/services` | Redirect to Payload's service collection; authoring is no longer local | Manager |

The table describes page access. Individual APIs can apply additional role and
ownership requirements. The authoritative page map and sidebar are in
[`src/lib/rbac.ts`](src/lib/rbac.ts); handler checks are in
[`src/lib/api/session.ts`](src/lib/api/session.ts) and each route.

Admin paths are rooted directly at the admin host: use `/bookings`, not
`/admin/bookings`. Legacy `/admin/*` redirects on the customer site are implemented
in the web app. `/staff` manages the team; `/me/*` is personal staff self-service.

## Local development

Start with the root [README](../../README.md) for the shared toolchain and workspace
installation. From the repository root:

```sh
bun install --frozen-lockfile
bun run --filter @rgss/admin dev
```

Before starting, copy [`.env.example`](.env.example) to `apps/admin/.env.local`
**if that local file does not already exist**, then configure the development
environment. The admin server listens on `http://localhost:3001`; the web app
normally uses `http://localhost:3000`. Start web in another terminal for the
normal shared sign-in flow:

```sh
bun run --filter @rgss/web dev
```

Keep the admin's `dev` script on Webpack. The explicit flag supports Windows
machines where Application Control blocks the native SWC path used by Turbopack.
`bun run --filter @rgss/admin dev:turbo` is the explicit alternative.

For normal local authentication, point `NEXT_PUBLIC_WEB_ORIGIN` at the local web
origin, use the same database branch and `BETTER_AUTH_SECRET` in both apps, and
configure each app's own origin and Google OAuth callbacks. Sign in on web with a
user who has the required role. Role assignment is stored in the shared database;
the [authentication guide](../../knowledge-base/authentication.md) and
[`packages/db/scripts/set-role.ts`](../../packages/db/scripts/set-role.ts) describe
the existing administrative utility. A customer account cannot enter the portal
merely because its Google sign-in succeeded.

Two development-only helpers exist in [`src/lib/dev-auth.ts`](src/lib/dev-auth.ts),
middleware, and the root layout:

- `ADMIN_DEV_BYPASS_AUTH=1` opens the presentation shell with developer navigation.
  It does not provide a real session for protected API calls.
- `ADMIN_DEV_IMPERSONATE_EMAIL` resolves an existing user from the configured
  database and uses that user's actual ID and role. It can read and mutate real
  records, so use your intended development database.

Both paths are disabled when `NODE_ENV=production`. They are development aids,
not substitutes for testing shared cookies, OAuth, or production authorization.

## Configuration

[`src/env.ts`](src/env.ts) is the typed schema; [`.env.example`](.env.example) is
the starter template. The repository's
[environment variable reference](../../knowledge-base/environment-variables.md)
also covers guarded job and notification settings.

| Group | Variables | Behavior |
| --- | --- | --- |
| Shared database | `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Pooled application connection and direct connection; use the same environment's branch as web |
| Better Auth | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Shared signing secret, but admin-specific auth origin |
| Google OAuth | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Shared provider setup and public client identifier |
| Admin origin | `NEXT_PUBLIC_APP_URL`, optional `NEXT_PUBLIC_WEB_ORIGIN` | Admin URLs/job destinations and the unauthenticated redirect target |
| Cookie scope | Optional `COOKIE_DOMAIN` | Shared business helper selects cookie scope; production defaults to `.theroyalglow.in`, local development omits a domain |
| Realtime | `ABLY_PRIVATE_KEY`, `NEXT_PUBLIC_ABLY_KEY` | Server-issued admin capabilities; private key must stay server-side |
| Rate limiting | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Per-user distributed API throttling |
| QStash | `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | Publishing, schedule registration, and signed job delivery |
| Internal job fallback | Optional `INTERNAL_JOB_TOKEN` | Checked only when both QStash signing keys are not available |
| Invoice PDFs | Optional `INVOICING_SERVICE_URL`, `INVOICE_PDF_HMAC_SECRET` | Signed calls to the PDF service; absent configuration permits email without the attachment |
| Email | `RESEND_API_KEY`, optional `RESEND_FROM_EMAIL` | Transactional notifications from admin-owned jobs |
| Web push delivery | `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, optional `VAPID_SUBJECT` | Server notification provider configuration; public website owns browser subscription UX |
| Observability | Optional `NEXT_PUBLIC_ADMIN_SENTRY_DSN`, `BETTER_STACK_HEARTBEAT_*` | Separate admin Sentry project and per-job heartbeat URLs |

Not every entry is part of `src/env.ts`: auth setup and graceful-degradation
helpers intentionally read guarded runtime values directly. Missing provider
configuration can allow a job to return successfully without sending a
notification. A healthy HTTP response alone does not verify email/push delivery.

`SKIP_ENV_VALIDATION` is a build escape hatch, not a way to supply working runtime
credentials. The current implementation checks whether the value is nonempty:
even `SKIP_ENV_VALIDATION="false"` skips validation. Remove/unset the variable to
validate configuration. Empty optional values are treated as absent by the schema.

## Code map and request flow

```text
apps/admin/
├── src/app/                  Pages, layouts, and feature components
│   └── api/                  Business APIs, auth, health, realtime tokens, jobs
├── src/components/layout/    Admin shell, sidebar, top bar, and navigation UI
├── src/components/ui/        Reusable controls, tables, panels, and UI states
├── src/lib/admin/            Client API helpers, navigation, and display formatting
├── src/lib/api/              Sessions, roles, errors, rate limits, audit logging
├── src/lib/jobs/             QStash verification, enqueue, schedules, heartbeats
├── src/lib/notifications/    Notification dispatch and email/web-push providers
├── src/lib/realtime/         Ably capabilities, token requests, and publishing
├── src/lib/auth-server.ts    Better Auth configuration
├── src/lib/rbac.ts           Pure role, route, and navigation rules
├── src/middleware.ts         Edge session gate and per-request CSP
├── src/styles/              Shared-token imports and admin semantic mappings
├── src/test/                Unit/component test setup
├── e2e/                     Playwright specs and role-session fixtures
├── scripts/                 Token validation and QStash schedule registration
├── next.config.ts           Workspace transpilation and static security headers
└── playwright.config.ts     Browser test projects and environment routing
```

Middleware first checks the signed Better Auth session-cache cookie, then falls
back to the admin's same-origin session endpoint when necessary. Unauthenticated
requests return to web; authenticated users without sufficient privileges receive
403. The root layout resolves the user for navigation, while protected handlers
perform their own session/role checks and self-service ownership checks.

Handlers orchestrate shared packages rather than duplicating their rules:

| Package | Admin responsibility it supports |
| --- | --- |
| `@rgss/db` | Shared schema, database client, and query/mutation helpers |
| `@rgss/business` | Booking, membership, invoicing, dates, and other domain rules |
| `@rgss/types` | Shared request schemas, responses, and domain types |
| `@rgss/errors` | Structured application errors |
| `@rgss/logger` | Consistent service logging |
| `@rgss/ui` | Brand design tokens shared with web |

Successful API responses use a `success`/`data` envelope with optional pagination
metadata; errors carry a code, message, request ID, and retryability. Authenticated
session checks enforce a 20-request/10-second per-user Upstash window. Limit
exhaustion returns 429 with `Retry-After`; missing Redis configuration or a Redis
outage currently allows requests through. This does not replace authorization.

Audit entries identify the authenticated actor. Client IP is deliberately null
until infrastructure supplies a protected, non-spoofable viewer identity; do not
interpret it as an omitted form field or copy untrusted forwarded headers into it.

## Background jobs and integrations

QStash sends jobs to this app's `/api/jobs/*` routes. They are outside browser
session middleware and verify the **raw request body** using
[`verifyQStashSignature`](src/lib/jobs/verify.ts). Without signing keys, an
internal-token fallback is available; without either credential, production
rejects the request while non-production permits local invocation with a warning.

[`src/lib/jobs/schedules.ts`](src/lib/jobs/schedules.ts) defines recurring work:
appointment reminders, birthday messages, membership and loyalty notifications,
lead follow-ups, business reports, expiry maintenance, session cleanup, and
service-catalogue drift detection. Cron expressions are UTC and descriptions show
their intended IST timing. Event-driven routes also handle invoice PDFs,
post-service follow-up, no-show checks, stale-booking alerts, and expired-membership
notices. See the [job guide](../../knowledge-base/background-jobs.md) for the wider
operational context; the schedule definitions and route files are the executable
source of truth.

From **`apps/admin`**, with the intended environment's `QSTASH_TOKEN` and public
`NEXT_PUBLIC_APP_URL` configured:

```sh
bun run register-schedules --dry
bun run register-schedules
```

The dry run reads remote schedules and prints the plan. Registration deletes
existing schedules for each matching destination URL and creates its replacement;
it is a remote configuration operation, separate from starting or building the
app. QStash must be able to reach the destination, so localhost is insufficient.
Definitions removed from the array are not automatically deleted by this script.

Job handlers preserve per-operation idempotency/deduplication for retries.
Publishing and heartbeats are best-effort. Catalogue drift reconciliation reports
differences between CMS and the public catalogue without repairing data.

Ably tokens are issued through `/api/ably/token` for receptionist-or-higher users
with subscribe-only admin capabilities. Server publishing and notification
providers have graceful-degradation paths; verify real delivery as well as HTTP
success when changing these integrations.

## Design system

The UI shares brand tokens from
[`packages/ui/src/styles/theme.css`](../../packages/ui/src/styles/theme.css).
[`src/styles/globals.css`](src/styles/globals.css) imports that theme and the
admin's [semantic shadcn mappings](src/styles/shadcn-theme.css). The current portal
is light-only. Shared primitives provide keyboard/focus behavior, tables, filters,
slide-over panels, notifications, and loading/empty/error states.

Use [`src/lib/admin/format.ts`](src/lib/admin/format.ts) for INR and IST display.
Amounts are stored/passed in integer paise; date-time display explicitly uses
`Asia/Kolkata` instead of the browser's timezone. Changes to shared brand tokens
also affect the customer website.

## Checks

From the **repository root**:

```sh
bun run --filter @rgss/admin typecheck
bun run --filter @rgss/admin lint
bunx vitest run --project admin
bun run --filter @rgss/admin check:tokens
bun run check:admin-no-literals
bun run check:admin-root-path
bun run --filter @rgss/admin build
```

Unit/component tests use the root Vitest `admin` project with jsdom and React
Testing Library, including property tests and accessibility checks. The package
does not define a `test` script. For a focused run, append a source test path to
`bunx vitest run --project admin`. Live integration suites are excluded from the
normal configuration and use the root integration-test entry point.

The token gate checks required names in the shared theme. The separate
`check:admin-path-allowlist` script checks the diff and rejects semantic API,
RBAC, schema, or migration changes mixed with admin presentation changes; read
its diagnostics when planning work across those boundaries.

For browser tests, first run the local admin server. In a separate **PowerShell**
terminal at the repository root, explicitly select the local origins:

```powershell
$env:PLAYWRIGHT_ADMIN_BASE_URL = 'http://localhost:3001'
$env:ADMIN_E2E_WEB_ORIGIN = 'http://localhost:3000'
$env:ADMIN_E2E_WEB_BASE_URL = 'http://localhost:3000'
$env:ADMIN_E2E_ADMIN_ORIGIN = 'https://admin.theroyalglow.in'
bun run --filter @rgss/admin test:e2e:list
bun run --filter @rgss/admin test:e2e
```

Setting `PLAYWRIGHT_ADMIN_BASE_URL` prevents Playwright from starting another
server. Otherwise the current config tries to build/start a local server, but
`start` itself does not pin port 3001; the explicit-origin approach avoids that
port mismatch. The web server must also be running for legacy redirect specs.
Their expected `ADMIN_E2E_ADMIN_ORIGIN` differs from the local browser base URL:
[`apps/web/src/lib/admin-redirect.ts`](../web/src/lib/admin-redirect.ts) currently
hardcodes the production admin origin. These specs disable redirect following
and check the status/`Location` header; they do not open the production target.

RBAC browser tests use receptionist, owner, and developer storage states from
`e2e/.auth/` or `ADMIN_E2E_*_STATE` overrides, as described in
[`e2e/fixtures/auth.ts`](e2e/fixtures/auth.ts). These files contain session
credentials and stay untracked. Missing states cause role specs to **skip**.
Do not interpret a skipped role matrix as verified authorization.

## Deployment and operational checks

The root [`sst.config.ts`](../../sst.config.ts) deploys admin independently from
web to AWS Lambda/CloudFront, through
[`deploy-aws.yml`](../../.github/workflows/deploy-aws.yml). Admin also receives the
notification provider credentials because it owns the job routes. CMS remains a
separate deployment, and PDF rendering belongs to the Cloud Run invoicing app.
Use the [deployment guide](../../knowledge-base/deployment.md) and
[branch-promotion guide](../../knowledge-base/branch-promotions.md) for the release
workflow; a local build does not register schedules or migrate shared databases.

`GET /api/health` performs a database `SELECT 1`, returning 200/`healthy` or
503/`unhealthy`. It is public for deployment probes and does not test OAuth,
every third-party provider, or notification delivery. Sentry uses the separate
admin DSN and initializes on the server through
[`src/lib/api/sentry-server-init.ts`](src/lib/api/sentry-server-init.ts), whose
comments explain the OpenNext instrumentation constraint.

Common troubleshooting starting points:

- **Redirected back to web:** check the shared DB/secret, cookie domain, both
  session-cookie names, actual database role, and configured web origin.
- **403:** compare the page minimum, API minimum, and ownership requirements;
  navigation visibility alone does not grant access.
- **410 from catalogue writes:** edit services/categories in Payload CMS. Read
  the [catalogue guide](../../knowledge-base/service-catalogue-management.md).
- **Jobs return 200 but send nothing:** inspect provider configuration and logs;
  optional notification clients can deliberately no-op.
- **Unexpected config validation behavior:** unset `SKIP_ENV_VALIDATION` rather
  than setting its string value to `false`.
- **Token or style failures:** inspect shared tokens and semantic mappings before
  adding a hard-coded fallback; font loading is also governed by middleware CSP.

Agent-specific instructions live in [AGENTS.md](AGENTS.md); [CLAUDE.md](CLAUDE.md)
imports the same scoped rules. Further architecture and feature context is indexed
in the repository's [knowledge base](../../knowledge-base/INDEX.md).
