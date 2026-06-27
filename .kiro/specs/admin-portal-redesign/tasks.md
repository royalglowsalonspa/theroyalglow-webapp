# Implementation Plan: Admin Portal Redesign

## Overview

This plan converts the presentation-layer redesign of the Royal Glow admin
portal (`apps/admin`) into incremental, test-driven coding tasks, following the
design's seven-step migration/rollout order:

1. **Foundation** — `lucide-react` + pure `@/lib/admin` helpers and their
   property-based tests (fast-check, ≥100 runs each).
2. **Status & format** — token-based `StatusBadge` (with back-compat shim) and
   IST/24h formatter call-site swaps.
3. **Shell** — `AdminShell` / `AdminSidebar` / `TopBar` / `Breadcrumb` /
   `UserIdentity` redesign (responsive Radix-Dialog drawer, focus trap/return).
4. **Primitives** — `DataTable` (+ pure `data-table-model`), `FilterBar`,
   `SlideOverPanel`, state presenters, `KPICard`, `ChartCard`, `useAsyncData`,
   `useDebouncedCallback`.
5. **Dashboard** — rebuild `dashboard-overview` on the new primitives.
6. **Route-by-route adoption** — migrate every listed admin route, preserving
   all fields and actions.
7. **Gates** — static CI gates (no-literals, no-emoji, token-presence,
   path-allowlist, root-path) plus jest-axe and Lighthouse a11y = 100.

**Implementation language:** TypeScript (React, Next.js 16 App Router), per the
design. Every task is presentation-layer only — no data-model, API-contract,
RBAC, or business-logic changes — and confined to the directories permitted by
Requirement 16 (`apps/admin/app/`, `apps/admin/src/components/`,
`apps/admin/src/lib/`, and shared tokens in `@rgss/ui`). The 20 correctness
properties are each implemented by a single fast-check test (`{ numRuns: 100 }`
minimum), tagged `// Feature: admin-portal-redesign, Property {n}`.

## Tasks

- [x] 1. Foundation — dependency and pure `@/lib/admin` helpers + property tests
  - [x] 1.1 Add the `lucide-react` dependency
    - Add `lucide-react` to `apps/admin/package.json` dependencies and install
    - Verify it imports as tree-shakeable React components (`size`, `aria-hidden`, `className`)
    - _Requirements: 2.1_

  - [x] 1.2 Implement the nav-icon mapping helper
    - Create `apps/admin/src/lib/admin/nav-icons.ts` with `NAV_ICON_MAP` (Root-Path href → `LucideIcon`), `DEFAULT_NAV_ICON`, and `navIconFor(href)`
    - _Requirements: 2.1, 2.2, 2.6_

  - [x]* 1.3 Write property test for nav-icon resolution
    - **Property 1: Icon resolution is total with a single fallback**
    - fast-check ≥100 runs against `navIconFor`; assert total resolution, single fallback for unknown hrefs, all `ADMIN_NAV` hrefs resolve
    - **Validates: Requirements 2.1, 2.2, 2.6**

  - [x] 1.4 Implement the avatar initials helper
    - Create `apps/admin/src/lib/admin/initials.ts` deriving ≤2 uppercase initials from a display name with a safe placeholder for empty/whitespace input
    - _Requirements: 3.3_

  - [x]* 1.5 Write property test for avatar initials
    - **Property 2: Avatar initials are at most two uppercase letters**
    - fast-check ≥100 runs; include empty, whitespace-only, single-word, and unicode names
    - **Validates: Requirements 3.3**

  - [x] 1.6 Implement the sidebar active-item resolver helper
    - Add a pure `isActive` / active-resolver helper (longest matching route prefix) usable by `AdminSidebar`
    - _Requirements: 4.5, 4.6_

  - [x]* 1.7 Write property test for active navigation item
    - **Property 3: Exactly one active navigation item by longest prefix**
    - fast-check ≥100 runs; assert at most one active item, chosen by longest path-prefix, marked `aria-current="page"`
    - **Validates: Requirements 4.5, 4.6**

  - [x]* 1.8 Write property test for role-level nav filtering
    - **Property 4: Navigation filtering respects role level with no empty sections**
    - fast-check ≥100 runs against the reused `filterNavByLevel` from `@/lib/rbac` (consumed, not modified); assert `item.minLevel <= roleLevel` and no empty sections
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.7**

  - [x] 1.9 Implement the breadcrumb derivation helper
    - Create `apps/admin/src/lib/admin/breadcrumbs.ts` with `deriveBreadcrumbs(pathname, nav)` returning ordered `Crumb[]` (longest-prefix match + detail segment)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6_

  - [x]* 1.10 Write property test for breadcrumb derivation
    - **Property 5: Breadcrumb derivation is well-formed**
    - fast-check ≥100 runs; assert non-empty ordered list, exactly one current/non-interactive last crumb, links on the rest, single crumb for top-level routes
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.6**

  - [x] 1.11 Implement the status-badge pure mapping
    - Create `apps/admin/src/lib/admin/status-badge.ts` with `STATUS_VARIANT`, `variantForStatus(status)` (neutral fallback), and `labelForStatus(status)` (snake_case → Title Case, placeholder for empty)
    - _Requirements: 9.2, 9.3, 9.4_

  - [x]* 1.12 Write property test for status variant mapping
    - **Property 11: Status variant mapping with neutral fallback**
    - fast-check ≥100 runs; recognised values map to documented variant, all else `neutral`
    - **Validates: Requirements 9.2, 9.4**

  - [x]* 1.13 Write property test for status label formatting
    - **Property 12: Status label is Title-Cased and always non-empty**
    - fast-check ≥100 runs over arbitrary `snake_case` strings; assert no underscores, capitalised words, word count preserved, fixed placeholder for empty/null/undefined
    - **Validates: Requirements 9.1, 9.3, 9.4, 9.6**

  - [x] 1.14 Implement the IST / 24h presentation formatters
    - Create `apps/admin/src/lib/admin/format.ts` adding `formatDateTimeIST`, `formatTime24hIST`, and the `PLACEHOLDER` (`'—'`) constant; re-export existing `formatINRWithPaise` / `formatDateDDMMYYYY` for use (do not modify existing helpers)
    - _Requirements: 15.3, 15.4, 15.5_

  - [x]* 1.15 Write property test for INR formatting
    - **Property 16: INR formatting round-trips with Indian grouping**
    - fast-check ≥100 runs over paise in `[0, 99_999_999_999]`; assert `₹` prefix, two decimals, Indian grouping, digit round-trip
    - **Validates: Requirements 15.1, 10.6**

  - [x]* 1.16 Write property test for date formatting
    - **Property 17: Date formatting is DD/MM/YYYY and round-trips**
    - fast-check ≥100 runs over valid dates incl. leap years; assert zero-padded `DD/MM/YYYY` and component round-trip
    - **Validates: Requirements 15.2**

  - [x]* 1.17 Write property test for UTC→IST conversion
    - **Property 18: UTC→IST conversion uses a constant +05:30 offset**
    - fast-check ≥100 runs over UTC instants; assert exact +330-minute shift, constant across the year (no DST)
    - **Validates: Requirements 15.3**

  - [x]* 1.18 Write property test for 24-hour IST time formatting
    - **Property 19: Time formatting is 24-hour HH:MM in IST**
    - fast-check ≥100 runs incl. midnight/near-midnight IST boundaries; assert zero-padded `HH:MM` equal to +330-minute shift
    - **Validates: Requirements 15.5**

  - [x]* 1.19 Write property test for invalid formatter input
    - **Property 20: Formatters reject invalid input with a fixed placeholder**
    - fast-check ≥100 runs over null/undefined/NaN/invalid input across currency, date, and time formatters; assert `'—'` and never a partial/raw value
    - **Validates: Requirements 15.4**

- [x] 2. Checkpoint — Ensure all foundation tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Status & format migration
  - [x] 3.1 Build the token-based StatusBadge and back-compat shim
    - Create `apps/admin/src/components/ui/status-badge.tsx` rendering a pill (dot `aria-hidden` + text label) using semantic Brand-Token classes per the variant→token table; add `apps/admin/src/components/admin/StatusBadge.tsx` as a thin re-export shim so existing import paths keep working
    - _Requirements: 9.1, 9.2, 9.5, 9.6_

  - [x]* 3.2 Write property test for status-badge contrast
    - **Property 13: Every status-badge variant meets AA contrast**
    - fast-check over all `BadgeVariant`s; compute WCAG contrast from Brand-Token hex composited over canvas; assert ≥4.5:1
    - **Validates: Requirements 9.5**

  - [x] 3.3 Swap formatting call-sites to the IST/24h helpers
    - Update presentation call-sites that display date-time / time-of-day to use `formatDateTimeIST` / `formatTime24hIST`; no business-logic or API changes
    - _Requirements: 15.3, 15.5_

  - [x]* 3.4 Write component test for StatusBadge rendering
    - Vitest + RTL: assert text label is the accessible content and colour is never the sole signal; jest-axe zero violations
    - _Requirements: 9.1, 9.6_

- [x] 4. App Shell redesign
  - [x] 4.1 Build the Icon wrapper component
    - Create `apps/admin/src/components/ui/icon.tsx` enforcing a11y rules: `decorative` → `aria-hidden="true"`; otherwise `role="img"` + required `aria-label`
    - _Requirements: 2.4, 2.5_

  - [x] 4.2 Redesign AdminSidebar with lucide icons and sectioned nav
    - Update `apps/admin/src/components/layout/admin-sidebar.tsx`: render `filterNavByLevel(ADMIN_NAV, roleLevel)` sectioned groups, `navIconFor(item.href)` icons (replacing emoji), active item via the resolver with `aria-current="page"`, logo + "Admin" label; unresolved role → level 0
    - _Requirements: 2.3, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [x] 4.3 Build the Breadcrumb component
    - Create `apps/admin/src/components/layout/breadcrumb.tsx` (server) rendering `deriveBreadcrumbs` output inside `<nav aria-label="Breadcrumb">`, links on ancestors, non-interactive current crumb
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 4.4 Build the UserIdentity component
    - Create `apps/admin/src/components/layout/user-identity.tsx`: avatar (≤2 initials), display name + role label; name hidden < 1024px with avatar kept operable at ≥44×44px
    - _Requirements: 3.3, 14.2, 14.4, 14.5_

  - [x] 4.5 Extract the TopBar component
    - Create `apps/admin/src/components/layout/top-bar.tsx` containing the sidebar toggle, `Breadcrumb`, existing `NotificationBell` (unchanged), and `UserIdentity`
    - _Requirements: 3.2_

  - [x] 4.6 Redesign AdminShell with responsive overlay drawer
    - Update `apps/admin/src/components/layout/admin-shell.tsx`: render Sidebar + TopBar + content on every page; ≥1024px persistent rail; < 1024px Radix-Dialog overlay drawer with backdrop, focus moved into drawer, focus trapped, close on toggle/backdrop/Esc/nav-item, focus returned to toggle on close
    - _Requirements: 3.1, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 17.1_

  - [x]* 4.7 Write component tests for shell composition and drawer focus
    - Vitest + RTL: assert shell composition (3.1/3.2) and overlay drawer open/close/focus-trap/focus-return behaviour
    - _Requirements: 3.1, 3.2, 3.6, 3.7, 3.8, 3.9_

  - [x]* 4.8 Write a11y tests for breadcrumb landmark and icons
    - Vitest + RTL + jest-axe: breadcrumb landmark + ancestor link navigation; decorative vs labelled icon a11y
    - _Requirements: 2.4, 2.5, 5.5, 5.7_

- [x] 5. Checkpoint — Ensure all shell and status tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Reusable primitives
  - [x] 6.1 Implement the pure data-table model
    - Create `apps/admin/src/components/ui/data-table-model.ts` with pure pagination (index/slice + control-state), single-column sort comparator, and column-visibility reducer (last-visible-column guard)
    - _Requirements: 6.3, 6.8, 6.9, 6.11, 6.12, 6.13, 7.4, 7.5_

  - [x]* 6.2 Write property test for column-visibility invariant
    - **Property 6: Column-visibility invariant — never empty, preserved across ops**
    - fast-check ≥100 runs over toggle/sort/filter/paginate sequences; assert never empty and preserved across operations
    - **Validates: Requirements 7.4, 7.5**

  - [x]* 6.3 Write property test for pagination bounds and slice
    - **Property 7: Pagination stays in bounds with correct slice and control state**
    - fast-check ≥100 runs over total counts, page sizes {10,25,50,100}, prev/next sequences; assert in-bounds index, correct slice, prev/next disabled states
    - **Validates: Requirements 6.8, 6.9, 6.11, 6.12, 6.13**

  - [x]* 6.4 Write property test for sorting
    - **Property 8: Sorting orders by the active column and toggles direction**
    - fast-check ≥100 runs; assert monotonic order, second activation reverses, single active sort column
    - **Validates: Requirements 6.3**

  - [x] 6.5 Build the DataTable component
    - Create `apps/admin/src/components/ui/data-table.tsx` (client) on `@tanstack/react-table` (core/sorted/filtered/paginated/expanded models): sortable header buttons with indicators, row hover, kebab row actions, optional selection + select-all, expandable sub-rows, pagination footer (rows-per-page 10/25/50/100 default 25, prev/next, "Page X of Y"), lifted column-visibility, `overflow-x-auto` responsive region, `<th scope>` + `sr-only` caption a11y
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 6.13, 7.2, 7.3, 7.5, 14.1_

  - [x]* 6.6 Write component tests for DataTable
    - Vitest + RTL + jest-axe: row actions, selection, expansion render; header/cell associations; keyboard operability
    - _Requirements: 6.5, 6.6, 6.7, 6.10_

  - [x] 6.7 Implement the useDebouncedCallback hook
    - Create `apps/admin/src/components/ui/use-debounced-callback.ts` (300 ms debounce)
    - _Requirements: 8.2_

  - [x] 6.8 Build the FilterBar component
    - Create `apps/admin/src/components/ui/filter-bar.tsx` (client): renders only configured controls (search `maxLength=100` + 300 ms debounced trimmed emit, dropdowns, tabs, column-visibility dropdown excluding select/expand/action columns, last-visible-off guard + hint); every control programmatically labelled
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x]* 6.9 Write property test for FilterBar control rendering
    - **Property 9: FilterBar renders exactly the configured controls**
    - fast-check ≥100 runs over config subsets of {search, dropdowns, tabs, column-visibility}
    - **Validates: Requirements 8.1**

  - [x]* 6.10 Write property test for search-term trimming
    - **Property 10: Search term is emitted trimmed**
    - fast-check ≥100 runs; emitted value equals `input.trim()`
    - **Validates: Requirements 8.2**

  - [x]* 6.11 Write component tests for FilterBar interactions
    - Vitest + RTL (fake timers): search maxLength + debounce timing, dropdown/tab/column emit, column-visibility add/remove within budget
    - _Requirements: 7.2, 7.3, 8.3, 8.4, 8.5, 8.6_

  - [x] 6.12 Build the state presenters and skeleton row-count helper
    - Create `apps/admin/src/components/ui/state/{skeleton,empty-state,error-state}.tsx`: skeleton matches content footprint with `min(n,10)` rows + `aria-live="polite"`/`aria-busy`; empty-state message; error-state message + retry with `role="alert"`
    - _Requirements: 12.1, 12.2, 12.3, 12.7, 12.8_

  - [x]* 6.13 Write property test for skeleton row count
    - **Property 14: Skeleton row count is bounded**
    - fast-check ≥100 runs over `n ≥ 0`; assert exactly `min(n, 10)` rows
    - **Validates: Requirements 12.1**

  - [x] 6.14 Implement the useAsyncData hook
    - Create `apps/admin/src/components/ui/use-async-data.ts`: loading/success/error states, configurable timeout (30 s default, 10 s dashboard), retry that transitions error→loading and re-requests; fetch orchestration only, no business logic
    - _Requirements: 10.8, 12.4, 12.5, 12.6_

  - [x]* 6.15 Write property test for async timeout outcome
    - **Property 15: Async timeout outcome is deterministic**
    - fast-check ≥100 runs (timer-driven model) over resolve delay vs timeout; success iff resolved strictly before deadline, else error with retry
    - **Validates: Requirements 12.6, 10.8**

  - [x] 6.16 Build the SlideOverPanel component
    - Create `apps/admin/src/components/ui/slide-over-panel.tsx` (client) on `@radix-ui/react-dialog`: right-edge content over backdrop, 300 ms transition gated by `motion-reduce`, Radix focus trap / focus return / Esc / backdrop close / scroll lock, labelled `Dialog.Title`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_

  - [x]* 6.17 Write component tests for SlideOverPanel and state presenters
    - Vitest + RTL + jest-axe: dialog semantics/focus/scroll-lock/reduced-motion; empty/error render + retry; live regions
    - _Requirements: 11.1, 11.4, 11.5, 11.6, 11.7, 11.8, 12.2, 12.3, 12.4, 12.5, 12.7, 12.8_

  - [x] 6.18 Build the KPICard and ChartCard components
    - Create `apps/admin/src/components/ui/kpi-card.tsx` (label + pre-formatted value via `formatINRWithPaise`, optional icon, loading skeleton) and `apps/admin/src/components/ui/chart-card.tsx` (recharts `ResponsiveContainer`, brand-token colours, loading skeleton)
    - _Requirements: 10.1, 10.2, 10.6_

  - [x]* 6.19 Write component tests for KPICard and ChartCard
    - Vitest + RTL: value/label render, INR formatting, loading skeleton state
    - _Requirements: 10.1, 10.2, 10.6_

- [x] 7. Checkpoint — Ensure all primitive tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Dashboard rebuild
  - [x] 8.1 Rebuild dashboard-overview on the new primitives
    - Update `apps/admin/src/components/admin/dashboard-overview.tsx` (or equivalent): ≥4 `KPICard`s, ≥1 `ChartCard` (recharts bar), recent-activity `DataTable`; `useAsyncData(..., { timeoutMs: 10_000 })` driving skeleton/error/empty/timeout + retry; monetary KPIs via `formatINRWithPaise`; replace emoji KPI icons with lucide icons
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

  - [x]* 8.2 Write component tests for the dashboard
    - Vitest + RTL (fake timers) + jest-axe: composition, loading/empty/error states, 10 s timeout, retry
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.7, 10.8_

- [x] 9. Route-by-route adoption (preserve every field and action)
  - [x] 9.1 Migrate /bookings and /waitlist
    - Render lists via `DataTable`, controls via `FilterBar`, statuses via `StatusBadge`, loading/empty/error via state presenters; adopt `SlideOverPanel` for `[id]` detail where it improves flow; preserve all pre-redesign fields and actions
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7_

  - [x] 9.2 Migrate /customers and /leads
    - Same primitive adoption + SlideOverPanel detail; preserve all fields/actions (incl. lead pipeline actions)
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7_

  - [x] 9.3 Migrate /staff, /schedule, /leave, /me/schedule, /me/leave
    - Same primitive adoption; preserve all fields/actions
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7_

  - [x] 9.4 Migrate /services, /offers, /memberships
    - Same primitive adoption + SlideOverPanel detail; preserve all fields/actions
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7_

  - [x] 9.5 Migrate /billing and /reports
    - Same primitive adoption; INR/date/time via formatters; preserve all fields/actions
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7_

  - [x] 9.6 Migrate /settings, /branches, /users
    - Same primitive adoption; preserve all fields/actions
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7_

  - [x] 9.7 Migrate /integrations and /logs
    - Same primitive adoption; preserve all fields/actions
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7_

  - [x]* 9.8 Write route-consistency smoke tests
    - Extend `migrated-routes.smoke.test.tsx`: every authenticated route renders within `AdminShell` and uses primitives where applicable; pre-redesign fields/actions preserved
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7_

- [x] 10. Checkpoint — Ensure all route migrations and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Static and accessibility CI gates
  - [x] 11.1 Add the no-brand-literals gate
    - Lint/grep gate asserting zero hex/rgb/px colour, font, radius, or shadow literals in `apps/admin` component source
    - _Requirements: 1.1, 1.2_

  - [x] 11.2 Add the no-emoji-icons gate
    - Grep gate over App_Shell / Sidebar / Dashboard source asserting no Unicode emoji glyph rendered as an icon
    - _Requirements: 2.3_

  - [x] 11.3 Add the build-time token-presence check
    - Build-time assertion that every required Brand-Token name resolves in the theme; a missing token fails the build with the missing token name and no fallback
    - _Requirements: 1.7_

  - [x] 11.4 Add the path-allowlist CI gate
    - CI gate rejecting diffs that touch `packages/db/schema`, `packages/db/migrations`, API contracts, `@/lib/rbac`, or the drift fingerprint reference
    - _Requirements: 16.1, 16.2, 16.3, 16.6, 16.7, 16.8_

  - [x] 11.5 Add the Root-Path assertion
    - Assert every `ADMIN_NAV` href omits the `/admin` prefix
    - _Requirements: 4.9_

  - [x]* 11.6 Add jest-axe assertions across primitives and routes
    - jest-axe zero-violations assertion on every primitive and every redesigned route
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 11.7 Wire the Lighthouse a11y = 100 gate per route
    - Configure `.github/lighthouse` so each redesigned route is audited; a score < 100 fails the gate and blocks merge, identifying the failing route
    - _Requirements: 13.7, 13.8_

  - [x]* 11.8 Add Playwright responsive tests
    - No horizontal page overflow 375→1920px; table-only horizontal scroll 375–1023px; user-name hide/show by breakpoint; sidebar persistent/overlay by breakpoint
    - _Requirements: 3.4, 3.5, 14.1, 14.2, 14.3, 14.4_

- [x] 12. Final checkpoint — Ensure all tests and gates pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests/gates that can be skipped for a
  faster MVP) and are not implemented by the executing agent unless requested;
  core implementation tasks are never optional.
- Each task references specific requirement clauses (and property numbers) for
  traceability.
- Property-based tests use fast-check at `{ numRuns: 100 }` minimum and target
  the pure helpers / pure models; example and component tests use Vitest + RTL +
  jest-axe; responsive and a11y-score gates use Playwright + Lighthouse CI.
- Every task is presentation-layer only and confined to the Req 16 permitted
  directories (`apps/admin/app/`, `apps/admin/src/components/`,
  `apps/admin/src/lib/`, shared `@rgss/ui` tokens). CI-gate tooling lives in the
  repo's gate/CI scripts and changes no data model, API contract, RBAC, or
  business logic.
- Checkpoints provide incremental validation at each migration-order boundary.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.4", "1.6", "1.9", "1.11", "1.14", "6.1", "6.7", "6.14"] },
    { "id": 1, "tasks": ["1.2", "1.5", "1.7", "1.8", "1.10", "1.12", "1.13", "1.15", "1.16", "1.17", "1.18", "1.19", "6.2", "6.3", "6.4", "6.15"] },
    { "id": 2, "tasks": ["1.3", "3.1", "3.3", "4.1"] },
    { "id": 3, "tasks": ["3.2", "3.4", "4.2", "4.3", "4.4", "6.5", "6.8", "6.12", "6.16"] },
    { "id": 4, "tasks": ["4.5", "6.6", "6.9", "6.10", "6.11", "6.13", "6.17", "6.18"] },
    { "id": 5, "tasks": ["4.6", "6.19"] },
    { "id": 6, "tasks": ["4.7", "4.8", "8.1"] },
    { "id": 7, "tasks": ["8.2", "9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "9.7"] },
    { "id": 8, "tasks": ["9.8", "11.1", "11.2", "11.3", "11.4", "11.5", "11.6", "11.7", "11.8"] }
  ]
}
```
