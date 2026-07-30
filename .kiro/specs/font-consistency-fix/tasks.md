# Implementation Plan

## Overview

Fix the font-consistency bug in `apps/web` using the bug-condition methodology. Work is
two-tiered: a prerequisite root-cause fix that adds `font-ui` to the shared shadcn UI
primitive bases (Task 3), then one independently-verifiable per-surface remediation task
for every route/layout and shared-component group enumerated in the design's input domain
(Tasks 4–35). Exploration (Task 1) and preservation (Task 2) tests are written and run on
unfixed code first, and a final build gate (Task 36) re-runs both and gates on
typecheck + Biome + production build.

## Tasks

Scope: `apps/web` only. Do NOT modify `packages/ui` theme tokens or base layer, and do
NOT touch `apps/admin`, `apps/cms`, or any shared `business`/`db`/`types`/`errors` code
(Preservation Req 3.2, 3.5).

Role → font rule applied in every audit task:
- headings (`<h1>`–`<h6>`, `CardTitle`, hero/section titles) → `font-display`
- body / paragraph copy (`<p>`, prose, descriptions) → `font-sans`
- UI text (buttons, badges, chips, eyebrows, labels, meta, nav, breadcrumbs, tabs) → `font-ui`

Each change adds exactly one `font-*` utility to a violating element and preserves all
other classes, attributes, and behaviour (Preservation Req 3.3, 3.4).

Property references:
- **Property 1 (Bug Condition / Expected Behavior)** — every violating element renders in
  `expectedFont(X)`. Validates Req 2.1–2.5.
- **Property 2 (Preservation)** — non-violating elements, theme tokens/base layer, primitive
  variant/size/a11y classes, and out-of-scope code are unchanged. Validates Req 3.1–3.5.

---

- [x] 1. Write bug condition exploration test (BEFORE any fix)
  - **Property 1: Bug Condition** - Primitives and UI text omit `font-ui`
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples proving the bug (primitives/UI text resolving to `font-sans` instead of `font-ui`, headings/body resolving to the wrong font)
  - **Scoped PBT Approach**: The bug is deterministic (a missing class in a fixed set of primitives), so scope the property to the concrete primitive set plus a representative migrated surface
  - Add a Vitest + React Testing Library test (e.g. `apps/web/src/components/ui/__tests__/font-consistency.exploration.test.tsx`)
  - Render each text-bearing primitive and assert it carries `font-ui` (from Bug Condition `isBugCondition(X)` in design):
    - `<Button>` (`components/ui/button.tsx`) — expect `font-ui` (FAILS: base has `text-sm font-medium`, no `font-ui`)
    - `<Badge>` (`components/ui/badge.tsx`) — expect `font-ui` (FAILS)
    - `<Label>` (`components/ui/label.tsx`) — expect `font-ui` (FAILS)
    - `<AccordionTrigger>` (`components/ui/accordion.tsx`) — expect `font-ui` (FAILS)
    - `<Input>` (`components/ui/input.tsx`) and `<Textarea>` (`components/ui/textarea.tsx`) — expect `font-ui` (FAILS)
  - Property over `Button` variant × size combinations: every rendered variant carries `font-ui` (FAILS uniformly — confirms structural root cause)
  - Render a migrated-surface UI element (e.g. an eyebrow/meta `<span>` on `(auth)/onboarding/onboarding-form.tsx`) and assert `font-ui` (FAILS — inherits `font-sans` from `body` base layer)
  - Run on UNFIXED code with `bun run --filter @rgss/web test` (or `bunx vitest --run`)
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found (e.g. "`<Button>` renders `inline-flex … text-sm font-medium …` with no `font-ui`, resolving to `font-sans`")
  - Mark task complete when test is written, run, and the failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Conforming text, theme tokens, and primitive non-font classes are unchanged
  - **IMPORTANT**: Follow observation-first methodology — record actual behaviour on UNFIXED code, then assert it
  - Add a Vitest test (e.g. `apps/web/src/components/ui/__tests__/font-consistency.preservation.test.tsx`)
  - Observe & assert on UNFIXED code (cases where `isBugCondition(X)` is false):
    - A conforming `<h2>` resolves to `font-display` via the base layer — record and assert unchanged (Req 3.1)
    - A conforming `<p>` resolves to `font-sans` via the base layer — record and assert unchanged (Req 3.1)
  - Snapshot the pre-fix class string + `data-*`/`aria-*` attributes of every `Button` variant × size and every `Badge` variant; store as the baseline the post-fix diff will be checked against (Req 3.4)
  - Add an assertion that `packages/ui/src/styles/theme.css` is NOT imported/redefined in `apps/web` and that `apps/web` declares no `--font-display`/`--font-sans`/`--font-ui` token (Req 3.2)
  - Add a guard asserting no files under `packages/*`, `apps/admin`, `apps/cms` are in scope of this fix (Req 3.5) — e.g. a path-allowlist check in the test
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Tier 1 (PREREQUISITE) — Add `font-ui` to shared UI primitive bases
  - **Property 1: Expected Behavior** — fixes the majority of UI-font violations site-wide at the source
  - **Files in scope (all under `apps/web/src/components/ui`):** `button.tsx`, `badge.tsx`, `label.tsx`, `accordion.tsx`, `input.tsx`, `textarea.tsx`
  - This is a prerequisite for ALL Tier 2 tasks: it changes the baseline every page inherits, so complete it before verifying any Tier 2 task
  - For each file, add `font-ui` to the `cva` base string (`button`, `badge`) or the base `cn(...)` class string (`label`, `input`, `textarea`, and `AccordionTrigger` in `accordion.tsx`). Add ONLY the `font-ui` utility — do not remove, reorder, or change any variant, size, `data-*`, Slot/`asChild`, or accessibility class
  - In `accordion.tsx`: add `font-ui` to `AccordionTrigger` only; leave `AccordionContent` as body (`font-sans` via inheritance)
  - Do NOT change `card.tsx`, `separator.tsx`, `switch.tsx`, `skeleton.tsx` here (card is per-call-site in Tier 2; the others render no text)
  - **Override semantics**: `className` is merged last via `cn(...)`, so any deliberate per-call-site font still wins — Tier 1 only fills the gap
  - Verify: re-run the Task 1 exploration test — the primitive assertions now PASS; re-run the Task 2 preservation snapshot — the only class-set diff vs baseline is the added `font-ui` (Property 2 holds)
  - Run `bun run --filter @rgss/web typecheck` and `bunx biome check apps/web/src/components/ui`
  - _Bug_Condition: isBugCondition(X) where role(X)=ui and resolvedFont(X)=font-sans (primitive base omits font-ui)_
  - _Expected_Behavior: expectedFont(X)=font-ui for all primitive consumers_
  - _Preservation: primitive variant/size/data-*/Slot/a11y classes unchanged; only font-family added_
  - _Requirements: 2.3, 2.4, 3.4_

### Tier 2 — Per-surface remediation (run after Task 3; each task is independently verifiable and parallel-safe)

Per-task verification (apply to every Tier 2 task below unless stated otherwise):
1. Class-level audit: every text element in the listed files carries/resolves the correct `font-*` for its role; only `font-*` utilities were added, nothing else changed (Property 1 + Property 2).
2. `bun run --filter @rgss/web typecheck`.
3. `bunx biome check <files in scope>`.

- [x] 4. Audit & fix root layout
  - Files: `app/layout.tsx`
  - Audit headings→`font-display`, body→`font-sans`, UI→`font-ui`; confirm it does not redefine `--font-*` tokens (must inherit `@rgss/ui` theme — Req 3.2)
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.2, 3.3_

- [x] 5. Audit & fix customer route-group layout
  - Files: `app/(customer)/layout.tsx`
  - Audit per role→font rule; apply correct `font-*` to any violating element, preserve all other styling
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.3_

- [x] 6. Audit & fix homepage and its `_components`
  - Files: `app/(customer)/page.tsx` and `app/(customer)/_components/*` (`AnnouncementBar.tsx`, `BookingCTASection.tsx`, `BrandLogo.tsx`, `BrandLogosSection.tsx`, `FaqSection.tsx`, `HeroSection.tsx`, `OffersSection.tsx`, `ServicesSection.tsx`, `TestimonialsCarousel.tsx`, `TestimonialsSection.tsx`)
  - Homepage is a known-conforming reference: most elements must stay unchanged (Req 3.1). Only add `font-*` to genuine violations (ad-hoc eyebrows/meta missing `font-ui`, raw headings/body missing their font)
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.1, 3.3_

- [x] 7. Audit & fix About page
  - Files: `app/(customer)/about/page.tsx`
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.3_

- [x] 8. Audit & fix Blog list and post pages
  - Files: `app/(customer)/blog/page.tsx`, `app/(customer)/blog/[slug]/` (page + any co-located components)
  - Blog is a known-conforming reference for prose — preserve `font-sans` body; fix only UI meta (dates, tags, read-time) missing `font-ui`
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.1, 3.3_

- [x] 9. Audit & fix Bookings list and detail pages
  - Files: `app/(customer)/bookings/page.tsx`, `app/(customer)/bookings/bookings-list.tsx`, `app/(customer)/bookings/[id]/` (page + co-located components)
  - Pay attention to status chips/badges, dates, and meta → `font-ui`
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.3_

- [x] 10. Audit & fix Contact page and form
  - Files: `app/(customer)/contact/page.tsx`, `app/(customer)/contact/ContactForm.tsx`
  - Form labels/inputs inherit `font-ui` from Tier 1; fix any ad-hoc helper/error text and headings/body
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.3_

- [x] 11. Audit & fix FAQ page
  - Files: `app/(customer)/faq/page.tsx`
  - Accordion triggers inherit `font-ui` from Tier 1; answers stay body `font-sans`
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.3_

- [x] 12. Audit & fix Favorites page
  - Files: `app/(customer)/favorites/page.tsx`
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.3_

- [x] 13. Audit & fix Gallery page
  - Files: `app/(customer)/gallery/page.tsx`
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.3_

- [x] 14. Audit & fix Gems page
  - Files: `app/(customer)/gems/page.tsx`
  - Balance/meta/chips → `font-ui`
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.3_

- [x] 15. Audit & fix Membership page
  - Files: `app/(customer)/membership/page.tsx`
  - Tier labels, hours-remaining meta → `font-ui`
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.3_

- [x] 16. Audit & fix Notifications page and panel
  - Files: `app/(customer)/notifications/page.tsx`, `app/(customer)/notifications/notifications-panel.tsx`
  - Timestamps/labels/meta → `font-ui`
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.3_

- [x] 17. Audit & fix Offers page
  - Files: `app/(customer)/offers/page.tsx`
  - Offer badges/pills → `font-ui`
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.3_

- [x] 18. Audit & fix Offline page
  - Files: `app/(customer)/offline/page.tsx`
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.3_

- [x] 19. Audit & fix Profile page and its forms
  - Files: `app/(customer)/profile/page.tsx`, `app/(customer)/profile/NotificationPreferencesForm.tsx`, `app/(customer)/profile/sign-out-button.tsx`
  - Form labels/buttons inherit `font-ui` from Tier 1; fix ad-hoc field labels/meta and headings/body
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.3_

- [x] 20. Audit & fix Services catalogue and detail pages
  - Files: `app/(customer)/services/page.tsx`, `app/(customer)/services/services-catalogue.tsx`, `app/(customer)/services/[slug]/` (page + co-located components)
  - Salon/SPA toggle, category chips, price/duration meta → `font-ui`; do NOT modify `services-catalogue.test.tsx` behaviour expectations beyond font assertions
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.3_

- [x] 21. Audit & fix Auth route-group layout and onboarding
  - Files: `app/(auth)/layout.tsx`, `app/(auth)/onboarding/page.tsx`, `app/(auth)/onboarding/onboarding-form.tsx`
  - Migrated surface (carried generic `stone-*` styling) — high violation density. Audit every label, helper text, consent copy, eyebrow, and button; apply role→font rule
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 1.5, 3.3_

- [x] 22. Audit & fix Landing route-group layout and book page
  - Files: `app/(landing)/layout.tsx`, `app/(landing)/book/page.tsx`
  - Lead-capture form labels/helper/CTA → `font-ui`; headline → `font-display`
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.3_

- [x] 23. Audit & fix Legal route-group layout and pages
  - Files: `app/(legal)/layout.tsx`, `app/(legal)/privacy/page.tsx`, `app/(legal)/refund-policy/page.tsx`, `app/(legal)/terms/page.tsx`
  - Long-form prose → `font-sans`; section headings → `font-display`
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.1, 2.2, 2.5, 3.3_

- [x] 24. Audit & fix shared `layout` components
  - Files: `components/layout/Header.tsx`, `components/layout/Footer.tsx`, `components/layout/MobileNav.tsx`, `components/layout/UserMenu.tsx`
  - Nav links, menu items, footer meta → `font-ui`
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.3, 2.5, 3.3_

- [x] 25. Audit & fix shared `booking` components
  - Files: `components/booking/BookingDialog.tsx`, `components/booking/BookingDialogProvider.tsx`, `components/booking/BookingDialogTrigger.tsx`, `components/booking/ServiceTypeToggle.tsx`
  - Step labels, toggle text, running-total meta → `font-ui`; dialog title → `font-display`; do NOT alter `BookingDialog.test.tsx` expectations beyond font
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.1, 2.3, 2.5, 3.3_

- [x] 26. Audit & fix shared `blog` components
  - Files: `components/blog/BlogFeed.tsx`, `components/blog/NewsletterForm.tsx`, `components/blog/RichText.tsx`
  - `RichText` prose → `font-sans` (preserve); feed meta/tags and newsletter label/CTA → `font-ui`
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.2, 2.3, 2.5, 3.1, 3.3_

- [x] 27. Audit & fix shared `gallery` component
  - Files: `components/gallery/GalleryGrid.tsx`
  - Captions/labels → `font-ui`
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.3, 2.5, 3.3_

- [x] 28. Audit & fix shared `gems` component
  - Files: `components/gems/RedeemFlow.tsx`
  - Balance/step labels/CTA → `font-ui`
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.3, 2.5, 3.3_

- [x] 29. Audit & fix shared `lead` component
  - Files: `components/lead/LeadCaptureForm.tsx`
  - Labels/helper/CTA → `font-ui`
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.3, 2.5, 3.3_

- [x] 30. Audit & fix shared `offers` component
  - Files: `components/offers/OfferBookButton.tsx`
  - Button text inherits `font-ui` from Tier 1; fix any ad-hoc label/meta
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.3, 2.4, 2.5, 3.3_

- [x] 31. Audit & fix shared `notifications` component
  - Files: `components/notifications/NotificationBell.tsx`
  - Count badge/labels → `font-ui`
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.3, 2.5, 3.3_

- [x] 32. Audit & fix shared `consent` components
  - Files: `components/consent/CookieConsent.tsx`, `components/consent/CookiePreferencesButton.tsx`
  - Banner copy → `font-sans`; toggle labels/buttons → `font-ui`
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.2, 2.3, 2.5, 3.3_

- [x] 33. Audit & fix shared `auth` component
  - Files: `components/auth/GoogleOneTap.tsx`
  - Any visible prompt text → role→font rule (note: if it renders no app-styled text, mark "no-op verified")
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.3, 2.5, 3.3_

- [x] 34. Audit & fix shared `pwa` components
  - Files: `components/pwa/InstallPrompt.tsx`, `components/pwa/ServiceWorkerRegistrar.tsx`
  - `InstallPrompt` copy/CTA → role→font rule; `ServiceWorkerRegistrar` renders no text → "no-op verified"
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.2, 2.3, 2.5, 3.3_

- [x] 35. Audit & fix `ui` non-primitive text usages
  - Files: `components/ui/card.tsx` (per-call-site guidance), `components/ui/motion/reveal.tsx`, `components/ui/motion/motion-variants.ts`, `components/ui/motion/use-reduced-motion.ts`
  - `card.tsx` is deliberately NOT forced at the primitive level — verify `CardTitle` usages are corrected per call site in Tier 2 (title-as-heading → `font-display`, body → `font-sans`/`font-ui`). Confirm motion wrappers add no conflicting font and pass `className` through so call-site fonts win
  - Confirm no-text components are out of domain: `components/realtime/RealtimeProvider.tsx`, `components/analytics/Analytics.tsx`, `components/seo/JsonLd.tsx` → "no-op verified"
  - _Property 1: Expected Behavior; Property 2: Preservation_
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.3_

### Final verification

- [x] 36. Checkpoint — full verification and build gate
  - **Property 1: Expected Behavior** — re-run the Task 1 exploration test (do NOT write a new test). **EXPECTED OUTCOME**: it now PASSES (all primitives and the migrated-surface sample carry `font-ui`; bug resolved)
  - **Property 2: Preservation** — re-run the Task 2 preservation tests (do NOT write new tests). **EXPECTED OUTCOME**: they still PASS — post-fix primitive class diffs are font-only, conforming `<h2>`/`<p>` unchanged, theme tokens/base layer untouched, no out-of-scope files modified
  - Run the full `apps/web` test suite: `bun run --filter @rgss/web test`
  - Run `bun run --filter @rgss/web typecheck`
  - Run `bunx biome check apps/web/src` (Biome/Ultracite) — zero errors
  - Run the production build gate: `bun run --filter @rgss/web build` — must succeed
  - Class-level sweep across the input domain: confirm no user-facing surface renders a text element in a font contradicting its role (headings `font-display`, body `font-sans`, UI `font-ui`) and that no surface relies on a non-conforming default
  - Confirm scope respected: `git diff --name-only` shows ONLY files under `apps/web/`; no changes under `packages/*`, `apps/admin`, `apps/cms`
  - Ensure all tests pass; ask the user if questions arise
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"], "dependsOn": [] },
    { "wave": 2, "tasks": ["3"], "dependsOn": ["1", "2"] },
    { "wave": 3, "tasks": ["4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35"], "dependsOn": ["3"] },
    { "wave": 4, "tasks": ["36"], "dependsOn": ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35"] }
  ]
}
```

- Wave 1 (Tasks 1, 2): no dependencies; run on unfixed code first.
- Wave 2 (Task 3, Tier 1): hard prerequisite for all Tier 2 tasks — changes inherited baseline.
- Wave 3 (Tasks 4–35, Tier 2): mutually independent, disjoint file sets, parallel-safe.
- Wave 4 (Task 36): depends on all of 3–35; re-runs the Task 1 and Task 2 tests + build gate.

## Notes

- Property 1 = fix (Bug Condition / Expected Behavior, Req 2.1–2.5). Property 2 = preservation
  (Req 3.1–3.5). Both are encoded once (Tasks 1 & 2) and re-verified at Task 36.
- Every fix adds exactly one `font-*` utility to a violating element; no other class,
  attribute, or behaviour changes.
- Out of scope and never modified: `packages/ui` theme tokens/base layer, `packages/*`,
  `apps/admin`, `apps/cms` (Req 3.2, 3.5).
- No-text components (`realtime/RealtimeProvider`, `analytics/Analytics`, `seo/JsonLd`,
  `pwa/ServiceWorkerRegistrar`) are out of the text domain — mark "no-op verified".
- Test framework: Vitest + React Testing Library (existing in `apps/web`). Run via
  `bun run --filter @rgss/web test` or `bunx vitest --run` (single run, never watch mode).
