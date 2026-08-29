# Sitemap — Complete Information Architecture & Site Hierarchy

> Comprehensive map of all ~104 routes, navigation structures, user flows, and URL conventions for the Royal Glow Salon & SPA application (`theroyalglow.in`).

---

## 1. Complete Site Hierarchy (Tree)

```
theroyalglow.in
│
├── PUBLIC PAGES (no auth required)
│   ├── / (Homepage)
│   │   ├── /?book=1 (Booking Dialog overlay — 4-step flow)
│   │   ├── /?book=1&utm_source=gmb (GMB deep link)
│   │   ├── /?book=1&utm_source=walkin (In-store QR deep link)
│   │   ├── /?book=1&service=[slug] (Service pre-selected)
│   │   └── /?book=1&leadId={id} (Lead context linked)
│   ├── /services (Services & Prices — Salon/SPA toggle)
│   ├── /offers (Offers & Combos — active promotions)
│   ├── /about (About Us — brand story, team gallery)
│   ├── /contact (Contact & Location — map, hours, form)
│   ├── /blog (Blog listing — beauty & wellness articles)
│   │   └── /blog/[slug] (Individual blog post)
│   └── /faq (Frequently Asked Questions — accordions)
│
├── AUTHENTICATED CUSTOMER PAGES (Google OAuth required)
│   ├── /profile (My Profile — edit details, notification prefs)
│   ├── /bookings (My Bookings — upcoming/past tabs)
│   │   └── /bookings/[id] (Booking Detail — timeline, services, invoice)
│   ├── /membership (SPA Membership — hours balance, sessions)
│   │   └── [note: only shown in nav if customer has active/past membership]
│   └── /gems (Royal Gems — balance, catalogue, history)
│
├── AUTH FLOW PAGES (minimal layout, no nav)
│   ├── /sign-in (Google OAuth — centered card)
│   └── /onboarding (Welcome setup — name, phone, DOB, consent)
│
├── LANDING PAGES (ad-only, no header/footer)
│   └── /book (Meta/Instagram ad lead capture)
│       └── [note: NEVER linked from homepage, GMB, or QR — ads only]
│
├── LEGAL PAGES (SSG, customer layout)
│   ├── /privacy (Privacy Policy — DPDP Act compliant)
│   ├── /terms (Terms of Service)
│   └── /refund-policy (Refund & Cancellation Policy)
│

├── ADMIN PORTAL (RBAC-gated, separate app at admin.theroyalglow.in, sidebar layout)
│   │   Routes use Root-Path Convention — no /admin prefix (subdomain is the namespace)
│   ├── / (Dashboard — today's overview, pending actions)
│   │   └── [Staff sees limited "My Schedule" view only]
│   │
│   ├── /bookings (All Bookings — filters, search, table)
│   │   ├── /bookings/new (Create Walk-in Booking)
│   │   └── /bookings/[id] (Booking Detail — approve/reject/checkout)
│   │
│   ├── /waitlist (Waitlist — promote to booking)
│   │
│   ├── /customers (Customer List — CRM, tags, LTV)
│   │   └── /customers/[id] (Customer 360° Profile)
│   │
│   ├── /leads (Lead Pipeline — Kanban/table view)
│   │   └── /leads/[id] (Lead Detail — notes, attribution)
│   │
│   ├── /staff (Staff List) [Manager+]
│   │   ├── /staff/new (Add Staff Member)
│   │   └── /staff/[id] (Staff Profile — schedule, performance)
│   │
│   ├── /schedule (Staff Schedule — daily/weekly grid)
│   │
│   ├── /leave (Leave Management — approve/reject)
│   │   └── [Staff sees own leave history + submit form only]
│   │
│   ├── /services (redirect → Payload CMS service collection) [Manager+]
│   │   └── [no admin CRUD — the catalogue is authored in cms.theroyalglow.in]
│   │
│   ├── /offers (Offers & Promotions) [Manager+]
│   │   ├── /offers/new (Create Offer)
│   │   └── /offers/[id] (Edit Offer)
│   │
│   ├── /memberships (All SPA Memberships)
│   │   ├── /memberships/new (Create Membership)
│   │   └── /memberships/[id] (Membership Detail — sessions, cancel)
│   │
│   ├── /billing (All Invoices — filter, export)
│   │   └── /billing/[id] (Invoice Detail — PDF, GST breakdown)
│   │
│   ├── /reports (Reports Overview — KPI dashboard) [Manager+]
│   │   ├── /reports/financial (Revenue, GST, payment breakdown)
│   │   ├── /reports/salon (Salon service analytics)
│   │   ├── /reports/spa (SPA membership analytics)
│   │   ├── /reports/staff (Staff performance & utilisation)
│   │   └── /reports/leads (Lead funnel & campaign ROAS)
│   │
│   ├── /settings (System Settings — hours, policies, gems) [Manager+]
│   │
│   ├── /branches (Branch Management) [Owner+]
│   │   └── /branches/[id] (Edit Branch)
│   │
│   ├── /users (User Management — roles, suspend/ban) [Owner+]
│   │
│   ├── /integrations (Integrations Dashboard) [Developer only]
│   │
│   └── /logs (Error Logs — Sentry feed) [Developer only]
│

├── API ROUTES (/api/*)
│   │
│   ├── Authentication
│   │   └── /api/auth/[...betterauth] (ALL — Google OAuth catch-all)
│   │
│   ├── Customer-Facing API
│   │   ├── /api/services (GET — all categories + services)
│   │   ├── /api/services/[slug] (GET — single service detail)
│   │   ├── /api/availability (GET — time slots for date/services)
│   │   ├── /api/bookings (GET — list customer's bookings)
│   │   ├── /api/bookings (POST — create new booking)
│   │   ├── /api/bookings/[id] (GET — single booking detail)
│   │   ├── /api/bookings/[id]/cancel (POST — cancel booking)
│   │   ├── /api/bookings/[id]/reschedule (POST — reschedule booking)
│   │   ├── /api/leads (POST — lead capture from /book)
│   │   ├── /api/onboarding/complete (POST — save onboarding data)
│   │   ├── /api/push/subscribe (POST — register push subscription)
│   │   ├── /api/push/unsubscribe (DELETE — remove push sub)
│   │   └── /api/ably/token (POST — scoped Ably JWT token)
│   │
│   ├── Admin API (served at admin.theroyalglow.in/api/*)
│   │   ├── /api/bookings/[id] (PATCH — approve/reject/assign)
│   │   ├── /api/bookings/[id]/complete (POST — checkout + invoice)
│   │   ├── /api/bookings/[id]/noshow (POST — mark no-show)
│   │   ├── /api/memberships (POST — create membership)
│   │   ├── /api/memberships/[id]/session (POST — record session)
│   │   ├── /api/leave (POST — submit leave request)
│   │   └── /api/leave/[id] (PATCH — approve/reject leave)
│   │
│   ├── Background Jobs (QStash — served at admin.theroyalglow.in/api/jobs/*, hosted in apps/admin)
│   │   ├── /api/jobs/appointment-reminders (every 15 min)
│   │   ├── /api/jobs/membership-expiry (daily 12:30 AM IST)
│   │   ├── /api/jobs/birthday-emails (daily 9:30 AM IST)
│   │   ├── /api/jobs/membership-usage-nudges (Wed 11:00 AM IST)
│   │   ├── /api/jobs/lead-followups (daily 10:30 AM IST)
│   │   ├── /api/jobs/daily-sales-report (daily 10:30 PM IST)
│   │   ├── /api/jobs/weekly-report (Mon 9:00 AM IST)
│   │   ├── /api/jobs/gems-expiry-reminder (daily 10:30 AM IST)
│   │   ├── /api/jobs/post-service-followup (+24h after completed)
│   │   ├── /api/jobs/stale-booking-alert (+2h after pending created)
│   │   ├── /api/jobs/noshow-check (+15min after scheduled end)
│   │   └── /api/jobs/membership-expired-notice (+1h after expires_at)
│   │
│   └── Incoming Webhooks
│       ├── /api/webhooks/meta-leads (POST — Meta Lead Gen forms)
│       └── /api/webhooks/aisensy (POST — WhatsApp status updates)
│

├── EXTERNAL SUBDOMAINS
│   ├── admin.theroyalglow.in (Admin portal — standalone Next.js app, RBAC-gated)
│   ├── cms.theroyalglow.in (Payload CMS — blog, gallery, FAQs)
│   ├── docs.theroyalglow.in (Mintlify — developer documentation)
│   └── status.theroyalglow.in (BetterStack — public uptime status)
│
└── SPECIAL FILES & ENDPOINTS
    ├── /sitemap.xml (Generated — static + dynamic blog routes)
    ├── /robots.txt (Generated — AI crawlers allowed, /api/ and /profile/ blocked; admin portal is at admin.theroyalglow.in — separate app, separate robots)
    ├── /llms.txt (AI agent discovery — site description, services)
    ├── /llms-full.txt (Extended — full menu, prices, booking instructions)
    ├── /manifest.json (PWA manifest — branding, icons, standalone)
    ├── /sw.js (Service worker — offline cache strategy)
    ├── /opengraph-image (Generated OG image — brand default)
    ├── /favicon.ico (32x32 favicon)
    ├── /apple-icon.png (180x180 iOS homescreen icon)
    └── /api/health (Health check — DB, Redis, timestamp)
```

---

## 2. Navigation Structure

### 2.1 Header Navigation (Customer)

**Desktop — Full horizontal nav:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [Royal Glow Logo]   Services  Offers  About  Contact  Blog  FAQ            │
│                                                          [Sign In] [Book Now]│
└─────────────────────────────────────────────────────────────────────────────┘

When signed in:
┌─────────────────────────────────────────────────────────────────────────────┐
│ [Royal Glow Logo]   Services  Offers  About  Contact  Blog  FAQ            │
│                                              [Avatar ▼] [Book Now]          │
│                                              ├── My Profile                 │
│                                              ├── My Bookings                │
│                                              ├── Membership (if active)     │
│                                              ├── Royal Gems                 │
│                                              └── Sign Out                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Mobile — Hamburger menu:**
```
┌──────────────────────────┐
│ [Logo]        [☰] [Book] │
└──────────────────────────┘

Hamburger overlay:
┌──────────────────────────┐
│                      [✕]  │
│  Services                 │
│  Offers                   │
│  About                    │
│  Contact                  │
│  Blog                     │
│  FAQ                      │
│  ─────────────────────    │
│  My Profile (if auth)     │
│  My Bookings (if auth)    │
│  Membership (if active)   │
│  Royal Gems (if auth)     │
│  ─────────────────────    │
│  Sign In / Sign Out       │
└──────────────────────────┘
```


### 2.2 Footer Navigation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ROYAL GLOW SALON & SPA                                                     │
│                                                                             │
│  Quick Links        Legal              Connect            Hours             │
│  ──────────────     ──────────────     ──────────────     ──────────────    │
│  Services           Privacy Policy     📍 [Address]       Mon–Sat: 10–8    │
│  Offers             Terms of Service   📞 +91 63601...    Sun: 11–7        │
│  About Us           Refund Policy      ✉ hello@the...                      │
│  Blog                                  📸 Instagram                         │
│  FAQ                                   📘 Facebook                          │
│  Contact                                                                    │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│  © 2026 Royal Glow Salon & SPA. All rights reserved.  [Cookie Preferences] │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Admin Sidebar Navigation

```
┌──────────────────────────┐
│  [Royal Glow Admin]      │
│  ════════════════════     │
│                           │
│  OVERVIEW                 │
│  ├── Dashboard            │  ← All roles (Staff sees limited)
│                           │
│  OPERATIONS               │
│  ├── Bookings             │  ← Receptionist+
│  ├── Waitlist             │  ← Receptionist+
│  ├── Schedule             │  ← Receptionist+
│  ├── Leave                │  ← Staff+ (own only) / Receptionist+ (all)
│                           │
│  CRM                      │
│  ├── Customers            │  ← Receptionist+
│  ├── Leads                │  ← Receptionist+
│  ├── Memberships          │  ← Receptionist+
│                           │
│  CATALOGUE                │
│  ├── Services             │  ← Manager+
│  ├── Offers               │  ← Manager+
│                           │
│  FINANCE                  │
│  ├── Billing              │  ← Receptionist+
│  ├── Reports              │  ← Manager+
│                           │
│  PEOPLE                   │
│  ├── Staff                │  ← Manager+
│  ├── Users                │  ← Owner+
│                           │
│  SYSTEM                   │
│  ├── Settings             │  ← Manager+
│  ├── Branches             │  ← Owner+
│  ├── Integrations         │  ← Developer only
│  └── Logs                 │  ← Developer only
│                           │
│  ════════════════════     │
│  [Avatar] Name            │
│  Role Badge               │
│  [Sign Out]               │
└──────────────────────────┘
```

### 2.4 Customer Mobile — Sticky "Book Now" CTA

```
Mobile bottom (not a tab bar — just a sticky CTA):
┌──────────────────────────────────┐
│                                  │
│  [ ★ Book Now — Royal Glow ]     │  ← Opens /?book=1 dialog
│                                  │
└──────────────────────────────────┘
```

Note: The customer site does NOT use a bottom tab bar. Navigation is via the hamburger menu (top) and a sticky "Book Now" floating CTA at the viewport bottom on mobile.


### 2.5 Breadcrumb Structure

```
Page                            Breadcrumbs
──────────────────────────────  ─────────────────────────────────────────────
/                               (none — homepage)
/services                       Home > Services
/offers                         Home > Offers
/about                          Home > About Us
/contact                        Home > Contact
/blog                           Home > Blog
/blog/[slug]                    Home > Blog > [Article Title]
/faq                            Home > FAQ
/profile                        Home > My Profile
/bookings                       Home > My Bookings
/bookings/[id]                  Home > My Bookings > #BKRS...
/membership                     Home > Membership
/gems                           Home > Royal Gems
/privacy                        Home > Privacy Policy
/terms                          Home > Terms of Service
/refund-policy                  Home > Refund Policy
# Admin app — served at admin.theroyalglow.in (Root-Path Convention, no /admin prefix)
/                               Admin > Dashboard
/bookings                       Admin > Bookings
/bookings/new                   Admin > Bookings > Create Walk-in
/bookings/[id]                  Admin > Bookings > #BKRS...
/customers                      Admin > Customers
/customers/[id]                 Admin > Customers > [Name]
/leads                          Admin > Leads
/leads/[id]                     Admin > Leads > [Name]
/staff                          Admin > Staff
/staff/new                      Admin > Staff > Add Staff
/staff/[id]                     Admin > Staff > [Name]
/schedule                       Admin > Schedule
/leave                          Admin > Leave
/services                       Admin > Services (redirect to Payload CMS)
/offers                         Admin > Offers
/offers/new                     Admin > Offers > Create Offer
/offers/[id]                    Admin > Offers > [Name]
/memberships                    Admin > Memberships
/memberships/new                Admin > Memberships > Create
/memberships/[id]               Admin > Memberships > #RGMEM...
/billing                        Admin > Billing
/billing/[id]                   Admin > Billing > #INV...
/reports                        Admin > Reports
/reports/financial              Admin > Reports > Financial
/reports/salon                  Admin > Reports > Salon
/reports/spa                    Admin > Reports > SPA
/reports/staff                  Admin > Reports > Staff
/reports/leads                  Admin > Reports > Leads
/settings                       Admin > Settings
/branches                       Admin > Branches
/branches/[id]                  Admin > Branches > [Name]
/users                          Admin > Users
/integrations                   Admin > Integrations
/logs                           Admin > Logs
```

---

## 3. Page Depth Levels

| Level | Clicks from Homepage | Pages |
|-------|---------------------|-------|
| **0** | 0 | `/` (Homepage) |
| **1** | 1 | `/services`, `/offers`, `/about`, `/contact`, `/blog`, `/faq`, `/profile`, `/bookings`, `/membership`, `/gems`, `/sign-in`, `/privacy`, `/terms`, `/refund-policy`, `/?book=1` |
| **2** | 2 | `/blog/[slug]`, `/bookings/[id]`, `/onboarding`, `/book` (via ad click) |
| **3** | 1 (direct nav) | `/admin` → `admin.theroyalglow.in/` (dashboard) |
| **3** | 2 | `admin.theroyalglow.in/bookings`, `/customers`, `/leads`, `/staff`, `/schedule`, `/leave`, `/services`, `/offers`, `/memberships`, `/billing`, `/reports`, `/settings`, `/branches`, `/users`, `/integrations`, `/logs`, `/waitlist` |
| **4** | 3 | `admin.theroyalglow.in/bookings/[id]`, `/bookings/new`, `/customers/[id]`, `/leads/[id]`, `/staff/[id]`, `/staff/new`, `/offers/[id]`, `/offers/new`, `/memberships/[id]`, `/memberships/new`, `/billing/[id]`, `/branches/[id]`, `/reports/financial`, `/reports/salon`, `/reports/spa`, `/reports/staff`, `/reports/leads` |

**Notes:**
- Admin pages count from their own entry point (`/admin` = Level 3 from homepage, but Level 0 within admin context)
- The booking dialog (`/?book=1`) is Level 1 since it's triggered by the primary CTA on homepage
- `/book` (ad landing) is entered directly from Meta ads — Level 0 from that entry context


---

## 4. User Navigation Flows

### 4.1 New Customer Discovery Flow

```
┌─────────────┐     ┌──────────────┐     ┌───────────┐     ┌───────────┐
│  Google     │     │              │     │           │     │           │
│  Search /   │────▶│  / Homepage  │────▶│ /services │────▶│ "Book     │
│  Instagram  │     │              │     │           │     │  This"    │
└─────────────┘     └──────────────┘     └───────────┘     └─────┬─────┘
                                                                  │
                                                                  ▼
┌─────────────┐     ┌──────────────┐     ┌───────────┐     ┌───────────┐
│  Booking    │     │              │     │           │     │ /?book=1  │
│  submitted  │◀────│ /onboarding  │◀────│ /sign-in  │◀────│ &service= │
│  (pending)  │     │ (first time) │     │           │     │ [slug]    │
└─────┬───────┘     └──────────────┘     └───────────┘     └───────────┘
      │
      ▼
┌─────────────┐
│ /bookings   │
│ (view mine) │
└─────────────┘
```

### 4.2 Returning Customer Booking Flow

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│              │     │  /?book=1         │     │  Booking         │
│  / Homepage  │────▶│  (4-step dialog)  │────▶│  submitted       │
│  (signed in) │     │  already auth'd   │     │  (status:pending)│
└──────────────┘     └──────────────────┘     └────────┬────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │  /bookings       │
                                               │  (see upcoming)  │
                                               └─────────────────┘
```

### 4.3 Meta Ad Conversion Flow

```
┌───────────────┐     ┌──────────────────┐     ┌────────────────┐
│  Meta/IG Ad   │     │  /book            │     │  Lead created   │
│  (user taps)  │────▶│  (lead capture    │────▶│  Meta CAPI:Lead │
│               │     │   form — 3 fields)│     │  event fired    │
└───────────────┘     └──────────────────┘     └───────┬────────┘
                                                        │
                                                        ▼
┌───────────────┐     ┌──────────────────┐     ┌────────────────┐
│  Booking      │     │  /?book=1         │     │  Redirect to   │
│  submitted    │◀────│  &leadId={id}     │◀────│  homepage with │
│  (pending)    │     │  (dialog opens)   │     │  lead context  │
└───────┬───────┘     └──────────────────┘     └────────────────┘
        │                      │
        │               ┌──────┴──────┐
        │               │  /sign-in   │  ← if not already signed in
        │               │  (prompted  │     (sessionStorage preserves
        │               │   mid-flow) │      book=1 + leadId)
        │               └─────────────┘
        ▼
┌───────────────┐
│  /bookings    │
│  (conversion  │
│   complete)   │
└───────────────┘
```

### 4.4 Admin Daily Workflow (Receptionist)

```
┌──────────────┐     ┌────────────────────┐     ┌─────────────────┐
│              │     │  admin.theroyalglow │     │ /bookings        │
│  Sign in     │────▶│  .in/ (Dashboard)   │────▶│ (pending filter) │
│              │     │  See pending count   │     │                  │
└──────────────┘     └────────────────────┘     └────────┬─────────┘
                                                          │
                                                          ▼
┌──────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ /billing         │     │  Checkout flow    │     │ /bookings       │
│ /[id] (invoice)  │◀────│  (on complete)    │◀────│ /[id] (approve  │
│                  │     │  Payment + PDF    │     │  assign staff)  │
└──────────────────┘     └──────────────────┘     └─────────────────┘
```

### 4.5 Staff Daily Flow

```
┌──────────────┐     ┌─────────────────────┐     ┌───────────────────┐
│              │     │  admin.theroyalglow  │     │  View today's      │
│  Sign in     │────▶│  .in/ (My Schedule) │────▶│  assigned          │
│              │     │  Today's appointments│     │  appointments      │
└──────────────┘     └─────────────────────┘     └──────────┬────────┘
                                                             │
                              ┌───────────────────┐          │
                              │  /leave            │          │
                              │  (Submit request)  │◀─────────┘
                              │  View own history  │    (if needed)
                              └───────────────────┘
```


---

## 5. Cross-linking Map

### 5.1 Public Pages — Outgoing Links

| Source Page | Links To |
|-------------|----------|
| `/` (Homepage) | `/services`, `/offers`, `/about`, `/contact`, `/blog`, `/faq`, `/sign-in`, `/?book=1`, `/privacy`, `/terms`, `/refund-policy` |
| `/services` | `/?book=1&service=[slug]` (per service), `/` (logo), `/offers`, `/contact` |
| `/offers` | `/?book=1` (with offer context), `/services`, `/` |
| `/about` | `/services`, `/contact`, `/?book=1`, `/` |
| `/contact` | `/` (logo), `/?book=1`, Google Maps (external) |
| `/blog` | `/blog/[slug]` (each article), `/` |
| `/blog/[slug]` | `/?book=1` (CTA banner), `/blog` (back), related `/blog/[slug]` posts, `/` |
| `/faq` | `/contact` ("Still have questions?"), `/?book=1`, `/refund-policy`, `/privacy`, `/` |

### 5.2 Authenticated Pages — Outgoing Links

| Source Page | Links To |
|-------------|----------|
| `/profile` | `/privacy`, `/` |
| `/bookings` | `/bookings/[id]`, `/?book=1` ("Book Now" CTA) |
| `/bookings/[id]` | `/bookings` (back), `/?book=1` ("Book Again"), Google Maps review (external) |
| `/membership` | `/contact` (renewal enquiry), `/` |
| `/gems` | `/?book=1` ("Book Now" CTA), `/` |

### 5.3 Admin Pages — Outgoing Links

> All paths below are relative to `admin.theroyalglow.in`.

| Source Page | Links To |
|-------------|----------|
| `/` (dashboard) | `/bookings` (pending), `/bookings/new`, `/schedule`, `/leads` |
| `/bookings` | `/bookings/[id]`, `/bookings/new` |
| `/bookings/[id]` | `/customers/[id]`, `/billing/[id]` (invoice after complete), `/bookings` |
| `/customers` | `/customers/[id]` |
| `/customers/[id]` | `/bookings/[id]` (booking history rows), `/leads/[id]` (if from lead), `/memberships/[id]` |
| `/leads` | `/leads/[id]` |
| `/leads/[id]` | `/bookings/[id]` (if converted), `/customers/[id]`, AiSensy (external) |
| `/staff` | `/staff/[id]`, `/staff/new` |
| `/memberships` | `/memberships/[id]`, `/memberships/new` |
| `/memberships/[id]` | `/customers/[id]`, `/billing/[id]` (purchase invoice) |
| `/billing` | `/billing/[id]` |
| `/billing/[id]` | `/bookings/[id]` (linked booking), `/customers/[id]` |
| `/reports` | `/reports/financial`, `/reports/salon`, `/reports/spa`, `/reports/staff`, `/reports/leads` |
| `/branches` | `/branches/[id]` |
| `/services` | `cms.theroyalglow.in/admin/collections/service` (external redirect) |
| `/offers` | `/offers/[id]`, `/offers/new` |
| `/integrations` | Sentry (external), BetterStack (external) |
| `/logs` | Sentry dashboard (external) |

### 5.4 Auth Flow Cross-links

| Source Page | Links To |
|-------------|----------|
| `/sign-in` | `/privacy`, `/terms`, Google OAuth (external redirect) |
| `/onboarding` | `/privacy` (consent link), `/` (on success redirect) |
| `/book` | `/?book=1&leadId={id}` (post-submit redirect) |

---

## 6. Entry Points (How Users Arrive)

| Entry Source | Landing URL | Context |
|--------------|-------------|---------|
| Google Search (organic) | `/`, `/services`, `/blog/[slug]`, `/faq`, `/about`, `/contact` | SEO-indexed public pages |
| Google Maps / GMB | `/?book=1&utm_source=gmb` | "Book" action button on Google Maps listing |
| In-store QR code | `/?book=1&utm_source=walkin` | QR posters at reception, mirrors, tables |
| Meta/Instagram ads | `/book?utm_source=meta&utm_campaign=X&utm_content=Y` | Paid campaign traffic → lead capture |
| Direct URL / Bookmark | `/` | Returning visitors, typed URL |
| Push notification tap | `/bookings/[id]` | Appointment reminder, status change alert |
| Email link (Resend) | `/bookings`, `/bookings/[id]`, `/membership`, `/gems` | Booking confirmations, membership reminders, gems expiry |
| Brevo email (marketing) | `/offers`, `/?book=1`, `/services` | Promotional campaigns, birthday offers |
| WhatsApp link (AiSensy) | `/?book=1` | Lead follow-up message links |
| Instagram bio link | `/` or `/?book=1` | Profile link-in-bio |
| Referral / Word-of-mouth | `/` | Shared link |
| Google AI Overview | `/faq`, `/services`, `/blog/[slug]` | Answer-first FAQ content, structured data |
| `/llms.txt` discovery | `/`, `/services`, `/api/health` | AI agent crawlers |
| PWA homescreen icon | `/` (start_url in manifest) | Installed PWA launch |
| Status page link | `status.theroyalglow.in` | Incident notifications |


---

## 7. URL Structure Convention

### 7.1 Naming Patterns

| Scope | Pattern | Examples |
|-------|---------|----------|
| Customer pages | `/noun` (short, clean, SEO-friendly) | `/services`, `/offers`, `/bookings`, `/profile`, `/gems` |
| Customer detail | `/noun/[id]` or `/noun/[slug]` | `/bookings/[id]`, `/blog/[slug]` |
| Admin list pages | `subdomain/noun` (at `admin.theroyalglow.in`) | `/bookings`, `/customers`, `/leads` |
| Admin detail pages | `subdomain/noun/[id]` | `/bookings/[id]`, `/customers/[id]` |
| Admin create pages | `subdomain/noun/new` | `/bookings/new`, `/staff/new`, `/offers/new` |
| Admin sub-reports | `subdomain/reports/topic` | `/reports/financial`, `/reports/salon` |
| API — customer | `/api/noun` or `/api/noun/[id]/action` | `/api/bookings`, `/api/bookings/[id]/cancel` |
| API — admin | `/api/noun/[id]` or `/api/noun/[id]/action` (at `admin.theroyalglow.in/api/`) | `/api/bookings/[id]`, `/api/bookings/[id]/complete` |
| API — jobs | `/api/jobs/descriptive-name` | `/api/jobs/appointment-reminders`, `/api/jobs/membership-expiry` |
| API — webhooks | `/api/webhooks/source` | `/api/webhooks/meta-leads`, `/api/webhooks/aisensy` |
| Legal | `/noun-noun` (hyphenated) | `/privacy`, `/terms`, `/refund-policy` |
| External subdomains | `subdomain.theroyalglow.in` | `admin.`, `docs.`, `status.` |

### 7.2 Dynamic Segments

| Segment | Format | Used In |
|---------|--------|---------|
| `[id]` | UUID or CUID2 (auto-generated) | Bookings, customers, leads, staff, services, offers, memberships, invoices, branches, leave |
| `[slug]` | Kebab-case string (human-readable) | Blog posts (`/blog/best-facial-treatments-bengaluru`), services (`hair-spa-treatment`) |
| `[...betterauth]` | Catch-all dynamic segment | Better Auth route handler (`/api/auth/*`) |

### 7.3 Query Parameters

| Parameter | Type | Used On | Purpose |
|-----------|------|---------|---------|
| `?book=1` | Flag | `/` | Auto-open booking dialog on mount |
| `?service=[slug]` | String | `/?book=1` | Pre-select service in Step 3 of dialog |
| `?leadId={id}` | UUID | `/?book=1` | Link lead record to booking |
| `?utm_source=X` | String | `/`, `/book` | Acquisition source tracking (gmb, walkin, meta) |
| `?utm_campaign=X` | String | `/book` | Meta campaign name |
| `?utm_content=X` | String | `/book` | Ad creative identifier |
| `?status=X` | Enum | `admin.theroyalglow.in/bookings` | Filter bookings by status |
| `?page=X` | Number | Lists | Pagination parameter |

### 7.4 URL Formatting Rules

- All URLs are **lowercase**
- Words separated by **hyphens** (not underscores)
- No trailing slashes (Next.js default)
- Dynamic IDs are **not exposed** in customer-facing nav (shown in browser URL bar only)
- Blog slugs are **auto-generated** from title in Payload CMS (editable)
- Booking numbers (display format `#BKRS2605H38291`) are different from URL IDs (UUID)

---

## 8. 404 and Error Handling Routes

### 8.1 Error Scenarios & Behaviour

```
┌─────────────────────────────────────────────────────────────────────┐
│  SCENARIO                    │  BEHAVIOUR                           │
├─────────────────────────────────────────────────────────────────────┤
│                              │                                      │
│  Non-existent page           │  → Custom 404 page                   │
│  (e.g., /xyz)               │    "Page not found"                  │
│                              │    [Go to Homepage] button            │
│                              │    Royal Glow branding                │
│                              │                                      │
│  Unauthenticated access      │  → Redirect to /sign-in             │
│  (e.g., /profile, /bookings)│    returnTo param preserved          │
│                              │    After sign-in → redirect back     │
│                              │                                      │
│  Insufficient role           │  → Redirect to admin.theroyalglow.in│
│  (e.g., Staff → /reports)   │    Toast: "Access denied. You        │
│                              │    don't have permission."           │
│                              │                                      │
│  Expired/invalid booking ID  │  → "Booking not found"              │
│  (/bookings/[invalid-id])    │    [Back to My Bookings] link        │
│                              │    (customer) or [Back to            │
│                              │    Bookings] (admin)                  │
│                              │                                      │
│  Expired/invalid blog slug   │  → "Article not found"              │
│  (/blog/[invalid-slug])      │    [Back to Blog] link               │
│                              │                                      │
│  Expired/invalid customer ID │  → "Customer not found"             │
│  (admin.theroyalglow.in/    │    [Back to Customers] link          │
│   customers/[bad-id])        │                                      │
│                              │                                      │
│  Expired/invalid lead ID     │  → "Lead not found"                 │
│  (admin.theroyalglow.in/    │    [Back to Leads] link              │
│   leads/[bad-id])            │                                      │
│                              │                                      │
│  Server error (500)          │  → Custom 500 page                   │
│                              │    "Something went wrong"             │
│                              │    [Try Again] button                 │
│                              │    Error reported to Sentry           │
│                              │                                      │
│  API errors                  │  → JSON: { success: false,          │
│  (any /api/* route)          │    error: { code, message } }        │
│                              │    HTTP status codes:                 │
│                              │    400 (validation), 401 (unauth),   │
│                              │    403 (forbidden), 404 (not found), │
│                              │    429 (rate limited), 500 (server)  │
│                              │                                      │
│  Ownership violation         │  → 404 (not 403)                    │
│  (viewing someone else's     │    Security: don't reveal existence  │
│   booking)                   │    of other users' resources         │
│                              │                                      │
│  Offline (PWA)               │  → Cached pages served               │
│  (no network)                │    Non-cached pages: "You're offline │
│                              │    — connect to internet to view"     │
│                              │                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.2 Redirect Map

| Condition | From | To | Method |
|-----------|------|----|--------|
| Not signed in | Any auth-gated page | `/sign-in?returnTo={current}` | Server redirect (middleware) |
| Profile incomplete | Any page (post-OAuth) | `/onboarding` | Server redirect |
| Profile already complete | `/onboarding` | `/` | Server redirect |
| Role insufficient | Admin page above user's role | `admin.theroyalglow.in/` + toast | Client redirect |
| Already signed in | `/sign-in` | `/` | Server redirect |
| Post-onboarding | `/onboarding` (submit) | `/` (with ?book=1 if in sessionStorage) | Client redirect |
| Post-lead-capture | `/book` (submit) | `/?book=1&leadId={id}` | Client redirect |
| Booking not owned | `/bookings/[id]` (other user) | 404 page | Server response |

### 8.3 Custom Error Page Design

```
┌─────────────────────────────────────────┐
│                                         │
│         [Royal Glow Logo]               │
│                                         │
│         ┌─────────────────┐             │
│         │      404        │             │
│         └─────────────────┘             │
│                                         │
│    Oops! This page doesn't exist.       │
│                                         │
│    The page you're looking for may      │
│    have been moved or doesn't exist.    │
│                                         │
│    ┌──────────────────────────┐         │
│    │   Go to Homepage  →      │         │
│    └──────────────────────────┘         │
│                                         │
│    Or try: Services | Book Now | FAQ    │
│                                         │
└─────────────────────────────────────────┘
```

---

## Appendix: Route Count Verification

| Category | Count |
|----------|-------|
| Customer public pages | 8 |
| Customer authenticated pages | 5 |
| Booking dialog (overlay, not a route) | 1 |
| Auth flow pages | 2 |
| Landing pages (ad-only) | 1 |
| Legal pages | 3 |
| Admin pages | 37 |
| Customer API routes | 13 |
| Admin API routes | 7 |
| Background job endpoints | 12 |
| Webhook endpoints | 2 |
| External subdomains | 3 |
| Special files/endpoints | 10 |
| **Total** | **~104** |
