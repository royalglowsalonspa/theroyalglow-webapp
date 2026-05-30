# Design Brief — Royal Glow Salon & SPA

> Single-file design reference for AI design agents (Lovable, Stitch, Figma AI, v0, Galileo). Contains everything needed to generate consistent, high-fidelity mockups for the entire application.

---

## 1. Brand Identity

- **Business:** Royal Glow Salon & SPA — Premium beauty salon and day spa in Bengaluru, India
- **Personality:** Luxurious, warm, inviting, confident, modern Indian premium
- **Tone:** Royal, elegant but approachable (not cold/clinical)
- **Target audience:** Women 20-45, premium Indian urban market
- **Tagline:** "Where beauty meets royalty"
- **Design mood:** Aesop + Charlotte Tilbury + Mews.com editorial

---

## 2. Design Tokens

### Colours — Brand

| Token | Hex | Usage |
|-------|-----|-------|
| `royal-gold` | `#F4E09B` | Primary CTA fill, accent highlights |
| `deep-gold` | `#C8A961` | Links, numerals, primary hover, outlines |
| `warm-gold` | `#F4E09B` | Alias of royal-gold |
| `warm-stone` | `#D4C5A9` | Muted gold neutral |
| `warm-cream` | `#FFF8E7` | Hero secondary card, CTA section bg |
| `golden-mist` | `#FFF3D4` | Announcement bar, pill hover bg |

### Colours — Neutrals

| Token | Hex | Usage |
|-------|-----|-------|
| `canvas-white` | `#FFFFFF` | Page background — dominant bright canvas |
| `cocoa-dark` | `#1A0F0A` | Primary text, dark hero card bg |
| `rich-chocolate` | `#2D1810` | Offer cards bg |
| `warm-gray` | `#3D2E1F` | Body / secondary text |
| `dusty-gray` | `#8C8C8C` | Tertiary text, timestamps |
| `outline-gray` | `#CCCCCC` | Inactive indicators, borders |
| `cloud-gray` | `#F4F5F9` | Card borders, dividers, ghost btn bg |

### Colours — Functional

| Token | Hex | Usage |
|-------|-----|-------|
| `success` | `#3F7D5C` | Confirmations, positive states |
| `warning` | `#C8A961` | Reuses deep-gold |
| `error` | `#B5482E` | Form errors, destructive actions |

### Colours — Accent

| Token | Hex | Usage |
|-------|-----|-------|
| `accent-pink` | `#F8C8D8` | Review avatar circles |

### Status Badge Colours

| Status | Colour | Background |
|--------|--------|------------|
| Pending | `deep-gold` | `golden-mist` |
| Confirmed | `success` | light green |
| In Progress | `deep-gold` | `warm-cream` |
| Completed | `dusty-gray` | `cloud-gray` |
| Cancelled | `error` | light red |
| Rejected | `error` outline | Transparent |
| No-Show | dark `error` | light red |

### Typography

| Variable | Font | Weight | Role |
|----------|------|--------|------|
| `--font-display` | Cabinet Grotesk | 900 (Black) | Headlines H1–H3, brand wordmark |
| `--font-sans` | Clash Grotesk | 400 (Regular) | Body, quotes, descriptions |
| `--font-ui` | Plus Jakarta Sans | 700 (Bold) | Buttons, nav, pills, eyebrows, badges |

**Font sources:**
- Cabinet Grotesk — [Fontshare](https://www.fontshare.com/fonts/cabinet-grotesk) (free, commercial use)
- Clash Grotesk — [Fontshare](https://www.fontshare.com/fonts/clash-grotesk) (free, commercial use)
- Plus Jakarta Sans — [Google Fonts](https://fonts.google.com/specimen/Plus+Jakarta+Sans) (open source, SIL OFL)

**Brand wordmarks** (product partner fonts): Cinzel (L'Oréal) · Oswald (Schwarzkopf) · Bodoni Moda italic (Lakmé) · Archivo Black (Olaplex) · Playfair Display (Wella) · Cormorant Garamond (Moroccanoil).

### Type Scale

| Class | Size | Line Height | Letter Spacing | Weight |
|-------|------|-------------|----------------|--------|
| `h-display` | `clamp(40px, 6vw, 72px)` | 1.03 | -1.44px | 900 |
| `h-xl` | `clamp(32px, 4.5vw, 48px)` | 1.1 | -0.96px | 900 |
| `h-md` | `28px` | 1.15 | — | 800 |
| Body L | `17px` | 1.6 | — | 400 |
| Body | `15px` | 1.55 | — | 400 |
| Small | `13–14px` | 1.5 | — | 400 |
| Eyebrow | `11px` | 1 | 2px | 700 / uppercase |
| Button | `12px` | 1 | 0.5px | 700 / uppercase |

### Spacing

| Token | Value |
|-------|-------|
| Container padding | 20px inline |
| Section gap | 80px vertical |
| Hero padding | 32px (mobile), 48px (tablet), 64px (desktop) |
| Card padding | 16px (small) / 32px (large) |
| Default gap | 24px |
| Page max-width | 1278px centred |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radius-cards` | `6px` | Cards, hero blocks, sections |
| `radius-buttons` | `8px` | Reserved |
| `radius-pill` | `9999px` | Buttons, pills, avatars, dots |
| `radius-testimonial` | `10px` | Review cards only |

### Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `shadow-card-hover` | `0 18px 40px -22px rgba(26,15,10,0.25)` | Card hover elevation |
| `shadow-elevated` | `0 24px 50px -20px rgba(26,15,10,0.45)` | Featured/elevated cards |

### Breakpoints

| Token | Value |
|-------|-------|
| sm | 640px |
| md (Mobile) | 768px |
| lg (Tablet) | 1024px |
| xl (Desktop) | 1280px |
| 2xl (Wide) | 1536px |

---

## 3. Component Library

### Buttons (height 40px, font-ui 12px/700, tracking 0.5px, UPPERCASE, pill radius)

| Variant | Style |
|---------|-------|
| Primary (`.btn-primary`) | bg `royal-gold` (#F4E09B), text `cocoa-dark` (#1A0F0A), hover bg `deep-gold` + translateY(-1px) |
| Ghost (`.btn-ghost`) | bg `cloud-gray` (#F4F5F9), text `cocoa-dark`, hover bg `golden-mist` |
| Outline Gold | border + text `deep-gold`, hover fill `deep-gold` + text `cocoa-dark` |
| White-on-dark | border `white/25`, hover bg `white/10`, text white |

### Card

- Background: `canvas-white` (#FFFFFF)
- Border: 1px `cloud-gray` (#F4F5F9)
- Radius: 6px
- Hover: border `golden-mist`, translateY(-2px), shadow `card-hover`
- Padding: 16px

### Offer Card

- Background: `rich-chocolate` (#2D1810)
- Text: white
- Left border: 4px solid `deep-gold` (#C8A961)
- Radius: 6px
- Padding: 32px

### Tag Pill

- bg `royal-gold` at 18% opacity
- text `royal-gold`
- font-ui 11px/700, tracking 1px, uppercase
- padding 8px 14px, radius 9999px

### Badge

- Shape: Pill (9999px radius)
- Size: 11px font-ui, padding 8px 14px
- Colours: Per status (see Status Badge Colours above)
- Font weight: 700

### Input

- Radius: 6px
- Border: 1px `outline-gray` (#CCCCCC)
- Focus ring: 2px `deep-gold` (#C8A961) outline, 2px offset
- Min height: 40px
- Padding: 12px 16px
- Placeholder: `dusty-gray` colour
- Font: font-sans (Clash Grotesk Regular)

### Toggle (Salon/SPA Selector)

- Style: Segmented control (two buttons in a pill container)
- Active: `royal-gold` fill with `cocoa-dark` text
- Inactive: Transparent with `warm-gray` text
- Font: font-ui (Plus Jakarta Sans Bold)
- Transition: Slide indicator (200ms ease)

### Accordion

- Border-bottom: 1px `outline-gray` per item
- Question: font-sans, 17px, weight 500, `cocoa-dark`
- Answer: font-sans, 15px, `warm-gray`
- "+" icon: 32px circle, 1px `outline-gray` border, rotates to "×" on expand
- Transition: height 200ms ease

### Avatar

- Shape: Rounded full (circle)
- Sizes: 32px (inline), 40px (nav), 64px (profile), 96px (large)
- Review avatars: `accent-pink` (#F8C8D8) background circle

### Dialog / Modal

| Viewport | Style |
|----------|-------|
| Desktop | Centered, 600px max-width, 6px radius, backdrop blur (8px), shadow-elevated |
| Mobile | Bottom sheet, slides up from bottom, drag handle (40px × 4px grey pill at top), full height on expand |

### Hero Dark Card

- bg `cocoa-dark` (#1A0F0A)
- radius 6px
- padding: 32px (mobile), 48px (tablet), 64px (desktop)
- Eyebrow: font-ui, 11px uppercase, tracking 2px, `warm-stone` text, `royal-gold` dot
- Headline: font-display (Cabinet Grotesk Black), h-display scale, `canvas-white`
- Body: font-sans (Clash Grotesk Regular), 17px, line 1.6, `dusty-gray`
- Buttons: btn-primary + btn-white-on-dark side by side

### Data Table (admin)

- Alternating rows: `canvas-white` / `cloud-gray`
- Sticky header row
- Sortable column headers (click to sort, arrow indicator)
- Row hover: subtle `golden-mist` background highlight
- Cell padding: 12px 16px
- Font: font-sans

### Toast

- Position: Bottom-right stack
- Auto-dismiss: 4s
- Animation: Slide in from right (200ms)
- Left border: `success` (green), `error` (red), `warning` (gold)

### Skeleton Loader

- Colour: warm cream shimmer (not cold grey)
- Animation: Shimmer left-to-right (1.5s loop)
- Shape: Matches content it replaces (rounded rectangles, 6px radius)

---

## 4. Layout Patterns

### Customer Layout (public + authenticated pages)

```
┌─────────────────────────────────────────────────────────────────┐
│  ANNOUNCEMENT BAR: golden-mist bg, "NEW · Offer text →"        │
├─────────────────────────────────────────────────────────────────┤
│  HEADER: Logo (left) · Nav links (center) · Avatar (right)     │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  MAIN CONTENT                                                     │
│  (max-width: 1278px, centered, 20px container padding)           │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│  FOOTER: Logo · Explore · Account · Admin · © 2026              │
└─────────────────────────────────────────────────────────────────┘

Mobile: Hamburger menu · sticky "Book Now" gold CTA at bottom
```

**Header details:**
- Height: 64px (desktop), 56px (mobile)
- Background: `canvas-white` with subtle bottom border (`cloud-gray`) on scroll
- Logo: Left-aligned — wreath icon + "Royal Glow" in font-display + "SALON & SPA" in font-ui 9px
- Nav links: Center-aligned, font-ui 12px uppercase, tracking 0.5px, `cocoa-dark`
- Right: User avatar (32px circle) + name in font-sans 14px
- When signed out: "Book Now" btn-primary replaces avatar
- Mobile: Logo left + hamburger right, overlay menu slides from right

**Footer details:**
- Background: `canvas-white` (light footer, bright brand)
- Top border: 1px `outline-gray`
- 4-column grid (desktop), stacked (mobile)
- Column headers: font-ui, 11px uppercase, tracking 1.5px, `deep-gold`
- Columns: Brand + Address | Explore links | Account links | Admin links
- Links: font-sans, 15px, `cocoa-dark`
- Bottom bar: © 2026 in font-sans 13px `dusty-gray`

### Admin Layout

```
┌────────────────┬─────────────────────────────────────────────────┐
│                │  TOP BAR: Breadcrumbs · Search (Cmd+K) · 🔔 · 👤│
│   SIDEBAR      ├─────────────────────────────────────────────────┤
│   (240px)      │                                                  │
│                │  PAGE CONTENT                                     │
│   - Nav items  │  (full width, scrollable)                        │
│   - Grouped    │                                                  │
│   - Role-gated │                                                  │
│                │                                                  │
│   [Sign Out]   │                                                  │
└────────────────┴─────────────────────────────────────────────────┘

Mobile: Sidebar collapses to hamburger overlay
```

**Sidebar details:**
- Width: 240px fixed
- Background: `cocoa-dark` (#1A0F0A)
- Nav items: White text, font-sans, grouped by section
- Active item: `royal-gold` left border + `royal-gold` text + subtle gold background
- Role-gated: Items hidden if user lacks permission
- Bottom: User avatar, name, role badge, "Sign Out" button

### Booking Dialog

```
Desktop: Centered modal (600px max, backdrop blur, close X)
Mobile: Bottom sheet (slides up, drag handle, full height on expand)
Both: Step indicator at top, content area, action buttons at bottom
```

**Step indicator:** Numbered circles connected by lines. Completed = `royal-gold` fill, Current = `royal-gold` ring, Future = `outline-gray` border.

---

## 5. Page-by-Page Design Instructions

### Public Pages

#### Homepage (`/`)

Two-column hero (desktop): dark hero card (left, `cocoa-dark` bg) with headline "Where beauty meets royalty." in Cabinet Grotesk Black + body text in Clash Grotesk Regular + "BOOK NOW" gold pill + "EXPLORE SERVICES" white-on-dark outline pill + category tags (HAIR, SPA, SKIN, BRIDAL, NAILS, GROOMING). Right column: large salon interior image with location info card overlay. Below hero: "Book your royal experience today" CTA section on `warm-cream` bg with 3-step process (numbered gold circles). FAQ accordion section (2-column: headline left, questions right). Light footer with 4-column links. Mobile: sticky gold "Book Now" bar fixed at viewport bottom.

#### Services (`/services`)

Salon/SPA segmented toggle at top (sticky on scroll, font-ui). Services grouped in accordion categories. Each category header in Cabinet Grotesk Black with decorative `deep-gold` underline. Each service row: name (Clash Grotesk Regular), price in ₹ (bold), duration in grey pill badge, "Book This" ghost button. SPA services have 60/90 min duration toggle (single card, not two). Premium card layout with generous spacing.

#### Offers (`/offers`)

Rich offer cards on `rich-chocolate` (#2D1810) background with 4px `deep-gold` left border. Type badges: gold pill "20% OFF", green pill "₹200 OFF", purple pill "FREE ADD-ON". Each card: title in Cabinet Grotesk Black (white text), linked services as chips, validity dates, terms in Clash Grotesk Regular. "Book Now" gold CTA. Empty state: elegant illustration + friendly text.

#### About (`/about`)

Brand story section with large Cabinet Grotesk Black headline ("The Royal Glow Story"), Clash Grotesk Regular body text. Team member cards in grid: circular avatar, name (font-display), designation (font-sans, `dusty-gray`). Values section with `cloud-gray` cards. Gallery section with masonry grid.

#### Contact (`/contact`)

Two-column on desktop: map + info (left), enquiry form (right). Address, phone (click-to-call), email, hours. Form: name, phone (+91 prefix), email, message + "Send Message" gold pill button. All inputs with `deep-gold` focus ring. Mobile: stacked, phone prominent.

#### Blog (`/blog`)

Article cards in 2-column grid (desktop), single column (mobile). Each card: featured image (16:9, 6px radius), title (Clash Grotesk Medium, 20px), excerpt (2 lines, `warm-gray`), date + read time. Category filter pills at top (font-ui, cloud-gray bg, active: royal-gold). Clean magazine feel.

#### FAQ (`/faq`)

Two-column layout: eyebrow + headline left, accordion right. Accordion groups by topic. Question in Clash Grotesk Medium (500), answer in Clash Grotesk Regular (400). "+" circle icons. "Still have questions?" CTA card at bottom on `warm-cream` bg.

---

### Authenticated Customer Pages

#### Profile (`/profile`)

Clean form layout with circular avatar at top center. Form fields: font-sans for labels and inputs. Gold "Save Changes" btn-primary.

#### My Bookings (`/bookings`)

Tab bar: "Upcoming" (active: `deep-gold` underline) | "Past" (`dusty-gray`). Booking cards stacked with status badge (tag-pill), date/time (font-display weight), services, staff, price. Action buttons per status. Empty state with illustration + gold CTA.

#### Membership (`/membership`)

Hero card with tier styling (Gold = `royal-gold` gradient). Hours remaining (large number, font-display), progress bar (`royal-gold` fill), expiry date. Session history table below.

#### Gems (`/gems`)

Large gem balance (font-display, 48px). Redeemable services card grid. Transaction history accordion.

---

### Auth Pages

#### Sign-in (`/sign-in`)

Centered card, minimal. Royal Glow logo, welcoming headline in Cabinet Grotesk Black, "Sign in with Google" button per Google branding. Privacy/Terms links in font-sans small.

#### Onboarding (`/onboarding`)

Welcome heading with user's name in Cabinet Grotesk Black. Clean form: font-sans labels/inputs. Consent section with divider. Gold "Let's Go!" btn-primary.

---

### Landing Page

#### `/book` (Meta Ad Lead Capture)

Zero nav/footer. Trust signals: "⭐ 4.9 on Google Maps · 500+ happy clients" in font-ui. Headline in Cabinet Grotesk Black. 3-field form only (name, phone, service). Full-width gold "Continue to Booking →" button. Address + phone below in font-sans `dusty-gray`. Premium funnel page feel.

---

### Admin Pages

#### Dashboard (`/admin`)

KPI cards row (4 cards): pending bookings, revenue, appointments, stale leads. Two-panel below: Today's Timeline (left), Pending Actions (right). Data-dense, efficient, touch-friendly (tablet-first).

#### Bookings List (`/admin/bookings`)

Filters row + data table. Columns: Booking #, Customer, Date/Time, Services, Staff, Status (badge), Amount. Row hover: `golden-mist` bg. Pagination at bottom.

#### Booking Detail (`/admin/bookings/[id]`)

Split layout: customer info card (left), services panel (center), status timeline (right). Action buttons based on current status.

#### Customer Profile (`/admin/customers/[id]`)

Header card with avatar, contact info, tags. KPI row. Tabbed interface: Bookings, Invoices, Membership, Gems, Notes.

#### Lead Pipeline (`/admin/leads`)

Kanban board: New → Contacted → Interested → Converted → Lost. Stale indicator (red dot if >48h). Table view toggle.

#### Schedule (`/admin/schedule`)

Calendar grid: staff rows × 30-min time columns. Colour-coded blocks (`royal-gold` = confirmed, `deep-gold` = in progress, `dusty-gray` = completed). Day/Week toggle.

#### Reports (`/admin/reports`)

Date range selector + charts (line, bar, pie). KPI summary cards. Export (CSV/PDF). Gold accent for primary data series.

#### Settings (`/admin/settings`)

Sectioned form with card containers. Toggle switches, number inputs. Per-section "Save" buttons.

---

## 6. Animation & Interaction Spec

| Interaction | Animation | Duration | Easing |
|-------------|-----------|----------|--------|
| Button hover | translateY(-1px) + bg change | 200ms | ease |
| Card hover | translateY(-2px) + shadow elevation + border change | 250ms | ease |
| Dialog open | Scale from 0.95 + fade in | 200ms | ease-out |
| Bottom sheet open | Slide up from bottom | 300ms | ease-out |
| Accordion expand | Smooth height + "+" rotates to "×" | 200ms | ease |
| Skeleton loading | Warm cream shimmer L→R | 1.5s loop | linear |
| Toast appear | Slide in from right | 200ms | ease-out |
| Toast dismiss | Fade out + slide right | 150ms | ease-in |
| Tab switch | Underline slide to active | 200ms | ease |

**Motion is restrained** — max 250ms, max translateY(-2px). Editorial calm, not playful.

**Accessibility:** Respect `prefers-reduced-motion` — disable all animations when set.

---

## 7. Accessibility Requirements

| Requirement | Implementation |
|-------------|----------------|
| Colour contrast | WCAG AA minimum. `cocoa-dark` on `canvas-white` ✓. `dusty-gray` only at ≥18px. Never gold text on white for body. |
| Focus rings | 2px `deep-gold` (#C8A961) outline with 2px offset on all interactive elements |
| Touch targets | 40px × 40px minimum on all buttons, links, inputs |
| Skip-to-content | First focusable element on every page — visually hidden until focused |
| ARIA labels | All icon-only buttons have `aria-label`. Live regions for dynamic content |
| Semantic HTML | Proper heading hierarchy (h1 → h2 → h3). Landmarks: `<nav>`, `<main>`, `<aside>`, `<footer>` |
| Form errors | Error messages linked via `aria-describedby`, announced via `aria-live="assertive"` |
| Images | Decorative: `alt=""`. Meaningful: descriptive alt text |
| Reduced motion | All animations disabled when `prefers-reduced-motion: reduce` |
| Dark mode | Not in scope for Phase 1 — light mode only |

---

## 8. Indian Context — Formatting Rules

| Format | Convention | Example |
|--------|-----------|---------|
| Dates | DD/MM/YYYY | 24/05/2026 |
| Currency | ₹X,XXX.00 (Indian comma system) | ₹1,300.00 / ₹12,500.00 |
| Phone | +91 XXXXX XXXXX | +91 63601 35720 |
| Time | 12-hour with AM/PM | 03:30 PM |
| GST | Always show "Incl. 18% GST" | Displayed near prices |
| Language | English (Indian English) | "colour" not "color" in UI copy |
| Address | Indian format | Bengaluru, Karnataka, India |

**Never** use MM/DD/YYYY date format anywhere in the application.

---

## 9. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Cabinet Grotesk Black for headlines** | Type-led hierarchy. Bold geometric sans creates luxury feel without serifs. |
| **Clash Grotesk Regular for body** | Clean, modern readability. Same foundry (Fontshare) pairs perfectly with Cabinet. |
| **Plus Jakarta Sans Bold for UI** | Crisp, slightly rounded geometric feel makes buttons and nav feel clickable. |
| **All white canvas** | `#FFFFFF` page background — bright, clean, editorial. Dark sections create dramatic contrast. |
| **No serifs in product UI** | Serifs reserved only for brand partner wordmarks (L'Oréal, Wella, etc.). |
| **No bottom tab bar** | Hamburger nav + sticky "Book Now" CTA. Not a native app pattern. |
| **Booking is a dialog overlay** | Bottom sheet on mobile, centered modal on desktop. Keeps user context. |
| **One primary CTA per screen** | Always gold pill, always clear. Never compete for attention. |
| **Admin is data-dense** | Tablet-first, touch-friendly, information density over visual luxury. |
| **No cool blues or purples** | Everything stays in the warm gold/cream/chocolate spectrum. |
| **Pill radius for all buttons** | 9999px — never square or slightly-rounded buttons. |
| **Gold as primary action colour** | Reinforces "Royal Glow" brand. Every CTA is immediately recognisable. |
| **Mobile-first for customers** | 99.99% of customer traffic is mobile. |
| **Tablet-first for admin** | Receptionists use tablet at counter. |

---

## 10. Device-Primary Strategy

> **Critical business context:** 99.99% of customers access the site on **mobile phones only**. Staff (receptionist/manager) primarily use a **tablet** at the reception counter.

### Device Priority by Audience

| Audience | Primary Device | Secondary | Tertiary |
|----------|---------------|-----------|----------|
| **Customers** (public + auth pages) | Mobile phone (99.99%) | — | — |
| **Receptionist / Manager** (admin) | Tablet (reception counter) | Laptop (back office) | Mobile (on-the-go) |
| **Staff** (stylist/therapist) | Mobile phone (checking own schedule) | Tablet (salon floor) | — |
| **Owner** (reports, analytics) | Laptop (home/office) | Tablet | Mobile |

### Responsive Breakpoint Priority (Order of Design)

**Customer pages:**
```
1st: Mobile (375px–428px)     ← Design THIS first
2nd: Mobile large (428px–768px)
3rd: Tablet (768px–1024px)     ← Bonus
4th: Desktop (1024px+)         ← Rare, but should work
```

**Admin pages:**
```
1st: Tablet (768px–1024px)     ← Design THIS first
2nd: Desktop (1024px–1440px)   ← Secondary workspace
3rd: Mobile (375px–768px)      ← Simplified on-the-go view
```

### Physical Context

| Context | Device | Position | Implication |
|---------|--------|----------|-------------|
| Customer at home browsing | Mobile | Held in one hand, portrait | Thumb zone design, bottom actions |
| Customer in salon waiting | Mobile | Held, possibly dim screen | Good contrast, readable fonts |
| Receptionist at front desk | Tablet | On counter stand or held | Touch-first, landscape orientation |
| Receptionist showing menu to customer | Tablet | Rotated toward customer | Premium visual, kiosk-like readability |
| Receptionist during checkout | Tablet | On counter, tapping | Large buttons, clear totals, fast workflow |
| Manager reviewing reports | Laptop | At desk | Standard desktop layout, charts legible |
| Stylist checking schedule | Mobile | Quick glance between clients | Minimal UI, today's appointments only |
| Owner checking revenue | Laptop or mobile | Home/office | Dashboard KPIs visible at glance |

---

## 11. File References

| Resource | Path | Content |
|----------|------|---------|
| Detailed design system | `design/UIUX_Design/DESIGN.md` | Full token spec, CSS variables, Tailwind config, component examples |
| CSS variables | `design/UIUX_Design/variables.css` | All CSS custom properties |
| Design tokens (JSON) | `design/UIUX_Design/tokens.json` | Structured token format for tools |
| Tailwind v4 theme | `design/UIUX_Design/theme.css` | `@theme` tokens + utility classes |
| Design flows | `design/` folder | ASCII wireframes and state machines for every flow |
| Page specs | `pages/` folder | Component lists, states, data sources, SEO metadata per page |
| Sitemap | `sitemap.md` | Complete navigation structure, 104 routes |
| Features | `features.md` | Business rules, booking logic, membership tiers, gems system |
| Architecture | `architecture.md` | Tech stack, infrastructure, project structure |
| Authentication | `authentication.md` | Auth flow, role hierarchy, permissions matrix |
| Database | `database-schema.md` | All 38 tables and relationships |

---

*Generated for use with Lovable, Stitch, Figma AI, v0, Galileo, and other AI design agents. Feed this entire file as context to generate consistent, brand-aligned mockups for any page in the Royal Glow Salon & SPA application.*
