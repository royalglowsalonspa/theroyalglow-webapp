# Web/Admin Separation Cleanup — Bugfix Design

## Overview

`apps/web` (`theroyalglow.in`) must hold only customer-facing code; `apps/admin`
(`admin.theroyalglow.in`) must hold only admin/operational code. A prior migration
moved admin pages and the `/api/staff` surface out of `web`, but a file-by-file
audit shows the separation is still incomplete in exactly two ways:

1. **Admin-only code living in `web`** — the entire background-jobs surface
   (`apps/web/src/app/api/jobs/**`, 19 route handlers) plus the job-support libs
   they pull in (`schedules.ts`, `reports/slack.ts`). These are operational/admin
   functions hosted inside the customer Worker. QStash schedules and triggered
   enqueues currently point at `theroyalglow.in/api/jobs/*`.
2. **Functionality duplicated across both apps** — two job routes
   (`noshow-check`, `stale-booking-alert`) exist **byte-for-byte identical** in
   both `apps/web/src/app/api/jobs/` and `apps/admin/src/app/api/jobs/`, and are
   both reachable, so the two copies can drift.

The fix relocates the canonical background-job surface to `apps/admin`, deletes
the customer-app copies (including the two duplicates), repoints QStash
scheduling and triggered enqueues at the admin origin, and moves the deploy-time
schedule registration from the web workflow to the admin workflow. No customer
behaviour changes: every genuinely customer-facing endpoint in `web` is left
functionally untouched, and the only change to a customer route
(`POST /api/bookings`) is the **destination URL** its best-effort QStash enqueue
targets — the job still runs with the same schedule, inputs and outcome.

The audit also confirms the four "split" endpoints
(`leads`, `membership`, `offers`, `notifications`) are **already correctly
split**: the `web` halves are purely customer-scoped, the admin halves already
live in `apps/admin`, and all shared logic lives in `packages/*`. They require
verification + preservation tests only — no code movement.

This is a code-location and de-duplication fix, not a behaviour change.

## Glossary

- **Bug_Condition (C)**: A unit of code `X` is buggy when it is admin-only and
  located in `apps/web`, **or** it is duplicated (same functionality implemented
  in both `apps/web` and `apps/admin`).
- **Property (P)**: After the fix, every admin-only unit lives only in
  `apps/admin`, every unit is defined in exactly one app, and background jobs run
  from a single canonical admin-side location with identical schedule/inputs/
  outcomes.
- **Preservation**: Customer-facing endpoints, pages, and customer-only libs in
  `apps/web` behave identically before and after the fix.
- **Background job**: A `POST /api/jobs/<name>` route handler invoked by QStash —
  either *scheduled* (cron, registered by `register-schedules.ts` from
  `JOB_SCHEDULES`) or *triggered* (enqueued with a delay via `enqueueJob`).
- **`enqueueJob(path, body, delaySeconds)`**: Best-effort QStash publish helper.
  Builds the destination as `${baseOrigin}${path}`; never throws; no-ops without
  `QSTASH_TOKEN`.
- **`JOB_SCHEDULES`**: The single source of truth (`lib/jobs/schedules.ts`) for
  the 14 scheduled jobs' paths + UTC crons, consumed by `register-schedules.ts`.
- **Canonical job home**: `apps/admin/src/app/api/jobs/**`, served from
  `admin.theroyalglow.in/api/jobs/*`.

## Bug Details

### Bug Condition

The bug manifests for any code unit `X` (a route handler, a job-support lib, a
deploy/config entry) that is admin-only yet located in `apps/web`, or that is
implemented redundantly in both apps. The web/admin boundary is violated either
by *misplacement* (admin code in the customer app) or by *duplication* (one unit
defined twice).

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X of type CodeUnit { path, app, kind, isAdminOnly, isCustomerFacing }
  OUTPUT: boolean

  // (a) admin-only functionality located in the customer app
  misplaced  := X.isAdminOnly AND X.app == 'web'

  // (b) the same unit of functionality implemented in BOTH apps
  duplicated := existsEquivalentImplementation(X, 'web') AND
                existsEquivalentImplementation(X, 'admin')

  RETURN misplaced OR duplicated
END FUNCTION
```

A unit is NOT buggy (`¬C`) when it is customer-facing and located in `web`, or
admin-only and located in `admin`, or shared and defined once in `packages/*`.

### Examples

- `apps/web/src/app/api/jobs/appointment-reminders/route.ts` — admin/operational
  job hosted in the customer app. **Buggy (misplaced).** Expected: lives only in
  `apps/admin`.
- `apps/web/src/app/api/jobs/noshow-check/route.ts` **and**
  `apps/admin/src/app/api/jobs/noshow-check/route.ts` — byte-identical, both
  reachable. **Buggy (duplicated).** Expected: defined once, in `apps/admin`.
- `apps/web/scripts/register-schedules.ts` + the "Register QStash schedules" step
  in `deploy-prod.yml` — register the admin job schedules against the **customer**
  origin from the **customer** deploy. **Buggy (misplaced).** Expected: registered
  from the admin workflow against the admin origin.
- `apps/web/src/app/api/leads/route.ts` (public Meta-ad capture) — customer-facing,
  in `web`. **Not buggy.** Stays exactly as-is.
- `getNotificationsForUser` in `@rgss/db/queries` — shared, defined once in a
  package, imported by both apps' notification routes. **Not buggy.** No change.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors (customer-facing, must behave identically):**
- `POST /api/leads` — public Meta-ad lead capture: rate-limit, phone
  normalisation, persistence with source attribution, best-effort CAPI event.
- `GET /api/membership` — the caller's own active membership, session history,
  past memberships.
- `GET /api/offers` — public active offers with applicable service names.
- `GET|PATCH /api/notifications` — the caller's own feed/unread count and
  mark-read.
- All other customer endpoints: `auth`, `availability`, `bookings` (incl. its
  observable create response and realtime publish), `contact`, `gems` (+`redeem`),
  `health`, `onboarding/complete`, `profile/preferences`, `push/subscribe`,
  `revalidate`, `services` (+`[slug]`), `ably/token`.
- Customer-only libs that stay in `web`: `lib/meta/capi.ts` (leads),
  `lib/notifications/providers/email.ts` (contact), and `lib/jobs/enqueue.ts`
  (booking-creation triggered enqueue).
- The work each background job performs: same schedule (identical UTC crons),
  same trigger delays, same inputs, same outcomes — just executed from the admin
  origin.

**Scope:**
All inputs that do NOT involve admin-only/background-job code are completely
unaffected. The single deliberate change touching a customer route is the QStash
**destination origin** inside `enqueueJob` (customer-observable behaviour of
`POST /api/bookings` is unchanged: the enqueue is best-effort, never throws, and
already no-ops without `QSTASH_TOKEN`).

**Out of scope:** No database schema change, no migration (the separation
introduces none — consistent with the committed canonical baseline). Shared
`packages/*` (`db`, `business`, `types`, `errors`, `logger`) are never duplicated;
both apps continue to import from them.

## Hypothesized Root Cause

The previous migration relocated admin **pages** and the `/api/staff` API surface
but stopped short of the background-jobs surface and its support libs:

1. **Incomplete relocation of the jobs surface**: All 19 `/api/jobs/*` handlers
   were left in `apps/web`. The QStash *scheduled* registration
   (`register-schedules.ts` + `JOB_SCHEDULES`) and the *triggered* `enqueueJob`
   destinations still resolve to the customer origin (`NEXT_PUBLIC_APP_URL` in the
   web app), and `deploy-prod.yml` (the customer workflow) owns the schedule
   registration step.

2. **Partial duplication during a prior attempt**: `noshow-check` and
   `stale-booking-alert` were copied into `apps/admin` (canonical, with admin
   logger tags and a `verify.test.ts`) but the `apps/web` originals were never
   deleted, leaving two live, identical copies.

3. **Support-lib entanglement**: The jobs depend on `lib/jobs/{verify,heartbeat,
   schedules}.ts`, `lib/notifications/dispatch.ts`, `lib/notifications/providers/
   webpush.ts`, and `lib/reports/slack.ts`. `apps/admin` already has its own
   `verify`, `heartbeat`, `dispatch`, and both providers, but lacks `schedules.ts`
   and `reports/slack.ts`. So some web libs become dead after the jobs leave
   (delete), some are admin-unique and must move, and a few are still used by
   genuine customer routes (keep).

4. **Admin app missing job-runtime wiring**: `apps/admin/package.json` lacks the
   `@upstash/qstash` dependency and a `register-schedules` script, and
   `apps/admin/src/env.ts` lacks `QSTASH_TOKEN`, `INVOICING_SERVICE_URL`, and
   `INVOICE_PDF_HMAC_SECRET` — all needed once the jobs and the registration
   script run from the admin side. `deploy-admin-prod.yml` has no QStash
   registration step.

## Correctness Properties

Property 1: Bug Condition — Admin-only and duplicated code is correctly placed and de-duplicated

_For any_ code unit `X` where the bug condition holds (`isBugCondition(X)` is
true — `X` is admin-only and in `apps/web`, or `X` is duplicated across both
apps), the fixed codebase SHALL host `X` only in `apps/admin` (relocating
misplaced units and deleting customer-app duplicates), SHALL define every unit in
exactly one app, and SHALL run every background job from the single canonical
admin-side location (`admin.theroyalglow.in/api/jobs/*`) with the same schedule,
inputs, and outcomes — including QStash scheduled registration and triggered
enqueues repointed to the admin origin.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 3.6**

Property 2: Preservation — Customer-facing functionality is unchanged

_For any_ input where the bug condition does NOT hold (`isBugCondition(X)` is
false — customer-facing code in `apps/web`, admin code already in `apps/admin`,
or shared code in `packages/*`), the fixed codebase SHALL produce exactly the same
behaviour as before, preserving the public lead capture, the caller's membership/
offers/notifications endpoints, and every other customer endpoint and customer-only
lib in `apps/web`. The only permitted change to a customer route is the QStash
destination origin inside the best-effort booking enqueue, which is not observable
in the route's response.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming the root-cause analysis is correct, the fix is a relocation +
de-duplication + repointing pass with no behaviour change.

#### A. Relocation / De-duplication Inventory (route handlers)

`apps/web/src/app/api/jobs/` currently holds 19 handlers. Classification:

| # | Source (`apps/web/src/app/api/jobs/...`) | Type | Action | Destination (`apps/admin/src/app/api/jobs/...`) | Reason |
|---|------------------------------------------|------|--------|--------------------------------------------------|--------|
| 1 | `appointment-reminders/route.ts` | scheduled | **MOVE** | `appointment-reminders/route.ts` | admin-only; not yet in admin |
| 2 | `membership-expiry/route.ts` | scheduled | **MOVE** | `membership-expiry/route.ts` | admin-only |
| 3 | `birthday-emails/route.ts` | scheduled | **MOVE** | `birthday-emails/route.ts` | admin-only |
| 4 | `membership-usage-nudges/route.ts` | scheduled | **MOVE** | `membership-usage-nudges/route.ts` | admin-only |
| 5 | `lead-followups/route.ts` | scheduled | **MOVE** | `lead-followups/route.ts` | admin-only |
| 6 | `daily-sales-report/route.ts` | scheduled | **MOVE** | `daily-sales-report/route.ts` | admin-only |
| 7 | `weekly-report/route.ts` | scheduled | **MOVE** | `weekly-report/route.ts` | admin-only |
| 8 | `gems-expiry-reminder/route.ts` | scheduled | **MOVE** | `gems-expiry-reminder/route.ts` | admin-only |
| 9 | `nightly-sales-summary/route.ts` | scheduled | **MOVE** | `nightly-sales-summary/route.ts` | admin-only (was pg_cron) |
| 10 | `membership-auto-expire/route.ts` | scheduled | **MOVE** | `membership-auto-expire/route.ts` | admin-only (was pg_cron) |
| 11 | `offer-auto-expire/route.ts` | scheduled | **MOVE** | `offer-auto-expire/route.ts` | admin-only (was pg_cron) |
| 12 | `gems-auto-expire/route.ts` | scheduled | **MOVE** | `gems-auto-expire/route.ts` | admin-only (was pg_cron) |
| 13 | `session-cleanup/route.ts` | scheduled | **MOVE** | `session-cleanup/route.ts` | admin-only (was pg_cron) |
| 14 | `monthly-gst-summary/route.ts` | scheduled | **MOVE** | `monthly-gst-summary/route.ts` | admin-only (was pg_cron) |
| 15 | `post-service-followup/route.ts` | triggered | **MOVE** | `post-service-followup/route.ts` | admin-only; enqueued from admin booking-complete |
| 16 | `membership-expired-notice/route.ts` | triggered | **MOVE** | `membership-expired-notice/route.ts` | admin-only; enqueued from admin membership-create |
| 17 | `invoice-pdf/route.ts` | triggered | **MOVE** | `invoice-pdf/route.ts` | admin-only; enqueued from admin booking-complete |
| 18 | `stale-booking-alert/route.ts` | triggered | **DELETE (dedup)** | already exists (canonical) | byte-identical duplicate already in admin |
| 19 | `noshow-check/route.ts` | triggered | **DELETE (dedup)** | already exists (canonical) | byte-identical duplicate already in admin |

Net result: `apps/web/src/app/api/jobs/` is removed entirely; `apps/admin/src/app/api/jobs/`
holds all 19 canonical handlers (2 pre-existing + 17 relocated).

When moving handlers, update the logger `service` tag from `web:jobs:<name>` to
`admin:jobs:<name>` to match the existing admin convention (e.g. admin's
`noshow-check` uses `admin:jobs:noshow-check`). All `@/lib/...` imports resolve
against the admin app (see lib inventory). `@rgss/*` package imports are
unchanged.

#### B. Relocation / De-duplication Inventory (support libs + scripts)

| Source (`apps/web/...`) | Action | Destination | Reason |
|-------------------------|--------|-------------|--------|
| `scripts/register-schedules.ts` | **MOVE** | `apps/admin/scripts/register-schedules.ts` | registers admin job schedules; must run from admin |
| `src/lib/jobs/schedules.ts` (`JOB_SCHEDULES`) | **MOVE** | `apps/admin/src/lib/jobs/schedules.ts` | schedule source-of-truth; admin lacks it |
| `src/lib/reports/slack.ts` | **MOVE** | `apps/admin/src/lib/reports/slack.ts` | only the report jobs use it; admin lacks `reports/` |
| `src/lib/jobs/verify.ts` | **DELETE** | (admin already has `lib/jobs/verify.ts`) | only job routes consumed it; admin canonical exists |
| `src/lib/jobs/heartbeat.ts` | **DELETE** | (admin already has `lib/jobs/heartbeat.ts`) | only job routes consumed it; admin canonical exists |
| `src/lib/notifications/dispatch.ts` | **DELETE** | (admin already has `lib/notifications/dispatch.ts`) | only job routes consumed it (verified no customer consumer); admin canonical exists |
| `src/lib/notifications/providers/webpush.ts` | **DELETE** | (admin already has `providers/webpush.ts`) | only `dispatch.ts` consumed it; dead in web once dispatch is gone |
| `src/lib/jobs/enqueue.ts` | **KEEP (edit)** | stays in `apps/web` | still used by `POST /api/bookings`; repoint base origin (see D) |
| `src/lib/notifications/providers/email.ts` | **KEEP** | stays in `apps/web` | used by customer `contact` route; admin has its own copy |
| `src/lib/meta/capi.ts` | **KEEP** | stays in `apps/web` | used by customer `leads` route |

After this, `apps/web/src/lib/jobs/` contains only `enqueue.ts`;
`apps/web/src/lib/reports/` is removed; `apps/web/src/lib/notifications/`
contains only `providers/email.ts`.

> Each **DELETE** must be guarded by a grep confirming zero remaining `apps/web`
> references before removal (the audit found none outside `api/jobs/**`).

#### C. Split endpoints — verify only, no movement

`leads`, `membership`, `offers`, `notifications` in `apps/web` are already
customer-scoped; their admin counterparts already exist under `apps/admin/src/app/api/`
(`leads/[id]`, `memberships*`, `offers*`, `membership-tiers`, `notifications`).
Shared query logic lives in `@rgss/db/queries`. **No code moves.** Add/keep
preservation tests asserting these `web` halves are unchanged and contain no
admin-only branch.

#### D. QStash repointing (scheduled + triggered)

- **Triggered, from `web`**: `apps/web/src/app/api/bookings/route.ts` enqueues
  `stale-booking-alert` (+2h) and `noshow-check` (after end+15m) via
  `apps/web/src/lib/jobs/enqueue.ts`. Those routes now live only in admin, so the
  web enqueue must POST to the **admin** origin. Change `enqueue.ts` to build the
  destination from `process.env.NEXT_PUBLIC_ADMIN_URL` instead of
  `NEXT_PUBLIC_APP_URL`. The call sites, paths, payloads, delays, and the
  best-effort/no-throw contract are unchanged.
- **Triggered, from `admin`**: `apps/admin/.../bookings/[id]/complete` (invoice-pdf,
  post-service-followup) and `.../memberships` (membership-expired-notice) already
  enqueue via `apps/admin/src/lib/jobs/enqueue.ts`, which resolves
  `NEXT_PUBLIC_APP_URL` = the **admin** origin in the admin app. **No change** —
  these already target the correct origin once the routes are in admin.
- **Scheduled**: the relocated `register-schedules.ts` reads `JOB_SCHEDULES` and
  registers each cron against its origin. Run it from the admin deploy with the
  admin public origin so the 14 schedules POST to `admin.theroyalglow.in/api/jobs/*`.

#### E. Package / env / deploy wiring

- `apps/admin/package.json`: add `"@upstash/qstash"` dependency (the moved
  `register-schedules.ts` imports `Client` at top level; the lazy import in
  `enqueue.ts`/`verify.ts` also benefits). Add script
  `"register-schedules": "bun run scripts/register-schedules.ts"`.
- `apps/web/package.json`: remove the `"register-schedules"` script. **Keep**
  `@upstash/qstash` (still used by the web `enqueue.ts`).
- `apps/admin/src/env.ts` + `apps/admin/.env.example`: add server vars
  `QSTASH_TOKEN` (enqueue + registration), `INVOICING_SERVICE_URL` and
  `INVOICE_PDF_HMAC_SECRET` (consumed by the relocated `invoice-pdf` job via
  admin `@/env`). Mirror the definitions from `apps/web/src/env.ts`.
- `.github/workflows/deploy-prod.yml`: remove the "Register QStash schedules"
  post-deploy step (and its `QSTASH_TOKEN`/`NEXT_PUBLIC_APP_URL` env). The web
  Worker keeps its `QSTASH_TOKEN` runtime secret (booking enqueue) and already
  receives `NEXT_PUBLIC_ADMIN_URL` at build (used by the repointed enqueue).
- `.github/workflows/deploy-admin-prod.yml`: add a post-deploy "Register QStash
  schedules" step running `bun run register-schedules` in `apps/admin` with
  `QSTASH_TOKEN: ${{ secrets.QSTASH_TOKEN }}` and
  `NEXT_PUBLIC_APP_URL: ${{ vars.NEXT_PUBLIC_ADMIN_URL }}`. Document that the
  admin Worker runtime secrets must now include `QSTASH_TOKEN` and the
  job-runtime secrets the jobs read (Resend/email, Slack webhook, BetterStack
  heartbeat URLs, `INVOICING_SERVICE_URL`, `INVOICE_PDF_HMAC_SECRET`).
- Documentation sync (consistency, non-blocking): update
  `knowledge-base/{background-jobs.md,sitemap.md,pages/api-routes.*,system-design/HLD.md}`
  and `docs/content/docs/*` references from `theroyalglow.in/api/jobs/*` to
  `admin.theroyalglow.in/api/jobs/*`.

#### F. Separation invariant test (fix harness)

Extend `apps/web/src/__tests__/admin-web-separation.invariants.test.ts`:
- assert `apps/web/src/app/api/jobs` does **not** exist;
- assert the deleted/moved web libs are gone (`lib/jobs/verify.ts`,
  `lib/jobs/heartbeat.ts`, `lib/jobs/schedules.ts`, `lib/notifications/dispatch.ts`,
  `lib/notifications/providers/webpush.ts`, `lib/reports/`);
- assert `lib/jobs/enqueue.ts`, `lib/notifications/providers/email.ts`,
  `lib/meta/capi.ts` and the four customer split-route files still exist;
- extend `FORBIDDEN_MARKERS` so no non-test `web` source references `/api/jobs/`,
  `lib/jobs/verify`, `lib/jobs/heartbeat`, `lib/jobs/schedules`,
  `notifications/dispatch`, or `reports/slack`.

Add an admin-side presence test asserting all 19 canonical job routes exist under
`apps/admin/src/app/api/jobs/**` and that `register-schedules.ts` +
`JOB_SCHEDULES` resolve in admin.

## Testing Strategy

### Validation Approach

Two phases. First, write static-placement checks that **fail on the current
(unfixed) tree** to demonstrate the separation defect and confirm the root cause
(jobs in `web`, duplicates in both apps, registration in the web workflow). Then,
after relocation, verify the bug condition is eliminated everywhere and that every
customer-facing behaviour is preserved.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate `isBugCondition(X)` is true for
real units in the current tree, confirming the root cause before changing code.

**Test Plan**: Add static (filesystem/AST-grep) assertions and run them against
the unfixed tree to observe failures.

**Test Cases**:
1. **Jobs-in-web**: assert `apps/web/src/app/api/jobs` does not exist — fails now
   (19 handlers present).
2. **Duplicate routes**: assert `noshow-check`/`stale-booking-alert` exist in only
   one app — fails now (present in both, identical).
3. **Registration ownership**: assert `deploy-prod.yml` has no QStash registration
   step and `apps/web` has no `register-schedules` script — fails now.
4. **Triggered destination**: assert the web booking enqueue resolves to the admin
   origin — fails now (`enqueue.ts` uses `NEXT_PUBLIC_APP_URL` = customer origin).

**Expected Counterexamples**:
- `apps/web/src/app/api/jobs/*` exist; both apps contain identical
  `noshow-check`/`stale-booking-alert`; `register-schedules` runs from the web
  workflow against `theroyalglow.in`. Confirms misplacement + duplication.

### Fix Checking

**Goal**: For all inputs where the bug condition holds, the fixed tree produces
the expected placement/behaviour.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  ASSERT locatedOnlyIn(X, 'admin')           // misplaced units relocated
  ASSERT definedInExactlyOneApp(X)           // duplicates removed
  ASSERT jobReachableAt(X, ADMIN_ORIGIN)     // QStash hits admin origin
  ASSERT sameScheduleInputsOutcome(X)        // work unchanged (Req 3.6)
END FOR
```

**Test Cases**: all 19 job routes resolve only under `apps/admin`; `JOB_SCHEDULES`
+ `register-schedules.ts` resolve in admin and target the admin origin (`--dry`
run lists `admin.theroyalglow.in/api/jobs/*`); the moved handlers compile against
admin `@/lib/*` and admin `@/env`; relocated `invoice-pdf` resolves
`INVOICING_SERVICE_URL`/`INVOICE_PDF_HMAC_SECRET` from admin env; admin
`enqueue.ts` targets the admin origin; web `enqueue.ts` now targets
`NEXT_PUBLIC_ADMIN_URL`.

### Preservation Checking

**Goal**: For all inputs where the bug condition does NOT hold, the fixed function
produces the same result as the original.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT behaviour_web_original(X) == behaviour_web_fixed(X)
END FOR
```

**Testing Approach**: Property-based testing fits the customer route handlers
(`leads`, `membership`, `offers`, `notifications`, `bookings`) because random
valid inputs exercise many branches and assert the response envelope is byte-for-
byte unchanged. Capture current behaviour on the unfixed tree first, then assert
it is unchanged after the move.

**Test Cases**:
1. **Lead capture preservation**: random valid lead bodies → unchanged 201 +
   `{ leadId }`, phone normalisation, source default, best-effort CAPI (mocked).
2. **Membership / offers / notifications preservation**: random sessions/params →
   unchanged envelopes, pagination, unread count, scoping.
3. **Booking-create preservation**: `POST /api/bookings` returns the identical
   response and still calls `enqueueJob` with the same `path`/`body`/`delay`
   (enqueue mocked) — only the internal base origin differs.
4. **Static preservation**: the kept customer files and customer-only libs still
   exist; no `web` source references a moved/deleted job lib (invariant test).

### Unit Tests

- Filesystem/AST invariants for placement and de-duplication (web + admin).
- `register-schedules.ts` `--dry` against admin origin emits all 14 schedules to
  `admin.theroyalglow.in/api/jobs/*`.
- Relocated handlers' existing per-route tests pass under admin (e.g. admin
  `verify.test.ts` already covers `noshow-check`/`stale-booking-alert`).
- Customer route handler tests (leads/membership/offers/notifications/bookings)
  unchanged and green.

### Property-Based Tests

- Customer endpoints: generate random valid inputs and assert response envelopes
  are identical pre/post fix.
- `enqueueJob`: property over random `(path, body, delaySeconds)` asserting the
  destination is `${NEXT_PUBLIC_ADMIN_URL}${path}` (web) / admin origin (admin)
  and that it never throws and no-ops without `QSTASH_TOKEN`.

### Integration Tests

- Admin deploy `register-schedules` step registers all 14 schedules against the
  admin origin idempotently (re-run converges, no duplicates).
- Booking creation (web) → triggered enqueue resolves to the admin job route;
  admin booking-complete/membership-create enqueues resolve to admin job routes.
- Post-relocation typecheck/build of both apps green (no dangling `@/lib/*`
  imports in either app); health checks for both Workers pass.
