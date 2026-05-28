# Royal Glow Salon & SPA — Style Reference
> Royal Warmth Aesthetic

**Theme:** light

Royal Glow employs a 'Royal Warmth' aesthetic: a pristine white canvas combined with warm gold accents and rich chocolate typography creates an impression of luxury, warmth, and premium care. Components utilise generous spacing and subtle shadow work to define interactive zones. The signature Royal Gold provides a luminous accent for primary actions and highlights, while the deep chocolaty tones ground the interface with richness and sophistication. This design system targets a premium Indian salon experience.

**Logo file:** `Royal Glow Logo.png` (located in this folder)

**Locale conventions:** All prices in ₹ (INR), dates in DD/MM/YYYY format, Indian English spelling.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Canvas White | `#ffffff` | `--color-canvas-white` | Page backgrounds, card surfaces, UI elements requiring clean separation |
| Cocoa Dark | `#1A0F0A` | `--color-cocoa-dark` | Primary text, critical borders, dark backgrounds for hero sections. A rich chocolaty black. |
| Cloud Gray | `#f4f5f9` | `--color-cloud-gray` | Subtle background for ghost buttons and secondary content cards |
| Warm Gray | `#3D2E1F` | `--color-warm-gray` | Secondary text, less prominent UI elements. Chocolate-tinted dark neutral. |
| Rich Chocolate | `#2D1810` | `--color-rich-chocolate` | Elevated card backgrounds, dark accents for premium feel |
| Dusty Gray | `#8c8c8c` | `--color-dusty-gray` | Muted text or icon accents, placeholder states |
| Outline Gray | `#cccccc` | `--color-outline-gray` | Hairline borders, subtle dividers |
| Royal Gold | `#F4E09B` | `--color-royal-gold` | Primary action backgrounds, interactive highlights — a warm, luminous gold presence against the neutral interface |
| Warm Cream | `#FFF8E7` | `--color-warm-cream` | Alternative accent background for banners or themed cards, a softer complement to Royal Gold |
| Golden Mist | `#FFF3D4` | `--color-golden-mist` | Subtle background for notification cards or soft promotional panels |
| Deep Gold | `#C8A961` | `--color-deep-gold` | Illustrative accents, decorative highlights, small icon fills — used sparingly to create warm luxurious points of interest |
| Warm Gold | `#F4E09B` | `--color-warm-gold` | Primary action color for filled buttons, selected navigation states, and focused conversion moments. Main CTA fill. |
| Warm Stone | `#D4C5A9` | `--color-warm-stone` | Subtle decorative strokes, icon outlines, or very light text in specific contexts |


## Tokens — Typography

### Inter — The primary typeface for all text elements. Features a wide range of weights, used dynamically for commanding headlines, legible body text, and distinct button labels. The tighter letter-spacing especially at larger sizes contributes to a crisp, modern aesthetic. · `--font-primary`
- **Font:** Inter (free, widely available via Google Fonts, similar crispness to soehne)
- **Substitute:** ui-sans-serif, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif
- **Weights:** 400, 500, 600, 700, 900
- **Sizes:** 11px, 12px, 13px, 14px, 15px, 16px, 17px, 18px, 20px, 22px, 28px, 32px, 40px, 48px, 64px, 72px, 96px
- **Line height:** 0.80, 0.90, 1.00, 1.03, 1.10, 1.15, 1.20, 1.35, 1.50
- **Letter spacing:** -0.025em for large headlines, gradually relaxing to normal for body text. Tighter tracking for display sizes enhances the modern, precise feel.
- **Role:** The primary typeface for all text elements. Features a wide range of weights, used dynamically for commanding headlines, legible body text, and distinct button labels. The tighter letter-spacing especially at larger sizes contributes to a crisp, modern aesthetic.

### Type Scale

| Role | Size | Line Height | Letter Spacing | Token |
|------|------|-------------|----------------|-------|
| caption | 11px | 1.5 | 0.05px | `--text-caption` |
| body | 15px | 1.35 | — | `--text-body` |
| subheading | 22px | 1.2 | — | `--text-subheading` |
| heading-sm | 28px | 1.15 | — | `--text-heading-sm` |
| heading | 48px | 1.1 | -0.96px | `--text-heading` |
| heading-lg | 72px | 1.03 | -1.44px | `--text-heading-lg` |
| display | 96px | 0.9 | -2.4px | `--text-display` |


## Tokens — Spacing & Shapes

**Density:** comfortable

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 7 | 7px | `--spacing-7` |
| 8 | 8px | `--spacing-8` |
| 10 | 10px | `--spacing-10` |
| 12 | 12px | `--spacing-12` |
| 14 | 14px | `--spacing-14` |
| 16 | 16px | `--spacing-16` |
| 20 | 20px | `--spacing-20` |
| 21 | 21px | `--spacing-21` |
| 24 | 24px | `--spacing-24` |
| 32 | 32px | `--spacing-32` |
| 36 | 36px | `--spacing-36` |
| 40 | 40px | `--spacing-40` |
| 42 | 42px | `--spacing-42` |
| 44 | 44px | `--spacing-44` |
| 48 | 48px | `--spacing-48` |
| 80 | 80px | `--spacing-80` |

### Border Radius

| Element | Value |
|---------|-------|
| pill | 9999px |
| cards | 6px |
| buttons | 8px |
| default | 4px |

### Layout

- **Page max-width:** 1278px
- **Section gap:** 80px
- **Card padding:** 16px
- **Element gap:** 10px


## Components

### Hero Dark Card
**Role:** Prominent information display — Hero banner

A large, dark surface with a #1A0F0A (Cocoa Dark) background, 6px border-radius, and generous 80px padding on all sides. Used for dramatic, text-heavy introductory blocks. The hero banner features "Royal Glow Salon & SPA" as the headline with a centred "Book Now" button below.

### Primary Action Button
**Role:** Call to action

Filled with Warm Gold (#F4E09B), text is Cocoa Dark (#1A0F0A), 8px border-radius, 48px vertical padding, 44px horizontal padding. A visually commanding element that draws the eye with its warm, luminous gold fill. Used for "Book Now", "Reserve Slot", and primary conversion CTAs.

### Ghost Pill Button
**Role:** Secondary action or tag

Transparent background with Canvas White (#ffffff) text and border. Features an extreme 9999px border-radius for a pill shape and minimal 0px vertical, 12px horizontal padding. Used for subtle categorisation or less prominent actions on dark backgrounds.

### Subtle Background Button
**Role:** Informational button or filter

Uses Cloud Gray (#f4f5f9) as background, Cocoa Dark (#1A0F0A) for text, 8px border-radius, and significant 48px vertical, 44px horizontal padding. Less assertive than the primary action, but still prominent. Used for filters like "All Services", "Hair", "Skin", "Nails".

### Feature Grid Card
**Role:** Display individual features or services

A Canvas White (#ffffff) background, 6px border-radius, with crisp implicit content padding, often appearing in grid layouts. Defines distinct content blocks within a section. Used for service cards, stylist profiles, and package displays.

### Dark Overlay Promo Card
**Role:** Specialised content highlight

A card with Rich Chocolate (#2D1810) background, 6px border-radius, and often no explicit padding (content manages its own internal spacing). Used for high-contrast promotional items such as membership offers, seasonal packages, or VIP experiences.

### Accordion Item
**Role:** Collapsible content area

Uses Canvas White (#ffffff) background with an Outline Gray (#cccccc) 1px border. Text is Cocoa Dark (#1A0F0A). Active state highlights with a touch of Deep Gold (#C8A961). Used for FAQ sections, service details expansion, and pricing breakdowns.


## Do's and Don'ts

### Do
- Prioritise Canvas White (#ffffff) as the primary background for all page sections unless an intentional dark contrast is required.
- Use Cocoa Dark (#1A0F0A) for all primary text elements and critical borders to maintain high contrast and warmth.
- Apply Warm Gold (#F4E09B) specifically for primary calls to action (Book Now, Reserve, Confirm), ensuring it stands out against neutral backgrounds.
- Incorporate 6px border-radius for all cards and container elements to maintain a consistent subtle softening.
- Maintain an 'elementGap' of 10px where distinct elements require separation in horizontal or vertical stacks.
- Use the Inter typeface with specific negative letter-spacing for headlines (e.g., -0.025em at 96px) to achieve a modern, condensed feel.
- Ensure generous vertical section spacing of 80px between major content blocks to create a comfortable rhythm.
- Display all prices in ₹ (Indian Rupees) and dates in DD/MM/YYYY format.
- Reference the `Royal Glow Logo.png` for all brand mark placements.

### Don't
- Do not introduce new vibrant colours unless they serve a specific brand or semantic function; maintain the warm gold and chocolate palette with precise accent usage.
- Avoid heavy drop shadows or intrusive gradients; surfaces should primarily be flat or have minimal depth created by a single solid border.
- Do not use generic system fonts; always specify Inter or its recommended substitute with defined weights and line heights.
- Refrain from using small radius values (e.g., 2px) on cards or buttons; maintain 6px for cards and 8px for buttons, with 9999px for pill-shaped elements.
- Do not break content beyond the 1278px pageMaxWidth; all main content should be horizontally centred within these bounds.
- Avoid unnecessary visual clutter. The system thrives on clear visual hierarchy and ample whitespace.
- Do not use plain, neutral grays for interactive states; interactive elements should leverage Warm Gold (#F4E09B) or Deep Gold (#C8A961) for a distinct visual change.
- Do not use cool-toned blues or purples; all accent tones should remain within the warm gold/cream spectrum.


## Agent Prompt Guide

### Quick Colour Reference
- text: #1A0F0A (Cocoa Dark)
- background: #ffffff (Canvas White)
- border: #cccccc (Outline Gray)
- accent: #C8A961 (Deep Gold)
- primary action: #F4E09B (Warm Gold — filled action button)

### 3-5 Example Component Prompts
1. **Create a Hero Dark Card:** Use background #1A0F0A (Cocoa Dark), border-radius 6px, and 80px padding. Place an Inter weight 900 headline at 64px reading "Royal Glow Salon & SPA", colour #ffffff (Canvas White), with letter-spacing -1.6px. Include a Primary Action Button below it with text "Book Now", centred.
2. **Create a Primary Action Button:** #F4E09B (Warm Gold) background, #1A0F0A (Cocoa Dark) text, 9999px radius, compact pill padding. Use this filled treatment for the main CTA such as "Book Now" or "Reserve Your Slot".
3. **Design a Feature Grid Card (Service Card):** Use background #ffffff (Canvas White), border-radius 6px. Include an Inter weight 600 heading at 20px reading the service name, colour #1A0F0A (Cocoa Dark), price in ₹ at 15px, and body text at 15px, colour #3D2E1F (Warm Gray). Maintain at least 16px internal padding for content.
4. **Create an Accordion Section (FAQ):** Each item has a #ffffff (Canvas White) background, 1px solid #cccccc (Outline Gray) border. Title is Inter weight 500 at 18px, colour #1A0F0A (Cocoa Dark). In the active state, highlight the expanding area with a touch of #C8A961 (Deep Gold) on the toggle icon or left border.


## Similar Brands

- **Glossier** — Shares a warm, inviting aesthetic with generous whitespace, soft accent colours, and a focus on premium beauty experiences.
- **Aesop** — Exhibits a similar approach to luxury through restraint, featuring rich earthy tones, clean typography, and minimal yet powerful layouts.
- **Byredo** — Uses a comparable warm-neutral palette with gold accents, creating an atmosphere of understated luxury and exclusivity.
- **Charlotte Tilbury** — Employs warm golds and rich darks to convey glamour and premium positioning in the beauty space, similar to Royal Glow's warmth.


## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-canvas-white: #ffffff;
  --color-cocoa-dark: #1A0F0A;
  --color-cloud-gray: #f4f5f9;
  --color-warm-gray: #3D2E1F;
  --color-rich-chocolate: #2D1810;
  --color-dusty-gray: #8c8c8c;
  --color-outline-gray: #cccccc;
  --color-royal-gold: #F4E09B;
  --color-warm-cream: #FFF8E7;
  --color-golden-mist: #FFF3D4;
  --color-deep-gold: #C8A961;
  --color-warm-gold: #F4E09B;
  --color-warm-stone: #D4C5A9;

  /* Typography — Font Families */
  --font-primary: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-caption: 11px;
  --leading-caption: 1.5;
  --tracking-caption: 0.05px;
  --text-body: 15px;
  --leading-body: 1.35;
  --text-subheading: 22px;
  --leading-subheading: 1.2;
  --text-heading-sm: 28px;
  --leading-heading-sm: 1.15;
  --text-heading: 48px;
  --leading-heading: 1.1;
  --tracking-heading: -0.96px;
  --text-heading-lg: 72px;
  --leading-heading-lg: 1.03;
  --tracking-heading-lg: -1.44px;
  --text-display: 96px;
  --leading-display: 0.9;
  --tracking-display: -2.4px;


  /* Typography — Weights */
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  --font-weight-black: 900;

  /* Spacing */
  --spacing-7: 7px;
  --spacing-8: 8px;
  --spacing-10: 10px;
  --spacing-12: 12px;
  --spacing-14: 14px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-21: 21px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-36: 36px;
  --spacing-40: 40px;
  --spacing-42: 42px;
  --spacing-44: 44px;
  --spacing-48: 48px;
  --spacing-80: 80px;

  /* Layout */
  --page-max-width: 1278px;
  --section-gap: 80px;
  --card-padding: 16px;
  --element-gap: 10px;

  /* Border Radius */
  --radius-md: 4px;
  --radius-lg: 8px;
  --radius-full: 9999px;

  /* Named Radii */
  --radius-pill: 9999px;
  --radius-cards: 6px;
  --radius-buttons: 8px;
  --radius-default: 4px;
}
```


### Tailwind v4

```css
@theme {
  /* Colors */
  --color-canvas-white: #ffffff;
  --color-cocoa-dark: #1A0F0A;
  --color-cloud-gray: #f4f5f9;
  --color-warm-gray: #3D2E1F;
  --color-rich-chocolate: #2D1810;
  --color-dusty-gray: #8c8c8c;
  --color-outline-gray: #cccccc;
  --color-royal-gold: #F4E09B;
  --color-warm-cream: #FFF8E7;
  --color-golden-mist: #FFF3D4;
  --color-deep-gold: #C8A961;
  --color-warm-gold: #F4E09B;
  --color-warm-stone: #D4C5A9;

  /* Typography */
  --font-primary: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-caption: 11px;
  --leading-caption: 1.5;
  --tracking-caption: 0.05px;
  --text-body: 15px;
  --leading-body: 1.35;
  --text-subheading: 22px;
  --leading-subheading: 1.2;
  --text-heading-sm: 28px;
  --leading-heading-sm: 1.15;
  --text-heading: 48px;
  --leading-heading: 1.1;
  --tracking-heading: -0.96px;
  --text-heading-lg: 72px;
  --leading-heading-lg: 1.03;
  --tracking-heading-lg: -1.44px;
  --text-display: 96px;
  --leading-display: 0.9;
  --tracking-display: -2.4px;

  /* Spacing */
  --spacing-7: 7px;
  --spacing-8: 8px;
  --spacing-10: 10px;
  --spacing-12: 12px;
  --spacing-14: 14px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-21: 21px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-36: 36px;
  --spacing-40: 40px;
  --spacing-42: 42px;
  --spacing-44: 44px;
  --spacing-48: 48px;
  --spacing-80: 80px;

  /* Border Radius */
  --radius-md: 4px;
  --radius-lg: 8px;
  --radius-full: 9999px;
}
```
