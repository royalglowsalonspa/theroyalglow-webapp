# Implementation Plan

## Overview

This plan follows the exploratory bugfix workflow: write bug-condition and
preservation tests **before** touching code, then relocate / de-duplicate /
repoint, then verify the bug condition is eliminated and customer behaviour is
preserved.

- **Property 1 (Bug Condition / Expected Behavior)** validates Requirements 2.1, 2.2, 2.3, 2.4, 3.6
- **Property 2 (Preservation)** validates Requirements 3.1, 3.2, 3.3, 3.4, 3.5

## Tasks

- [x] 1. Write bug-condition exploration tests (BEFORE any fix)
  - **Property 1: Bug Condition** - Admin-only / duplicated code is misplaced in `apps/web`
  - **CRITICAL**: These tests MUST FAIL on the current (unfixed) tree - failure confirms the separation defect exists
  - **DO NOT attempt to fix the test or the code when it fails** at this stage
  - **NOTE**: These tests encode the expected placement - they will validate the fix when they pass after implementation
  - **GOAL**: Surface counterexamples proving `isBugCondition(X)` is true for real units in the tree
  - **Scoped PBT Approach**: The bug is deterministic (fixed filesystem state), so scope each property to the concrete failing units enumerated in the design's relocation inventory rather than random generation
  - Extend `apps/web/src/__tests__/admin-web-separation.invariants.test.ts` with static (filesystem/AST-grep) assertions:
    - Assert `apps/web/src/app/api/jobs` does **not** exist (fails now: 19 handlers present) — `isBugCondition` misplaced case
    - Assert `noshow-check` and `stale-booking-alert` exist in **exactly one** app (fails now: byte-identical copies in both `apps/web` and `apps/admin`) — `isBugCondition` duplicated case
    - Assert `.github/workflows/deploy-prod.yml` has **no** "Register QStash schedules" step AND `apps/web/package.json` has **no** `register-schedules` script (fails now: registration owned by the web workflow)
    - Assert the web booking enqueue (`apps/web/src/lib/jobs/enqueue.ts`) resolves its destination to the **admin** origin `NEXT_PUBLIC_ADMIN_URL` (fails now: uses `NEXT_PUBLIC_APP_URL` = customer origin)
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct - it proves misplacement + duplication)
  - Document counterexamples found: `apps/web/src/app/api/jobs/*` present (19 handlers); `noshow-check`/`stale-booking-alert` duplicated in both apps; `register-schedules` runs from web workflow against `theroyalglow.in`; enqueue targets customer origin
  - Mark complete when tests are written, run, and failures documented
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.6_

- [x] 2. Write preservation property tests (BEFORE any fix)
  - **Property 2: Preservation** - Customer-facing endpoints and customer-only libs are unchanged
  - **IMPORTANT**: Follow observation-first methodology — run UNFIXED code first, record actual outputs, then assert them
  - **GOAL**: Capture a behavioural baseline for every `¬isBugCondition(X)` unit so any regression is caught
  - Property-based tests (random valid inputs) for customer route handlers, asserting response envelopes are byte-for-byte unchanged:
    - Observe + assert `POST /api/leads`: random valid lead bodies → `201` + `{ leadId }`, phone normalisation, source default, best-effort CAPI (mocked) — baseline for Req 3.1
    - Observe + assert `GET /api/membership`: random authed sessions → unchanged active membership + session history + past memberships envelope — baseline for Req 3.2
    - Observe + assert `GET /api/offers`: random params → unchanged active offers with applicable service names — baseline for Req 3.3
    - Observe + assert `GET|PATCH /api/notifications`: random sessions/params → unchanged feed/unread count + mark-read + scoping — baseline for Req 3.4
    - Observe + assert `POST /api/bookings`: random valid bodies → identical response envelope AND `enqueueJob` still called with the same `path`/`body`/`delaySeconds` (enqueue mocked) — baseline for Req 3.5 (only the internal base origin may differ later)
  - Property over `enqueueJob(path, body, delaySeconds)`: never throws, no-ops without `QSTASH_TOKEN`, builds `${baseOrigin}${path}` (baseline of the best-effort contract)
  - Static preservation: assert the kept customer files still exist — `lib/jobs/enqueue.ts`, `lib/notifications/providers/email.ts`, `lib/meta/capi.ts`, and the four customer split-route files (`leads`, `membership`, `offers`, `notifications`)
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (confirms the baseline customer behaviour to preserve)
  - Mark complete when tests are written, run, and passing on the unfixed tree
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix: relocate, de-duplicate, repoint, and rewire the background-jobs surface

  - [x] 3.1 Relocate the 17 admin-only job route handlers from `apps/web` to `apps/admin`
    - Move each of the 17 handlers from `apps/web/src/app/api/jobs/<name>/route.ts` to `apps/admin/src/app/api/jobs/<name>/route.ts`: `appointment-reminders`, `membership-expiry`, `birthday-emails`, `membership-usage-nudges`, `lead-followups`, `daily-sales-report`, `weekly-report`, `gems-expiry-reminder`, `nightly-sales-summary`, `membership-auto-expire`, `offer-auto-expire`, `gems-auto-expire`, `session-cleanup`, `monthly-gst-summary`, `post-service-followup`, `membership-expired-notice`, `invoice-pdf`
    - Update each logger `service` tag from `web:jobs:<name>` to `admin:jobs:<name>` to match the admin convention
    - Ensure all `@/lib/...` imports resolve against the admin app; leave `@rgss/*` package imports unchanged
    - _Bug_Condition: isBugCondition(X) — X.isAdminOnly AND X.app == 'web' (misplaced)_
    - _Expected_Behavior: locatedOnlyIn(X, 'admin') with same schedule/inputs/outcomes_
    - _Preservation: no customer route touched by this move_
    - _Requirements: 2.1, 2.2, 3.6_

  - [x] 3.2 Move job-support libs and the registration script to `apps/admin`
    - Move `apps/web/scripts/register-schedules.ts` → `apps/admin/scripts/register-schedules.ts`
    - Move `apps/web/src/lib/jobs/schedules.ts` (`JOB_SCHEDULES`) → `apps/admin/src/lib/jobs/schedules.ts`
    - Move `apps/web/src/lib/reports/slack.ts` → `apps/admin/src/lib/reports/slack.ts`
    - **Depends on 3.1** (handlers must reference the admin-side libs)
    - _Bug_Condition: isBugCondition(X) — admin-only support libs located in 'web'_
    - _Expected_Behavior: locatedOnlyIn(X, 'admin'); JOB_SCHEDULES + register-schedules resolve in admin_
    - _Preservation: these libs have no customer consumer_
    - _Requirements: 2.1, 2.2, 3.6_

  - [x] 3.3 Repoint the web booking enqueue to the admin origin
    - Edit `apps/web/src/lib/jobs/enqueue.ts` to build the destination from `process.env.NEXT_PUBLIC_ADMIN_URL` instead of `NEXT_PUBLIC_APP_URL`
    - Keep call sites, paths, payloads, delays, and the best-effort/no-throw/no-`QSTASH_TOKEN`-no-op contract unchanged
    - Confirm admin `enqueue.ts` already resolves the admin origin (no change needed there)
    - **Depends on 3.1** (target routes `noshow-check`/`stale-booking-alert` now live only in admin)
    - _Bug_Condition: triggered enqueue from web must hit the canonical admin job home_
    - _Expected_Behavior: jobReachableAt(X, ADMIN_ORIGIN); destination = `${NEXT_PUBLIC_ADMIN_URL}${path}`_
    - _Preservation: `POST /api/bookings` response is unchanged; only the internal base origin differs_
    - _Requirements: 2.2, 3.5, 3.6_

  - [x] 3.4 Delete the now-dead web job libs and the two duplicate routes (grep-guarded)
    - **Guard**: before each delete, grep `apps/web` for remaining references and confirm zero (outside `api/jobs/**`, which is gone after 3.1)
    - Delete duplicate routes from web: `apps/web/src/app/api/jobs/noshow-check/route.ts`, `apps/web/src/app/api/jobs/stale-booking-alert/route.ts` (admin canonical already exists)
    - Delete dead libs: `apps/web/src/lib/jobs/verify.ts`, `apps/web/src/lib/jobs/heartbeat.ts`, `apps/web/src/lib/notifications/dispatch.ts`, `apps/web/src/lib/notifications/providers/webpush.ts`
    - Ensure `apps/web/src/app/api/jobs` is removed entirely; `apps/web/src/lib/jobs/` retains only `enqueue.ts`; `apps/web/src/lib/reports/` is gone; `apps/web/src/lib/notifications/` retains only `providers/email.ts`
    - **Depends on 3.1, 3.2, 3.3** (references must be gone before deletion)
    - _Bug_Condition: isBugCondition(X) — duplicated (same unit in both apps)_
    - _Expected_Behavior: definedInExactlyOneApp(X); duplicates removed_
    - _Preservation: KEEP `enqueue.ts`, `providers/email.ts`, `meta/capi.ts` and the four customer split routes_
    - _Requirements: 2.3, 3.5_

  - [x] 3.5 Wire package, env, and deploy for the admin job runtime
    - `apps/admin/package.json`: add `@upstash/qstash` dependency; add script `"register-schedules": "bun run scripts/register-schedules.ts"`
    - `apps/web/package.json`: remove the `register-schedules` script; **keep** `@upstash/qstash` (still used by web `enqueue.ts`)
    - `apps/admin/src/env.ts` + `apps/admin/.env.example`: add server vars `QSTASH_TOKEN`, `INVOICING_SERVICE_URL`, `INVOICE_PDF_HMAC_SECRET` (mirror `apps/web/src/env.ts` definitions)
    - `.github/workflows/deploy-prod.yml`: remove the "Register QStash schedules" post-deploy step and its `QSTASH_TOKEN`/`NEXT_PUBLIC_APP_URL` env (web Worker keeps `QSTASH_TOKEN` runtime secret + `NEXT_PUBLIC_ADMIN_URL` at build)
    - `.github/workflows/deploy-admin-prod.yml`: add a post-deploy "Register QStash schedules" step running `bun run register-schedules` in `apps/admin` with `QSTASH_TOKEN: ${{ secrets.QSTASH_TOKEN }}` and `NEXT_PUBLIC_APP_URL: ${{ vars.NEXT_PUBLIC_ADMIN_URL }}`
    - **CRITICAL ORDERING**: Ensure the admin Worker carries ALL job-runtime secrets (Resend/email, Slack webhook, BetterStack heartbeat URLs, `QSTASH_TOKEN`, `INVOICING_SERVICE_URL`, `INVOICE_PDF_HMAC_SECRET`) **BEFORE** the schedules go live, or relocated jobs will fail at runtime
    - **Depends on 3.1, 3.2** (admin must host the jobs + script before registration is pointed at it)
    - _Bug_Condition: registration + runtime wiring must live on the admin side_
    - _Expected_Behavior: register-schedules runs from admin against the admin origin; jobs resolve their env_
    - _Preservation: web deploy still ships the customer Worker with its booking-enqueue secret_
    - _Requirements: 2.1, 2.2, 3.6_

  - [x] 3.6 Sync documentation references (non-blocking consistency)
    - Update `knowledge-base/{background-jobs.md,sitemap.md,pages/api-routes.*,system-design/HLD.md}` and `docs/content/docs/*` references from `theroyalglow.in/api/jobs/*` to `admin.theroyalglow.in/api/jobs/*`
    - _Preservation: documentation only — no runtime behaviour change_
    - _Requirements: 2.2_

  - [x] 3.7 Verify bug-condition exploration tests now PASS
    - **Property 1: Expected Behavior** - Admin-only / duplicated code correctly placed and de-duplicated
    - **IMPORTANT**: Re-run the SAME tests from task 1 - do NOT write new tests
    - Extend the invariant tests' `FORBIDDEN_MARKERS` so no non-test `web` source references `/api/jobs/`, `lib/jobs/verify`, `lib/jobs/heartbeat`, `lib/jobs/schedules`, `notifications/dispatch`, or `reports/slack`
    - Add an admin-side presence test asserting all 19 canonical job routes exist under `apps/admin/src/app/api/jobs/**` and that `register-schedules.ts` + `JOB_SCHEDULES` resolve in admin
    - Run `register-schedules --dry` against the admin origin and assert it lists all 14 schedules at `admin.theroyalglow.in/api/jobs/*`
    - **EXPECTED OUTCOME**: Tests PASS (confirms the bug condition is eliminated)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.6_

  - [x] 3.8 Verify preservation property tests still PASS
    - **Property 2: Preservation** - Customer-facing functionality is unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Confirm `leads`/`membership`/`offers`/`notifications`/`bookings` envelopes are unchanged and the static preservation assertions (kept files exist) still hold
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Checkpoint - full verification of both apps
  - Re-run separation-invariant tests (now pass) + admin presence test (all 19 routes under admin)
  - `register-schedules --dry` lists `admin.theroyalglow.in/api/jobs/*` for all 14 schedules
  - Typecheck + build BOTH apps green (no dangling `@/lib/*` imports in either app); health checks for both Workers pass
  - Customer route preservation tests unchanged and green
  - Ensure all tests pass; ask the user if any questions arise
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

## Task Dependency Graph

Tasks grouped into ordered waves. Tasks in the same wave have no
dependencies on one another and may run in parallel; each wave depends on
the waves above it.

```json
{
  "waves": [
    {
      "wave": 1,
      "name": "Establish baselines (tests before fix)",
      "tasks": ["1", "2"],
      "dependsOn": []
    },
    {
      "wave": 2,
      "name": "Relocate the canonical jobs surface",
      "tasks": ["3.1"],
      "dependsOn": ["1", "2"]
    },
    {
      "wave": 3,
      "name": "Move support libs and repoint enqueue",
      "tasks": ["3.2", "3.3"],
      "dependsOn": ["3.1"]
    },
    {
      "wave": 4,
      "name": "Delete dead/duplicate web code and wire deploy",
      "tasks": ["3.4", "3.5"],
      "dependsOn": ["3.1", "3.2", "3.3"]
    },
    {
      "wave": 5,
      "name": "Documentation sync",
      "tasks": ["3.6"],
      "dependsOn": ["3.5"]
    },
    {
      "wave": 6,
      "name": "Verify fix and preservation",
      "tasks": ["3.7", "3.8"],
      "dependsOn": ["3.4", "3.5", "3.6"]
    },
    {
      "wave": 7,
      "name": "Final checkpoint",
      "tasks": ["4"],
      "dependsOn": ["3.7", "3.8"]
    }
  ]
}
```

## Notes

- **Ordering rationale**: tests first (1 → 2); relocation before repoint before
  delete-dead-lib (3.1 → 3.2/3.3 → 3.4) so all references are gone before any
  deletion; deploy wiring (3.5) only after the admin side hosts the jobs + script;
  verification (3.7, 3.8) last before the final checkpoint (4).
- **Property 1 (Bug Condition)** task 1 must FAIL on the unfixed tree and PASS
  after the fix (task 3.7). **Property 2 (Preservation)** task 2 must PASS on the
  unfixed tree and still PASS after the fix (task 3.8).
- **Safety**: every DELETE in task 3.4 is grep-guarded for zero remaining
  `apps/web` references. The admin Worker must carry all job-runtime secrets
  before the schedules go live (task 3.5) to avoid runtime failures.
- This is a code-location + de-duplication fix only — no DB schema change, no
  migration, and no customer-observable behaviour change.
