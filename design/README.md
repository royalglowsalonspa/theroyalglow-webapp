# Design Flows — Royal Glow Salon & SPA

> Visual design reference for every user interaction, state transition, and page layout in the application. Uses ASCII wireframes and flow diagrams to communicate design intent to any design tool, agent, or team member.

**Domain:** `theroyalglow.in`

---

## How to Use These Files

Each file contains:
- **Flow diagrams** — state machines showing every possible path through a feature
- **ASCII wireframes** — layout mockups showing exact component placement (mobile + desktop)
- **State transitions** — what triggers each UI change
- **Component specs** — badges, buttons, cards with exact labels and colours
- **Edge cases** — error states, empty states, loading states

Feed any file directly to a design agent (Figma AI, Stitch, v0, Galileo) as context for generating high-fidelity mockups.

---

## Design Principles

| Principle | Implementation |
|-----------|---------------|
| Premium feel | Rich imagery, generous whitespace, gold accents, minimal clutter |
| Mobile-first | Bottom sheets, thumb-friendly targets (44px min), sticky CTAs |
| Single CTA per view | One primary action per screen — never compete for attention |
| Instant feedback | Skeleton loaders, optimistic UI, animated status transitions |
| Accessible | WCAG 2.1 AA, visible focus rings, semantic HTML, screen reader friendly |
| Indian context | DD/MM/YYYY dates, ₹ currency, +91 phone format, GST-inclusive prices |

---

## Device-Primary Strategy

| Audience | Primary Device | Design Approach |
|----------|---------------|-----------------|
| Customers | Mobile phone (99.99%) | Mobile-first. All customer pages designed for 375px–428px FIRST. Desktop is a scaled-up adaptation. |
| Receptionist / Manager | Tablet (10" at counter) | Tablet-first (768px–1024px). Sidebar visible. Touch-friendly. Also used as kiosk to show menu to customers. |
| Staff (Stylist/Therapist) | Mobile phone | Simplified mobile view. Schedule + leave only. Quick glance UI. |
| Owner | Laptop | Desktop layout. Reports, analytics, user management. |
| Developer | Laptop | Desktop layout. Logs, integrations. |

**Rule:** When designing customer-facing pages, start with the mobile wireframe. The desktop version adapts FROM mobile — not the other way around. For admin pages, start with tablet (landscape) wireframe.

---

## File Index

| File | Section | What It Covers |
|------|---------|----------------|
| [booking-flow.md](./booking-flow.md) | Customer Booking | 4-step dialog wireframes, status lifecycle, reschedule/cancel flows |
| [auth-onboarding-flow.md](./auth-onboarding-flow.md) | Authentication | Sign-in page, Google OAuth redirect, onboarding form, consent |
| [lead-capture-flow.md](./lead-capture-flow.md) | Meta Ads → Booking | Ad click → /book form → redirect → booking dialog conversion |
| [admin-booking-management.md](./admin-booking-management.md) | Admin Bookings | Approve/reject, staff assignment, checkout, no-show marking |
| [membership-flow.md](./membership-flow.md) | SPA Memberships | Purchase, session recording, hours tracking, expiry lifecycle |
| [crm-lead-pipeline.md](./crm-lead-pipeline.md) | CRM & Leads | Customer profile, kanban pipeline, lead conversion |
| [billing-invoice-flow.md](./billing-invoice-flow.md) | Billing | Checkout → invoice generation → PDF → email → gems award |
| [schedule-leave-flow.md](./schedule-leave-flow.md) | Schedule & Leave | Staff calendar grid, leave request → approval workflow |
| [notifications-realtime.md](./notifications-realtime.md) | Notifications | Push notifications, Ably realtime updates, email triggers |
| [homepage-services.md](./homepage-services.md) | Public Pages | Homepage, services, offers, contact, blog wireframes |

---

## Common UI Patterns

### Status Badge Colours
```
┌──────────────────────────────────────────┐
│  Pending      ●  Amber (#F59E0B)         │
│  Confirmed    ●  Green (#10B981)         │
│  In Progress  ●  Blue (#3B82F6)          │
│  Completed    ●  Grey (#6B7280)          │
│  Cancelled    ●  Red (#EF4444)           │
│  Rejected     ○  Red outline (#EF4444)   │
│  No-Show      ●  Dark Red (#991B1B)      │
└──────────────────────────────────────────┘
```

### Button Hierarchy
```
[  Primary Action  ]     ← Solid, brand colour, full-width on mobile
[  Secondary Action  ]   ← Outline/ghost, same row as primary on desktop
   Tertiary link →       ← Text link, small, right-aligned
```

### Card Pattern (Booking Example)
```
┌─────────────────────────────────────────────┐
│  ● Confirmed                   #BKRS26...   │
│                                              │
│  24 May 2026 (Saturday) · 03:30 PM          │
│  Classic Facial, Waxing — Full Arms          │
│  Assigned to: Anjali                         │
│                                              │
│  ₹1,300.00                                  │
│                                              │
│  [ Reschedule ]  [ Cancel ]                  │
└─────────────────────────────────────────────┘
```

### Loading Skeleton Pattern
```
┌─────────────────────────────────────────────┐
│  ░░░░░░░░░░░░░░                ░░░░░░░░░    │
│                                              │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░        │
│  ░░░░░░░░░░░░░░░░░░░░░                      │
│  ░░░░░░░░░░░░░░                              │
│                                              │
│  ░░░░░░░░                                   │
│                                              │
│  ░░░░░░░░░░░░  ░░░░░░░░░░░░                 │
└─────────────────────────────────────────────┘
```

---

## Cross-References

- [pages/](../pages/) — Full page specs with components, states, SEO, accessibility
- [features.md](../features.md) — Business rules and logic
- [authentication.md](../authentication.md) — Auth flow and role hierarchy
- [database-schema.md](../database-schema.md) — Data model
- [ably-channels.md](../ably-channels.md) — Realtime event structure
- [email-strategy.md](../email-strategy.md) — Email templates and triggers
- [meta-pixel.md](../meta-pixel.md) — Analytics event triggers
