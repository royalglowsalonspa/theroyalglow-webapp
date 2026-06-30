# Font Consistency Fix Bugfix Design

## Overview

The customer-facing website (`apps/web`) is meant to render every text element using a single
typographic system whose font-family tokens are the single source of truth in
`packages/ui/src/styles/theme.css`:

- **Headings** → `font-display` (Cabinet Grotesk)
- **Body / paragraph copy** → `font-sans` (Clash Grotesk)
- **UI labels / eyebrows / buttons / badges / meta / chips / nav** → `font-ui` (Plus Jakarta Sans)

After the shadcn/Radix/motion migration, many surfaces drifted from this standard. The dominant
failure is structural: the shadcn primitives in `apps/web/src/components/ui` (notably `Button` and
`Badge`) declare no `font-ui` class in their `cva` base, so they silently inherit `font-sans` from
the `body` base layer. Because these primitives are reused everywhere, a single omission produces a
large number of UI-font violations across the whole site. Secondary violations are per-element:
headings missing `font-display`, body copy missing `font-sans`, and ad-hoc UI text (eyebrows, meta,
chips, nav) missing `font-ui`.

The fix strategy is two-tiered and deliberately ordered to maximise leverage:

1. **Root-cause primitive fixes (highest leverage):** add `font-ui` to the `cva`/class base of the
   text-bearing shadcn UI primitives so every consumer inherits the correct UI font automatically.
   This resolves the majority of violations at the source without touching call sites.
2. **Per-surface remediation:** for the residual page- and component-level violations that the
   primitive fix cannot reach (raw `<h*>`/`<p>`/`<span>` markup, ad-hoc styled text), add the
   correct `font-*` utility class at the element, preserving all other styling.

The fix changes only the resolved **font family** of text. Colours, spacing, layout, sizing, radii,
shadows, interactive states, accessibility attributes, and component logic are unchanged. The shared
`@rgss/ui` theme tokens and base layer are NOT redefined or duplicated in `apps/web`. Scope is
strictly `apps/web`.

## Glossary

- **Bug_Condition (C)**: For a text-rendering element `X`, `resolvedFont(X) ≠ expectedFont(X)` — the
  font the element actually resolves to (including inherited / library-default fonts) does not match
  the canonical font for its typographic role.
- **Property (P)**: After the fix, every element renders in `expectedFont(X)` — headings in
  `font-display`, body in `font-sans`, UI in `font-ui`.
- **Preservation**: All non-font styling and behaviour, the shared theme tokens/base layer, and all
  code outside `apps/web` remain exactly as before. Surfaces that already conform stay unchanged.
- **role(X)**: The typographic role of an element — one of `{ heading, body, ui }`.
- **expectedFont(X)**: The canonical font for `role(X)` — `heading→font-display`, `body→font-sans`,
  `ui→font-ui`.
- **resolvedFont(X)**: The font-family that actually applies to `X` after cascade/inheritance,
  including shadcn/library defaults and the `body`/`h1–h6` base layer.
- **Primitive base**: The first argument to `cva(...)` (or the base `cn(...)` class string) in a
  shadcn UI component — classes applied to every variant of that primitive.
- **font tokens**: `--font-display`, `--font-sans`, `--font-ui`, defined once in
  `packages/ui/src/styles/theme.css`. Surfaced as the Tailwind utilities `font-display`,
  `font-sans`, `font-ui`.
- **Base layer**: The `@layer base` rules in `theme.css` mapping `h1–h6 → font-display` and
  `body → font-sans`. This is why UI elements default to `font-sans` unless they opt into `font-ui`.

## Bug Details

### Bug Condition

The bug manifests when a text-rendering element on a user-facing surface under `apps/web/src`
resolves to a font that contradicts its typographic role. The element is either relying on an
inherited/library default that disagrees with its role (the common case for UI elements inheriting
`font-sans` from `body`), is a heading not resolving to `font-display`, or is body copy not resolving
to `font-sans`.

**Formal Specification:**
```
FUNCTION expectedFont(X)
  INPUT: X — a text-rendering element on a user-facing surface under apps/web/src
  OUTPUT: one of { font-display, font-sans, font-ui }

  IF role(X) = heading THEN RETURN font-display   // h1-h6 / heading-role text
  IF role(X) = body    THEN RETURN font-sans      // paragraph / long-form copy
  IF role(X) = ui      THEN RETURN font-ui         // labels, eyebrows, buttons,
                                                   // badges, meta, chips, nav
END FUNCTION

FUNCTION isBugCondition(X)
  INPUT: X — a text-rendering element on a user-facing surface under apps/web/src
  OUTPUT: boolean

  // True when the font X actually resolves to does not match its role's canonical
  // font — including the case where X relies on an inherited or shadcn/library
  // default that contradicts expectedFont(X).
  RETURN resolvedFont(X) <> expectedFont(X)
END FUNCTION
```

### Role detection rule (how to classify an element)

To audit any element/JSX node, classify `role(X)` then check the applied font utility:

| Signal | role(X) | expectedFont |
|--------|---------|--------------|
| `<h1>`–`<h6>`, or a styled heading/title acting as a section heading (e.g. `CardTitle`, hero/eyebrow-paired headlines) | `heading` | `font-display` |
| `<p>`, long-form paragraph copy, prose blocks, rich-text body, descriptions | `body` | `font-sans` |
| Buttons, badges, chips, pills, eyebrows/kickers, form labels, input/control text, nav links, breadcrumbs, tabs, meta text (dates, counts, captions), toasts | `ui` | `font-ui` |

**resolvedFont(X) determination (audit procedure for one file):**
1. If the element (or a primitive it renders) applies an explicit `font-display` / `font-sans` /
   `font-ui` utility, that is `resolvedFont(X)`.
2. Otherwise inheritance applies: `h1–h6` resolve to `font-display`; everything else resolves to
   `font-sans` (the `body` base layer).
3. `isBugCondition(X)` is true iff step 1/2 result ≠ `expectedFont(X)`. The most common true case:
   a UI element (role=`ui`, expected `font-ui`) with no explicit font utility, inheriting `font-sans`.

### Examples

- **Button primitive** (`button.tsx`): `cva` base has `text-sm font-medium` but no `font-ui`. A
  rendered `<Button>Book Now</Button>` is role=`ui`, expected `font-ui`, but resolves to inherited
  `font-sans` → **violation**.
- **Badge primitive** (`badge.tsx`): `cva` base has `text-xs font-medium` but no `font-ui`. A
  `<Badge>New</Badge>` is role=`ui`, expected `font-ui`, resolves to `font-sans` → **violation**.
- **Form label** (`label.tsx`): role=`ui`, expected `font-ui`, no font utility → resolves to
  `font-sans` → **violation**.
- **Ad-hoc eyebrow/meta** on a page (e.g. `<span className="text-xs uppercase tracking-wide">`):
  role=`ui`, expected `font-ui`, resolves to `font-sans` → **violation**.
- **Conforming heading** (`<h2 className="...">`): role=`heading`, resolves to `font-display` via
  base layer → **not a violation** (must be preserved).
- **Conforming body** (`<p>`): role=`body`, resolves to `font-sans` via base layer → **not a
  violation** (must be preserved).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Surfaces that already conform (e.g. homepage, blog) continue to render their text in the same
  canonical fonts, byte-for-byte unchanged.
- The shared `@rgss/ui` theme keeps its existing font-family tokens (`--font-display`, `--font-sans`,
  `--font-ui`) and base layer (`h1–h6 → font-display`, `body → font-sans`). These are NOT redefined
  or duplicated in `apps/web`.
- All non-font styling and behaviour of every corrected surface — colours, spacing, layout, sizing,
  radii, shadows, hover/focus/active/disabled states, ARIA attributes, and component logic — is
  preserved. Only the resolved font family changes.
- Corrected shadcn/Radix primitives keep all of their existing variant classes, sizes, `data-*`
  attributes, `asChild`/Slot behaviour, and accessibility attributes.

**Scope:**
All inputs where `isBugCondition(X)` is false must be completely unaffected by this fix. This includes:
- Every already-conforming heading, body, and UI element across `apps/web`.
- The shared theme package (`packages/ui`) — token definitions and base layer untouched.
- All code outside `apps/web` — shared `business`/`db`/`types`/`errors` layers, `apps/admin`,
  `apps/cms` — behaves exactly as before.

**Note:** The expected correct behaviour for buggy inputs is defined in the Correctness Properties
section (Property 1). This section enumerates what must NOT change.

## Hypothesized Root Cause

Based on the bug analysis and inspection of `apps/web/src/components/ui`, the violations have two
distinct root causes:

1. **Primitive `cva` base omits `font-ui` (dominant, structural cause).** The shadcn primitives were
   migrated with their upstream class bases, which carry `text-{size} font-medium` but no font-family
   utility. Because `theme.css` sets `body { font-family: var(--font-sans) }`, every such primitive
   inherits `font-sans` instead of the `font-ui` its UI role requires. Confirmed by inspection:
   - `button.tsx` base: `"... text-sm font-medium ..."` — no `font-ui`.
   - `badge.tsx` base: `"... text-xs font-medium ..."` — no `font-ui`.
   - `label.tsx` class: `"... text-sm leading-none font-medium ..."` — no `font-ui`.
   - `accordion.tsx` `AccordionTrigger`: `"... text-sm font-medium ..."` — no `font-ui`.
   - `input.tsx` / `textarea.tsx`: control text inherits `font-sans` — no `font-ui`.
   This single class of omission accounts for the largest share of violations because the primitives
   are reused on nearly every page.

2. **Per-element font utility missing on raw markup (residual cause).** Hand-authored page and
   component markup that does not go through a primitive — raw `<h*>` that overrides font, `<p>` body
   copy that lost its font during migration, and ad-hoc UI text (`<span>`/`<div>` eyebrows, meta,
   chips, nav items) — omits the explicit `font-*` utility and therefore inherits a font that
   contradicts its role. Migrated surfaces carried over with generic styling (e.g. the onboarding
   form) concentrate this category.

A third non-cause to rule out: the **theme tokens and base layer are correct** and are the single
source of truth; the fix must not touch them. The bug is entirely in `apps/web` consumers.

## Correctness Properties

Property 1: Bug Condition - Every element renders in its role's canonical font

_For any_ text-rendering element `X` on a user-facing surface under `apps/web/src` where the bug
condition holds (`isBugCondition(X)` returns true), the fixed code SHALL render `X` in
`expectedFont(X)` — headings in `font-display` (Cabinet Grotesk), body copy in `font-sans` (Clash
Grotesk), and UI elements (labels, eyebrows, buttons, badges, meta, chips, nav) in `font-ui` (Plus
Jakarta Sans) — so that no surface renders text in a font that contradicts the standard or relies on
a non-conforming default.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation - Non-violating elements and out-of-scope code are unchanged

_For any_ input where the bug condition does NOT hold (`isBugCondition(X)` returns false) — including
already-conforming elements, the shared `@rgss/ui` theme tokens and base layer, all non-font styling
and behaviour of corrected surfaces, the preserved variant/size/accessibility classes of corrected
primitives, and all code outside `apps/web` — the fixed code SHALL produce the same result as the
original code, preserving everything except the resolved font family of violating elements.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Tier 1 — Root-cause primitive fixes (do first)

Add `font-ui` to the base class of each text-bearing UI primitive in
`apps/web/src/components/ui`. This is a minimal, additive change to the `cva` base string (or the
base `cn(...)` string) — no variant, size, `data-*`, Slot, or accessibility class is removed or
reordered. Every existing consumer of these primitives then inherits `font-ui` automatically.

**File / function changes:**

| File | Symbol | Change | Rationale |
|------|--------|--------|-----------|
| `components/ui/button.tsx` | `buttonVariants` (cva base) | add `font-ui` to base string | Buttons are UI controls; fixes all `<Button>` site-wide |
| `components/ui/badge.tsx` | `badgeVariants` (cva base) | add `font-ui` to base string | Badges/chips are UI; fixes all `<Badge>` site-wide |
| `components/ui/label.tsx` | `Label` (cn base) | add `font-ui` to base string | Form labels are UI |
| `components/ui/accordion.tsx` | `AccordionTrigger` (cn base) | add `font-ui` to trigger base string | Accordion triggers are UI controls. `AccordionContent` stays body (`font-sans` via inheritance) — leave it |
| `components/ui/input.tsx` | `Input` (cn base) | add `font-ui` to base string | Control text is UI |
| `components/ui/textarea.tsx` | `Textarea` (cn base) | add `font-ui` to base string | Control text is UI |

**Deliberately NOT changed at the primitive level:**
- `card.tsx` — `CardTitle` is heading-role and `CardDescription` is body-role, but a `Card` is a
  generic container used in both heading and body contexts; forcing a single font on `CardTitle`/
  `CardDescription` would be wrong for some call sites. Card text is remediated per call site in
  Tier 2 (apply `font-display` to title-as-heading usages, `font-sans`/`font-ui` as the role demands).
- `separator.tsx`, `switch.tsx`, `skeleton.tsx` — render no text; nothing to change.

**Override semantics:** because these primitives pass `className` last through `cn(...)`, any call
site that already specifies a deliberate font utility continues to win (Tailwind merge keeps the
last font-family class). The base `font-ui` only fills the gap where no font was specified, so Tier 1
cannot regress an intentional per-call-site choice.

### Tier 2 — Per-surface remediation

For each page and shared component listed in the input domain, audit every text element using the
role-detection rule, then add the correct `font-*` utility class to any element where
`isBugCondition(X)` is true, after Tier 1 is applied (Tier 1 removes the bulk of UI violations, so
Tier 2 focuses on raw `<h*>`/`<p>` markup and ad-hoc UI text not covered by a primitive).

**Per-element change pattern:**
- Heading element resolving to the wrong font → add `font-display`.
- Body/paragraph element resolving to the wrong font → add `font-sans`.
- Ad-hoc UI text (eyebrow, meta, chip, nav) resolving to `font-sans` → add `font-ui`.
- Card title used as a section heading → add `font-display`; card body/meta → `font-sans`/`font-ui`.

Each change adds exactly one font-family utility and touches nothing else on the element.

### Input domain (enumeration for the Tasks phase)

The Tasks phase SHALL create one discrete, independently-verifiable remediation task per unit below
(suitable for parallel sub-agents). Tier-1 primitive tasks are prerequisites and should be completed
(or merged) before per-surface tasks are verified, since Tier 1 changes the baseline each page
inherits.

**Tier 1 — shared UI primitives (prerequisite):**
- `components/ui/button.tsx`, `badge.tsx`, `label.tsx`, `accordion.tsx`, `input.tsx`, `textarea.tsx`

**Tier 2 — routes (each page + its `_components`):**
- Root: `app/layout.tsx`
- `(customer)/layout.tsx`, `(customer)/page.tsx` (homepage) + `(customer)/_components/*`
- `(customer)/about`, `blog` (+ `blog/[slug]`), `bookings` (+ `bookings/[id]`), `contact`, `faq`,
  `favorites`, `gallery`, `gems`, `membership`, `notifications`, `offers`, `offline`, `profile`,
  `services` (+ nested/dynamic routes)
- `(auth)/layout.tsx`, `(auth)/onboarding`
- `(landing)/layout.tsx`, `(landing)/book`
- `(legal)/layout.tsx`, `(legal)/privacy`, `(legal)/refund-policy`, `(legal)/terms`

**Tier 2 — shared components (by directory):**
- `components/layout` (`Header`, `Footer`, `MobileNav`, `UserMenu`)
- `components/booking` (`BookingDialog`, `BookingDialogProvider`, `BookingDialogTrigger`,
  `ServiceTypeToggle`)
- `components/blog` (`BlogFeed`, `NewsletterForm`, `RichText`)
- `components/gallery` (`GalleryGrid`)
- `components/gems` (`RedeemFlow`)
- `components/lead` (`LeadCaptureForm`)
- `components/offers` (`OfferBookButton`)
- `components/notifications` (`NotificationBell`)
- `components/consent` (`CookieConsent`, `CookiePreferencesButton`)
- `components/auth` (`GoogleOneTap`)
- `components/pwa` (`InstallPrompt`, `ServiceWorkerRegistrar`)
- `components/ui` non-primitive text usages (`card.tsx` per-call-site, `motion/*` wrappers)

Components that render no user-visible text (e.g. `realtime/RealtimeProvider`,
`analytics/Analytics`, `seo/JsonLd`) are out of the text domain and require no change; the Tasks
phase may note them as "no-op verified".

## Testing Strategy

### Validation Approach

Two-phase approach. First, on the UNFIXED code, surface concrete counterexamples that demonstrate
the bug (primitives resolving to `font-sans`, page elements with the wrong font) and confirm the
root-cause hypothesis. Then verify the fix renders every element in its role's canonical font and
preserves everything else. Because the domain is "every text element on every surface", class-level
assertions (does the rendered element carry the correct `font-*` utility / resolve to the correct
`--font-*` token) plus build/lint gates are the practical verification mechanism, complemented by
property-based generation over primitive variants.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix, and confirm
or refute the root-cause hypothesis. If refuted (e.g. a primitive already had `font-ui`, or a token
was redefined in `apps/web`), re-hypothesize.

**Test Plan**: Render the primitives and a sample of representative surfaces in a test renderer and
assert the resolved/declared font. Run on UNFIXED code to observe failures.

**Test Cases**:
1. **Button primitive**: render `<Button>` and assert it carries `font-ui` (will fail — base lacks it).
2. **Badge primitive**: render `<Badge>` and assert `font-ui` (will fail).
3. **Label primitive**: render `<Label>` and assert `font-ui` (will fail).
4. **Accordion trigger**: render `<AccordionTrigger>` and assert `font-ui` (will fail).
5. **Page UI text**: select an eyebrow/meta element on a migrated surface (e.g. onboarding) and
   assert `font-ui` (will fail — inherits `font-sans`).

**Expected Counterexamples**:
- Primitives render with no `font-ui` class, resolving to `font-sans` from the `body` base layer.
- Root causes: `cva`/`cn` base strings omit `font-ui`; raw markup omits the per-element font utility.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed code produces the
expected behaviour (element renders in `expectedFont(X)`).

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  rendered := renderFixed(X)
  ASSERT resolvedFont(rendered) = expectedFont(X)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed code produces
the same result as the original.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT renderOriginal(X) = renderFixed(X)            // already-conforming text unchanged
END FOR
ASSERT themeTokensAndBaseLayer(after) = themeTokensAndBaseLayer(before)   // packages/ui untouched
ASSERT nonFontClasses(primitive_after) = nonFontClasses(primitive_before) // variant/size/a11y kept
ASSERT codeOutsideAppsWeb(after) = codeOutsideAppsWeb(before)             // scope respected
```

**Testing Approach**: Property-based testing is recommended for preservation on the primitives
because the variant × size space is large: generate every `variant`/`size` combination of `Button`
and `Badge` and assert that (a) the only class-set difference vs the pre-fix snapshot is the addition
of `font-ui`, and (b) all other classes, `data-*` attributes, and Slot/`asChild` behaviour are
identical. This gives strong assurance that the structural fix changes font family and nothing else.

**Test Plan**: Snapshot the pre-fix class output of primitives and conforming sample elements, then
assert the post-fix diff is font-only.

**Test Cases**:
1. **Conforming heading preservation**: a known-good `<h2>` still resolves to `font-display`,
   unchanged.
2. **Conforming body preservation**: a known-good `<p>` still resolves to `font-sans`, unchanged.
3. **Primitive non-font preservation**: every `Button`/`Badge` variant+size keeps all non-font
   classes and `data-*`/accessibility attributes.
4. **Theme untouched**: `packages/ui/src/styles/theme.css` tokens and base layer are byte-identical;
   `apps/web` does not redefine `--font-*`.
5. **Out-of-scope untouched**: no files under `packages/*`, `apps/admin`, `apps/cms` are modified.

### Unit Tests

- Render each fixed primitive (`Button`, `Badge`, `Label`, `AccordionTrigger`, `Input`, `Textarea`)
  and assert it carries `font-ui`.
- For each remediated page/component, assert headings carry/resolve `font-display`, body
  `font-sans`, and UI text `font-ui`.
- Assert corrected primitives retain their variant/size classes and accessibility attributes.

### Property-Based Tests

- Generate all `Button` variant × size combinations; assert `font-ui` present and the class-set diff
  vs baseline is font-only (fix + preservation in one property).
- Generate all `Badge` variant combinations; same assertion.
- Generate representative role-tagged elements (`heading`/`body`/`ui`) and assert the rendered font
  utility equals `expectedFont(role)`.

### Integration Tests

- Verify the whole project still builds and passes lint after the changes:
  `bun run typecheck`, `bun run lint` (Biome/Ultracite), `bun run build` for `apps/web`.
- Render full key pages (homepage, services, onboarding, a legal page, blog) and assert no text
  element resolves to a font contradicting its role (class/computed-style audit).
- Visual/class-level confirmation that already-conforming surfaces (homepage, blog) are unchanged.
