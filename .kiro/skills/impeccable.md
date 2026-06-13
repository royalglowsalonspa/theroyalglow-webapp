---
name: impeccable
description: Production-grade frontend design skill by Paul Bakaus. Covers UI design, polish, critique, animation, color, typography, layout, accessibility, performance, responsive behavior, anti-patterns, and the AI slop test. Use when designing, redesigning, shaping, critiquing, auditing, polishing, or improving any frontend interface.
---

# Impeccable - Production-Grade Frontend Design

Designs and iterates production-grade frontend interfaces. Real working code, committed design choices, exceptional craft.

## Core Principle

Produce ready-to-ship, production-grade code, not prototypes or starting points. Take no shortcuts. Don't stop until arriving at a complete implementation (beautiful, responsive, fast, precise, bug-free, on brand). Every page, section or component is battle-tested.

---

## Design Rules

### Color

- **Verify contrast.** Body text must hit >= 4.5:1 against its background; large text (>= 18px or bold >= 14px) needs >= 3:1.
- Placeholder text needs the same 4.5:1, not the muted-gray default.
- The most common failure: muted gray body text on a tinted near-white. If contrast is even close, bump the body color toward ink end.
- Gray text on a colored background looks washed out. Use a darker shade of the background's own hue, or a transparency of the text color.
- Use OKLCH for color definition.
- Tinted neutrals: add 0.005-0.015 chroma toward the brand's hue. Don't default-tint toward warm or cool by reflex.

#### Color Strategy (pick before picking colors)
- **Restrained**: tinted neutrals + one accent <= 10%. Product default; brand minimalism.
- **Committed**: one saturated color carries 30-60% of the surface. Identity-driven pages.
- **Full palette**: 3-4 named roles, each used deliberately. Campaigns; data viz.
- **Drenched**: the surface IS the color. Heroes, campaign pages.

### Typography

- Cap body line length at 65-75ch.
- Hierarchy through scale + weight contrast (>= 1.25 ratio between steps). Avoid flat scales.
- Cap font-family count at 3 (display + body + optional mono).
- Don't pair fonts that are similar but not identical. Pair on a contrast axis (serif + sans, geometric + humanist) or use one family in multiple weights.
- No all-caps body copy. Reserve uppercase for short labels (<= 4 words) and badges.
- Hero/display heading ceiling: clamp() max <= 6rem (~96px).
- Display heading letter-spacing floor: >= -0.04em.
- Use `text-wrap: balance` on h1-h3; `text-wrap: pretty` on long prose.

### Layout

- Vary spacing for rhythm.
- Cards are the lazy answer. Use them only when truly the best affordance. Nested cards are always wrong.
- Flexbox for 1D, Grid for 2D. Don't default to Grid when `flex-wrap` would be simpler.
- Responsive grids without breakpoints: `repeat(auto-fit, minmax(280px, 1fr))`.
- Build a semantic z-index scale (dropdown -> sticky -> modal-backdrop -> modal -> toast -> tooltip). Never arbitrary values.

### Motion

- Motion should be intentional, not an afterthought. Consider it as part of the build.
- Don't animate CSS layout properties unless truly needed.
- Ease out with exponential curves (ease-out-quart / quint / expo). No bounce, no elastic.
- Use libraries for advanced motion (motion, gsap, anime.js, lenis).
- Reduced motion is not optional. Every animation needs a `@media (prefers-reduced-motion: reduce)` alternative.
- Staggering items within one list is legitimate. The tell is the uniform reflex (identical entrance on every section).
- Reveal animations must enhance an already-visible default. Don't gate content visibility on class-triggered transitions.
- Premium motion materials: blur, backdrop-filter, clip-path, mask, shadow/glow are part of the palette when they improve the effect.

### Interaction

- Dropdowns rendered with `position: absolute` inside `overflow: hidden` containers will be clipped. Use native `<dialog>` / popover API, `position: fixed`, or a portal.

### Copy

- Every word earns its place. No restated headings, no intros that repeat the title.
- **No em dashes.** Use commas, colons, semicolons, periods, or parentheses.
- **No aphoristic-cadence body copy as default voice.** Don't fall into "serious statement, then punchy short negation" as recurring voice.
- **No marketing buzzwords.** No streamline / empower / supercharge / leverage / unleash / transform / seamless / world-class / enterprise-grade / next-generation / cutting-edge / game-changer / mission-critical. Pick specific nouns and verbs.
- Button labels: verb + object. "Save changes" beats "OK"; "Delete project" beats "Yes".
- Link text needs standalone meaning. "View pricing plans" beats "Click here".

---

## Absolute Bans

Match-and-refuse. If you're about to write any of these, rewrite.

1. **Side-stripe borders.** `border-left` or `border-right` > 1px as colored accent on cards/alerts. Rewrite with full borders, background tints, or nothing.
2. **Gradient text.** `background-clip: text` + gradient background. Use a single solid color.
3. **Glassmorphism as default.** Blurs and glass cards used decoratively. Rare and purposeful, or nothing.
4. **The hero-metric template.** Big number, small label, supporting stats, gradient accent. SaaS cliche.
5. **Identical card grids.** Same-sized cards with icon + heading + text, repeated endlessly.
6. **Tiny uppercase tracked eyebrow above every section.** One named kicker as deliberate brand system is voice; eyebrow on every section is AI grammar.
7. **Numbered section markers as default scaffolding (01 / 02 / 03).** Numbers earn their place only when the section IS a sequence.
8. **Text that overflows its container.** Test heading copy at every breakpoint.

---

## The AI Slop Test

If someone could look at this interface and say "AI made that" without doubt, it's failed.

**Category-reflex check (two altitudes):**
- **First-order:** if someone could guess the theme + palette from the category alone, it's the first training-data reflex. Rework.
- **Second-order:** if someone could guess the aesthetic family from category-plus-anti-references, it's the trap one tier deeper. Rework until both answers are not obvious.

---

## The Cream/Sand/Beige Ban (New Projects)

The warm-neutral band (OKLCH L 0.84-0.97, C < 0.06, hue 40-100) reads as cream/sand/paper/parchment. Token names like `--paper`, `--cream`, `--sand`, `--bone`, `--flour`, `--linen` are tells themselves.

If the brief is "warm, traditional" DO NOT translate into warm-tinted bg. Instead:
- (a) A saturated brand color as body (terracotta, oxblood, deep ochre, near-black)
- (b) A true off-white at chroma 0
- (c) A darker mid-tone tinted neutral clearly the brand's own

"Warmth" is carried by accent + typography + imagery, not body background.

---

## Commands (Mental Model)

Use these as design modes when working on UI:

| Mode | When to Use |
|---|---|
| craft | Build a feature end-to-end |
| shape | Plan UX/UI before writing code |
| critique | UX design review with heuristic scoring |
| audit | Technical quality checks (a11y, perf, responsive) |
| polish | Final quality pass before shipping |
| bolder | Amplify safe or bland designs |
| quieter | Tone down aggressive or overstimulating designs |
| distill | Strip to essence, remove complexity |
| harden | Production-ready: errors, i18n, edge cases |
| animate | Add purposeful animations and motion |
| colorize | Add strategic color to monochromatic UIs |
| typeset | Improve typography hierarchy and fonts |
| layout | Fix spacing, rhythm, and visual hierarchy |
| delight | Add personality and memorable touches |
| clarify | Improve UX copy, labels, and error messages |
| adapt | Adapt for different devices and screen sizes |
| optimize | Diagnose and fix UI performance |

---

## Theme Selection Process

Before choosing dark vs. light: write one sentence of physical scene - who uses this, where, under what ambient light, in what mood. If the sentence doesn't force the answer, it's not concrete enough.

---

## RGSS Project Application

For Royal Glow Salon & Spa customer-facing pages:
- **Register:** Brand (design IS the product for customer pages)
- **Audience:** Beauty/wellness consumers in Bengaluru, mobile-first
- **Scene:** Customer browsing on phone, likely in well-lit environment, looking for premium salon experience
- **Color strategy:** Committed - brand identity drives the surface
- **Motion:** Intentional micro-interactions on booking flow, scroll reveals on service pages
- **Typography:** Premium display font + clean body, Indian locale considerations (DD/MM/YYYY, INR formatting)
