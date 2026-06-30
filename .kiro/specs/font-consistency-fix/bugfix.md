# Bugfix Requirements Document

## Introduction

The customer-facing website (`apps/web`) is meant to render text using a single,
consistent typography system — the "homepage/blog font system" — across every
page and shared component:

- **Headings** → `font-display` (Cabinet Grotesk)
- **Body / paragraph copy** → `font-sans` (Clash Grotesk)
- **UI labels / eyebrows / buttons / badges / meta** → `font-ui` (Plus Jakarta Sans)

These font-family tokens (`--font-display`, `--font-sans`, `--font-ui`) are the
single source of truth, defined in `packages/ui/src/styles/theme.css`. A base
layer in that theme maps `h1`–`h6` → `font-display` and `body` → `font-sans`.

Despite a recent shadcn/Radix/motion migration of `apps/web`, some pages and
components still deviate from this system: headings that do not resolve to
`font-display`, body text that does not resolve to `font-sans`, and — most
commonly — UI elements (buttons, badges, labels, eyebrows, meta) that omit
`font-ui` and instead inherit `font-sans` from the body base layer. For example,
the shadcn `Button` and `Badge` primitives define no `font-ui` class in their
variant base, so they render in the inherited body font rather than Plus Jakarta
Sans. Migrated surfaces (such as the onboarding form, which previously used
generic `stone-*` styling) may carry further inconsistencies.

The result is a user-facing surface whose typography is internally inconsistent
and contradicts the intended brand standard. This bugfix defines the canonical
font rule precisely, defines how to detect a violation, and treats every
user-facing page and shared component under `apps/web/src` as an input that must
conform.

## Bug Analysis

### Bug Condition

The fix and preservation properties below are expressed over the set of
user-facing surfaces. The input domain `X` is every text-rendering element on
every user-facing page and shared component under `apps/web/src`, specifically:

- **Routes:** all pages under `apps/web/src/app/(customer)` (including `/`,
  `about`, `blog`, `bookings`, `contact`, `faq`, `favorites`, `gallery`, `gems`,
  `membership`, `notifications`, `offers`, `offline`, `profile`, `services` and
  their nested/dynamic routes and `_components`), `apps/web/src/app/(auth)`
  (`onboarding`), `apps/web/src/app/(landing)` (`book`), and
  `apps/web/src/app/(legal)` (`privacy`, `refund-policy`, `terms`), plus the
  route-group layouts.
- **Shared components:** every component under `apps/web/src/components`
  (including `layout`, `booking`, `ui`, `blog`, `gallery`, `gems`, `lead`,
  `offers`, `notifications`, `consent`, `auth`, `pwa`).

Each element `X` is classified into exactly one typographic role and the
canonical font for that role is defined as:

```pascal
FUNCTION expectedFont(X)
  INPUT: X — a text-rendering element on a user-facing surface
  OUTPUT: one of { font-display, font-sans, font-ui }

  IF role(X) = heading        THEN RETURN font-display   // h1-h6 / heading-role text
  IF role(X) = body           THEN RETURN font-sans      // paragraph / long-form copy
  IF role(X) = ui             THEN RETURN font-ui         // labels, eyebrows, buttons,
                                                          // badges, meta, chips, nav
END FUNCTION
```

```pascal
FUNCTION isBugCondition(X)
  INPUT: X — a text-rendering element on a user-facing surface under apps/web/src
  OUTPUT: boolean

  // True when the font X actually resolves to does not match its role's
  // canonical font — including the case where X relies on an inherited or
  // shadcn/library default that contradicts expectedFont(X).
  RETURN resolvedFont(X) <> expectedFont(X)
END FUNCTION
```

**Definitions:**
- **F** — the user-facing surface as it renders before the fix (current code).
- **F'** — the user-facing surface after the fix is applied.
- A **violation** is any element `X` where `isBugCondition(X)` is true.

### Current Behavior (Defect)

1.1 WHEN a heading element on a user-facing page or component does not explicitly resolve to `font-display` (it relies on an inherited or library default that is not Cabinet Grotesk) THEN the system renders that heading in a font that contradicts the standard.

1.2 WHEN body or paragraph copy on a user-facing page or component does not resolve to `font-sans` THEN the system renders that body text in a font that contradicts the standard.

1.3 WHEN a UI element (label, eyebrow, button, badge, meta text, chip, nav item) does not apply `font-ui` THEN the system renders that element in the inherited body font (`font-sans`) instead of Plus Jakarta Sans.

1.4 WHEN a shadcn/Radix primitive (e.g. `Button`, `Badge`) is rendered THEN the system applies no `font-ui` class in its variant base, so the primitive inherits a font that contradicts its UI role.

1.5 WHEN a migrated surface (e.g. the onboarding form, or any surface carried over with generic styling) is rendered THEN the system displays text in fonts that do not match the role-to-font standard.

### Expected Behavior (Correct)

2.1 WHEN a heading element on any user-facing page or component is rendered THEN the system SHALL render it in `font-display` (Cabinet Grotesk).

2.2 WHEN body or paragraph copy on any user-facing page or component is rendered THEN the system SHALL render it in `font-sans` (Clash Grotesk).

2.3 WHEN a UI element (label, eyebrow, button, badge, meta text, chip, nav item) is rendered THEN the system SHALL render it in `font-ui` (Plus Jakarta Sans).

2.4 WHEN a shadcn/Radix primitive (e.g. `Button`, `Badge`) is rendered THEN the system SHALL resolve its text to `font-ui` rather than an inherited body default.

2.5 WHEN any user-facing surface (every page and shared component enumerated in the Bug Condition) is rendered THEN the system SHALL render every text element in the canonical font for its role, so that no surface renders text in a font that contradicts the standard or relies on a non-conforming default.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN any user-facing surface already conforms to the role-to-font standard (e.g. the homepage and blog) THEN the system SHALL CONTINUE TO render its text in the same canonical fonts, unchanged.

3.2 WHEN the shared `@rgss/ui` theme is loaded THEN the system SHALL CONTINUE TO use the existing font-family tokens (`--font-display`, `--font-sans`, `--font-ui`) and base layer (`h1`–`h6` → `font-display`, `body` → `font-sans`) without redefining or duplicating them in `apps/web`.

3.3 WHEN a user-facing surface is corrected THEN the system SHALL CONTINUE TO preserve all non-font styling and behavior — colors, spacing, layout, sizing, radii, shadows, interactive states, and component logic — changing only the resolved font family.

3.4 WHEN a shadcn/Radix primitive is corrected to use `font-ui` THEN the system SHALL CONTINUE TO preserve all of its other variant classes, sizes, and accessibility attributes unchanged.

3.5 WHEN code outside `apps/web` is considered (shared `business`/`db`/`types` layers, `apps/admin`, `apps/cms`) THEN the system SHALL CONTINUE TO behave exactly as before — this fix is scoped to `apps/web` consumers only.
