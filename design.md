# Design Brief — Royal Glow Salon & SPA

> Single-file design reference for AI design agents (Stitch, Figma AI, v0, Galileo). Contains everything needed to generate consistent, high-fidelity mockups for the entire application.

---

## 1. Brand Identity

- **Business:** Royal Glow Salon & SPA — Premium beauty salon and day spa in Bengaluru, India
- **Personality:** Luxurious, warm, inviting, confident, modern Indian premium
- **Tone:** Royal, elegant but approachable (not cold/clinical)
- **Target audience:** Women 20-45, premium Indian urban market
- **Tagline suggestion:** "Where beauty meets royalty" or "Your Royal Glow moment awaits"

---

## 2. Design Tokens

### Colours

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#C8A961` | Rich warm gold — buttons, accents, links |
| Primary Dark | `#A07D3A` | Deep gold — hover states, active states |
| Secondary | `#6B2D5B` | Royal Purple/Plum — secondary actions, highlights |
| Background | `#FFFDF7` | Warm white — page backgrounds (not pure white) |
| Surface | `#FFF8F0` | Cream — card backgrounds, elevated surfaces |
| Text Primary | `#1A1A1A` | Deep charcoal — headings, body text |
| Text Secondary | `#6B6B6B` | Warm grey — captions, descriptions |
| Text Muted | `#9CA3AF` | Light grey — placeholders, disabled text |
| Success | `#10B981` | Emerald green — confirmations, positive states |
| Warning | `#F59E0B` | Amber — pending actions, caution |
| Error | `#EF4444` | Rose red — errors, destructive actions |
| Info | `#3B82F6` | Sky blue — informational notices |

### Status Badge Colours

| Status | Colour | Background |
|--------|--------|------------|
| Pending | Amber `#F59E0B` | `amber-50` |
| Confirmed | Green `#10B981` | `green-50` |
| In Progress | Blue `#3B82F6` | `blue-50` |
| Completed | Grey `#6B7280` | `grey-50` |
| Cancelled | Red `#EF4444` | `red-50` |
| Rejected | Red outline `#EF4444` | Transparent |
| No-Show | Dark Red `#991B1B` | `red-100` |

### Typography

| Property | Value |
|----------|-------|
| Body font | Inter |
| Heading font | Playfair Display or Cormorant Garamond (premium serif) |
| Scale | 12px, 14px, 16px (base), 18px, 20px, 24px, 30px, 36px, 48px, 60px |
| Body | 16px / 1.6 line-height |
| Headings | Tight line-height (1.2) |
| Weight — Body | 400 (regular) |
| Weight — Medium | 500 |
| Weight — Semibold | 600 |
| Weight — Bold | 700 |

### Spacing

| Token | Value |
|-------|-------|
| Base unit | 4px |
| Scale | 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128 |
| Section padding (desktop) | 64px |
| Section padding (mobile) | 40px |
| Card padding | 24px |
| Input padding | 12px 16px |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| Small | 6px | Badges, chips |
| Medium | 12px | Cards, inputs |
| Large | 16px | Modals, dialogs |
| Full | 9999px | Buttons (pill), avatars |

### Shadows

| Token | Value |
|-------|-------|
| sm | `0 1px 2px rgba(0,0,0,0.05)` |
| md | `0 4px 6px rgba(0,0,0,0.07)` |
| lg | `0 10px 15px rgba(0,0,0,0.1)` |
| xl | `0 20px 25px rgba(0,0,0,0.1)` |

### Breakpoints

| Token | Value |
|-------|-------|
| Mobile | < 768px |
| Tablet | 768px–1024px |
| Desktop | > 1024px |
| Wide | > 1440px |

---

## 3. Component Library (shadcn/ui themed)

### Button

| Variant | Style |
|---------|-------|
| Primary | Gold fill (`#C8A961`), white text, pill shape (full radius), md shadow on hover, scale(1.02) on hover |
| Secondary | Outline (1px gold border), gold text, transparent fill, gold fill on hover |
| Ghost | Text only (gold colour), no border, subtle background on hover |
| Destructive | Red fill (`#EF4444`), white text, pill shape |

All buttons: 44px min height on mobile, 40px on desktop. Font weight 600.

### Card

- Background: Warm white (`#FFF8F0`)
- Border: 1px `grey-100`
- Radius: 12px (medium)
- Shadow: sm default, md on hover (elevation transition 200ms)
- Padding: 24px

### Badge

- Shape: Pill (full radius)
- Size: Small text (12px), padding 4px 10px
- Colours: Per status (see Status Badge Colours above)
- Font weight: 500

### Input

- Radius: 12px
- Border: 1px `grey-200`
- Focus ring: 2px gold (`#C8A961`) outline
- Min height: 44px (mobile), 40px (desktop)
- Padding: 12px 16px
- Placeholder: Text Muted colour

### Toggle (Salon/SPA Selector)

- Style: Segmented control (two buttons in a pill container)
- Active: Gold fill with white text
- Inactive: Transparent with grey text
- Transition: Slide indicator (200ms ease)

### Accordion

- Clean top/bottom borders per item
- Chevron icon rotates 180° on expand (200ms)
- Smooth height transition on expand/collapse
- Question: Semibold (600), Answer: Regular (400)

### Avatar

- Shape: Rounded full (circle)
- Sizes: 32px (inline), 40px (nav), 64px (profile), 96px (large)
- VIP ring: 2px gold border for premium/VIP customers

### Dialog / Modal

| Viewport | Style |
|----------|-------|
| Desktop | Centered, 600px max-width, 16px radius, backdrop blur (8px), shadow-xl |
| Mobile | Bottom sheet, slides up from bottom, drag handle (40px × 4px grey pill at top), full height on expand |

### Tab Bar

- Style: Underline tabs
- Active indicator: 2px gold bottom border
- Active text: Gold colour, font weight 600
- Inactive text: Text Secondary colour

### Data Table

- Striped rows (alternating warm white / cream)
- Sticky header row
- Sortable column headers (click to sort, arrow indicator)
- Row hover: subtle gold-50 background highlight
- Cell padding: 12px 16px

### Toast

- Position: Bottom-right stack
- Auto-dismiss: 4s
- Animation: Slide in from right (200ms)
- Variants: Success (green left border), Error (red), Info (blue), Warning (amber)

### Skeleton Loader

- Colour: Warm grey shimmer (not cold grey)
- Animation: Shimmer left-to-right (1.5s loop)
- Shape: Matches content it replaces (rounded rectangles)

---

## 4. Layout Patterns

### Customer Layout (public + authenticated pages)

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER: Logo (left) · Nav links (center) · [Sign In] [Book Now]│
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  MAIN CONTENT                                                     │
│  (max-width: 1200px, centered, responsive padding)               │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│  FOOTER: Logo · Quick Links · Legal · Connect · Hours · © 2026  │
└─────────────────────────────────────────────────────────────────┘

Mobile: Hamburger menu · sticky "Book Now" CTA at bottom
```

**Header details:**
- Height: 64px (desktop), 56px (mobile)
- Background: Warm white with subtle bottom border
- Logo: Left-aligned, max-height 40px
- Nav links: Center-aligned, horizontal, 16px gap
- Actions: Right-aligned, "Sign In" ghost button + "Book Now" primary pill button
- When signed in: Avatar dropdown replaces "Sign In"

**Footer details:**
- 4-column grid (desktop), stacked (mobile)
- Columns: Quick Links, Legal, Connect (social + address), Hours
- Copyright bar at bottom with cookie preferences link

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
- Background: Deep charcoal (`#1A1A1A`) or very dark plum
- Nav items: White text, grouped by section (Overview, Operations, CRM, Catalogue, Finance, People, System)
- Active item: Gold left border + gold text + subtle gold background
- Role-gated: Items hidden if user lacks permission
- Bottom: User avatar, name, role badge, "Sign Out" button

**Top bar details:**
- Height: 56px
- Background: White
- Left: Breadcrumbs (grey > separators)
- Right: Search shortcut (Cmd+K), notification bell (red dot if unread), user avatar

### Booking Dialog

```
Desktop: Centered modal (600px max, backdrop blur, close X)
Mobile: Bottom sheet (slides up, drag handle, full height on expand)
Both: Step indicator at top, content area, action buttons at bottom
```

**Step indicator:** 4 dots connected by lines. Completed = gold fill, Current = gold ring + pulse, Future = grey outline.

---

## 5. Page-by-Page Design Instructions

### Public Pages

#### Homepage (`/`)

Premium hero section with full-bleed salon imagery (high-quality photography of the salon interior or a styled model). Single gold "Book Now" button as the dominant CTA — large, centered, pill-shaped, with subtle glow/shadow. Below the fold: horizontal scrolling service category cards (icon + name + "from ₹X"), active offer banner (gold border, countdown if time-limited), Google Reviews snippet section (star rating + 3 recent review quotes), FAQ accordions (top 5 questions). Generous whitespace throughout. Mobile: sticky gold "Book Now" bar fixed at viewport bottom.

#### Services (`/services`)

Salon/SPA segmented toggle at top (sticky on scroll). Services grouped in accordion categories (7 salon categories, 3 SPA categories). Each service card: name (serif heading), price in ₹ (bold, GST-inclusive), duration badge (grey pill, e.g. "60 min"), and a "Book This" ghost button. SPA services show duration selector (60/90 min) inline. Premium card layout — not a boring flat list. Category headers in serif font with decorative gold underline.

#### Offers (`/offers`)

Rich offer cards with type badge: gold pill for percentage off (e.g. "20% OFF"), green pill for flat discount (e.g. "₹500 OFF"), purple pill for combo deals. Each card shows: offer title (serif), linked services (chips), validity period (start–end dates), terms, and a "Book Now" gold CTA button. Cards have cream background with subtle gold left border. Empty state: elegant line illustration of a gift box + "No active offers right now — check back soon!" text.

#### About (`/about`)

Full-width brand story section with large serif headline ("The Royal Glow Story"), flowing body text alongside salon interior photography. Team member cards in a grid: circular avatar photo, name (serif), designation (regular), brief bio on hover/tap. Salon gallery section with masonry or Pinterest-style grid layout. Warm, personal, inviting feel — lots of faces and real imagery.

#### Contact (`/contact`)

Two-column on desktop: info column (left) with address, phone (click-to-call), email, social links (Instagram, Facebook icons); interactive Google Maps embed (right). Hours table below map. Enquiry form at bottom: name, email, phone, message fields + gold "Send Message" submit button. Mobile: phone number is prominent click-to-call button at top, map below, form below.

#### Blog (`/blog`)

Article cards in a 2-column grid (desktop), single column (mobile). Each card: large featured image (16:9 aspect, rounded corners), title (serif, 20px), excerpt (2 lines max, grey), date + read time badge. Clean magazine feel with generous spacing. Category filter pills at top (optional).

#### FAQ (`/faq`)

Accordion groups organised by topic (Booking, Payments, Membership, General). Question text in semibold (600), answer in regular (400) with slightly smaller font. Subtle dividers between items. "Still have questions?" CTA card at bottom linking to `/contact`.

---

### Authenticated Customer Pages

#### Profile (`/profile`)

Clean form layout with circular avatar at top center (editable photo). Form fields below in single column: name, email (read-only, greyed), phone, date of birth, gender select. Toggle switches section for notification preferences (push, email, marketing). "Member Since" and "Last Updated" info displayed as subtle grey badges at bottom. Gold "Save Changes" button.

#### My Bookings (`/bookings`)

Tab bar at top: "Upcoming" (gold active underline) | "Past" (grey). Booking cards stacked vertically. Each card shows: status badge (colour-coded pill, top-right), date + day + time (bold), list of services booked, assigned staff name, total price (₹). Action buttons at card bottom vary by status: [Reschedule] [Cancel] for pending/confirmed, [View Invoice] for completed. Empty state: friendly line illustration of a calendar + "No bookings yet" + gold "Book Now" CTA.

#### Booking Detail (`/bookings/[id]`)

Status timeline on the left (desktop) or top (mobile): vertical stepper with coloured dots and connecting lines. Each step: status name, timestamp, and optional note (e.g. rejection reason). Right/below: services list with individual prices, payment summary card (subtotal, GST breakdown, total), invoice download link (PDF icon). If gems were earned: gold "gems earned" callout.

#### Membership (`/membership`)

Hero card at top with tier badge (Silver = grey gradient, Gold = warm gold gradient, Platinum = dark purple gradient with gold text). Card shows: tier name, hours remaining (large number), hours used/total progress bar (animated gold fill), expiry date (with urgency colour — green if >30 days, amber if <30 days, red if <7 days). Session history table below: date, service, duration used, staff. "Contact us to renew" CTA if expiring soon.

#### Gems (`/gems`)

Large gem balance display: centered, bold number (48px) with a sparkling gem icon (💎 or custom SVG). Below: "Redeemable Services" card grid — each card shows service name, gems required, and a "Redeem" button (greyed out + "Insufficient gems" label if balance too low). Transaction history section (expandable accordion): date, description (+/- gems), running balance.

---

### Auth Pages

#### Sign-in (`/sign-in`)

Centered card on a premium background (subtle gradient or blurred salon imagery). Royal Glow logo above the card (centered, 80px). Card contains: welcoming headline ("Welcome to Royal Glow"), subtitle ("Sign in to book appointments and manage your profile"), single "Sign in with Google" button (white card-style with Google icon, as per Google branding guidelines). Privacy/Terms links below in small text. Minimal, trustworthy, no clutter.

#### Onboarding (`/onboarding`)

Friendly welcome heading with the user's first name ("Welcome, Priya! 👋" — but no emoji in production, use warm serif text). Clean single-column form: name (prefilled), email (read-only), phone, date of birth (DD/MM/YYYY picker), gender (select dropdown). Consent section clearly separated with a divider: required privacy checkbox + optional analytics + optional marketing. Gold "Let's Go!" submit button at bottom. Progress feels light and quick — not bureaucratic.

---

### Landing Page

#### `/book` (Meta Ad Lead Capture)

Zero navigation header/footer — completely stripped layout. Trust signals at very top: "★ 4.9 on Google Maps · 500+ happy clients". Headline in serif: "Book Your Royal Glow Experience". 3-field form only: name, phone (+91 prefix auto), service interest (dropdown of categories). Gold "Continue to Booking" CTA button (full-width, large, prominent). Below form: salon address + phone number (small, grey). Feels like a premium funnel page, not a website page. Fast, focused, zero distractions.

---

### Admin Pages

#### Dashboard (`/admin`)

KPI cards row at top (4 cards, equal width): pending bookings (amber accent), today's revenue (green accent), today's appointments (blue accent), stale leads (red accent). Each card: icon, label, large number, percentage change indicator. Below: two-panel layout — left panel is "Today's Timeline" (booking feed in chronological order, compact cards with time + customer + service + status badge), right panel is "Pending Actions" (list of items needing attention with action buttons). Clean, data-dense, scannable.

#### Bookings List (`/admin/bookings`)

Filters row at top: date range picker, status multi-select, branch select, search input. Data table below with columns: Booking #, Customer, Date/Time, Services, Staff, Status (badge), Amount. Row hover highlight (gold-50 bg). Click row to navigate to detail. Bulk actions: none (one-at-a-time workflow). Pagination at bottom.

#### Booking Detail (`/admin/bookings/[id]`)

Split layout — left: customer info card (avatar, name, phone, email, tags, booking count). Center: services panel (list of services with individual prices + staff assignment dropdown per service). Right sidebar: status timeline (vertical stepper). Bottom: action buttons based on current status (Approve, Reject with reason modal, Mark In Progress, Complete/Checkout). Checkout triggers invoice modal with payment method select + line items + total.

#### Customer Profile (`/admin/customers/[id]`)

Header card: large avatar, full name, phone (click-to-call), email, customer tags (pills), "Member Since" date, acquisition source badge. KPI row below: total bookings, total spent, gems balance, no-show count. Tabbed interface: Bookings (table), Invoices (table), Membership (details card), Gems (transaction list), Notes (chronological staff notes with "Add Note" form).

#### Lead Pipeline (`/admin/leads`)

Kanban board view with drag-and-drop columns: New → Contacted → Interested → Converted → Lost. Each card: customer name, phone, service interested in, campaign badge (source), timestamp, "stale" red dot if untouched >48h. Column counts in header. Click card to open detail drawer. Table view toggle available as alternative layout.

#### Schedule (`/admin/schedule`)

Calendar grid view: rows = staff members (with avatar + name), columns = time slots (30-min intervals). Colour-coded booking blocks (gold = confirmed, blue = in progress, grey = completed, amber = pending). Click empty slot to create walk-in booking (quick form popover). Today highlighted with gold column background. Day/Week toggle at top. Staff on leave shown as greyed-out full row with "On Leave" label.

#### Reports (`/admin/reports`)

Date range selector at top (preset buttons: Today, This Week, This Month, Custom). Chart section: line chart (revenue over time), bar chart (services by category), pie chart (payment methods). Below: summary KPI cards (total revenue, avg. booking value, total bookings, new customers). Export button (CSV/PDF) in top-right. Clean data visualisation with gold accent colour for primary data series.

#### Settings (`/admin/settings`)

Sectioned form with clear group headings (Business Hours, Booking Policies, Gems Configuration, Notification Settings). Each section has its own "Save" button. Toggle switches for boolean settings. Number inputs for thresholds. Clear descriptions under each field label. No overwhelming single-page form — visually broken into digestible sections with card containers.

---

## 6. Animation & Interaction Spec

| Interaction | Animation | Duration | Easing |
|-------------|-----------|----------|--------|
| Page transitions | Subtle opacity fade | 150ms | ease |
| Dialog open | Scale from 0.95 + fade in | 200ms | ease-out |
| Bottom sheet open | Slide up from bottom | 300ms | ease-out |
| Step transitions (booking) | Horizontal slide | 250ms | ease-in-out |
| Status badge change | Colour morph + subtle pulse | 400ms | spring |
| Skeleton loading | Warm grey shimmer L→R | 1.5s loop | linear |
| Button hover | Scale(1.02) + shadow elevation | 150ms | ease |
| Card hover | Shadow sm → lg elevation | 200ms | ease |
| Toast appear | Slide in from right | 200ms | ease-out |
| Toast dismiss | Fade out + slide right | 150ms | ease-in |
| Booking success | Subtle confetti particle burst | 1.5s | — |
| Accordion expand | Smooth height + chevron rotate | 200ms | ease |
| Tab switch | Underline slide to active | 200ms | ease |

**Accessibility:** Respect `prefers-reduced-motion` — disable all animations when set. Replace transitions with instant state changes.

---

## 7. Accessibility Requirements

| Requirement | Implementation |
|-------------|----------------|
| Colour contrast | 4.5:1 minimum (WCAG AA). Gold on white verified — use dark gold `#A07D3A` for text on white backgrounds |
| Focus rings | 2px gold outline (`#C8A961`) with 2px offset on all interactive elements (visible on keyboard tab) |
| Touch targets | 44px × 44px minimum on all buttons, links, inputs (mobile) |
| Skip-to-content | First focusable element on every page — visually hidden until focused |
| ARIA labels | All icon-only buttons have `aria-label`. Live regions (`aria-live="polite"`) for dynamic content updates |
| Semantic HTML | Proper heading hierarchy (h1 → h2 → h3, never skip levels). Landmarks: `<nav>`, `<main>`, `<aside>`, `<footer>` |
| Form errors | Error messages linked via `aria-describedby`. Error announcements via `aria-live="assertive"` |
| Images | All decorative images have `alt=""`. All meaningful images have descriptive alt text |
| Reduced motion | All animations disabled when `prefers-reduced-motion: reduce` is set |
| Dark mode | Not in scope for Phase 1 — light mode only |

---

## 8. Indian Context — Formatting Rules

| Format | Convention | Example |
|--------|-----------|---------|
| Dates | DD/MM/YYYY | 24/05/2026 |
| Currency | ₹X,XXX.00 (Indian comma system) | ₹1,300.00 / ₹12,500.00 |
| Phone | +91 XXXXX XXXXX | +91 63601 XXXXX |
| Time | 12-hour with AM/PM | 03:30 PM |
| GST | Always show "Incl. 18% GST" | Displayed near prices |
| Language | English (Indian English) | "colour" not "color" in UI copy |
| Address | Indian format | Bengaluru, Karnataka, India |

**Never** use MM/DD/YYYY date format anywhere in the application.

---

## 9. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **No bottom tab bar** | Customer site uses hamburger nav + sticky "Book Now" CTA. Not a native app pattern. |
| **Booking is a dialog overlay** | Not a separate page. Bottom sheet on mobile, centered modal on desktop. Keeps user context on homepage. |
| **One primary CTA per screen** | Always gold, always clear. Never compete for user attention. |
| **Admin is data-dense** | Unlike customer site which is spacious and luxurious. Admin prioritises information density and efficiency. |
| **Status badges everywhere** | Consistent colour coding across entire app (customer + admin). |
| **Skeleton loaders, not spinners** | Premium feel during loading. Warm grey shimmer matches brand warmth. |
| **Empty states are friendly** | Illustration + clear action CTA. Never just "No data" text. |
| **Serif headings + sans body** | Playfair Display (headings) creates luxury feel. Inter (body) ensures readability. |
| **Warm whites, not pure white** | `#FFFDF7` background feels warmer and more luxurious than `#FFFFFF`. |
| **Gold as primary action colour** | Reinforces "Royal Glow" brand. Every CTA is immediately recognisable. |
| **Mobile-first responsive** | 70%+ of Indian premium salon traffic is mobile. All designs start mobile. |
| **PWA-optimised** | Installable on home screen. Offline-capable for viewing bookings. |
| **Mobile-first for customers, tablet-first for admin** | 99.99% of customers are on mobile. Receptionists use tablet at counter. Design priorities reflect actual device usage, not theoretical responsive design. |

---

## 10. Device-Primary Strategy

> **Critical business context:** 99.99% of customers access the site on **mobile phones only**. Staff (receptionist/manager) primarily use a **tablet** at the reception counter to show the menu, manage bookings, and process checkout. Laptop and mobile are secondary admin devices.

### Device Priority by Audience

| Audience | Primary Device | Secondary | Tertiary |
|----------|---------------|-----------|----------|
| **Customers** (public + auth pages) | Mobile phone (99.99%) | — | — |
| **Receptionist / Manager** (admin) | Tablet (reception counter) | Laptop (back office) | Mobile (on-the-go) |
| **Staff** (stylist/therapist) | Mobile phone (checking own schedule) | Tablet (salon floor) | — |
| **Owner** (reports, analytics) | Laptop (home/office) | Tablet | Mobile |
| **Developer** (integrations, logs) | Laptop | — | — |

### What This Means for Design

**Customer pages (`/`, `/services`, `/offers`, `/bookings`, `/profile`, etc.):**
- Design mobile-first — this IS the primary (and often only) experience
- Desktop/tablet layouts are secondary adaptations of the mobile design
- All touch targets: 44px minimum, thumb-friendly placement
- Bottom sheet dialogs (booking), not centered modals
- Sticky "Book Now" CTA at bottom of viewport
- One-handed reachability: primary actions in thumb zone
- Fast load: aggressive image optimization, skeleton loaders
- PWA: installable on homescreen, offline-capable for menu/prices
- Forms: large inputs (48px height), phone keyboard triggers for phone fields, date picker native-like

**Admin pages (`/admin/*`) — Tablet-primary:**
- Design for **768px–1024px tablet viewport** as the primary experience
- Sidebar nav: visible by default on tablet (not collapsed)
- Data tables: optimized for tablet landscape width (~1024px)
- Touch-friendly: 44px targets, larger click areas than typical desktop admin
- Checkout flow: designed for receptionist tapping on tablet while customer watches
- Schedule grid: staff rows × time columns must be readable on 10" tablet screen
- Service menu display: tablet is turned toward customer to show services/prices (kiosk-like use)
- Split-view patterns: booking detail on left, actions on right (tablet landscape)
- Desktop (laptop): same layout scales up with more breathing room
- Mobile admin: simplified views for on-the-go checks (not full feature parity)

**Tablet as in-store kiosk (special use case):**
- `/services` page is shown to customers on the tablet (receptionist holds/rotates tablet)
- Design must look premium and readable at arm's length on 10" screen
- Font sizes slightly larger than typical tablet web (18px body minimum for kiosk mode)
- High contrast mode consideration for salon lighting conditions

### Responsive Breakpoint Priority (Order of Design)

**Customer pages:**
```
1st: Mobile (375px–428px)     ← Design THIS first
2nd: Mobile large (428px–768px)
3rd: Tablet (768px–1024px)     ← Bonus, not primary
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

For detailed component specs, wireframes, and flow diagrams per page:

| Resource | Path | Content |
|----------|------|---------|
| Design flows | `design/` folder | ASCII wireframes and state machines for every flow (booking, auth, membership, billing, CRM, schedule, notifications) |
| Page specs | `pages/` folder | Component lists, states, data sources, SEO metadata per page |
| Sitemap | `sitemap.md` | Complete navigation structure, 104 routes, URL conventions, user flows |
| Features | `features.md` | Business rules, booking logic, membership tiers, gems system |
| Architecture | `architecture.md` | Tech stack, infrastructure, project structure |
| Authentication | `authentication.md` | Auth flow, role hierarchy, permissions matrix |
| Database | `database-schema.md` | All 38 tables and relationships |

---

*Generated for use with Stitch, Figma AI, v0, Galileo, and other AI design agents. Feed this entire file as context to generate consistent, brand-aligned mockups for any page in the Royal Glow Salon & SPA application.*
