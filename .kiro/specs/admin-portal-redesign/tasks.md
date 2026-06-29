# Implementation Plan: Admin Portal Redesign

## Overview

This plan converts the presentation-layer redesign of the Royal Glow admin
portal (`apps/admin`, served at `admin.theroyalglow.in`) into incremental,
test-driven coding tasks, following the design's **six-step Migration & Rollout
order**:

1. **shadcn + motion + theme mapping** — install the canonical shadcn/ui
   component set as owned source via the CLI; add `motion` and the required
   Radix packages as pinned dependencies; map the shadcn theme variables onto
   the Royal Glow Brand Tokens; create the motion layer; enable the initial
   static gates (no-literals, theme-mapping presence, owned-source/no-runtime-dep,
   token-presence).
2. **Composite primitives onto shadcn** — refactor the existing hand-rolled
   primitives (`status-badge`, `icon`, `data-table`, `filter-bar`, `kpi-card`,
   `chart-card`, `state/skeleton`) to *compose* shadcn/Radix components while
   keeping their **pure logic untouched**; add `detail-sheet` (shadcn Sheet) +
   the `slide-over-panel` re-export shim. **Re-run the preserved property tests
   as the verification gate — they must pass unchanged** (Req 2.4).
3. **Shell, command palette, toasts** — refactor `admin-shell` /
   `admin-sidebar` / `top-bar` / `breadcrumb` / `user-identity` onto the shadcn
   Sidebar block + Breadcrumb; add the Command palette (shadcn Command) + the
   new `commandItemsForLevel` helper; mount the Sonner toaster; replace emoji
   icons.
4. **Dashboard** — rebuild `dashboard-overview` on KPICard / ChartCard /
   DataTable + `useAsyncData`.
5. **Route-by-route adoption** — migrate every authenticated route enumerated in
   Req 22.1 to the App Shell + primitives, preserving every field and action.
6. **Static + a11y gates** — enable the no-emoji, path-allowlist, and Root-Path
   gates plus jest-axe, Lighthouse a11y = 100 per route, and Playwright
   responsive checks before merge.

**Implementation language:** TypeScript (React, Next.js 16 App Router), built
with **Bun**, per the design. Every task is **presentation-layer only** — no
data-model, API-contract, RBAC, or business-logic changes — and confined to the
Requirement 21 permitted paths (`apps/admin/app/`, `apps/admin/src/app/`,
`apps/admin/src/components/`, `apps/admin/src/lib/`, `apps/admin/src/styles/`,
`apps/admin/components.json`, the dependency list in `apps/admin/package.json`,
and shared Brand Tokens in `@rgss/ui`). The CI `Drift_Gate` and the committed
schema fingerprint reference are left untouched (Req 21.8).

The 21 correctness properties are each implemented by a **single** fast-check
test (`{ numRuns: 100 }` minimum), tagged
`// Feature: admin-portal-redesign, Property {n}`. **Critical preservation
constraint (Req 2.4 / design Key Decision 2):** the existing pure-logic and
property tests survive the refactor unchanged — they are **re-run as a
verification gate**, never rewritten. Only **Property 6** (the new
`commandItemsForLevel` selector) introduces a newly authored property test.

## Tasks

- [x] 1. Foundation — shadcn owned source, motion + Radix deps, theme mapping, motion layer
  - [x] 1.1 Install the shadcn/ui component set as owned source via the CLI
    - Run `bunx shadcn@latest add button input select checkbox table tabs dropdown-menu dialog sheet tooltip badge card skeleton popover command separator avatar scroll-area sidebar breadcrumb sonner` so each lands as editable source under `apps/admin/src/components/ui/` (style `new-york`, `rsc: true`, `tsx`, alias `@/components/ui`, `iconLibrary: lucide`)
    - Confirm `apps/admin/package.json` declares **zero runtime shadcn package dependency** (components are owned source)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 1.2 Add `motion` and the required Radix packages as pinned dependencies
    - Add `motion` (motion.dev) plus the Radix packages pulled by the installed components (`@radix-ui/react-select`, `@radix-ui/react-checkbox`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip`, `@radix-ui/react-popover`, `@radix-ui/react-separator`, `@radix-ui/react-avatar`, `@radix-ui/react-scroll-area`, `@radix-ui/react-slot`, plus `cmdk` and `sonner`) as **exact-version-pinned** deps of `apps/admin`; `@radix-ui/react-dialog` and `@radix-ui/react-dropdown-menu` are already present
    - _Requirements: 2.5_

  - [x] 1.3 Create the shadcn theme-variable → Brand Token mapping
    - Create `apps/admin/src/styles/shadcn-theme.css` redefining every shadcn theme variable (`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`, `--chart-1…--chart-5`) to resolve to a named Brand Token, and import it from `globals.css` after `@rgss/ui/theme.css`; map headings→`--font-display`, body→`--font-sans`, UI labels→`--font-ui`; card surfaces→6px `--radius-cards`, button surfaces→8px `--radius-buttons`; define no brand literals in `apps/admin`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 1.4 Build the motion layer
    - Create `apps/admin/src/components/ui/motion/motion-variants.ts` (bounded named variants: `overlaySlideRight`, `overlayFade`, `routeTransition`, `listRow` ≤300ms; `emphasisPop` 200–600ms animating ≥2 properties; `DURATION.micro` 0.15s), `use-reduced-motion.ts` (`usePrefersReducedMotion()`), and `motion-presence.tsx` (`RouteTransition`, `ListPresence` via `AnimatePresence`) that render the final visual state directly under reduced motion
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.3, 4.4, 4.5, 4.6_

  - [x]* 1.5 Add the initial static gates (foundation)
    - no-brand-literals gate (zero hex/rgb/px colour/font/radius/shadow literals in `apps/admin` component source); shadcn theme-mapping presence gate (every shadcn theme variable remapped to a Brand Token); owned-source / no-runtime-shadcn-dep gate + `motion`/Radix pinned-version assertion; build-time token-presence check that fails with the missing token name and substitutes no fallback
    - _Requirements: 1.1, 1.2, 1.3, 1.7, 2.3, 2.5_

- [x] 2. Checkpoint — Ensure all foundation checks pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Refactor composite primitives onto shadcn (preserve pure logic)
  - [x] 3.1 Refactor StatusBadge onto the shadcn Badge
    - Rewrite `apps/admin/src/components/ui/status-badge.tsx` to compose the shadcn `Badge`, mapping each variant to the semantic Brand-Token classes (success/warning/error/neutral per the design table); keep `apps/admin/src/lib/admin/status-badge.ts` (`variantForStatus`, `labelForStatus`) **unchanged**; keep the `@/components/admin/StatusBadge` re-export shim; text label always present so colour is never the sole signal
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.6_

  - [x] 3.2 Refactor the Icon wrapper for shadcn reuse
    - Update `apps/admin/src/components/ui/icon.tsx` so it is reused inside shadcn components wherever an icon appears: `decorative` → `aria-hidden="true"`; icon-only control → required non-empty `aria-label`; keep `@/lib/admin/nav-icons.ts` (`NAV_ICON_MAP`, `DEFAULT_NAV_ICON`, `navIconFor`) **unchanged**
    - _Requirements: 5.1, 5.4, 5.5_

  - [x] 3.3 Refactor DataTable onto shadcn Table + TanStack
    - Rewrite `apps/admin/src/components/ui/data-table.tsx` (client) to compose the shadcn `Table`/`Checkbox`/`DropdownMenu`/`Select`/`Button` driven by `@tanstack/react-table` (core/sorted/filtered/paginated/expanded models): single-column sort with chevron indicator, row hover, kebab row actions, optional selection + select-all, expandable sub-rows, pagination footer (rows-per-page 10/25/50/100 default 25, prev/next, "Page X of Y"), lifted column-visibility, `AnimatePresence` row enter/exit ≤300ms, `ScrollArea`/`overflow-x-auto` region, `<caption class="sr-only">` + `<th scope>` a11y; keep `data-table-model.ts` (pagination/sort/column-visibility) **unchanged**
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12, 10.13, 11.2, 11.3, 11.5, 19.1_

  - [x] 3.4 Refactor FilterBar onto shadcn Input/Select/Tabs/DropdownMenu
    - Rewrite `apps/admin/src/components/ui/filter-bar.tsx` (client) to compose the shadcn `Input` (search, `maxLength={100}`), `Select` (dropdowns), `Tabs` (tabbed filters), and `DropdownMenu` (column-visibility checklist excluding selection/expand/action columns, last-visible-off guard via the data-table model); renders only configured controls, emits the trimmed search term after 300ms via `useDebouncedCallback`, every control programmatically labelled; keep `use-debounced-callback.ts` **unchanged**
    - _Requirements: 11.1, 11.4, 11.6, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [x] 3.5 Refactor KPICard and ChartCard onto the shadcn Card
    - Rewrite `apps/admin/src/components/ui/kpi-card.tsx` (label + pre-formatted value via `formatINRWithPaise`, optional lucide icon, loading skeleton) and `chart-card.tsx` (recharts `ResponsiveContainer` with brand-token `--chart-*` series colours, loading skeleton) to compose the shadcn `Card`
    - _Requirements: 14.1, 14.2, 14.6_

  - [x] 3.6 Refactor the state presenters onto the shadcn Skeleton
    - Rewrite `apps/admin/src/components/ui/state/skeleton.tsx` to compose the shadcn `Skeleton` (1 row per record, max 10, `aria-live="polite"` + `aria-busy`); keep `empty-state.tsx` (message) and `error-state.tsx` (message + retry, `role="alert"`) composing shadcn surfaces with `emphasisPop` reveal; keep the skeleton row-count helper and `use-async-data.ts` (loading/success/error + timeout/retry, 30s default / 10s dashboard) **unchanged**
    - _Requirements: 14.4, 14.5, 14.7, 14.8, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8_

  - [x] 3.7 Add the DetailSheet (shadcn Sheet) and slide-over-panel shim
    - Create `apps/admin/src/components/ui/detail-sheet.tsx` (client) composing the shadcn `Sheet` (`side="right"`): slides in over a dimming backdrop within a 300ms `motion` transition, Radix-Dialog focus trap / focus return / Esc + backdrop close / scroll lock / `role="dialog"` + `aria-modal`, labelled `SheetTitle`, reduced-motion suppresses the slide; replace `slide-over-panel.tsx` with a thin re-export → `DetailSheet` so existing import sites keep working
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8_

  - [x]* 3.8 Re-run the preserved primitive property tests (verification gate, Req 2.4)
    - Run the existing tests **unchanged** and assert they still pass after the refactor: `data-table-model.test.ts`, `filter-bar-render.property.test.ts`, `filter-bar-search.property.test.ts`, `status-badge-contrast.property.test.ts`, `use-async-data.property.test.ts`, and `state/skeleton.property.test.ts`
    - **Validates (preserved): Property 7 (Req 11.4, 11.5), Property 8 (Req 10.8, 10.9, 10.11, 10.12, 10.13), Property 9 (Req 10.3), Property 10 (Req 12.1), Property 11 (Req 12.2), Property 12 (Req 13.2, 13.4), Property 13 (Req 13.3, 13.4, 13.6), Property 14 (Req 13.5), Property 15 (Req 17.1), Property 16 (Req 17.6, 14.8)**

  - [x]* 3.9 Write component / a11y tests for the refactored primitives
    - Vitest + RTL + jest-axe (`primitives.a11y.test.tsx`): keyboard operability + visible focus + name/role/state across the shadcn-composed primitives; DataTable sort indicator / hover / row actions / selection / expansion / header-cell association; FilterBar maxLength + dropdown/tab/column emit; DetailSheet dialog semantics / focus / scroll-lock / reduced-motion; StatusBadge text-label render
    - _Requirements: 2.7, 10.4, 10.5, 10.6, 10.7, 10.10, 11.1, 11.2, 11.3, 11.6, 12.3, 12.4, 12.5, 12.6, 12.7, 13.1, 15.1, 15.4, 15.5, 15.6, 15.7, 15.8_

- [x] 4. Checkpoint — Ensure preserved property tests pass unchanged and primitives are sound
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. App Shell, Command palette, and Toasts onto shadcn
  - [x] 5.1 Implement the `commandItemsForLevel` pure helper
    - Create `apps/admin/src/lib/admin/command-items.ts` exporting `commandItemsForLevel(nav, roleLevel)` that flattens `filterNavByLevel(ADMIN_NAV, roleLevel)` into `CommandNavItem[]` (`{ label, href }`); unresolved/unknown/absent role → level 0; pure, no new filtering rule (delegates to the existing `filterNavByLevel`)
    - _Requirements: 9.4, 9.5_

  - [x]* 5.2 Write the property test for `commandItemsForLevel` (NEW)
    - **Property 6: Command-palette items respect role level**
    - fast-check `{ numRuns: 100 }` over arbitrary role levels; assert every returned item's minimum required level ≤ roleLevel and unresolved role is treated as level 0
    - **Validates: Requirements 9.4, 9.5**

  - [x] 5.3 Refactor AdminSidebar onto the shadcn Sidebar sub-components
    - Rewrite `apps/admin/src/components/layout/admin-sidebar.tsx` (client) to compose `SidebarGroup`/`SidebarGroupLabel`/`SidebarMenu`/`SidebarMenuItem`/`SidebarMenuButton` + `ScrollArea`: titled sections from `filterNavByLevel(ADMIN_NAV, roleLevel)`, empty sections omitted, `navIconFor(item.href)` lucide icons **replacing every emoji**, active item via the `active-nav` resolver with `aria-current="page"`, Royal Glow logo + "Admin" label, unresolved role → level 0, Root-Path hrefs preserved (no `/admin` prefix); keep `filterNavByLevel`, `active-nav`, and `nav-icons` helpers **unchanged**
    - _Requirements: 5.3, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_

  - [x] 5.4 Refactor Breadcrumb onto the shadcn Breadcrumb
    - Rewrite `apps/admin/src/components/layout/breadcrumb.tsx` (server) to compose the shadcn `Breadcrumb` (`BreadcrumbList`/`BreadcrumbItem`/`BreadcrumbLink`/`BreadcrumbPage`/`BreadcrumbSeparator`) rendering `deriveBreadcrumbs(pathname, ADMIN_NAV)` inside the `<nav aria-label>` landmark, links on ancestors, non-interactive current crumb with `aria-current="page"`; keep `breadcrumbs.ts` **unchanged**
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 5.5 Refactor UserIdentity onto shadcn Avatar + DropdownMenu
    - Rewrite `apps/admin/src/components/layout/user-identity.tsx` to compose the shadcn `Avatar` (≤2 initials via `@/lib/admin/initials`) + `DropdownMenu`: ≥1024px shows avatar + name + role label; <1024px hides the name text while keeping the avatar operable at ≥44×44px; keep `initials.ts` **unchanged**
    - _Requirements: 6.3, 19.2, 19.4, 19.5_

  - [x] 5.6 Refactor the TopBar
    - Rewrite `apps/admin/src/components/layout/top-bar.tsx` to contain the shadcn `SidebarTrigger`, the `Breadcrumb`, the Command-palette trigger, the existing `NotificationBell` (unchanged), and `UserIdentity`
    - _Requirements: 6.2_

  - [x] 5.7 Build the Command palette
    - Create `apps/admin/src/components/layout/command-palette.tsx` (client) composing the shadcn `Command` (`CommandDialog`/`CommandInput`/`CommandList`/`CommandGroup`/`CommandItem`/`CommandEmpty`): global Ctrl/Cmd+K (or Top Bar trigger) opens it and moves focus to the input within 200ms, case-insensitive label-substring filter within 200ms, lists `commandItemsForLevel` for the role (unresolved → level 0), `CommandEmpty` on no match, selecting a destination routes + closes, Esc/selection closes and returns focus, focus confined while open, `overlayFade` ≤300ms
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_

  - [x] 5.8 Mount the Sonner toaster and toast helpers
    - Create `apps/admin/src/components/ui/toaster.tsx` (shadcn `Sonner` `Toaster`, mounted once in the shell) and `apps/admin/src/lib/admin/toast.ts` (`toast.success`/`toast.error` wrappers): success names the action + auto-dismisses after 5s with a keyboard-operable dismiss (polite live region); error names the action + reason + persists until dismissed (assertive live region); reduced motion suppresses entrance/exit; a task-blocking failure also surfaces a persistent in-page inline alert so the toast is not the sole channel
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9_

  - [x] 5.9 Refactor AdminShell onto the shadcn Sidebar block
    - Rewrite `apps/admin/src/components/layout/admin-shell.tsx` (client) to compose `SidebarProvider`/`Sidebar`/`SidebarTrigger`/`SidebarInset` + `Separator` + `TopBar` + Command palette + Sonner `Toaster`: renders Sidebar + Top Bar + content on every route; ≥1024px persistent rail; <1024px Sheet-based overlay drawer with dimming backdrop, focus moved into the drawer, focus trapped, close on trigger/backdrop/Esc/nav-item, focus returned to the trigger on close; wraps `SidebarInset` content in `RouteTransition` ≤300ms
    - _Requirements: 6.1, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 22.1_

  - [x]* 5.10 Re-run the preserved shell-helper property tests (verification gate, Req 2.4)
    - Run the existing `@/lib/admin` tests **unchanged** and assert they still pass: `nav-icons`, `initials`, `active-nav`, `breadcrumbs`, and the `nav-filter` (`filterNavByLevel`) tests
    - **Validates (preserved): Property 1 (Req 5.2, 5.6), Property 2 (Req 6.3), Property 3 (Req 7.5, 7.6), Property 4 (Req 7.2, 7.3, 7.4, 7.7), Property 5 (Req 8.1, 8.2, 8.3, 8.4, 8.6)**

  - [x]* 5.11 Write component / a11y tests for the shell, command palette, and breadcrumb
    - Vitest + RTL + jest-axe: shell composition (6.1/6.2) and overlay drawer open/close/focus-trap/focus-return (6.6–6.9); breadcrumb landmark + ancestor link navigation (8.5/8.7); command-palette open on ⌘K/Ctrl+K + focus + substring filter + no-results + select-navigates-closes + focus-confine + Esc-return (9.2/9.3/9.6/9.7/9.8/9.9); Sonner success/error live regions + auto-dismiss/persist + reduced-motion + in-page fallback (16.4/16.5/16.6/16.7/16.8/16.9)
    - _Requirements: 6.1, 6.2, 6.6, 6.7, 6.8, 6.9, 8.5, 8.7, 9.2, 9.3, 9.6, 9.7, 9.8, 9.9, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9_

- [x] 6. Checkpoint — Ensure shell, command palette, and toast tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Dashboard rebuild
  - [x] 7.1 Rebuild dashboard-overview on the new primitives
    - Update `apps/admin/src/components/admin/dashboard-overview.tsx` (or equivalent): ≥4 `KPICard`s, ≥1 `ChartCard` (recharts) with brand-token series colours, recent-activity `DataTable` beneath; `useAsyncData(..., { timeoutMs: 10_000 })` driving skeleton/empty/error + 10s-timeout retry; monetary KPIs via `formatINRWithPaise`; lucide KPI icons replacing emoji
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8_

  - [x]* 7.2 Write component tests for the dashboard
    - Vitest + RTL (fake timers) + jest-axe: composition (≥4 KPI, ≥1 chart, recent-activity table), loading/empty/error states, 10s timeout, retry
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.7, 14.8_

- [x] 8. Route-by-route adoption (every Req 22.1 route; preserve all fields and actions)
  - [x] 8.1 Migrate `/`, `/bookings`, `/bookings/[id]`, `/bookings/new`, `/waitlist`
    - Render each within `AdminShell`; lists via `DataTable`, controls via `FilterBar`, statuses via `StatusBadge`, loading/empty/error via the state presenters; adopt `DetailSheet` on `[id]` detail where it improves flow; preserve every pre-redesign field and action
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7_

  - [x] 8.2 Migrate `/customers`, `/customers/[id]`, `/leads`, `/leads/[id]`
    - Same primitive adoption + `DetailSheet` detail; preserve all fields/actions (incl. lead pipeline actions)
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7_

  - [x] 8.3 Migrate `/staff`, `/schedule`, `/leave`, `/me/schedule`, `/me/leave`
    - Same primitive adoption within the App Shell; preserve all fields/actions
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7_

  - [x] 8.4 Migrate `/services`, `/offers`, `/memberships`, `/memberships/[id]`, `/memberships/new`
    - Same primitive adoption + `DetailSheet` detail; preserve all fields/actions
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7_

  - [x] 8.5 Migrate `/billing`, `/billing/[id]`, `/reports`
    - Same primitive adoption; INR/date/time via the reused formatters; preserve all fields/actions
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7_

  - [x] 8.6 Migrate `/settings`, `/branches`, `/users`
    - Same primitive adoption within the App Shell; preserve all fields/actions
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7_

  - [x] 8.7 Migrate `/integrations`, `/logs`
    - Same primitive adoption within the App Shell; preserve all fields/actions
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7_

  - [x]* 8.8 Write route-consistency smoke tests
    - Extend `migrated-routes.smoke.test.tsx`: every authenticated route in the Req 22.1 enumeration renders within `AdminShell` with no alternative frame and uses the primitives where applicable (DataTable/StatusBadge/StatePresenter/FilterBar); pre-redesign fields and actions preserved
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7_

- [x] 9. Checkpoint — Ensure all route migrations and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Static and accessibility CI gates
  - [x]* 10.1 Add the no-emoji-icons gate
    - Grep gate over App_Shell / Sidebar / Dashboard source asserting no Unicode emoji glyph remains rendered as an icon
    - _Requirements: 5.3_

  - [x]* 10.2 Add the path-allowlist CI gate
    - CI gate rejecting diffs that touch `packages/db/schema`, `packages/db/migrations`, API request/response contracts, `@/lib/rbac`, or the committed drift fingerprint reference; confine every changed file to the Req 21.1 permitted paths
    - _Requirements: 21.1, 21.2, 21.3, 21.6, 21.7, 21.8_

  - [x]* 10.3 Add the Root-Path assertion
    - Assert every `ADMIN_NAV` href omits the `/admin` prefix (Root-Path Convention preserved)
    - _Requirements: 7.9_

  - [x]* 10.4 Add jest-axe assertions across primitives and routes
    - jest-axe zero-violations assertion on every shadcn-composed primitive and every redesigned route
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

  - [x]* 10.5 Wire the Lighthouse a11y = 100 gate per route
    - Configure `.github/lighthouse` so each redesigned route is audited; a score < 100 fails the gate and blocks merge, identifying the failing route
    - _Requirements: 18.6, 18.7, 18.8_

  - [x]* 10.6 Add Playwright responsive tests
    - No horizontal page overflow 375→1920px; table-only horizontal scroll 375–1023px; user-name hide/show by breakpoint; sidebar persistent/overlay by breakpoint; ≥44×44px touch targets below 1024px
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

- [x] 11. Final checkpoint — Ensure all tests and gates pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests and CI/static gates that can be
  skipped for a faster MVP) and are not implemented by the executing agent
  unless requested; core implementation tasks are never optional.
- **Preservation gate (Req 2.4):** tasks 3.8 and 5.10 **re-run** the existing
  pure-logic and property tests unchanged as the verification gate after each
  primitive/shell refactor. These tests are never rewritten — the refactor swaps
  the rendering substrate, not the logic.
- The 21 correctness properties use fast-check at `{ numRuns: 100 }` minimum and
  target the pure helpers / pure models, each tagged
  `// Feature: admin-portal-redesign, Property {n}`. Property 6
  (`commandItemsForLevel`) is the only newly authored property test (task 5.2);
  Properties 1–5 and 7–21 are preserved and re-run.
- Example / component tests use Vitest + React Testing Library + jest-axe;
  responsive and a11y-score gates use Playwright + Lighthouse CI.
- Every task is presentation-layer only and confined to the Req 21 permitted
  paths (`apps/admin/app`, `apps/admin/src/app`, `apps/admin/src/components`,
  `apps/admin/src/lib`, `apps/admin/src/styles`, `components.json`,
  `apps/admin/package.json` deps, shared `@rgss/ui` tokens). No data-model, API,
  RBAC, or business-logic changes; the CI `Drift_Gate` and schema fingerprint
  reference are untouched.
- Checkpoints provide incremental validation at each Migration & Rollout
  boundary.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4"] },
    { "id": 2, "tasks": ["1.5", "3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7"] },
    { "id": 3, "tasks": ["3.8", "3.9", "5.1", "5.3", "5.4", "5.5"] },
    { "id": 4, "tasks": ["5.2", "5.6", "5.7", "5.8"] },
    { "id": 5, "tasks": ["5.9"] },
    { "id": 6, "tasks": ["5.10", "5.11", "7.1"] },
    { "id": 7, "tasks": ["7.2", "8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7"] },
    { "id": 8, "tasks": ["8.8", "10.1", "10.2", "10.3"] },
    { "id": 9, "tasks": ["10.4", "10.5", "10.6"] }
  ]
}
```
