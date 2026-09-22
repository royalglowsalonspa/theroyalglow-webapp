# Royal Glow customer website

`@rgss/web` is the customer-facing Next.js application at
[theroyalglow.in](https://theroyalglow.in). It combines public salon content,
service discovery, Google sign-in, booking, and customer account features. Its
route handlers connect those experiences to shared domain rules and Neon data.

[Repository setup](../../README.md) · [Agent instructions](AGENTS.md) ·
[Page guides](../../knowledge-base/pages/README.md) ·
[Architecture](../../knowledge-base/architecture.md)

## Responsibilities and boundaries

| Area | What this app owns |
| --- | --- |
| Public discovery | Homepage, service catalogue/detail pages, offers, gallery, blog, about, FAQ, contact, legal pages |
| Booking | Homepage booking dialog, service/date selection, availability, booking creation, customer booking history, cancellation, rescheduling |
| Accounts | Google OAuth and One Tap, onboarding, profile, notification preferences, memberships, gems and redemption views |
| Lead capture | `/book` landing page, `/api/leads`, contact enquiries, campaign context |
| Content delivery | Payload REST reads, defensive content mapping, media resolution, cached reads, CMS-triggered revalidation |
| Browser services | Consent UI, analytics loading, Ably subscriptions, push subscription storage, install/offline affordances |
| Discovery and monitoring | Metadata, JSON-LD, sitemap, robots, `llms.txt`, health response, Sentry hooks |

The operations portal and scheduled/triggered job receivers belong to
[apps/admin](../admin/README.md). Content authoring and catalogue synchronization
belong to [apps/cms](../cms/README.md). The [invoicing service](../invoicing/README.md)
renders PDFs; web does not run that renderer.

`/?book=1` opens the booking dialog. `/book` is a lead-capture page and does **not**
reserve an appointment. Legacy `/admin/*` URLs redirect to root paths on the
admin subdomain; `/staff/*` redirects to its `/me/*` self-service namespace.

## Local development

Install from the repository root using the Bun version declared in the root
`packageManager` field and Node.js for Next.js/tooling:

```bash
bun install --frozen-lockfile
```

Create an ignored `apps/web/.env.local` using the root
[.env.example](../../.env.example) as the reference. It contains shared settings
for several applications, so configure the web values deliberately rather than
treating every placeholder as a working credential. The web validator is
[src/env.ts](src/env.ts); optional provider adapters also document settings they
read directly. Do not assume a root env file automatically configures every app.

Set local origins to `http://localhost:3000` for `NEXT_PUBLIC_APP_URL` and
`BETTER_AUTH_URL`. When using local admin, set `NEXT_PUBLIC_ADMIN_URL` to
`http://localhost:3001`. For local CMS content, set `NEXT_PUBLIC_CMS_URL` to
`http://localhost:3002`. Use the intended development database and OAuth client;
Google must allow the local origin and `/api/auth/callback/google` redirect URL.
Keep `COOKIE_DOMAIN` unset for ordinary localhost development.

Start web from the repository root:

```bash
bun run --filter=@rgss/web dev
```

Open [localhost:3000](http://localhost:3000). This script deliberately uses
Webpack because Windows Application Control on the maintainer's machine blocks
the native SWC path used by Turbopack. `bun run --filter=@rgss/web dev:turbo` is
available when that constraint does not apply.

Public CMS sections have fallbacks, but that does not make every route independent
of infrastructure. Sign-in, service catalogue, availability, booking, and account
operations need correctly configured services and data. The env validator also
requires several integration settings even when individual adapters can degrade
gracefully. `SKIP_ENV_VALIDATION` bypasses checks; it does not provision those
services or establish a valid runtime configuration.

## Configuration map

This is a navigation aid; [src/env.ts](src/env.ts), the referenced adapter, and
the [shared environment guide](../../knowledge-base/environment-variables.md)
define the details. Never put private keys in `NEXT_PUBLIC_*` variables.

| Concern | Settings and behavior |
| --- | --- |
| Application data | `DATABASE_URL`; web uses shared `@rgss/db` queries. Database migrations run through the repository's migration workflow, not during page rendering. |
| Session security | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, optional `COOKIE_DOMAIN`; web/admin share the secret and compatible cookie settings. |
| Google | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; server OAuth and browser One Tap must refer to the intended client. |
| Admin/job destination | `NEXT_PUBLIC_ADMIN_URL`, `QSTASH_TOKEN`; triggered jobs are published to admin. QStash signing settings in the shared env schema do not imply job receivers live here. |
| CMS | `NEXT_PUBLIC_CMS_URL`, `REVALIDATE_SECRET`; revalidation secret must match the CMS setting. Both are read by their adapters directly. |
| Media/storage | `NEXT_PUBLIC_R2_PUBLIC_URL` resolves relative media URLs and is used by the health probe. The shared validator also includes `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`; content uploads belong to CMS. |
| Rate limiting | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`; distributed limits fall back to per-instance memory when unavailable. |
| Realtime | `ABLY_PRIVATE_KEY` signs scoped token requests and publishes server events. `NEXT_PUBLIC_ABLY_KEY` is present in the validator; never place the private key there. |
| Email/contact | `RESEND_API_KEY`, optional `CONTACT_INBOX_EMAIL`; see the contact handler and `lib/notifications/providers/email.ts`. |
| Analytics | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, optional `NEXT_PUBLIC_CLARITY_ID` and `NEXT_PUBLIC_META_PIXEL_ID`; provider loading requires the corresponding consent. |
| Server marketing events | Optional `META_PIXEL_ACCESS_TOKEN` with `NEXT_PUBLIC_META_PIXEL_ID`; lead CAPI delivery is best-effort. |
| Push | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, optional `VAPID_SUBJECT`; subscriptions originate here, notification/job dispatch is owned by admin. |
| Error monitoring | `NEXT_PUBLIC_SENTRY_DSN`; `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` are used for configured build-time source-map uploads. |

Some shared env entries refer to admin jobs, Slack, heartbeats, and invoice
orchestration. Their presence is not evidence that this app runs those workflows.
Use [background-jobs.md](../../knowledge-base/background-jobs.md) and the admin
README to find the actual receivers.

## Source map

| Path | Purpose |
| --- | --- |
| [`src/app/(customer)`](src/app/%28customer%29) | Public pages and private customer pages; shared header/footer, announcement bar, booking dialog |
| [`src/app/(auth)`](src/app/%28auth%29) | Onboarding with minimal layout |
| [`src/app/(landing)`](src/app/%28landing%29) | Conversion-focused `/book` lead capture |
| [`src/app/(legal)`](src/app/%28legal%29) | Prerendered privacy, terms, and refund policy |
| [`src/app/api`](src/app/api) | Public/customer route handlers, Better Auth, health, revalidation |
| [`src/components`](src/components) | Feature UI, local UI primitives, consent/analytics, SEO, PWA, realtime |
| [`src/lib/api`](src/lib/api) | Session guards, response/error contracts, rate limits, exact-origin CORS |
| [`src/lib/cms`](src/lib/cms) | CMS REST seam, view models, rich text/media conversion, fallback content |
| [`src/lib/seo`](src/lib/seo) | Business facts, metadata, JSON-LD builders |
| [`src/lib/auth-server.ts`](src/lib/auth-server.ts) / [`auth-client.ts`](src/lib/auth-client.ts) | Better Auth server/client configuration |
| [`src/lib/onboarding-guard.ts`](src/lib/onboarding-guard.ts) | Profile-completion navigation guards |
| [`src/lib/jobs`](src/lib/jobs) / [`src/lib/realtime`](src/lib/realtime) | Best-effort enqueue/publish and browser realtime helpers |
| [`src/styles`](src/styles) | Shared-theme imports, shadcn bindings, web-specific animations/utilities |
| [`public`](public) | Static assets and dependency-free service worker |
| [`e2e`](e2e) / [`src/test`](src/test) | Browser smoke tests and Vitest setup/MSW helpers |

The `@/` alias resolves to `src`. Shared package exports are the boundary for
validation, business calculations, queries, logging, errors, and shared UI.

## Request and data flows

### Booking and customer APIs

The booking handler validates the shared request schema, loads the operational
branch and active services, calculates price/duration from server data, selects
staff, and writes the booking with service snapshots through shared queries.
Amounts use integer paise. Appointment scheduling preserves the salon's IST
wall-clock semantics rather than the developer machine's timezone.

Customer APIs include `/api/bookings` and its detail/cancel/reschedule routes,
`/api/gems`, `/api/gems/redeem`, `/api/membership`, `/api/notifications`,
`/api/profile/preferences`, and `/api/onboarding/complete`. Public routes expose
service discovery, availability, offers, leads, and contact. Read each handler for
its method, input schema, session requirement, and ownership check; route names
alone do not establish authorization.

Most application APIs use `{ success, data, meta? }` or a structured error with a
request ID through `withErrorHandler`. Better Auth, `/api/health`, and
`/api/revalidate` intentionally have their own contracts. Booking writes survive
optional QStash or Ably failures; adapters log failures without undoing the core
transaction. This best-effort design also means a successful booking response
does not prove a notification was delivered.

### Authentication and onboarding

Better Auth uses the shared Drizzle account/session schema and Google OAuth with
One Tap. Roles are server-controlled. Web and admin coordinate their session
secret and cookie scope; Payload has separate authentication.

Middleware redirects visitors without a session cookie away from selected private
routes, but private pages and APIs validate the session on the server. Onboarding
guards direct signed-in users without a profile to `/onboarding` and redirect
completed users away from it. Google sign-in helpers preserve booking, lead, and
UTM navigation context across the redirect.

See [authentication](../../knowledge-base/authentication.md) and the
[Better Auth cleanup record](../../knowledge-base/better-auth-1.7.3-cleanup.md)
before modifying shared auth configuration or schema.

### CMS content and catalogue

`src/lib/cms/config.ts` reads Payload REST with a default one-hour revalidation
window, returning safe values on missing configuration or failed reads. The
client narrows unknown responses into local view models and filters published
posts, active content, and scheduled validity windows.

Fallback behavior differs by surface:

- Blog list/detail/sitemap helpers can return built-in sample posts when no valid
  CMS result exists. A visible article does not prove CMS connectivity.
- FAQs and homepage testimonials, offers, and service cards have static or
  curated fallbacks in their respective readers/components.
- Gallery/team readers can return empty lists; the page decides the empty state.
- Transactional service catalogue pages, API reads, and booking prices use
  Drizzle application data synchronized from CMS authoring, not marketing cards.

`POST /api/revalidate` authenticates `REVALIDATE_SECRET` and accepts allowed
collection tags. Its current implementation refreshes the entire root layout
through `revalidatePath('/', 'layout')`, even though requests identify tags.
See [service catalogue management](../../knowledge-base/service-catalogue-management.md)
for the cross-app authoring/synchronization model.

## Design, accessibility, SEO, and browser behavior

The customer site is mobile-first and light-themed. It uses shared brand tokens
from `@rgss/ui/theme.css`, local Radix/shadcn-style primitives, Lucide icons, and
Motion helpers. Brand font stylesheets/preconnects live in the root layout; the
global stylesheet holds app-specific animations and utilities. Preserve keyboard
operation, visible focus, form labels, dialog focus behavior, and reduced motion.

Use the shared metadata/JSON-LD helpers for public pages. Customer-private pages
declare noindex; the public site must not inherit the admin app's site-wide
noindex behavior. Machine-readable routes include `/sitemap.xml`, `/robots.txt`,
`/llms.txt`, `/llms-full.txt`, and the web manifest.

Middleware owns the CSP. Dynamic pages receive a per-request nonce; prerendered
legal pages use a separate policy compatible with static HTML. Changes to script,
font, frame, and connect sources must preserve Google sign-in, analytics, realtime,
and hydration. Next image-host configuration is a separate allowlist.

PostHog and Clarity load after analytics consent; Meta Pixel loads after marketing
consent. The service worker provides a network-first navigation fallback to
`/offline` and does not cache customer API responses. PWA support does not provide
offline booking or offline access to account data.

## Verification

Run from the **repository root**:

```bash
bun run --filter=@rgss/web lint
bun run --filter=@rgss/web typecheck
bunx vitest run --project web
```

Use a specific test path for a focused change. The web Vitest project uses jsdom,
React, and `src/test/setup.ts`; it covers API guards/contracts, booking behavior,
CMS mapping, auth schema compatibility, consent, SEO, components, and app
separation. Real-service integration suites are excluded by default; the root
integration command deliberately opts into them.

For a production build or browser smoke tests:

```bash
bun run --filter=@rgss/web build
bun run --filter=@rgss/web start
# In a separate terminal, with that server running:
bun run test:e2e
```

Root Playwright reuses an existing local server or builds/starts web itself. Its
current Chromium smoke tests cover homepage/booking-dialog visibility and basic
sitemap, robots, and `llms.txt` responses. They do not establish full booking,
payment, notification, or interactive Google OAuth correctness. See
[testing.md](../../knowledge-base/testing.md) for repository checks and live-test
boundaries.

## Deployment and troubleshooting

[sst.config.ts](../../sst.config.ts) deploys web alongside admin to AWS through
OpenNext, Lambda, CloudFront, and S3. Production uses `theroyalglow.in`; CMS remains
on Render and invoicing targets Cloud Run. Browser-visible env values must be
available when the frontend is built; runtime secrets are supplied through the
deployment configuration. Use the [deployment guide](../../knowledge-base/deployment.md)
and [promotion workflow](../../knowledge-base/branch-promotions.md).

| Symptom | First checks |
| --- | --- |
| Sign-in failure or repeated onboarding | App/Google origins, shared secret/cookie settings, actual server session, customer-profile existence, auth schema contract |
| Missing or stale CMS changes | Correct CMS origin, REST response, fallback behavior, matching revalidation secret, CMS hook delivery, cache window |
| Bookable services missing | Application catalogue synchronization, active flags, branch operation, staff assignment; marketing cards are independent |
| Rate limits affect unrelated visitors | The current edge setup uses a shared `unknown` anonymous identity; forwarded IP headers are deliberately not trusted |
| Booking succeeds but follow-up is absent | Admin URL, QStash publish logs, signed admin receiver, Ably/provider configuration and delivery logs |
| Fonts, images, or hydration fail | Root font links, CSP policy for the route, image allowlist, browser network/console errors |
| Health returns 200 but monitoring warns | Inspect JSON `status` and `checks`: Redis/R2 failure yields `degraded`; DB failure yields 503. R2 probes the public `/.health` object. |
| Build fails on Windows | Retain Webpack for local dev, inspect runtime/tool versions and available disk space; generated Next/OpenNext caches can be large |

Sentry server capture is initialized through the API error wrapper's
`sentry-server-init.ts` import. Root `instrumentation.ts` is intentionally absent
because of an OpenNext build incompatibility; changing that requires deployment
validation, not merely a successful typecheck.

## Current feature boundaries

- `/favorites` is an authenticated empty-state shell; saved-service management is
  not implemented by that page.
- The blog newsletter form currently changes local React state only. It has no
  subscription API call or persisted mailing-list enrollment.
- Marketing fallback copy and prices are display content, not validated live
  catalogue entries or proof that an offer is active in transactional data.
- Optional adapter configuration, successful health HTTP status, and rendered
  fallback pages are not evidence that every external integration is operational.

Keep these boundaries accurate when implementing the corresponding features.
Track work using [repository issues and labels](../../knowledge-base/ISSUES.md)
rather than embedding a changing issue inventory in this README.
