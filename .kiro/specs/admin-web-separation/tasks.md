# Implementation Plan: Admin/Web Separation — Staff Self-Service Relocation

## Overview

This plan relocates the remaining staff self-service surfaces (own schedule view + own
leave submit/withdraw) out of `apps/web` and onto the admin subdomain (`apps/admin`), then
makes `apps/web` permanently 301-redirect legacy `/staff/*` (and residual `/admin/*`) paths
to the admin `/me/*` namespace.

This is a **relocation, not a rewrite**. The web API handlers and page components are already
written against the same shared imports the admin app uses (`withErrorHandler`, `apiSuccess`,
`requireRole`, `@rgss/db/queries`). Prefer **move + import-base change** over reimplementation:
copy the file to its admin location, adjust the import base (`@/lib/admin/bookings` for format
helpers), retarget client `fetch` URLs to `/api/me/*`, and delete the web source. Preserve the
two carried invariants verbatim: **409-on-duplicate-date** and **uniform-404-on-withdraw**.

Implementation language is **TypeScript** (Next.js 16 App Router, both apps). Ordering: APIs +
RBAC land first, then pages (which consume them), then the web redirect + cleanup, with static
verification last.

## Tasks

- [ ] 1. Relocate staff self-service APIs to `apps/admin/src/app/api/me/*`
  - [ ] 1.1 Relocate the schedule GET endpoint
    - Create `apps/admin/src/app/api/me/schedule/route.ts` by moving the handler from
      `apps/web/src/app/api/staff/schedule/route.ts`
    - Keep `withErrorHandler`/`apiSuccess` from `@/lib/api/error-handler` and
      `requireRole('staff')` from `@/lib/api/session`; reuse `getStaffProfileByUserId` +
      `getStaffSchedule` from `@rgss/db/queries`
    - Resolve the staff profile strictly from `session.user.id`; return
      `notFound('No staff profile for this account.')` when the profile is null
    - _Requirements: 2.1, 2.6, 8.4_

  - [ ] 1.2 Relocate the leave GET + POST endpoint
    - Create `apps/admin/src/app/api/me/leave/route.ts` by moving the handler from
      `apps/web/src/app/api/staff/leave/route.ts`
    - GET: reuse `getLeaveForStaff(staff.id)`; 404 on no profile
    - POST: validate with `submitLeaveSchema` from `@rgss/types`; pre-check
      `getLeaveForStaffOnDate(staff.id, date)` and throw `conflict(ERROR_CODES.CONFLICT, …)`
      → **409** on duplicate date; otherwise `submitLeave` returning status `pending` (201)
    - _Requirements: 2.2, 2.3, 2.4, 2.6, 8.4_

  - [ ] 1.3 Relocate the leave withdraw DELETE endpoint
    - Create `apps/admin/src/app/api/me/leave/[id]/route.ts` by moving the handler from
      `apps/web/src/app/api/staff/leave/[id]/route.ts`
    - Call `withdrawLeave(id, staff.id)`; on a null result return a single uniform
      `notFound(…)` regardless of cause (not theirs / already decided / missing) so it never
      reveals another staff member's data
    - `params` is a Promise (Next.js 16) — `await params` for `id`
    - _Requirements: 2.5, 2.6, 8.4_

  - [ ]* 1.4 Write unit tests for the relocated `/api/me/*` behaviors
    - 409 on duplicate-date POST (mock `getLeaveForStaffOnDate` returning a row)
    - Uniform 404 when `withdrawLeave` returns null
    - 404 "no staff profile" when `getStaffProfileByUserId` returns null (schedule + leave GET)
    - Mock the `@rgss/db/queries` layer; no real DB
    - _Requirements: 2.1, 2.2, 2.4, 2.5_

- [ ] 2. Edit Admin RBAC to grant staff access to only its own surfaces
  - [ ] 2.1 Add the `/me` route entry and Self-Service nav section in `apps/admin/src/lib/rbac.ts`
    - Add `['/me', 1]` to `ROUTE_MIN_LEVEL` (placed before the `['/', 2]` root row); leave
      `['/staff', 3]` unchanged
    - Add an `ADMIN_NAV` "Self-Service" section with `My Schedule` (`/me/schedule`) and
      `My Leave` (`/me/leave`), both `minLevel: 1`
    - Do not change `decide`, `routeMinLevel`, `filterNavByLevel`, or `resolveRoleLevel`
    - _Requirements: 3.1, 3.4, 3.6_

  - [ ]* 2.2 Write property test: staff granted exactly the self-service routes
    - **Property 5: Staff is granted access to exactly the self-service routes**
    - **Validates: Requirements 3.2, 3.3, 3.5**
    - Extend `apps/admin/src/lib/rbac.test.ts`; fast-check + Vitest, ≥100 iterations
    - Tag: `// Feature: admin-web-separation, Property 5: Staff is granted access to exactly the self-service routes`
    - Sample paths from known prefixes; assert `decide({kind:'valid',roleLevel:1}, routeMinLevel(path))`
      allows iff path resolves under `/me`, forbids on `/` and every level≥2 route

  - [ ]* 2.3 Write property test: `/me` does not weaken the manager-level `/staff` route
    - **Property 6: Adding `/me` does not weaken the manager-level `/staff` route**
    - **Validates: Requirements 3.4**
    - Extend `apps/admin/src/lib/rbac.test.ts`; fast-check + Vitest, ≥100 iterations
    - Tag: `// Feature: admin-web-separation, Property 6: Adding /me does not weaken the manager-level /staff route`
    - For any `/staff` or `/staff/`-prefixed path assert `routeMinLevel(path) === 3`

  - [ ]* 2.4 Write property test: self-service navigation visibility matches role level
    - **Property 7: Self-service navigation visibility matches role level**
    - **Validates: Requirements 3.6**
    - Extend `apps/admin/src/lib/rbac.test.ts`; fast-check + Vitest, ≥100 iterations
    - Tag: `// Feature: admin-web-separation, Property 7: Self-service navigation visibility matches role level`
    - For `level ∈ 0..5`: `filterNavByLevel(ADMIN_NAV, level)` includes `My Schedule`/`My Leave`
      iff `level >= 1`; for level 1 the result contains only the Self-Service section

  - [ ]* 2.5 Write RBAC matrix example tests
    - Explicit assertions: staff (1) allowed on `/me/schedule` + `/me/leave`; staff 403 on
      `/`, `/bookings`, `/staff`; receptionist (2)+ allowed on `/me/*`
    - _Requirements: 3.2, 3.3, 9.6_

- [ ] 3. Checkpoint — APIs + RBAC
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Relocate staff self-service pages to `apps/admin/src/app/me/*`
  - [ ] 4.1 Create the `/me` self-service layout
    - Create `apps/admin/src/app/me/layout.tsx`: resolve the session server-side and
      `redirect()` to the web origin if absent (defence-in-depth complementing edge gating)
    - Set `robots: { index: false, follow: false }` (noindex) and a `%s | Royal Glow` title
      template; rely on `AdminShell` + `filterNavByLevel` for the self-service-only sidebar
    - _Requirements: 1.3_

  - [ ] 4.2 Relocate the schedule page
    - Create `apps/admin/src/app/me/schedule/page.tsx` by moving the web `StaffSchedulePage`
    - Resolve `getStaffProfileByUserId(session.user.id)`; render the explicit "no staff
      profile" state when null; otherwise render the read-only 7-day grid via
      `getStaffSchedule(staff.id)`
    - Use `formatTime12h` from `@/lib/admin/bookings`; keep `dayOfWeekLabel` from `@rgss/business`
    - _Requirements: 1.1, 1.4_

  - [ ] 4.3 Relocate the leave page + client panel
    - Create `apps/admin/src/app/me/leave/page.tsx` (server header port) and
      `apps/admin/src/app/me/leave/me-leave-panel.tsx` (client port of `StaffLeavePanel`)
    - Retarget the panel `fetch` URLs from `/api/staff/leave*` to `/api/me/leave*`
    - Import `formatDateDDMMYYYY` from `@/lib/admin/bookings`; keep submit form, history list,
      and the per-item withdraw action for `pending` rows
    - _Requirements: 1.2, 1.5_

  - [ ]* 4.4 Write page-rendering tests for the schedule page
    - React Testing Library: renders the "no staff profile" state when the profile is null;
      renders 7 day rows when a schedule is present (mock the query layer)
    - _Requirements: 1.1, 1.4_

  - [ ]* 4.5 Extend the admin route smoke test to cover `/me/*`
    - Add `/me/schedule` and `/me/leave` to
      `apps/admin/src/app/__tests__/migrated-routes.smoke.test.tsx`: staff session allowed on
      `/me/*`, `/` returns 403
    - _Requirements: 3.2, 3.3, 7.3_

- [ ] 5. Checkpoint — relocated pages render and gate correctly
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Add the Web staff-redirect map and wire it into middleware
  - [ ] 6.1 Create the pure `mapStaffRedirect` module
    - Create `apps/web/src/lib/staff-redirect.ts` mirroring `admin-redirect.ts`: export
      `ADMIN_ORIGIN` and `mapStaffRedirect(path, search?)`
    - Behavior: normalize `search` (accept `"?a=b"`, `"a=b"`, empty, `"?"`, `undefined`);
      `/staff` & `/staff/` → `/me`; `/staff/{rest}` → `/me/{rest}`; already-canonical
      `/me` or `/me/*` → identity (idempotence); any other path → `/me`; return
      `` `${ADMIN_ORIGIN}${rest}${query}` ``
    - Pure: no imports, no I/O, deterministic in `(path, search)`; add a breadcrumb comment
      recording the canonical `admin.theroyalglow.in/me/*` destination
    - _Requirements: 4.2, 4.3, 4.6, 4.7, 8.1_

  - [ ]* 6.2 Write property test: staff redirect preserves the deep-link sub-path
    - **Property 1: Staff redirect preserves the deep-link sub-path**
    - **Validates: Requirements 4.1, 4.2**
    - `apps/web/src/lib/staff-redirect.test.ts`; fast-check + Vitest, ≥100 iterations
    - Tag: `// Feature: admin-web-separation, Property 1: Staff redirect preserves the deep-link sub-path`
    - Generate non-empty sub-paths under `/staff/...`; assert result equals
      `https://admin.theroyalglow.in/me/{rest}`

  - [ ]* 6.3 Write property test: staff redirect preserves the query string verbatim
    - **Property 2: Staff redirect preserves the query string verbatim**
    - **Validates: Requirements 4.3**
    - `apps/web/src/lib/staff-redirect.test.ts`; fast-check + Vitest, ≥100 iterations
    - Tag: `// Feature: admin-web-separation, Property 2: Staff redirect preserves the query string verbatim`
    - Generate query strings with/without leading `?`; assert destination ends with the
      query exactly (after leading-`?` normalization), nothing added/dropped/re-encoded

  - [ ]* 6.4 Write property test: staff redirect is idempotent
    - **Property 3: Staff redirect is idempotent**
    - **Validates: Requirements 4.6**
    - `apps/web/src/lib/staff-redirect.test.ts`; fast-check + Vitest, ≥100 iterations
    - Tag: `// Feature: admin-web-separation, Property 3: Staff redirect is idempotent`
    - Assert re-mapping the resulting `/me/...` path yields the same destination URL

  - [ ]* 6.5 Write property test: staff redirect always targets the admin `/me` namespace
    - **Property 4: Staff redirect always targets the admin `/me` namespace**
    - **Validates: Requirements 4.1, 4.2, 4.7**
    - `apps/web/src/lib/staff-redirect.test.ts`; fast-check + Vitest, ≥100 iterations
    - Tag: `// Feature: admin-web-separation, Property 4: Staff redirect always targets the admin /me namespace`
    - For `/staff`, `/staff/`, and any `/staff/`-prefixed path: result origin is
      `https://admin.theroyalglow.in`, path begins with `/me`, never contains `/staff`

  - [ ] 6.6 Wire `mapStaffRedirect` into `apps/web/src/middleware.ts`
    - Import `mapStaffRedirect`; add a `/staff` branch (`pathname === '/staff' ||
      pathname.startsWith('/staff/')`) returning `NextResponse.redirect(..., 301)`,
      placed immediately after the existing `/admin` branch and **before** any session check
    - Add `'/staff'` to the matcher (the existing `'/staff/:path*'` stays); add a breadcrumb
      comment at the branch noting the canonical `admin.theroyalglow.in/me/*` destination
    - Keep no RBAC/role logic in middleware beyond the two redirect branches
    - _Requirements: 4.1, 4.4, 4.5, 5.6_

  - [ ]* 6.7 Write redirect mapping example tests
    - `/staff` → `…/me`; `/staff/schedule` → `…/me/schedule`;
      `/staff/leave?from=email` → `…/me/leave?from=email`
    - _Requirements: 9.5_

  - [ ]* 6.8 Write middleware redirect ordering integration tests
    - `/staff/schedule` (authenticated AND unauthenticated) returns 301 →
      `https://admin.theroyalglow.in/me/schedule` before any session check; `/admin/*` still
      redirects via `mapAdminRedirect`; `/book` is never redirected
    - _Requirements: 4.1, 4.5, 6.4_

- [ ] 7. Clean up the Web staff surfaces
  - [ ] 7.1 Delete the relocated web staff pages and APIs
    - Delete `apps/web/src/app/staff/layout.tsx`, `apps/web/src/app/staff/schedule/page.tsx`,
      `apps/web/src/app/staff/leave/page.tsx`,
      `apps/web/src/app/staff/leave/staff-leave-panel.tsx`
    - Delete `apps/web/src/app/api/staff/schedule/route.ts`,
      `apps/web/src/app/api/staff/leave/route.ts`,
      `apps/web/src/app/api/staff/leave/[id]/route.ts`
    - Ensure the `apps/web/src/app/staff` and `apps/web/src/app/api/staff` directories are
      removed entirely (legacy redirect lives in middleware, not a page)
    - _Requirements: 1.6, 2.7, 5.4, 5.5, 8.2_

  - [ ] 7.2 Remove dead imports left by the deletion
    - Verify no remaining `apps/web/src` module imports a relocated staff module or a removed
      staff API path; remove any now-unused imports/helpers (e.g. staff-only `@/lib/format`
      consumers); keep `(landing)/book` + `LeadCaptureForm` untouched
    - _Requirements: 6.1, 6.2, 8.3, 9.3_

- [ ] 8. Static-invariant verification for Requirement 9
  - [ ]* 8.1 Write "no leftover staff dirs" static check
    - Vitest using `node:fs`: fail if `apps/web/src/app/staff` or
      `apps/web/src/app/api/staff` resolves (glob count === 0)
    - _Requirements: 9.4_

  - [ ]* 8.2 Write "no dead staff imports" static check
    - Static grep of `apps/web/src` for imports referencing relocated staff modules / removed
      staff API paths → assert zero matches
    - _Requirements: 9.3_

  - [ ]* 8.3 Write "kept surfaces present" + "no new migration" static checks
    - Assert `apps/web/src/app/(landing)/book` and
      `apps/web/src/components/lead/LeadCaptureForm.tsx` still exist; assert no new files under
      `packages/db/migrations/`
    - _Requirements: 6.1, 6.2, 9.7_

  - [ ] 8.4 Run workspace typecheck and lint, fix any introduced errors
    - `turbo run typecheck` and `turbo run lint` (Biome) report no errors introduced by this
      feature across `apps/web` and `apps/admin`
    - _Requirements: 9.1, 9.2_

- [ ] 9. Final checkpoint — full separation verified
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; the model must not
  implement `*` sub-tasks unless asked.
- This is a relocation: prefer **move + import-base change** over rewriting handlers/pages.
- Two invariants are carried over verbatim and must be preserved: 409-on-duplicate-date and
  uniform-404-on-withdraw.
- Property tests use fast-check + Vitest, run ≥100 iterations each, and are tagged
  `// Feature: admin-web-separation, Property {n}: {title}`.
- Each task references the specific requirements clause(s) it implements for traceability.
- No new database migration is introduced (Req 9.7).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "2.1", "6.1"] },
    { "id": 1, "tasks": ["1.4", "2.2", "2.3", "2.4", "2.5", "6.2", "6.3", "6.4", "6.5", "6.7"] },
    { "id": 2, "tasks": ["4.1", "4.2", "4.3", "6.6"] },
    { "id": 3, "tasks": ["4.4", "4.5", "6.8", "7.1"] },
    { "id": 4, "tasks": ["7.2"] },
    { "id": 5, "tasks": ["8.1", "8.2", "8.3"] },
    { "id": 6, "tasks": ["8.4"] }
  ]
}
```
