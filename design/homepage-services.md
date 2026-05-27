# Homepage & Public Pages — Design Reference

> All customer-facing public pages: homepage hero, services browser, offers, contact, header/footer components, PWA install prompt, and cookie consent. Designed mobile-first with full desktop responsive variants.

---

## 1. Homepage — Mobile Wireframe

```
┌─────────────────────────────────────┐
│  ┌─────────────────────────────┐    │
│  │ 👑 Royal Glow   ☰ (hamburger)│    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │   HERO IMAGE / VIDEO        │    │
│  │   (salon interior,          │    │
│  │    happy customer)          │    │
│  │                             │    │
│  │   Royal Glow                │    │
│  │   Salon & SPA              │    │
│  │                             │    │
│  │   "Where beauty meets      │    │
│  │    royalty"                 │    │
│  │                             │    │
│  │   ┌─────────────────────┐  │    │
│  │   │   [ Book Now ]      │  │    │
│  │   └─────────────────────┘  │    │
│  │                             │    │
│  │   ⭐ 4.9 · 86+ reviews     │    │
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
│  ── Our Services ──────────────     │
│                                     │
│  (horizontal scroll cards)          │
│  ┌────────┐ ┌────────┐ ┌────────┐ │
│  │ 💇     │ │ 💆     │ │ 🧖     │ │
│  │Haircut │ │ Facial │ │  SPA   │ │
│  │from    │ │from    │ │from    │ │
│  │₹500   │ │₹1,499 │ │₹2,500 │ │
│  │[Book →]│ │[Book →]│ │[Book →]│ │
│  └────────┘ └────────┘ └────────┘ │
│                    ← scroll →       │
│  [ View All Services → ]           │
│                                     │
│  ── Special Offers ────────────     │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  🎉 20% OFF Facials         │    │
│  │  This week only!            │    │
│  │  [ Book Now → ]             │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │  💎 Free head massage       │    │
│  │  with any SPA booking       │    │
│  │  [ Book Now → ]             │    │
│  └─────────────────────────────┘    │
│                                     │
│  ── What Our Clients Say ──────     │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  ⭐⭐⭐⭐⭐                   │    │
│  │  "Best salon experience     │    │
│  │   in Bengaluru!"           │    │
│  │  — Priya S.                 │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │  ⭐⭐⭐⭐⭐                   │    │
│  │  "Amazing SPA, so relaxing" │    │
│  │  — Aisha K.                 │    │
│  └─────────────────────────────┘    │
│  [ See all reviews on Google → ]   │
│                                     │
│  ── Gallery ───────────────────     │
│                                     │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐     │
│  │ 📷 │ │ 📷 │ │ 📷 │ │ 📷 │     │
│  └────┘ └────┘ └────┘ └────┘     │
│  (2x2 grid, tap to lightbox)      │
│                                     │
│  ── FAQ ───────────────────────     │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ ▶ What services do you offer?│    │
│  ├─────────────────────────────┤    │
│  │ ▶ Do I need to book in      │    │
│  │   advance?                  │    │
│  ├─────────────────────────────┤    │
│  │ ▶ What payment methods do   │    │
│  │   you accept?              │    │
│  ├─────────────────────────────┤    │
│  │ ▶ Where are you located?    │    │
│  └─────────────────────────────┘    │
│                                     │
│  ── FOOTER ────────────────────     │
│  (see Section 8)                    │
│                                     │
└─────────────────────────────────────┘
```

---


## 2. Homepage — Desktop Wireframe

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ 👑 Royal Glow      Services  Offers  Gallery  Contact   [Book Now]│  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │                    FULL-WIDTH HERO                                 │  │
│  │             (background: salon interior image)                     │  │
│  │                                                                    │  │
│  │         Royal Glow Salon & SPA                                    │  │
│  │         "Where beauty meets royalty"                              │  │
│  │                                                                    │  │
│  │         ⭐ 4.9 rating · 86+ Google reviews                        │  │
│  │                                                                    │  │
│  │         ┌─────────────────────────┐                               │  │
│  │         │      [ Book Now ]       │                               │  │
│  │         └─────────────────────────┘                               │  │
│  │                                                                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ── Our Services ────────────────────────────────────────────────────── │
│                                                                          │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐    │
│  │  💇 Haircut & Styling         │  │  💆 Facial & Skincare         │    │
│  │  Expert cuts and styling     │  │  Premium skincare treatments  │    │
│  │  From ₹500                   │  │  From ₹1,499                 │    │
│  │  [ View Services → ]        │  │  [ View Services → ]         │    │
│  └──────────────────────────────┘  └──────────────────────────────┘    │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐    │
│  │  🧖 SPA & Massage            │  │  💅 Manicure & Pedicure       │    │
│  │  Relaxing body therapies     │  │  Nail art and care           │    │
│  │  From ₹2,500                 │  │  From ₹800                   │    │
│  │  [ View Services → ]        │  │  [ View Services → ]         │    │
│  └──────────────────────────────┘  └──────────────────────────────┘    │
│                                                                          │
│  ── Special Offers ──────────── ── Reviews ──────────────────────────── │
│                                                                          │
│  ┌──────────────────────────┐   ┌──────────────────────────────────┐   │
│  │ 🎉 20% OFF Facials       │   │  ⭐⭐⭐⭐⭐ "Best salon in         │   │
│  │ This week only           │   │  Bengaluru!" — Priya S.          │   │
│  │ [ Book Now → ]           │   │                                   │   │
│  ├──────────────────────────┤   │  ⭐⭐⭐⭐⭐ "Amazing SPA"           │   │
│  │ 💎 Free head massage     │   │  — Aisha K.                      │   │
│  │ with SPA booking         │   │                                   │   │
│  │ [ Book Now → ]           │   │  ⭐⭐⭐⭐⭐ "Love the ambiance"     │   │
│  └──────────────────────────┘   │  — Rahul M.                      │   │
│                                  │                                   │   │
│                                  │  [ See all on Google → ]         │   │
│                                  └──────────────────────────────────┘   │
│                                                                          │
│  ── Gallery (masonry grid) ─────────────────────────────────────────── │
│  ┌────────┐ ┌────────────────┐ ┌────────┐                             │
│  │  📷    │ │    📷          │ │  📷    │                             │
│  │        │ │                │ │        │                             │
│  └────────┘ └────────────────┘ └────────┘                             │
│  ┌────────────────┐ ┌────────┐ ┌────────┐                             │
│  │    📷          │ │  📷    │ │  📷    │                             │
│  └────────────────┘ └────────┘ └────────┘                             │
│                                                                          │
│  ── FAQ + FOOTER ────────────────────────────────────────────────────── │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

Desktop layout differences:
• Full-width hero with parallax scroll effect
• 2-column grid for service cards (not horizontal scroll)
• Offers + Reviews side-by-side (2-column)
• Gallery: masonry grid (3 columns)
• FAQ: 2-column accordion layout
```

---

## 3. Services Page — `/services`

```
┌─────────────────────────────────────────────────────┐
│  Our Services                                        │
│  ════════════                                        │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │  [ Salon ]  │  [ SPA ]                      │    │
│  │  ▲ active (filled, brand colour)            │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ── SALON SERVICES ────────────────────────────     │
│                                                      │
│  ▼ 💇 Haircut & Styling                             │
│  ┌─────────────────────────────────────────────┐    │
│  │                                              │    │
│  │  Classic Haircut                             │    │
│  │  ₹500 · 45 min              [ Book This ]  │    │
│  │                                              │    │
│  │  ────────────────────────────────────────── │    │
│  │                                              │    │
│  │  Hair Wash & Blow Dry                       │    │
│  │  ₹300 · 30 min              [ Book This ]  │    │
│  │                                              │    │
│  │  ────────────────────────────────────────── │    │
│  │                                              │    │
│  │  Global Hair Colour                         │    │
│  │  ₹2,500 · 120 min           [ Book This ]  │    │
│  │                                              │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ▶ 💆 Facial & Skincare  (collapsed)                │
│  ▶ 🧴 Waxing  (collapsed)                          │
│  ▶ 💅 Manicure & Pedicure  (collapsed)             │
│  ▶ 💄 Makeup Services  (collapsed)                 │
│  ▶ 🧖 Hair SPA & Therapies  (collapsed)           │
│                                                      │
│  ─────────────────────────────────────────────      │
│                                                      │
│  Toggle to SPA tab:                                  │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │  [ Salon ]  │  [ SPA ]                      │    │
│  │                  ▲ active                    │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ── SPA SERVICES ──────────────────────────────     │
│                                                      │
│  ▼ 🌿 Standard SPA                                  │
│  ▼ ✨ Premium SPA                                   │
│  ▼ 👑 VVIP SPA                                     │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---


## 4. SPA Service Card — Duration Toggle

```
Single card with 60/90 min toggle (NOT two separate cards):

┌─────────────────────────────────────────────────────┐
│                                                      │
│  Aroma Therapy                                       │
│  Relaxing full-body massage with essential oils     │
│                                                      │
│  Duration:                                           │
│  ┌─────────────────────────────────────────────┐    │
│  │  [ 60 min · ₹2,500 ]  │  [●90 min · ₹3,500]│    │
│  └─────────────────────────────────────────────┘    │
│  (toggle button group — one active at a time)       │
│                                                      │
│  Selected: 90 min — ₹3,500                         │
│                                                      │
│  [ Book This → ]                                    │
│                                                      │
└─────────────────────────────────────────────────────┘

Desktop variant (wider card):
┌─────────────────────────────────────────────────────────────────┐
│  Aroma Therapy                    [ 60 min · ₹2,500 ] [●90 min]│
│  Relaxing full-body massage       ₹3,500 · 90 min               │
│  with essential oils              [ Book This → ]                │
└─────────────────────────────────────────────────────────────────┘

IMPLEMENTATION:
• Same service row in DB, same service_id
• Duration toggle stored as selected_duration in booking
• Price switches dynamically on toggle (no page reload)
• "Book This" opens booking dialog with service + duration pre-selected
• All SPA services have 60/90 toggle (Standard, Premium, VVIP)
• Salon services do NOT have duration toggle (fixed duration)
```

---

## 5. Offers Page — `/offers`

```
┌─────────────────────────────────────────────────────┐
│  Special Offers                                      │
│  ═══════════════                                     │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │  🎉 PERCENTAGE DISCOUNT                      │    │
│  │                                              │    │
│  │  20% OFF All Facials                        │    │
│  │                                              │    │
│  │  Applicable services:                        │    │
│  │  • Hydrafacial  • Cleanup  • Gold Facial    │    │
│  │                                              │    │
│  │  Valid: 20 May – 31 May 2026                │    │
│  │                                              │    │
│  │  Terms:                                      │    │
│  │  • Max 1 per customer per day               │    │
│  │  • Cannot combine with other offers         │    │
│  │  • Valid at Rayasandra branch only          │    │
│  │                                              │    │
│  │  [ Book Now → ]                              │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │  💎 FLAT DISCOUNT                            │    │
│  │                                              │    │
│  │  ₹200 OFF Your First Visit                  │    │
│  │                                              │    │
│  │  Applicable: All services ≥ ₹500           │    │
│  │                                              │    │
│  │  Valid: Ongoing (new customers only)         │    │
│  │                                              │    │
│  │  Terms:                                      │    │
│  │  • First completed booking only              │    │
│  │  • Min spend ₹500 before discount          │    │
│  │                                              │    │
│  │  [ Book Now → ]                              │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │  🎁 COMPLIMENTARY ADD-ON                     │    │
│  │                                              │    │
│  │  Free Head Massage with any SPA Booking     │    │
│  │                                              │    │
│  │  Applicable: All SPA services               │    │
│  │                                              │    │
│  │  Valid: 1 Jun – 30 Jun 2026                 │    │
│  │                                              │    │
│  │  Terms:                                      │    │
│  │  • Auto-applied at checkout                  │    │
│  │  • 15 min add-on (no extra charge)          │    │
│  │                                              │    │
│  │  [ Book Now → ]                              │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  Offer type badges:                                  │
│  🎉 = percentage   💎 = flat   🎁 = complimentary   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 6. Contact Page — `/contact`

```
MOBILE (stacked):
┌─────────────────────────────────────┐
│  Contact Us                          │
│  ══════════                          │
│                                     │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │   📍 GOOGLE MAP EMBED       │    │
│  │   (interactive, pinch-zoom) │    │
│  │                             │    │
│  │   Royal Glow Salon & SPA   │    │
│  │   1st Floor, Narmada Complex│    │
│  │   Rayasandra Main Road     │    │
│  │   Bengaluru, 560099        │    │
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
│  📞 +91 63601 35720 (tap to call)  │
│  ✉️  hello@theroyalglow.in          │
│                                     │
│  Hours:                              │
│  Mon–Sat: 10:00 AM – 8:00 PM       │
│  Sunday:  10:00 AM – 6:00 PM       │
│                                     │
│  ─────────────────────────────      │
│                                     │
│  Send us a message:                  │
│                                     │
│  Name                                │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  └─────────────────────────────┘    │
│  Phone                               │
│  ┌─────────────────────────────┐    │
│  │ +91                         │    │
│  └─────────────────────────────┘    │
│  Message                             │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
│  [ Send Message ]                   │
│                                     │
└─────────────────────────────────────┘

DESKTOP (2-column):
┌─────────────────────────────────────────────────────────────────────────┐
│  Contact Us                                                              │
│  ══════════                                                              │
│                                                                          │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐    │
│  │                              │  │                               │    │
│  │   📍 GOOGLE MAP EMBED        │  │  Send us a message            │    │
│  │   (larger, interactive)      │  │                               │    │
│  │                              │  │  Name                         │    │
│  │                              │  │  ┌───────────────────────┐   │    │
│  │                              │  │  │                       │   │    │
│  │                              │  │  └───────────────────────┘   │    │
│  │                              │  │                               │    │
│  ├──────────────────────────────┤  │  Phone                       │    │
│  │  📍 1st Floor, Narmada       │  │  ┌───────────────────────┐   │    │
│  │     Complex, Rayasandra     │  │  │ +91                   │   │    │
│  │     Main Rd, Bengaluru      │  │  └───────────────────────┘   │    │
│  │                              │  │                               │    │
│  │  📞 +91 63601 35720         │  │  Message                     │    │
│  │  ✉️  hello@theroyalglow.in   │  │  ┌───────────────────────┐   │    │
│  │                              │  │  │                       │   │    │
│  │  Hours: Mon–Sat 10AM–8PM   │  │  │                       │   │    │
│  │         Sun 10AM–6PM       │  │  └───────────────────────┘   │    │
│  └──────────────────────────────┘  │                               │    │
│                                     │  [ Send Message ]            │    │
│                                     └──────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---


## 7. Header Component

```
MOBILE HEADER:
┌─────────────────────────────────────┐
│  👑 Royal Glow              ☰       │
└─────────────────────────────────────┘

Hamburger menu expands (slide from right):
┌─────────────────────────────────────┐
│  👑 Royal Glow              ✕       │
├─────────────────────────────────────┤
│                                     │
│  Home                               │
│  Services                           │
│  Offers                             │
│  Gallery                            │
│  Contact                            │
│                                     │
│  ─────────────────────────────      │
│                                     │
│  My Bookings (if signed in)        │
│  My Gems (if signed in)            │
│  Profile (if signed in)            │
│                                     │
│  ─────────────────────────────      │
│                                     │
│  ┌─────────────────────────────┐    │
│  │      [ Book Now ]           │    │
│  └─────────────────────────────┘    │
│                                     │
│  Sign In / Sign Out                 │
│                                     │
└─────────────────────────────────────┘

DESKTOP HEADER:
┌─────────────────────────────────────────────────────────────────────────┐
│  👑 Royal Glow      Services  Offers  Gallery  Contact    [ Book Now ] │
│                                                                          │
│  (if signed in: + My Bookings, Gems, Profile avatar dropdown)           │
└─────────────────────────────────────────────────────────────────────────┘

HEADER SPECS:
• Sticky (fixed top on scroll)
• Background: white with subtle shadow on scroll
• Height: 64px (mobile), 72px (desktop)
• Logo: clickable → home
• "Book Now" CTA: brand colour filled button (always visible)
• Active page: underline indicator on nav link
• Desktop: all nav items visible (no hamburger)
• Mobile: only logo + hamburger visible
• Transition: hamburger menu slides in from right (250ms, ease-out)
```

---

## 8. Footer Component

```
┌─────────────────────────────────────────────────────────────────────────┐
│  FOOTER (all pages)                                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  👑 Royal Glow Salon & SPA                                        │  │
│  │                                                                    │  │
│  │  ── NAP (Name, Address, Phone) ──                                │  │
│  │  📍 1st Floor, Narmada Complex                                    │  │
│  │     Rayasandra Main Road, Bengaluru 560099                       │  │
│  │  📞 +91 63601 35720                                              │  │
│  │  ✉️  hello@theroyalglow.in                                        │  │
│  │                                                                    │  │
│  │  ── Hours ──                                                      │  │
│  │  Mon–Sat: 10:00 AM – 8:00 PM                                    │  │
│  │  Sunday:  10:00 AM – 6:00 PM                                    │  │
│  │                                                                    │  │
│  │  ── Social ──                                                     │  │
│  │  [📷 Instagram]  [📘 Facebook]  [▶️ YouTube]  [🗺 Google Maps]   │  │
│  │                                                                    │  │
│  │  ── Legal ──                                                      │  │
│  │  Privacy Policy · Terms of Service · Refund Policy                │  │
│  │                                                                    │  │
│  │  ── Preferences ──                                                │  │
│  │  [ 🍪 Cookie Preferences ]                                       │  │
│  │                                                                    │  │
│  │  ─────────────────────────────────────────────────────────────── │  │
│  │  © 2026 Royal Glow Salon & SPA. All rights reserved.             │  │
│  │  Built with ❤️ in Bengaluru                                       │  │
│  │                                                                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  FOOTER LAYOUT:                                                          │
│  • Mobile: single column, stacked sections                              │
│  • Desktop: 3-column grid (NAP | Hours+Social | Legal+Links)           │
│  • Background: dark (brand dark shade)                                  │
│  • Text: white/light grey                                                │
│  • Social icons: 32px, hover → brand colour highlight                   │
│  • NAP matches Google My Business listing EXACTLY (SEO critical)        │
│  • Schema.org LocalBusiness structured data in footer                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. PWA Install Prompt

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PWA INSTALL PROMPT STRATEGY                                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  TRIGGER: Show after 2nd visit (not first visit)                        │
│  WHY: User has shown intent by returning — higher install rate          │
│                                                                          │
│  Detection: localStorage visit_count >= 2                               │
│  AND: window.beforeinstallprompt event was captured                     │
│  AND: User has NOT dismissed prompt before                              │
│  AND: App is NOT already installed (display-mode: standalone check)     │
│                                                                          │
│  Custom prompt (branded, NOT browser default):                          │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │                                                              │       │
│  │  ┌──────────────────────────────────────────────────────┐   │       │
│  │  │                                                       │   │       │
│  │  │  👑 Add Royal Glow to your home screen               │   │       │
│  │  │                                                       │   │       │
│  │  │  Get quick access to:                                 │   │       │
│  │  │  ✓ Book appointments instantly                       │   │       │
│  │  │  ✓ View your bookings & gems                         │   │       │
│  │  │  ✓ Get push notifications                            │   │       │
│  │  │                                                       │   │       │
│  │  │  ┌──────────────────┐  ┌──────────────────┐         │   │       │
│  │  │  │  [ Install App ] │  │  [ Not Now ]     │         │   │       │
│  │  │  └──────────────────┘  └──────────────────┘         │   │       │
│  │  │   (brand colour,         (text only,                  │   │       │
│  │  │    primary)               secondary)                  │   │       │
│  │  │                                                       │   │       │
│  │  └──────────────────────────────────────────────────────┘   │       │
│  │                                                              │       │
│  │  (bottom sheet on mobile, centered modal on desktop)         │       │
│  └─────────────────────────────────────────────────────────────┘       │
│                                                                          │
│  "Install App" clicked → trigger native beforeinstallprompt             │
│  "Not Now" clicked → dismiss, don't show for 7 days                    │
│  Dismissed 3 times → never show again                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Cookie Consent Banner

```
┌─────────────────────────────────────────────────────────────────────────┐
│  COOKIE CONSENT (2-tier approach)                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  TIER 1: Initial banner (fixed bottom):                                 │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  🍪 We use cookies to enhance your experience and for analytics.  │  │
│  │                                                                    │  │
│  │  [ Accept All ]    [ Reject All ]    [ Manage Preferences ]       │  │
│  │                                                                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────      │
│                                                                          │
│  TIER 2: Expanded preferences (if "Manage Preferences" clicked):        │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  Cookie Preferences                                    ✕          │  │
│  │  ════════════════════                                              │  │
│  │                                                                    │  │
│  │  ┌────────────────────────────────────────────────────────────┐   │  │
│  │  │  Essential Cookies              [====●] ON (locked)        │   │  │
│  │  │  Required for the site to function.                        │   │  │
│  │  │  (authentication, security, session)                       │   │  │
│  │  └────────────────────────────────────────────────────────────┘   │  │
│  │                                                                    │  │
│  │  ┌────────────────────────────────────────────────────────────┐   │  │
│  │  │  Analytics Cookies              [====●] ON                 │   │  │
│  │  │  Help us understand how you use the site.                  │   │  │
│  │  │  (PostHog, Google Analytics)                               │   │  │
│  │  └────────────────────────────────────────────────────────────┘   │  │
│  │                                                                    │  │
│  │  ┌────────────────────────────────────────────────────────────┐   │  │
│  │  │  Marketing Cookies              [====●] ON                 │   │  │
│  │  │  Used to deliver relevant ads and track conversions.       │   │  │
│  │  │  (Meta Pixel, Google Ads)                                  │   │  │
│  │  └────────────────────────────────────────────────────────────┘   │  │
│  │                                                                    │  │
│  │  ┌────────────────────────────────────────────────────────────┐   │  │
│  │  │  Functional Cookies             [●====] OFF                │   │  │
│  │  │  Enable enhanced features like chat and preferences.       │   │  │
│  │  │  (Ably realtime, localStorage preferences)                 │   │  │
│  │  └────────────────────────────────────────────────────────────┘   │  │
│  │                                                                    │  │
│  │  [ Save Preferences ]                                             │  │
│  │                                                                    │  │
│  │  Learn more in our Privacy Policy →                               │  │
│  │                                                                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  IMPLEMENTATION:                                                         │
│  • Consent stored in cookie: rg_consent={essential:1,analytics:1,...}   │
│  • If analytics rejected → PostHog not loaded, GA not loaded            │
│  • If marketing rejected → Meta Pixel not loaded, no CAPI events       │
│  • Banner re-appears if consent cookie expires (365 days)              │
│  • Footer link "Cookie Preferences" re-opens Tier 2 modal             │
│  • Mobile: banner is full-width bottom sheet                           │
│  • Desktop: banner is bottom-right card (max-width 480px)              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```
