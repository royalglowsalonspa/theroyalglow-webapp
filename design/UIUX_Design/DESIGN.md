# Royal Glow Salon & SPA — Design System

A premium, editorial salon brand. Warm chocolate + royal gold on bright canvas.
Built on Tailwind CSS v4 (`@theme` tokens in `src/styles.css`).

**Theme:** light
**Logo file:** `Royal Glow Logo.png` (located in this folder)
**Locale conventions:** All prices in ₹ (INR), dates in DD/MM/YYYY format, Indian English spelling.

---

## 1. Design Principles

- **Editorial calm** — generous whitespace, large display type, dark hero blocks against bright canvas.
- **Warm luxury** — chocolate browns + champagne/royal gold instead of cold neutrals.
- **Crisp geometry** — 6px card radius, pill buttons, hairline borders (`cloud-gray`).
- **Type-led hierarchy** — Cabinet Grotesk Black for headlines does the heavy lifting; color accents are secondary.
- **Motion is restrained** — 200–250ms ease, max `translateY(-2px)` lift on hover.

---

## 2. Color Tokens

### Brand

| Token | Hex | Role |
|---|---|---|
| `--color-royal-gold` | `#F4E09B` | Primary CTA fill, accent highlights |
| `--color-deep-gold` | `#C8A961` | Links, numerals, primary hover, outlines |
| `--color-warm-gold` | `#F4E09B` | Alias of royal-gold |
| `--color-warm-stone` | `#D4C5A9` | Muted gold neutral |
| `--color-warm-cream` | `#FFF8E7` | Hero secondary card, CTA section bg |
| `--color-golden-mist` | `#FFF3D4` | Announcement bar, pill hover bg |

### Neutrals

| Token | Hex | Role |
|---|---|---|
| `--color-canvas-white` | `#FFFFFF` | Page background |
| `--color-cocoa-dark` | `#1A0F0A` | Primary text, dark hero card bg |
| `--color-rich-chocolate` | `#2D1810` | Offer cards bg |
| `--color-warm-gray` | `#3D2E1F` | Secondary body text |
| `--color-dusty-gray` | `#8C8C8C` | Tertiary text, timestamps |
| `--color-outline-gray` | `#CCCCCC` | Inactive indicators, borders |
| `--color-cloud-gray` | `#F4F5F9` | Card borders, dividers, ghost btn bg |

### Functional

| Token | Hex | Role |
|---|---|---|
| `--color-success` | `#3F7D5C` | Confirmations |
| `--color-warning` | `#C8A961` | Reuses deep-gold |
| `--color-error` | `#B5482E` | Form errors, destructive actions |

### Accent

| Token | Hex | Role |
|---|---|---|
| `--color-accent-pink` | `#F8C8D8` | Review avatar circles |

---

## 3. Typography

### Font Families

| Variable | Font | Weight | Role |
|---|---|---|---|
| `--font-display` | Cabinet Grotesk | 900 (Black) | Headlines H1–H3, brand wordmark |
| `--font-sans` | Clash Grotesk | 400 (Regular) | Body, quotes, descriptions |
| `--font-ui` | Plus Jakarta Sans | 700 (Bold) | Buttons, nav, pills, eyebrows, badges |

**Font sources:**
- Cabinet Grotesk — [Fontshare](https://www.fontshare.com/fonts/cabinet-grotesk) (free, commercial use)
- Clash Grotesk — [Fontshare](https://www.fontshare.com/fonts/clash-grotesk) (free, commercial use)
- Plus Jakarta Sans — [Google Fonts](https://fonts.google.com/specimen/Plus+Jakarta+Sans) (open source, SIL OFL)

### Type Scale

| Class | Size | Line Height | Letter Spacing | Weight |
|---|---|---|---|---|
| `.h-display` | `clamp(40px, 6vw, 72px)` | 1.03 | -1.44px | 900 |
| `.h-xl` | `clamp(32px, 4.5vw, 48px)` | 1.1 | -0.96px | 900 |
| `.h-md` | `28px` | 1.15 | — | 800 |
| Body L | `17px` | 1.6 | — | 400 |
| Body | `15px` | 1.55 | — | 400 |
| Small | `13–14px` | 1.5 | — | 400 |
| Eyebrow | `11px` | 1 | 2px | 700 / uppercase |

### Brand Wordmarks (product partner fonts)

| Brand | Font |
|---|---|
| L'Oréal | Cinzel |
| Schwarzkopf | Oswald |
| Lakmé | Bodoni Moda (italic) |
| Olaplex | Archivo Black |
| Wella | Playfair Display |
| Moroccanoil | Cormorant Garamond |

---

## 4. Spacing & Layout

| Token | Value | Use |
|---|---|---|
| `--page-max-width` | `1278px` | Container max-width |
| Container padding | `20px` inline | `.container-rg` |
| Section rhythm | `80px` | Between major sections |
| Hero padding | `p-8 sm:p-12 lg:p-16` | Hero cards |
| Card padding | `16px` (small) / `32px` (large) | Service / offer / CTA cards |
| Default gap | `24px` (`gap-6`) | Grids |
| Wide gap | `gap-12 lg:gap-16` | Two-column layouts |

**Breakpoints** (Tailwind defaults): `sm 640` · `md 768` · `lg 1024` · `xl 1280` · `2xl 1536`.

---

## 5. Radius, Shadow, Motion

### Radius

| Token | Value | Use |
|---|---|---|
| `--radius-cards` | `6px` | Cards, hero blocks, sections |
| `--radius-buttons` | `8px` | Reserved (pills preferred) |
| `--radius-pill` | `9999px` | Buttons, pills, avatars, dots |
| Testimonial | `10px` | Review cards only |

### Shadow

| Name | Value | Use |
|---|---|---|
| `--shadow-card-hover` | `0 18px 40px -22px rgba(26,15,10,0.25)` | Card hover state |
| `--shadow-elevated` | `0 24px 50px -20px rgba(26,15,10,0.45)` | Featured review card |

### Motion

- Buttons: `transform 0.2s ease, background 0.2s ease`
- Cards: `box-shadow 0.25s ease, transform 0.25s ease, border-color 0.25s ease`
- Hover lift: `translateY(-1px)` (buttons) / `translateY(-2px)` (cards)

---

## 6. Components

### Buttons (height 40px, font-ui 12px/700, tracking 0.5px, UPPERCASE)

| Variant | Style |
|---|---|
| `.btn-primary` | bg `royal-gold` → hover `deep-gold` + lift; text `cocoa-dark` |
| `.btn-ghost` | bg `cloud-gray` → hover `golden-mist`; text `cocoa-dark` |
| Outline gold | border + text `deep-gold` → hover fill `deep-gold` on `cocoa-dark` |
| White-on-dark | border `white/25`, hover bg `white/10`, text white |

### Tag Pill

- bg `royal-gold` at 18% opacity
- text `royal-gold`
- 11px/700, tracking 1px
- padding `8px 14px`
- radius `9999px` (pill)

### Card

- bg white
- radius 6px
- border 1px `cloud-gray`
- Hover: border `golden-mist`, lift `-2px`, shadow `card-hover`

### Offer Card

- bg `rich-chocolate` (#2D1810)
- text white
- left border `4px solid deep-gold` (#C8A961)
- padding `32px`
- radius 6px

### Featured Review Card

- bg `cocoa-dark` (#1A0F0A)
- text white
- radius `10px`
- shadow `elevated`

### Accordion Item

- bg `canvas-white`
- border-bottom: 1px `outline-gray`
- Question: font-sans, 17px, weight 500, cocoa-dark
- "+" icon: 32px circle, 1px outline-gray border, rotates to "×" on expand
- Answer: font-sans, 15px, warm-gray

### Hero Dark Card

- bg `cocoa-dark` (#1A0F0A)
- radius 6px
- padding: 32px (mobile), 48px (tablet), 64px (desktop)
- Eyebrow: font-ui, 11px uppercase, tracking 2px, warm-stone text, royal-gold dot
- Headline: font-display, h-display scale, canvas-white
- Body: font-sans, 17px, line 1.6, dusty-gray

---

## 7. Tailwind v4 — `src/styles.css`

Tailwind v4 reads tokens from `@theme`. Any `--color-*` becomes `bg-*`, `text-*`, `border-*` automatically. Any `--font-*` becomes `font-*`.

```css
@import "tailwindcss" source(none);
@source "../src";

@theme {
  /* Colors — Brand */
  --color-royal-gold: #F4E09B;
  --color-deep-gold: #C8A961;
  --color-warm-gold: #F4E09B;
  --color-warm-stone: #D4C5A9;
  --color-warm-cream: #FFF8E7;
  --color-golden-mist: #FFF3D4;

  /* Colors — Neutrals */
  --color-canvas-white: #FFFFFF;
  --color-cocoa-dark: #1A0F0A;
  --color-rich-chocolate: #2D1810;
  --color-warm-gray: #3D2E1F;
  --color-dusty-gray: #8C8C8C;
  --color-outline-gray: #CCCCCC;
  --color-cloud-gray: #F4F5F9;

  /* Colors — Functional */
  --color-success: #3F7D5C;
  --color-warning: #C8A961;
  --color-error: #B5482E;

  /* Colors — Accent */
  --color-accent-pink: #F8C8D8;

  /* Fonts */
  --font-display: 'Cabinet Grotesk', ui-sans-serif, system-ui, sans-serif;
  --font-sans: 'Clash Grotesk', ui-sans-serif, system-ui, sans-serif;
  --font-ui: 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif;

  /* Radius */
  --radius-cards: 6px;
  --radius-buttons: 8px;
  --radius-pill: 9999px;

  /* Shadows */
  --shadow-card-hover: 0 18px 40px -22px rgba(26, 15, 10, 0.25);
  --shadow-elevated: 0 24px 50px -20px rgba(26, 15, 10, 0.45);

  /* Layout */
  --container-rg: 1278px;
}
```

### Usage Examples

```tsx
{/* Headline */}
<h1 className="font-display text-cocoa-dark tracking-[-1.44px] leading-[1.03]">
  Where beauty meets royalty.
</h1>

{/* Primary CTA */}
<button className="bg-royal-gold text-cocoa-dark font-ui text-xs uppercase tracking-wider rounded-full px-6 py-3 hover:bg-deep-gold hover:-translate-y-px transition-all duration-200">
  BOOK NOW
</button>

{/* Offer card */}
<div className="bg-rich-chocolate text-canvas-white border-l-4 border-deep-gold rounded-[6px] p-8">
  ...
</div>

{/* Body text */}
<p className="font-sans text-warm-gray text-[15px] leading-[1.55]">
  A premium salon and spa experience in Bengaluru.
</p>
```

---

## 8. Accessibility

- All body text ≥ 15px on `canvas-white` meets WCAG AA against `cocoa-dark` / `warm-gray`.
- `dusty-gray` (#8C8C8C) on white passes AA only at ≥18px — use for timestamps and meta, never body copy.
- `royal-gold` text on `cocoa-dark` passes AA at large sizes; never use gold text on white for body.
- Focus state: `outline: 2px solid var(--color-deep-gold); outline-offset: 2px;`
- All touch targets: minimum 40px × 40px.
- Respect `prefers-reduced-motion` — disable all animations when set.

---

## 9. Do / Don't

### Do

- Use `--font-display` (Cabinet Grotesk Black) for any headline ≥ 24px.
- Use `--font-sans` (Clash Grotesk Regular) for all body text, descriptions, quotes.
- Use `--font-ui` (Plus Jakarta Sans Bold) for buttons, nav, pills, badges, eyebrows.
- Pair dark chocolate blocks with cream/white blocks for editorial rhythm.
- Keep CTAs gold; secondary actions stay neutral (cloud-gray ghost buttons).
- Use pill radius (9999px) for all buttons — never square buttons.
- Display all prices in ₹ (Indian Rupees) with Indian comma system.
- Use DD/MM/YYYY date format everywhere.

### Don't

- Don't introduce new colours outside this palette — extend `@theme` instead.
- Don't use serif fonts in product UI (reserved for brand wordmarks only).
- Don't stack more than two gold elements in one viewport — gold is an accent.
- Don't use cool blues, purples, or grey-blues — everything warm spectrum only.
- Don't use Inter, Helvetica, or other generic sans fonts — use Clash Grotesk for body.
- Don't use heavy drop shadows or gradients — keep surfaces flat with hairline borders.
- Don't break content beyond the 1278px page max-width.

---

## 10. Similar Brands (design mood)

- **Aesop** — Luxury through restraint, rich earthy tones, clean typography.
- **Charlotte Tilbury** — Warm golds and rich darks for glamour and premium positioning.
- **Glossier** — Warm, inviting aesthetic with generous whitespace.
- **Mews.com** — Editorial web design, type-led, clean geometry.

---

## 11. Quick Colour Reference (for AI agents)

```
text:           #1A0F0A (Cocoa Dark)
background:     #FFFFFF (Canvas White)
border:         #CCCCCC (Outline Gray)
accent:         #C8A961 (Deep Gold)
primary action: #F4E09B (Royal Gold — filled CTA button)
body font:      Clash Grotesk Regular (400)
headline font:  Cabinet Grotesk Black (900)
ui font:        Plus Jakarta Sans Bold (700)
```

---

*Generated for use with Lovable, Stitch, Figma AI, v0, Galileo, and other AI design agents. Feed this entire file as context to generate consistent, brand-aligned mockups for any page in the Royal Glow Salon & SPA application.*
