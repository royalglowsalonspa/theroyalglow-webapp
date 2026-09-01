# Implementation Plan: Admin Subdomain Migration

## Overview

Migrate the admin portal out of `apps/web` into a dedicated Next.js 16 app
(`apps/admin`, served at `admin.theroyalglow.in`) in verifiable phases:
scaffold → shared UI → RBAC/middleware → auth/session sharing → page migration →
API migration → realtime/jobs → security → deploy/CI → web cleanup/redirects →
docs → testing. Each task builds on the previous and ends with everything wired
together. Implementation language is **TypeScript** (matches the design and the
existing monorepo). Pure decision logic (`lib/rbac.ts`, `lib/cors.ts`, redirect
mapping, Ably capability builder, QStash verify gate) is extracted so it can be
property-tested with `fast-check` (P1–P7).

## Tasks

- [x] 1. Scaffold the `apps/admin` application
  - [x] 1.1 Create the admin app skeleton and tooling configs
    - Create `apps/admin/package.json` (name `@rgss/admin`, scripts `dev -p 3001`/`build`/`start`/`typecheck`/`lint`, `workspace:*` deps on `@rgss/{db,business,types,errors,logger}`, better-auth, @t3-oss/env-nextjs, @sentry/nextjs, @upstash/ratelimit + redis)
    - Create `next.config.ts` (transpilePackages, withSentryConfig), `tsconfig.json` (extends root, `@/*` → `./src/*`), `postcss.config.mjs`, `components.json`, root `app/layout.tsx` + a root `app/page.tsx`
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.7, 14.1_

  - [x] 1.2 Implement admin env validation (`apps/admin/src/env.ts`)
    - `@t3-oss/env-nextjs` + Zod schema for admin-scoped vars (DB, BETTER_AUTH_*, GOOGLE_OAUTH_*, ABLY_PRIVATE_KEY, UPSTASH_*, QSTASH_* signing keys, NEXT_PUBLIC_APP_URL/SENTRY_DSN/ABLY_KEY); exclude customer-only tracking vars; honour `SKIP_ENV_VALIDATION`
    - Create committed `.env.example` and gitignored `.env.local`
    - _Requirements: 1.4, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x] 1.3 Add Sentry instrumentation and health route
    - `instrumentation.ts`, `sentry.{client,server,edge}.config.ts` pointing at the separate admin Sentry project
    - `app/api/health/route.ts` returning 200 (DB ping → 503 on failure)
    - _Requirements: 6.6, 6.4_

  - [x]* 1.4 Write unit tests for env validation
    - Build fails on a missing required var; passes with `SKIP_ENV_VALIDATION`; schema excludes customer tracking vars
    - _Requirements: 12.1, 12.5, 12.6_

- [x] 2. Introduce the shared UI package
  - [x] 2.1 Create `packages/ui` (`@rgss/ui`)
    - Move shadcn/ui primitives and the Tailwind v4 design-token theme into `@rgss/ui` as the single source of truth
    - _Requirements: 13.1, 13.2_

  - [x] 2.2 Consume `@rgss/ui` from both apps
    - Add `@rgss/ui` via `workspace:*` to `apps/web` and `apps/admin`, add to `transpilePackages`, import tokens in each global stylesheet
    - _Requirements: 13.1, 13.3, 13.4_

- [x] 3. Implement the pure RBAC decision core (`apps/admin/src/lib/rbac.ts`)
  - [x] 3.1 Implement role + route + decision functions
    - `ROLE_LEVELS`, `resolveRoleLevel` (unknown/absent → 0), `ROUTE_MIN_LEVEL` longest-prefix `routeMinLevel`, `AuthState`/`Decision` unions, `decide`, and a pure nav-visibility filter
    - _Requirements: 5.1, 5.2, 5.3, 5.7, 4.3, 4.4, 4.5, 4.6_

  - [x]* 3.2 Write property test for the access decision
    - **Property 1: RBAC access decision is correct and monotonic in role level**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.7, 15.1**

  - [x]* 3.3 Write property test for the middleware auth-state decision
    - **Property 2: Middleware auth-state decision maps every state to the correct action**
    - **Validates: Requirements 4.3, 4.4, 4.5, 4.6, 5.5, 5.6**

  - [x]* 3.4 Write property test for sidebar nav visibility
    - **Property 3: Sidebar navigation visibility matches role level**
    - **Validates: Requirements 5.4**

- [x] 4. Implement the edge middleware (`apps/admin/src/middleware.ts`)
  - [x] 4.1 Wire the middleware to the RBAC core
    - Read `better-auth.session_token`, `fetch('/api/auth/get-session')` forwarding the cookie, classify into `AuthState`, compute `routeMin`, call `decide`, render the `NextResponse` (redirect / clear-cookie+redirect / 403 / next); set the matcher excluding `_next`, `favicon.ico`, `api/health`, `api/auth`
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 5.2, 5.5, 5.6_

  - [x]* 4.2 Write unit tests for the middleware access matrix
    - Each role level against each route minimum; auth-state → action mapping
    - _Requirements: 15.1_

- [x] 5. Authentication and cross-subdomain session sharing
  - [x] 5.1 Add admin auth route and Better Auth config
    - `apps/admin/src/lib/auth-server.ts` + `auth-client.ts`, `app/api/auth/[...all]/route.ts` via `toNextJsHandler`, same Neon DB and `BETTER_AUTH_SECRET`; enable `advanced.crossSubDomainCookies` (`domain: '.theroyalglow.in'`, omitted in local dev), no admin sign-in page (unauthenticated → 302 to `https://theroyalglow.in`)
    - _Requirements: 4.1, 4.2, 4.7, 4.8_

  - [x] 5.2 Enable cross-subdomain cookie in the web app
    - Update `apps/web` `auth-server.ts` to set `advanced.crossSubDomainCookies` with `domain: '.theroyalglow.in'` so sign-in cookies are readable by the admin subdomain
    - _Requirements: 4.8_

  - [x]* 5.3 Write integration tests for session sharing
    - A cookie issued under web config validates under admin config against the same DB; assert `Set-Cookie` has `Domain=.theroyalglow.in; SameSite=Lax; Secure; HttpOnly`
    - _Requirements: 4.1, 4.2, 4.8_

- [x] 6. Migrate admin pages and components (Root-Path Convention)
  - [x] 6.1 Migrate the admin shell and sidebar
    - Move `admin-shell.tsx` / `AdminSidebar.tsx` to `apps/admin`, rewrite internal links from `/admin/x` to `/x`, replace the `CURRENT_ROLE` placeholder with the real role from session, drive nav visibility from `resolveRoleLevel`
    - _Requirements: 2.3, 5.4_

  - [x] 6.2 Migrate all admin feature pages to root paths
    - Move every page tree (`/`, `/bookings[/[id]]`, `/waitlist`, `/customers[/[id]]`, `/leads[/[id]]`, `/billing`, `/leave`, `/memberships`, `/services`, `/offers`, `/staff`, `/schedule`, `/reports`, `/settings`, `/branches`, `/users`, `/integrations`, `/logs`) and their components verbatim, dropping the `/admin` prefix
    - _Requirements: 2.1, 2.4, 2.5, 2.6_

  - [x]* 6.3 Write smoke tests for migrated routes
    - One render-without-error test per migrated top-level route for an authorized role
    - _Requirements: 2.1, 15.3_

- [x] 7. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Migrate admin API routes
  - [x] 8.1 Relocate admin API routes to `apps/admin/src/app/api/`
    - Move `/api/bookings`, `/customers`, `/leads`, `/leave`, `/membership-tiers`, `/memberships`, `/offers`, `/schedule`, `/staff`, `/tags`, preserving HTTP methods and the `{ success, data }` / error envelope; keep handlers thin (parse → Zod → business → envelope)
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 8.2 Implement server-side upstream calls to web-only endpoints
    - When admin must call a web-only endpoint, call it server-side and map any non-2xx to `502 UPSTREAM_ERROR` via `AppError` without leaking upstream detail
    - _Requirements: 3.4, 3.5_

  - [x]* 8.3 Write unit tests for API routes
    - Method set + response envelope + auth guard for representative routes (MSW/in-memory DB)
    - _Requirements: 3.1, 3.2, 3.3, 2.6_

- [x] 9. Realtime and background jobs
  - [x] 9.1 Implement the Ably token route and capability builder
    - `app/api/ably/token` requires Receptionist+, issues subscribe-only capability scoped to `admin:bookings:*`, `admin:schedule:*`, `admin:leave`, `booking:*`; extract the capability builder into a pure helper; 503 when `ABLY_PRIVATE_KEY` unset
    - _Requirements: 8.1_

  - [x] 9.2 Implement the client realtime provider
    - Subscribe to `admin:bookings:{branchId}`, `admin:schedule:{YYYY-MM-DD}`, `admin:leave` on page mount with identical channel names/schemas; show a reconnecting indicator within 2s of connection loss and re-subscribe on recovery
    - _Requirements: 8.2, 8.3, 8.5_

  - [x] 9.3 Implement QStash webhook receivers
    - `app/api/jobs/stale-booking-alert` and `app/api/jobs/noshow-check` with raw-body → `verifyQStashSignature` (HMAC) → process → heartbeat → 200; extract the verify gate into a pure helper that runs before any side effect
    - _Requirements: 8.4_

  - [x]* 9.4 Write property test for the Ably token capability
    - **Property 6: Ably token capability is subscribe-only and scoped to admin channels**
    - **Validates: Requirements 8.1**

  - [x]* 9.5 Write property test for the QStash verify gate
    - **Property 7: QStash webhook receivers reject unverified requests before side effects**
    - **Validates: Requirements 8.4**

- [x] 10. Security: CORS, CSP, rate limiting, headers
  - [x] 10.1 Implement CORS helper, CSP nonce, and security headers
    - `apps/admin/src/lib/cors.ts` reflects `Access-Control-Allow-Origin` only when origin equals `https://admin.theroyalglow.in`; middleware injects a per-request CSP nonce; `next.config.ts` sets `default-src 'self'`, `script-src 'self' 'nonce-…'`, `X-Frame-Options: DENY`, and `noindex`
    - _Requirements: 7.1, 7.2, 7.3, 7.7_

  - [x] 10.2 Add Upstash rate limiting to admin API routes
    - `@upstash/ratelimit` sliding window (20 req / 10s) keyed by authenticated user id; on exceed → 429 with `Retry-After`
    - _Requirements: 7.4, 7.5_

  - [x]* 10.3 Write property test for CORS origin reflection
    - **Property 5: CORS reflects the allowed origin only**
    - **Validates: Requirements 7.1, 7.2**

  - [x]* 10.4 Write unit tests for rate limit and headers
    - At/over 20 req / 10s → 429 + `Retry-After`; assert CSP and `X-Frame-Options: DENY` headers
    - _Requirements: 7.3, 7.4, 7.5, 7.7_

- [x] 11. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. DNS, deployment, and CI/CD
  - [x] 12.1 Align the admin resource with the shared AWS deploy workflow
    - Declare Admin_App in `sst.config.ts` with `sst.aws.Nextjs`; use `.github/workflows/deploy-aws.yml` to run `bunx sst deploy`. The workflow does not upload Sentry source maps or run migrations. When `AWS_DOMAINS_LIVE == 'true'`, retry both web and admin `/api/health` endpoints up to 6 times with 15-second waits; on failure, notify best-effort and require operator inspection before manual known-good-ref redeployment
    - Keep Cloudflare as authoritative DNS only; SST's DNS integration may use `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_DEFAULT_ACCOUNT_ID`, but neither is an Admin_App runtime variable
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 12.2 Add path-filtered parallel CI jobs and Lighthouse
    - Extend `ci.yml` with `dorny/paths-filter`; separate parallel admin/web jobs (lint+typecheck+test+build via per-app turbo filters), each reporting its own status within a 15-min budget; any failed required app build blocks the single shared SST production deployment; Lighthouse CI vs `admin.theroyalglow.in` (perf ≥ 90, a11y = 100, best practices ≥ 95)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

- [x] 13. Web app cleanup and 301 redirects (`apps/web`)
  - [x] 13.1 Remove admin code from the web app
    - Delete `src/app/admin/`, `src/app/api/admin/`, `src/lib/admin/`, `src/components/admin/`; remove the `/admin/:path*` matcher and admin-role logic from web `middleware.ts` while keeping customer-protected matchers and shared routes (`/api/auth`, `/api/bookings`, `/api/services`, `/api/availability`, `/api/ably/token`)
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 13.2 Add the 301 redirect and fix the image host
    - Add a pure `mapAdminRedirect(path)` helper and wire `/admin/:path*` → `https://admin.theroyalglow.in/:path*` (drop `/admin`, preserve remainder + query; bare `/admin` → origin root) as a 301; update web `next.config.ts` image `remotePatterns` host from `admin.theroyalglow.in` to `cms.theroyalglow.in`
    - _Requirements: 9.4_

  - [x]* 13.3 Write property test for the redirect mapping
    - **Property 4: Web→admin 301 redirect preserves the sub-path**
    - **Validates: Requirements 9.4, 15.5**

  - [x]* 13.4 Write smoke tests for cutover invariants
    - Old `/admin/*` redirects and `/api/admin/*` → 404; web build has zero unresolved admin imports; no admin artifacts remain under `apps/web`; no new DB migrations introduced
    - _Requirements: 3.6, 9.1, 9.2, 9.5, 14.5_

- [x] 14. Documentation and steering updates
  - [x] 14.1 Update steering and deployment docs
    - `project-overview.md` (add `apps/admin/` to structure tree + subdomain map + Layer Rules row); `coding-standards.md` (Root-Path Convention); `implementation-tasks.md` (repoint Phase 3 paths to `apps/admin/app/`); `features.md` (admin served at `admin.theroyalglow.in` root paths); `deployment.md` (Admin_App `sst.aws.Nextjs` resource, `.github/workflows/deploy-aws.yml`, `bunx sst deploy`, CloudFront domain, health path)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

- [x] 15. End-to-end verification and CI assertions
  - [x] 15.1 Write Playwright E2E tests
    - Unauthenticated visitor → redirected to `https://theroyalglow.in`; Receptionist reaches `/bookings`, 403 on `/users`; Owner reaches `/users`; Developer reaches `/logs`; 301 verification for `/admin` and `/admin/bookings`
    - _Requirements: 15.2, 15.5_

  - [x]* 15.2 Add CI path-assertion and migration-diff checks
    - CI check asserting zero admin artifacts under `apps/web` and no `/admin` matcher in web middleware; migration-diff check that no new DB migrations are introduced; tests run in the `test` task and block deploy on failure
    - _Requirements: 2.2, 2.7, 9.1, 9.2, 14.5, 15.4_

- [x] 16. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests) and can be skipped for a faster MVP.
- Each task references specific requirements for traceability.
- Property tests use `fast-check` + Vitest, ≥100 runs each, one test per
  correctness property (P1–P7), tagged with the property text.
- The migration follows the phased cutover: the web `/admin` routes stay live
  until the admin app passes health/smoke checks; cleanup + 301 (Phase 13) is the
  final cutover step. No database schema changes are introduced.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2", "3.2", "3.3", "3.4"] },
    { "id": 2, "tasks": ["1.4", "4.1", "5.1", "5.2"] },
    { "id": 3, "tasks": ["4.2", "5.3", "6.1", "8.1"] },
    { "id": 4, "tasks": ["6.2", "8.2", "9.1", "9.3"] },
    { "id": 5, "tasks": ["6.3", "8.3", "9.2", "9.4", "9.5", "10.1"] },
    { "id": 6, "tasks": ["10.2", "10.3", "10.4", "13.1"] },
    { "id": 7, "tasks": ["12.1", "12.2", "13.2", "14.1"] },
    { "id": 8, "tasks": ["13.3", "13.4", "15.1", "15.2"] }
  ]
}
```
