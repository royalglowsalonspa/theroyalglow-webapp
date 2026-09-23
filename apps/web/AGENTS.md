# Web application instructions

Applies to `apps/web/**`, together with the [root instructions](../../AGENTS.md).
See [README.md](README.md) for feature coverage, setup, integrations, and known
limitations. Read the implementation near a change before treating older plans as
current behavior.

## App boundary

- This is the customer-facing Next.js App Router app, package `@rgss/web`, local
  port 3000. It owns public pages, customer accounts, booking, leads, and API
  routes for public and customer use.
- Administrative pages, administrative APIs, staff self-service, and `/api/jobs/*`
  belong in `apps/admin`. Preserve the legacy `/admin/*` and `/staff/*` redirects
  in `src/middleware.ts` and their mapping helpers.
- Keep route handlers thin: shared request schemas in `@rgss/types`, calculations
  in `@rgss/business`, queries in `@rgss/db/queries`. Do not import another app's
  implementation through relative paths.
- The booking catalogue reads Drizzle application tables. Payload authors and
  synchronizes that catalogue; the web app must not start querying CMS service
  documents as its transactional pricing source.
- Marketing content uses `src/lib/cms/`. Keep Payload packages and generated CMS
  types out of this app; narrow external records into the local view models.

## Commands

Run these from the **repository root**, using the existing workspace install:

| Task | Command |
| --- | --- |
| Development | `bun run --filter=@rgss/web dev` |
| Typecheck | `bun run --filter=@rgss/web typecheck` |
| Lint | `bun run --filter=@rgss/web lint` |
| Web unit tests | `bunx vitest run --project web` |
| Focused unit test | `bunx vitest run --project web apps/web/src/lib/auth-schema-contract.test.ts` |
| Customer/admin separation check | `bun run check:cutover` |
| Production build | `bun run --filter=@rgss/web build` |
| Start an existing build | `bun run --filter=@rgss/web start` |
| Browser smoke tests | `bun run test:e2e` |

- Keep the default `dev` script's `--webpack` flag: the maintainer's Windows
  Application Control blocks the native SWC path used by Turbopack. `dev:turbo`
  is an explicit opt-in, not a replacement for the default.
- Vitest uses the root `web` project, jsdom, React, and `src/test/setup.ts`.
  Select the relevant tests; a documentation edit does not require a build.
- Root Playwright targets `apps/web/e2e`. It reuses an existing local server;
  otherwise it builds and starts web. Configure the intended test environment
  before running it. Browser smoke tests do not verify real Google sign-in.
- Live integration suites are separately opt-in through the root configuration.
  Do not treat a live health test as an isolated unit test.

## Authentication and request safety

- `src/lib/auth-server.ts` owns Better Auth; `auth-client.ts` owns browser setup.
  Preserve Google OAuth and One Tap compatibility, the server-controlled `role`
  field (`input: false`), and the shared web/admin session configuration.
- Web and admin need the same `BETTER_AUTH_SECRET` and compatible cookie scope,
  with their own `BETTER_AUTH_URL`. Use the shared cross-subdomain helper rather
  than hand-building cookie settings. Localhost uses host-only cookies.
- Middleware's session-cookie presence check is an early navigation gate, not
  proof of authentication. Enforce a real server session and resource ownership
  in private pages and API handlers; never trust a supplied customer ID.
- There is no dedicated customer `/sign-in` page. Sign-in starts from the
  homepage. Reuse `startGoogleSignIn` so booking/lead/UTM context survives OAuth;
  that browser context is a navigation hint, not trusted identity.
- Preserve the complementary onboarding guards: a signed-in user without a
  customer profile can reach onboarding; an onboarded user leaves it. Avoid
  introducing redirect cycles or gating all public marketing pages.
- Keep Better Auth schema compatibility covered by `auth-schema-contract.test.ts`.
  Coordinate changes with admin and `packages/db`; do not reintroduce a required
  legacy `account.issuer` column or the obsolete issuer-based identity index.
- Use `withErrorHandler`, `apiSuccess`, and typed errors for application APIs.
  Better Auth, health, and revalidation endpoints deliberately use their own contracts.
- Await `enforceRateLimit`. The current deployment has no trustworthy viewer-IP
  header: `getClientIp` deliberately returns `unknown`. Do not trust forwarded
  headers without matching edge/origin security changes.
- CORS uses exact origins where needed, not wildcard credentialed access.

## Booking and external integrations

- Calculate booking price/duration from database services with shared helpers;
  never trust client totals. Preserve integer paise, IST appointment semantics,
  service snapshots, ownership checks, and transactional query boundaries.
- Booking notifications and QStash enqueueing happen after the database write
  and are best-effort. Do not turn optional provider outages into duplicate or
  failed booking transactions.
- `enqueueJob` targets `NEXT_PUBLIC_ADMIN_URL`; job receivers stay in admin.
  Keep Ably private keys server-side and token capabilities scoped to the session.
- CMS fetch/mapping helpers must tolerate absent configuration, malformed content,
  and provider failures. Preserve each surface's deliberate fallback/empty state;
  do not silently convert marketing fallback prices into bookable service data.
- CMS revalidation requires `REVALIDATE_SECRET` matching CMS and an allowed tag.
  It is provisioned as the `RevalidateSecret` SST secret, web only; without it the
  handler answers 503 and CMS edits stay invisible until the fetch TTL lapses. The
  handler calls `revalidateTag(tag, { expire: 0 })` per tag and `revalidatePath('/', 'layout')`.
  Coordinate cache-contract changes with CMS hooks.
- Prefer `src/env.ts` for validated settings. Existing optional adapters read
  `process.env` deliberately to degrade gracefully; preserve that behavior when
  touching them. Update schema/runtime mapping, examples, and deployment wiring
  together when introducing configuration.

## Rendering, design, and observability

- Default to Server Components; add client boundaries only for interaction.
  Await App Router `params`, `searchParams`, and server headers where required.
- Reuse `@rgss/ui/theme.css`, local shadcn primitives, and the existing mobile-first
  layout. Keep brand tokens centralized; preserve loaded display-font weights,
  keyboard navigation, dialog focus, accessible names, and reduced-motion behavior.
- Brand font links live in `src/app/layout.tsx`; do not move them back into CSS
  imports that delay font discovery. New image hosts must match `next.config.ts`.
- Public pages stay indexable. Use `buildMetadata`, server-rendered escaped
  `JsonLd`, sitemap/robots helpers, and explicit noindex for private pages.
- Middleware owns CSP. Dynamic pages receive a nonce; the static legal routes
  intentionally use the prerender-compatible policy. Test hydration and third-party
  sign-in/analytics when changing this boundary rather than adding blanket relaxations.
- Keep PostHog/Clarity behind analytics consent and Meta Pixel behind marketing
  consent. Avoid sensitive account/booking details in analytics or error logs.
- Preserve the service worker's network-first offline fallback; do not cache API,
  authentication, or private customer responses.
- Sentry server initialization currently runs through `src/lib/api/sentry-server-init.ts`.
  Do not reintroduce root `instrumentation.ts` without checking the documented
  OpenNext bundling constraint and the resulting deployed error-capture path.
- Health HTTP 200 can mean `degraded`; inspect `status` and individual checks.
  Database failure yields 503; optional Redis/R2 failures do not.
