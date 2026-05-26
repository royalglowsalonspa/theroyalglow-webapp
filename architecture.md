# Architecture & Infrastructure

## Hosting Decision

**Choice: Cloudflare Pages + Workers**

### Why Cloudflare over Vercel
- Vercel's billing scales quickly past 20k monthly users (bandwidth + function invocations add up fast)
- Cloudflare Pages + Workers handles massive scale at a fraction of the cost
- Next.js app runs at the **edge globally** — users in Mumbai, London, and New York all get sub-100ms responses
- Cloudflare's free tier is very generous for a solo developer

### Why Render (Two Roles)
Render serves two purposes in this stack:

1. **SSR fallback origin** — some SSR workloads exceed Cloudflare Workers' 50ms CPU wall time. Render handles those requests behind Cloudflare.
2. **Payload CMS admin host** — Payload requires Node.js 20.9+ and cannot run on Cloudflare Workers (V8 isolate, not Node.js). Render hosts the admin panel at `admin.theroyalglow.in`.

**Plan: Free tier** — only 2 admin users, content changes every ~2 months. The ~30–60s cold start on first access is acceptable for internal use.
**Region: Singapore** — closest Render region to India for lower admin panel latency.
**Upgrade path:** Render Starter ($7/mo) disables spin-down if cold starts become a problem.

---

## Admin Portal & Blog Routing

### Admin Portal — `/admin/*` (Same Next.js App)

**Decision: Use `/admin/*` routes in the same Next.js application (not a separate subdomain).**

**Admin routes:**
```
theroyalglow.in/admin/bookings
theroyalglow.in/admin/leads
theroyalglow.in/admin/billing
theroyalglow.in/admin/staff
theroyalglow.in/admin/settings
```

**Security:** All `/admin/*` routes are gated by Better Auth RBAC — role check in middleware before any admin page renders. Receptionist is the lowest admin role. Manager+ can access `/admin/settings`, and non-admin Staff cannot access `/admin/*` at all.

### Blog — Payload CMS + `/blog/*`

**Decision: Manage blogs in Payload CMS, serve at `/blog/*` on the main domain.**

- Blog content managed at: `admin.theroyalglow.in` (Payload CMS)
- Blog posts rendered at: `theroyalglow.in/blog/*` (Next.js fetches from Payload API)

**Why:** Blogs are part of the main site marketing content, so serving them on the main domain improves local SEO ranking.

### Documentation Portal — Fumadocs + `docs.theroyalglow.in`

**Decision: Use Fumadocs for the documentation site at `docs.theroyalglow.in`.**

- Documentation is maintained in the repo with Fumadocs
- Docs are served at: `docs.theroyalglow.in`
- Purpose: technical docs, setup guides, architecture notes, and internal reference pages

**Why:** Fumadocs is perfectly aligned with the stack — it is built for Next.js, TypeScript-first, and looks premium out of the box.

**API reference auto-generation:** The `fumadocs-openapi` package generates the entire `/api-reference` section directly from the OpenAPI/Swagger spec. Once the API routes are built and the spec is exported, API docs require zero manual writing — every endpoint, param, and response schema is generated automatically.

### DNS & Routing Summary

```
theroyalglow.in (root domain)
├─ /                    (homepage + Book Now dialog; ?book=1 auto-opens dialog)
├─ /services            (service catalogue — all categories)
├─ /offers              (active offers & combos)
├─ /about               (story, team gallery)
├─ /contact             (socials, Google Maps, form)
├─ /profile             (auth required)
├─ /bookings/*          (auth required — list + detail)
├─ /membership          (auth required)
├─ /gems                (auth required)
├─ /blog/*              (Payload CMS content — ISR, 1h revalidation)
├─ /faq                  (FAQ — SSG, FAQPage JSON-LD)
├─ /book                (Meta/Instagram ad lead capture only — no nav, creates lead source meta_ad)
├─ /sign-in             (Google OAuth entry point)
├─ /onboarding          (first-time setup — auth required)
├─ /privacy             (DPDP Act — SSG)
├─ /terms               (SSG)
├─ /refund-policy       (SSG)
└─ /admin/*             (RBAC gated — admin roles only)

admin.theroyalglow.in
└─ Payload CMS (blog, gallery, team, banners, FAQ)

docs.theroyalglow.in
└─ Fumadocs documentation portal

status.theroyalglow.in
└─ BetterStack (uptime monitoring)
```

**Booking route contract:**
- Homepage `Book Now` / `Book Appointment` opens the 4-step dialog over `/`; it never redirects to `/book`.
- `https://theroyalglow.in/?book=1&utm_source=gmb` is the Google Maps/GMB deep-link and opens the same homepage dialog with source `gmb`.
- `https://theroyalglow.in/?book=1&utm_source=walkin` is the in-store QR deep-link and opens the same homepage dialog with source `walkin`.
- `https://theroyalglow.in` without UTM defaults new online customers to first-touch source `organic`.
- `/book` is a Meta/Instagram ad lead form only. It creates a `lead` with source `meta_ad`; no login is required and no slot is reserved until the user later submits the homepage booking dialog.
- Before Google OAuth redirect, persist `book=1`, `utm_source`, and UTM fields in session/local storage so onboarding can write the correct first-touch `customer_profile.acquisition_source`.

---

## Full Infrastructure Stack

```
                        ┌─────────────────────────┐
                        │     Cloudflare DNS       │
                        │   + DDoS Protection      │
                        └────────────┬────────────┘
                                     │
                        ┌────────────▼────────────┐
                        │  Cloudflare Pages        │
                        │  (Static assets + CDN)   │
                        └────────────┬────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                                 │
       ┌────────────▼────────────┐   ┌───────────────▼──────────┐
       │  Cloudflare Workers     │   │  Render (Singapore)      │
       │  (Edge SSR / API routes)│   │  SSR fallback +          │
       │                         │   │  Payload CMS /admin      │
       └────────────┬────────────┘   └───────────────┬──────────┘
                    │                                 │
                    └────────────────┬────────────────┘
                                     │
           ┌─────────────────────────┼──────────────────────────┐
           │                         │                          │
┌──────────▼──────────┐  ┌───────────▼───────────┐  ┌──────────▼──────────┐
│      Neon DB         │  │   Cloudflare R2        │  │  Upstash Redis       │
│  (Primary Postgres   │  │   (File storage:       │  │  (Cache, rate limit, │
│   4 branches,        │  │    photos, invoices)   │  │   QStash job queue)  │
│   pg_cron, Drizzle) │  └────────────────────────┘  └─────────────────────┘
└─────────────────────┘
```

---

## Project Structure — Monorepo

**Architecture: Monorepo with strict layer separation.** Not micro-frontends — one codebase, one deployment, clean boundaries between UI, API, business logic, and database.

> Micro-frontend architecture was evaluated and rejected: designed for multi-team enterprise orgs, adds module federation complexity, cross-app routing overhead, and shared state problems with zero benefit for a solo developer on a single stack.

```
rgss_solutions/
│
├── apps/
│   ├── web/                              ← Next.js 16 application (Cloudflare Pages + Workers)
│   │   ├── app/                          ← App Router (file-system based routing)
│   │   │   ├── layout.tsx               ← Root layout (<html>, <body>, providers, fonts)
│   │   │   ├── global-error.tsx         ← Global error boundary (catches root layout errors)
│   │   │   ├── not-found.tsx            ← Global 404 page
│   │   │   ├── sitemap.ts              ← Generated sitemap (static routes + dynamic blog posts from Payload API + FAQ)
│   │   │   ├── robots.ts               ← Generated robots.txt (allows AI crawlers)
│   │   │   ├── opengraph-image.tsx      ← Default OG image (generated, branded)
│   │   │   ├── favicon.ico             ← Favicon (Next.js metadata API)
│   │   │   ├── apple-icon.png          ← Apple home screen icon (180×180, for iOS PWA)
│   │   │   │
│   │   │   ├── (customer)/              ← Route group: customer-facing pages
│   │   │   │   ├── layout.tsx           ← Customer layout: header, footer, nav
│   │   │   │   ├── loading.tsx          ← Shared loading skeleton (Suspense boundary)
│   │   │   │   ├── error.tsx            ← Error boundary for customer routes
│   │   │   │   ├── page.tsx             ← / (homepage + "Book Now" dialog; ?book=1 deep-link)
│   │   │   │   ├── services/
│   │   │   │   │   └── page.tsx         ← /services (all categories, Salon/SPA toggle)
│   │   │   │   ├── offers/
│   │   │   │   │   └── page.tsx         ← /offers (active offers & combos)
│   │   │   │   ├── about/
│   │   │   │   │   └── page.tsx         ← /about (story, team gallery)
│   │   │   │   ├── contact/
│   │   │   │   │   └── page.tsx         ← /contact (socials, Google Maps, form)
│   │   │   │   ├── profile/
│   │   │   │   │   └── page.tsx         ← /profile (edit fields, notification prefs)
│   │   │   │   ├── bookings/
│   │   │   │   │   ├── page.tsx         ← /bookings (upcoming & past, reschedule/cancel)
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx     ← /bookings/[id] (detail, status timeline, services, notes)
│   │   │   │   ├── membership/
│   │   │   │   │   └── page.tsx         ← /membership (tier, hours, session history)
│   │   │   │   ├── gems/
│   │   │   │   │   └── page.tsx         ← /gems (catalogue + balance)
│   │   │   │   ├── blog/
│   │   │   │   │   ├── page.tsx         ← /blog (list — fetches from Payload API)
│   │   │   │   │   └── [slug]/
│   │   │   │   │       └── page.tsx     ← /blog/[slug] (single post from Payload, BlogPosting + BreadcrumbList JSON-LD)
│   │   │   │   └── faq/
│   │   │   │       └── page.tsx         ← /faq (FAQPage JSON-LD — SSG, revalidate: false)
│   │   │   │
│   │   │   ├── (auth)/                  ← Route group: auth pages (no main nav)
│   │   │   │   ├── layout.tsx           ← Auth layout: minimal chrome, centered card
│   │   │   │   ├── template.tsx         ← Re-renders on navigation (clears form state)
│   │   │   │   ├── onboarding/
│   │   │   │   │   └── page.tsx         ← /onboarding (first-time: name, phone, DOB, consent)
│   │   │   │   └── sign-in/
│   │   │   │       └── page.tsx         ← /sign-in (Google OAuth entry point)
│   │   │   │
│   │   │   ├── (landing)/              ← Route group: distraction-free pages (no nav)
│   │   │   │   ├── layout.tsx           ← Minimal layout: no header/footer (conversion-optimised)
│   │   │   │   └── book/
│   │   │   │       └── page.tsx         ← /book (Meta/Instagram lead capture only → lead source meta_ad)
│   │   │   │
│   │   │   ├── (legal)/                ← Route group: static legal pages (SSG)
│   │   │   │   ├── layout.tsx           ← Customer layout reused (header, footer, nav)
│   │   │   │   ├── privacy/
│   │   │   │   │   └── page.tsx         ← /privacy (DPDP Act)
│   │   │   │   ├── terms/
│   │   │   │   │   └── page.tsx         ← /terms
│   │   │   │   └── refund-policy/
│   │   │   │       └── page.tsx         ← /refund-policy
│   │   │   │
│   │   │   ├── admin/                   ← Admin portal (/admin/*) — RBAC gated
│   │   │   │   ├── layout.tsx           ← Admin layout: sidebar nav, role check middleware
│   │   │   │   ├── loading.tsx          ← Admin loading skeleton (sidebar persists, content streams)
│   │   │   │   ├── error.tsx            ← Admin error boundary (sidebar persists, error in content area)
│   │   │   │   ├── not-found.tsx        ← Admin 404 (invalid /admin/* path)
│   │   │   │   ├── page.tsx             ← /admin (dashboard — today's overview)
│   │   │   │   │
│   │   │   │   ├── bookings/            ← Booking management
│   │   │   │   │   ├── page.tsx         ← /admin/bookings (list, filter by status/date/staff)
│   │   │   │   │   ├── new/
│   │   │   │   │   │   └── page.tsx     ← /admin/bookings/new (walk-in creation)
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx     ← /admin/bookings/[id] (approve, assign, mark status)
│   │   │   │   ├── waitlist/
│   │   │   │   │   └── page.tsx         ← /admin/waitlist (promote to booking)
│   │   │   │   │
│   │   │   │   ├── customers/           ← CRM
│   │   │   │   │   ├── page.tsx         ← /admin/customers (search, filter by tag, sort LTV)
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx     ← /admin/customers/[id] (history, notes, tags, no-show tier)
│   │   │   │   │
│   │   │   │   ├── leads/               ← Lead pipeline
│   │   │   │   │   ├── page.tsx         ← /admin/leads (pipeline: New→Contacted→Follow-up→Booked→Won/Lost)
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx     ← /admin/leads/[id] (notes, UTM, WhatsApp link)
│   │   │   │   │
│   │   │   │   ├── staff/               ← Staff management
│   │   │   │   │   ├── page.tsx         ← /admin/staff (list with designation, schedule)
│   │   │   │   │   ├── new/
│   │   │   │   │   │   └── page.tsx     ← /admin/staff/new (add staff member)
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx     ← /admin/staff/[id] (schedule, leave, performance)
│   │   │   │   │
│   │   │   │   ├── schedule/
│   │   │   │   │   └── page.tsx         ← /admin/schedule (weekly/daily staff availability)
│   │   │   │   ├── leave/
│   │   │   │   │   └── page.tsx         ← /admin/leave (approve/reject, staff leave calendar)
│   │   │   │   │
│   │   │   │   ├── services/            ← Service catalog
│   │   │   │   │   ├── page.tsx         ← /admin/services (all services by category)
│   │   │   │   │   ├── new/
│   │   │   │   │   │   └── page.tsx     ← /admin/services/new (add service)
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx     ← /admin/services/[id] (edit price, duration, gems)
│   │   │   │   │
│   │   │   │   ├── offers/              ← Offers & promotions
│   │   │   │   │   ├── page.tsx         ← /admin/offers (active, scheduled, expired)
│   │   │   │   │   ├── new/
│   │   │   │   │   │   └── page.tsx     ← /admin/offers/new (create offer)
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx     ← /admin/offers/[id] (edit/deactivate)
│   │   │   │   │
│   │   │   │   ├── memberships/         ← SPA memberships
│   │   │   │   │   ├── page.tsx         ← /admin/memberships (all, filter by tier/status)
│   │   │   │   │   ├── new/
│   │   │   │   │   │   └── page.tsx     ← /admin/memberships/new (create for customer)
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx     ← /admin/memberships/[id] (sessions, record, cancel)
│   │   │   │   │
│   │   │   │   ├── billing/             ← Invoicing
│   │   │   │   │   ├── page.tsx         ← /admin/billing (all invoices, filter by type/date)
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx     ← /admin/billing/[id] (line items, GST, PDF, resend)
│   │   │   │   │
│   │   │   │   ├── reports/             ← Analytics & reports
│   │   │   │   │   ├── page.tsx         ← /admin/reports (overview KPIs)
│   │   │   │   │   ├── financial/
│   │   │   │   │   │   └── page.tsx     ← /admin/reports/financial (revenue, GST)
│   │   │   │   │   ├── salon/
│   │   │   │   │   │   └── page.tsx     ← /admin/reports/salon (service breakdown)
│   │   │   │   │   ├── spa/
│   │   │   │   │   │   └── page.tsx     ← /admin/reports/spa (membership utilisation)
│   │   │   │   │   ├── staff/
│   │   │   │   │   │   └── page.tsx     ← /admin/reports/staff (performance, utilisation)
│   │   │   │   │   └── leads/
│   │   │   │   │       └── page.tsx     ← /admin/reports/leads (conversion, Meta campaign ROAS)
│   │   │   │   │
│   │   │   │   ├── settings/
│   │   │   │   │   └── page.tsx         ← /admin/settings (salon info, GST, hours, policies)
│   │   │   │   ├── branches/
│   │   │   │   │   ├── page.tsx         ← /admin/branches (list/add branches — Owner/Developer only)
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx     ← /admin/branches/[id] (edit branch details)
│   │   │   │   ├── users/
│   │   │   │   │   └── page.tsx         ← /admin/users (roles, suspend/ban, sessions)
│   │   │   │   │
│   │   │   │   └── (developer)/         ← Developer-only routes (extra role check)
│   │   │   │       ├── integrations/
│   │   │   │       │   └── page.tsx     ← /admin/integrations (Ably, Meta, Sentry config)
│   │   │   │       └── logs/
│   │   │   │           └── page.tsx     ← /admin/logs (Sentry error viewer)
│   │   │   │
│   │   │   └── api/                     ← API routes (thin layer — parse, validate, delegate)
│   │   │       ├── auth/
│   │   │       │   └── [...betterauth]/
│   │   │       │       └── route.ts     ← Better Auth catch-all (login, callback, session)
│   │   │       ├── services/
│   │   │       │   ├── route.ts         ← GET: all categories + services (Cloudflare KV cached)
│   │   │       │   └── [slug]/
│   │   │       │       └── route.ts     ← GET: single service detail
│   │   │       ├── push/                ← Web Push subscription management
│   │   │       │   ├── subscribe/
│   │   │       │   │   └── route.ts     ← POST: register push subscription in Neon
│   │   │       │   └── unsubscribe/
│   │   │       │       └── route.ts     ← DELETE: remove push subscription from Neon
│   │   │       ├── bookings/
│   │   │       │   ├── route.ts         ← GET/POST: list customer bookings + create normal booking; optionally links prior lead
│   │   │       │   └── [id]/
│   │   │       │       ├── route.ts     ← GET: single booking detail
│   │   │       │       ├── cancel/
│   │   │       │       │   └── route.ts ← POST: cancel booking
│   │   │       │       └── reschedule/
│   │   │       │           └── route.ts ← POST: reschedule booking
│   │   │       ├── leads/
│   │   │       │   └── route.ts         ← POST: campaign lead capture → Neon + CAPI Lead + booking redirect
│   │   │       ├── availability/
│   │   │       │   └── route.ts         ← GET: slot availability for date + staff
│   │   │       ├── onboarding/
│   │   │       │   └── complete/
│   │   │       │       └── route.ts     ← POST: save onboarding data + CAPI CompleteRegistration
│   │   │       ├── ably/
│   │   │       │   └── token/
│   │   │       │       └── route.ts     ← POST: Ably Token Auth (scoped per role)
│   │   │       ├── admin/               ← Admin-only API routes (role-checked)
│   │   │       │   ├── bookings/
│   │   │       │   │   └── [id]/
│   │   │       │   │       ├── complete/
│   │   │       │   │       │   └── route.ts  ← POST: mark completed, invoice, gems, CAPI Purchase
│   │   │       │   │       └── route.ts      ← PATCH: approve, reject, assign staff
│   │   │       │   ├── memberships/
│   │   │       │   │   └── route.ts     ← POST: create membership + invoice
│   │   │       │   └── leave/
│   │   │       │       └── route.ts     ← POST/PATCH: submit, approve, reject leave
│   │   │       ├── jobs/                ← QStash job endpoints (called by Upstash scheduler)
│   │   │       │   ├── appointment-reminders/
│   │   │       │   │   └── route.ts     ← POST: send 24h/1h push + email reminders
│   │   │       │   ├── gems-expiry-reminder/
│   │   │       │   │   └── route.ts     ← POST: 7-day gems expiry push
│   │   │       │   ├── daily-sales-report/
│   │   │       │   │   └── route.ts     ← POST: Slack + email daily sales
│   │   │       │   └── membership-expiry/
│   │   │       │       └── route.ts     ← POST: 30d/7d/1d membership alerts
│   │   │       └── webhooks/            ← Incoming webhooks (signature-verified)
│   │   │           ├── meta-leads/
│   │   │           │   └── route.ts     ← POST: Meta Lead Gen Form webhook (Option A backup)
│   │   │           └── aisensy/
│   │   │               └── route.ts     ← POST: AiSensy status change → update lead in Neon
│   │   │
│   │   ├── components/                  ← UI only — zero business logic
│   │   │   ├── ui/                      ← shadcn/ui primitives (Button, Input, Dialog, etc.)
│   │   │   ├── booking/                 ← Booking dialog steps, service cards, slot picker
│   │   │   ├── admin/                   ← Admin dashboard widgets, data tables, charts
│   │   │   ├── layout/                  ← Header, Footer, CustomerNav, AdminSidebar
│   │   │   └── shared/                  ← Consent banner, PWA prompt, loading states
│   │   │
│   │   ├── lib/                         ← App-level utilities (framework-aware)
│   │   │   ├── auth.ts                  ← Better Auth client (createAuthClient, useSession hook)
│   │   │   ├── meta-pixel.ts            ← browser pixel event helpers
│   │   │   ├── meta-capi.ts             ← server-side CAPI helper
│   │   │   ├── meta-signals.ts          ← extract fbp/fbc cookies from request
│   │   │   ├── consent.ts              ← cookie consent grant/revoke
│   │   │   ├── ably.ts                 ← Ably client setup + channel subscriptions
│   │   │   └── push.ts                 ← Web Push subscription management
│   │   │
│   │   ├── middleware.ts                ← RBAC check, rate limiting, CORS, CSP nonce
│   │   ├── instrumentation.ts          ← OpenTelemetry + Sentry init (runs once on cold start)
│   │   ├── env.ts                       ← @t3-oss/env-nextjs validation (Zod)
│   │   ├── next.config.ts               ← Next.js configuration
│   │   ├── tsconfig.json                ← TypeScript config (extends root)
│   │   └── next-env.d.ts               ← Auto-generated type declarations (do not edit/commit)
│   │
│   └── cms/                             ← Payload CMS (deployed on Render)
│       ├── payload.config.ts
│       └── collections/
│           ├── blog.ts                  ← Blog posts (title, slug, body, featured image)
│           ├── gallery.ts               ← Salon/SPA photos
│           ├── team.ts                  ← Staff bios for /about page
│           ├── banners.ts               ← Homepage hero banners
│           └── faq.ts                   ← FAQ items for /faq
│
├── docs/                                ← Fumadocs site (docs.theroyalglow.in)
│   │
│   ├── getting-started/                 ← Project intro, tech stack, env vars
│   │   ├── introduction.mdx             ← What is Royal Glow, system overview, quick links
│   │   ├── tech-stack.mdx               ← Full stack reference (Next.js 16, Neon, Cloudflare, Bun…)
│   │   └── environment-variables.mdx    ← All env vars grouped by service with descriptions
│   │
│   ├── architecture/                    ← System design, infra, integrations, security
│   │   ├── overview.mdx                 ← High-level design, infra diagram, hosting rationale
│   │   ├── monorepo-structure.mdx       ← Turborepo layers, layer rules, folder map
│   │   ├── database.mdx                 ← Neon DB rationale, 4-branch strategy, pg_cron, Drizzle
│   │   ├── database-schema.mdx          ← Full table reference (all 20+ tables + enums)
│   │   ├── background-jobs.mdx          ← All 19 jobs: pg_cron (7) + QStash (12), triggers, endpoints
│   │   ├── authentication.mdx           ← Better Auth, Google OAuth, RBAC roles, session management
│   │   ├── email-strategy.mdx           ← Resend (transactional) vs Brevo (marketing) split + templates
│   │   ├── ably-channels.mdx            ← Realtime channel design, events, presence, free tier
│   │   ├── observability.mdx            ← Sentry, OpenTelemetry, BetterStack uptime, error tracking
│   │   ├── error-handling.mdx           ← Error boundaries, API error response shape, recovery patterns
│   │   ├── security.mdx                 ← CSP, CORS, rate limiting, Zod validation, OWASP compliance
│   │   ├── seo.mdx                      ← Meta tags, JSON-LD schemas (LocalBusiness, FAQ, Blog), sitemap
│   │   └── meta-pixel.mdx               ← Meta Pixel browser events + CAPI server-side (Lead, Purchase)
│   │
│   ├── api-reference/                   ← Auto-generated from OpenAPI spec via fumadocs-openapi
│   │   ├── authentication.mdx           ← Better Auth endpoints (sign-in, callback, session, sign-out)
│   │   ├── bookings.mdx                 ← GET /api/bookings, POST create, cancel, reschedule
│   │   ├── availability.mdx             ← GET /api/availability (date, staffId, serviceIds)
│   │   ├── services.mdx                 ← GET /api/services (all) + GET /api/services/[slug]
│   │   ├── leads.mdx                    ← POST /api/leads (/book Meta lead capture → Neon source meta_ad + CAPI Lead)
│   │   ├── push-notifications.mdx       ← POST /api/push/subscribe + DELETE /api/push/unsubscribe
│   │   ├── onboarding.mdx               ← POST /api/onboarding/complete (name, phone, DOB, consent)
│   │   ├── admin-bookings.mdx           ← PATCH approve/assign/reject, POST mark-complete
│   │   ├── admin-memberships.mdx        ← POST /api/admin/memberships (create + invoice)
│   │   ├── admin-leave.mdx              ← POST submit, PATCH approve/reject staff leave
│   │   └── webhooks.mdx                 ← POST /api/webhooks/meta-leads + /api/webhooks/aisensy
│   │
│   ├── guides/                          ← Step-by-step how-to walkthroughs
│   │   ├── local-development.mdx        ← Clone, Bun install, Neon dev branch, env vars, dev server
│   │   ├── deployment.mdx               ← Cloudflare Pages deploy, Render CMS, CI/CD pipeline
│   │   ├── git-workflow.mdx             ← Branch strategy: feature → dev → test → pprd → prod
│   │   ├── data-seeding.mdx             ← Seed scripts (services, staff, SPA tiers), PII anonymisation
│   │   ├── testing.mdx                  ← Vitest unit, Playwright E2E, Lighthouse CI, test gates
│   │   ├── adding-a-service.mdx         ← Add salon/SPA service end-to-end (DB → admin UI → live)
│   │   ├── managing-staff.mdx           ← Add staff member, set schedule, assign services, leave
│   │   ├── creating-an-offer.mdx        ← Create offer, set discount rules, link to services
│   │   ├── managing-memberships.mdx     ← Create SPA tier, assign to customer, record session
│   │   ├── launch-checklist.mdx         ← Pre-launch gate checks (DNS, env vars, smoke tests)
│   │   └── release-process.mdx          ← Versioning, changelog update, pprd UAT, prod deploy approval
│   │
│   ├── business-logic/                  ← Domain rules: bookings, loyalty, invoicing, CRM
│   │   ├── booking-flow.mdx             ← Full lifecycle: browse → slot → confirm → complete → invoice
│   │   ├── spa-memberships.mdx          ← Silver/Gold/Platinum tiers, session deduction, expiry logic
│   │   ├── loyalty-gems.mdx             ← Earn (1% of final invoiced amount, floor), redeem, 1-year (365-day) expiry, catalogue
│   │   ├── invoicing-gst.mdx            ← GST back-calc (18%), invoice numbering, PDF, Resend delivery
│   │   ├── no-show-policy.mdx           ← No-show tiers, automatic flags, recovery check, soft-ban
│   │   ├── lead-pipeline.mdx            ← UTM attribution, status transitions, CAPI Lead/Purchase events
│   │   └── cron-schedule.mdx            ← All 19 jobs at a glance: schedule, purpose, trigger, route
│   │
│   └── changelog/
│       └── index.mdx                    ← Release history (latest first)
│
├── packages/
│   ├── db/                              ← ALL database concerns (Drizzle ORM + Neon)
│   │   ├── index.ts                     ← DB client export (pooled + unpooled connections)
│   │   ├── schema/                      ← Drizzle table definitions (mirrors database-schema.md)
│   │   │   ├── enums.ts                 ← All PostgreSQL enums
│   │   │   ├── auth.ts                  ← user, session, account, verification
│   │   │   ├── profile.ts              ← customer_profile, staff_profile
│   │   │   ├── service.ts              ← service_category, service, service_staff
│   │   │   ├── schedule.ts             ← staff_schedule, staff_time_off, holiday, waitlist
│   │   │   ├── booking.ts              ← booking, booking_service, booking_note, booking_history
│   │   │   ├── invoice.ts              ← invoice, invoice_item
│   │   │   ├── membership.ts           ← spa_membership, spa_membership_tier
│   │   │   ├── offer.ts                ← offer, offer_service, offer_redemption
│   │   │   ├── lead.ts                 ← lead, lead_note
│   │   │   ├── crm.ts                  ← customer_tag, customer_tag_assignment, customer_note
│   │   │   ├── loyalty.ts              ← loyalty_account, loyalty_transaction
│   │   │   ├── notification.ts         ← notification, push_subscription
│   │   │   ├── branch.ts              ← branch
│   │   │   └── system.ts               ← daily_sales_summary, monthly_gst_summary, audit_log, system_setting
│   │   ├── queries/                     ← Reusable Drizzle query builders
│   │   │   ├── bookings.ts             ← today's bookings, by-staff, by-customer
│   │   │   ├── customers.ts            ← search, filter by tag, LTV sort
│   │   │   ├── leads.ts                ← pipeline queries, by-status, by-campaign
│   │   │   ├── availability.ts         ← free slots for date + staff
│   │   │   ├── services.ts             ← all categories + services, by-category, with assigned staff
│   │   │   ├── offers.ts               ← active offers, by-service, per-customer redemption check
│   │   │   ├── staff.ts                ← by-designation, schedule, leave calendar
│   │   │   ├── notifications.ts        ← push subscriptions by-user, pending reminder queue
│   │   │   ├── invoices.ts             ← by-type, by-date, daily totals
│   │   │   ├── memberships.ts          ← active, expiring-soon, by-customer
│   │   │   ├── loyalty.ts              ← balance, expiring gems, transaction history
│   │   │   └── reports.ts              ← revenue aggregations, staff performance, lead funnel
│   │   ├── migrations/                  ← drizzle-kit generated SQL migrations
│   │   └── drizzle.config.ts
│   │
│   ├── business/                        ← Pure business logic — NO framework imports
│   │   ├── booking/
│   │   │   ├── availability.ts          ← slot calculation (staff schedule - leaves - existing bookings)
│   │   │   ├── pricing.ts              ← service total, GST back-calc, offer application
│   │   │   ├── validation.ts           ← booking rules (reschedule limits, time constraints)
│   │   │   └── noshow.ts               ← no-show tier logic, recovery check
│   │   ├── invoicing/
│   │   │   ├── generate.ts             ← invoice line items, GST split, numbering (INV-X-YYZZ-XXXXX)
│   │   │   └── pdf.ts                  ← PDF generation (branded template)
│   │   ├── numbering/
│   │   │   └── generate.ts             ← booking number, invoice number, membership number (5-digit random + retry on collision)
│   │   ├── loyalty/
│   │   │   ├── gems.ts                 ← earn calculation (floor(total × 0.01)), expiry logic
│   │   │   └── catalogue.ts            ← redemption validation (enough gems, eligible service)
│   │   ├── membership/
│   │   │   ├── session.ts              ← hours validation, deduction, remaining calc
│   │   │   └── expiry.ts               ← auto-expire logic, reminder thresholds
│   │   ├── leads/
│   │   │   ├── attribution.ts          ← UTM parsing, source tracking, campaign mapping
│   │   │   └── conversion.ts           ← lead → booking linking, status transitions
│   │   └── notifications/
│   │       ├── templates.ts             ← push notification message builders
│   │       └── channels.ts             ← which events → which channels (push/email/both)
│   │
│   ├── types/                           ← Shared TypeScript types + Zod schemas
│   │   ├── booking.ts                   ← BookingStatus, CreateBookingInput, etc.
│   │   ├── user.ts                      ← UserRole, CustomerProfile, StaffProfile
│   │   ├── lead.ts                      ← LeadStatus, LeadFormInput
│   │   ├── service.ts                   ← ServiceCategory, ServiceType, CreateServiceInput
│   │   ├── offer.ts                     ← DiscountType, OfferStatus, CreateOfferInput
│   │   ├── invoice.ts                   ← InvoiceType, InvoiceItem
│   │   ├── membership.ts               ← MembershipTier, MembershipStatus
│   │   ├── notification.ts             ← NotificationType, NotificationChannel
│   │   └── api.ts                       ← API response shapes, error format
│   │
│   └── email/                           ← React Email templates (Resend)
│       ├── invoice.tsx                  ← Invoice + PDF attachment
│       ├── booking-confirmed.tsx        ← Booking confirmation
│       ├── appointment-reminder.tsx     ← 24h/1h reminder
│       ├── membership-welcome.tsx       ← Membership created
│       ├── membership-expiry.tsx        ← 30d/7d/1d expiry warning
│       └── gems-earned.tsx              ← "You earned X gems" (if email needed later)
│
├── scripts/                             ← Bun utility scripts
│   ├── seed-dev.ts                      ← Seed services, staff, demo bookings for dev
│   ├── seed-spa-tiers.ts               ← Seed Silver/Gold/Platinum defaults
│   ├── anonymize-preprod.ts            ← Strip PII from prod → pprd data
│   └── generate-vapid-keys.ts          ← Web Push VAPID key generation
│
├── public/                              ← Static assets (served as-is from root URL)
│   ├── manifest.json                    ← PWA manifest
│   ├── sw.js                            ← Service worker (push notifications, offline cache)
│   ├── icon.svg                         ← App icon (used by manifest.json)
│   ├── apple-touch-icon.png            ← iOS PWA icon (direct URL fallback: /apple-touch-icon.png)
│   ├── llms.txt                         ← AI agent discovery
│   └── llms-full.txt                    ← AI agent full context
│
├── turbo.json                           ← Turborepo task config
├── package.json                         ← Bun workspace root
├── bun.lockb
├── tsconfig.json                        ← Root TypeScript config (shared settings)
├── biome.json                           ← Biome + Ultracite config (lint + format)
│
└── .github/
    └── workflows/
        ├── ci.yml                       ← Lint, typecheck, Vitest, Playwright, Lighthouse CI
        ├── deploy-prod.yml              ← Deploy to Cloudflare Pages (on push to prod)
        ├── deploy-pprd.yml              ← Deploy to Cloudflare Pages preview (on push to pprd)
        └── replicate-prod-to-pprd.yml   ← Neon branch reset + PII anonymisation (daily cron)
```

## Layer Rules (Enforced)

| Layer | Rule |
|-------|------|
| `app/**/page.tsx` | Server Components by default. Only add `'use client'` when interactivity is needed. Use `PageProps<'/route'>` helper for typed params/searchParams. |
| `app/**/layout.tsx` | Use `LayoutProps<'/route'>` helper for typed children + named slots. |
| `app/**/loading.tsx` | Streaming skeleton — wraps page in React Suspense boundary. Keep lightweight. |
| `app/**/error.tsx` | Client Component (`'use client'`). Catches errors in the subtree, shows recovery UI. |
| `app/**/not-found.tsx` | Custom 404 UI for the route segment. Triggered by `notFound()` call. |
| `components/` | Zero business logic. Receives data via props, emits events. Never imports from `packages/business/` directly. |
| `lib/` | Framework-aware utilities (Meta Pixel, Ably, push). Thin wrappers — no business decisions. |
| `app/api/` routes | Thin layer only — parse request → Zod validate → call business function → return response. No logic inline. |
| `app/admin/` pages | Protected by RBAC in `middleware.ts` before any admin page renders; layouts assume the request is already role-checked. |
| `packages/business/` | Zero framework imports. No `next`, no `react`. Pure TypeScript functions. Fully testable with `bun test` in isolation. |
| `packages/db/` | Only Drizzle schema and queries. No business rules. Queries return data — they don't decide what to do with it. |
| `packages/types/` | Zod schemas + TypeScript types. Imported by both `business/` and `app/api/`. Single source of truth for input shapes. |
| `packages/email/` | React Email templates only. No DB access, no business logic. Receives props, returns JSX. |

### Next.js 16 Conventions (Key Differences)

| Convention | Detail |
|-----------|--------|
| **`params` is a Promise** | All dynamic route params must be awaited: `const { slug } = await props.params` |
| **`searchParams` is a Promise** | Must be awaited: `const filters = (await searchParams).filters` |
| **`PageProps<'/path'>`** | Global type helper — no import needed. Provides typed `params` + `searchParams` for the route. |
| **`LayoutProps<'/path'>`** | Global type helper — no import needed. Provides typed `children` + named slots. |
| **Type generation** | Run `next dev`, `next build`, or `next typegen` to generate route types. |
| **`biome.json`** | Biome + Ultracite config. Single file replaces `.eslintrc` + `.prettierrc`. |
| **`instrumentation.ts`** | Runs once on server cold start — used for Sentry/OpenTelemetry init. |
| **Private folders (`_folder`)** | Prefix with `_` to opt out of routing. Safe for colocated utils (e.g., `app/admin/_utils/`). |
| **`robots.ts` / `sitemap.ts`** | Generated via code in `app/` — replaces static files in `public/`. |

**Why this matters:** `packages/business/` is framework-portable. When a mobile app is built later, it imports the same booking, pricing, and loyalty logic with zero duplication.

---

## Database & Data Layer

**Primary DB: Neon DB (PostgreSQL)**

> See [database.md](./database.md) for full comparison, cron jobs, and data stack rationale.

| Layer | Technology | Usage |
|-------|-----------|-------|
| **Primary DB** | Neon DB | All business data, 4 branches, pg_cron, Drizzle ORM, Better Auth sessions |
| **Realtime** | **Ably** | Live booking status push, queue board, staff availability (6M messages/mo free) |
| **File storage** | Cloudflare R2 | Profile photos, service images, PDF invoices (10 GB free) |
| **Cache + queuing** | Upstash Redis | Availability slot cache, rate limiting, QStash async jobs |
| **Edge cache** | Cloudflare KV | Service listings, static data at edge |
| **Search** | Postgres FTS (pg_trgm) | Fuzzy search inside Neon — free; upgrade to Algolia later if needed |

### Why Neon over Supabase as Primary
- Supabase only provides **2 free projects** — not enough for 4 environments
- Neon provides **10 branches** on the free plan, one per environment, in a single project
- `pg_cron` is natively available in Neon for all scheduled business jobs
- Cloudflare R2 replaces Supabase Storage (10 GB free vs 1 GB)

---

## Environments

| Environment | Neon Branch | Purpose |
|-------------|-------------|--------|
| `prod` | `main` | Live production traffic — pg_cron runs here |
| `pprd` | `preprod` | Pre-production / UAT — auto-reset from `main` every 24h, PII stripped |
| `test` | `test` | Integration testing — seeded fixtures, wiped on each CI run |
| `dev` | `dev` | Local development — free-form sandbox |

All 4 environments live in a **single Neon project** using database branching — no separate paid projects required.

> See [git-workflow.md](./git-workflow.md) for branch and replication strategy.
> See [database.md](./database.md) for full database selection rationale.

---

## Scale Targets

| Metric | Target |
|--------|--------|
| Concurrent users | 20,000 – 50,000 |
| Page response time | < 100ms globally (edge) |
| Lighthouse score | 100% all categories |
| PageSpeed score | 100% |
| LCP | < 2.5s |
| CLS | < 0.1 |
| INP | < 200ms |

---

## PWA & Push Notifications

**The site is a PWA** — installable on a customer's phone via add-to-homescreen.

- Service worker caches: service menu, prices, contact, hours, gallery thumbnails, homepage shell
- Offline: cached content readable on bad network. Booking/profile require server.
- Add-to-homescreen prompt: shown after 2nd visit (custom branded, not browser default)
- **Web Push API** for appointment reminders (24h + 1h before) and booking confirmations
- Push subscription stored in Neon DB; reminder batches are triggered by QStash every 15 min
- Cost: ₹0 — Web Push is free and unlimited

> See [features.md](./features.md) sections 9, 10, 11 for full PWA, Push, and Image specs.

---

## Accessibility (a11y)

WCAG 2.1 AA compliance is a hard requirement — Lighthouse Accessibility score must be 100 to pass CI.

- Semantic HTML throughout (`<nav>`, `<main>`, `<header>`, `<footer>`, `<section>`)
- Skip-to-content link on every page
- All interactive elements keyboard-reachable with visible focus ring (no `outline: none` unless custom replacement)
- Modals trap focus on open, return focus on close
- ARIA labels on icon buttons, form fields, dynamic regions
- `aria-live="polite"` on form error messages
- `prefers-reduced-motion` media query wraps all CSS/JS animations
- `@axe-core/react` in Vitest for automated checks — catches issues in CI before they reach staging
- Manual screen reader pass (NVDA / VoiceOver) before each major release

---

## Legal Pages

Required under India's Digital Personal Data Protection (DPDP) Act 2023.

| Page | Route | Notes |
|------|-------|-------|
| Privacy Policy | `/privacy` | DPDP Act mandatory — data collection, purpose, storage, sharing |
| Terms of Service | `/terms` | Business protection |
| Cookie Consent | Banner component (site-wide) | PostHog + Meta Pixel gated behind Accept. Preference in `localStorage`, 365-day expiry |
| Refund & Cancellation Policy | `/refund-policy` | Cancellation window, no-show, rescheduling rules |

All legal pages are static (`generateStaticParams` / SSG), cached at edge. Lightweight custom cookie banner — no paid consent tool.

---

## Security Hardening

### Foundational
- All PII (phone, gender, DOB) stored in Neon DB under Drizzle-managed schema with access control in API layer
- Cloudflare handles DDoS and bot mitigation at the edge
- HTTPS enforced everywhere — Cloudflare auto-TLS, `Strict-Transport-Security` header
- Secrets managed via environment variables — never committed to git
- PII stripped from prod → pprd replication before restore

---

### Content Security Policy (CSP)

CSP headers set via Cloudflare Workers `_headers` file or Next.js middleware. Prevents XSS, clickjacking, and injection attacks.

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{random}' https://*.posthog.com https://clarity.ms https://connect.facebook.net;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://uploads.theroyalglow.in https://*.cloudflare.com https://*.r2.dev;
  font-src 'self';
  connect-src 'self' https://*.neon.tech https://*.ably.io https://*.upstash.io https://*.posthog.com https://clarity.ms https://graph.facebook.com https://*.sentry.io;
  frame-src 'none';
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  upgrade-insecure-requests;

X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-DNS-Prefetch-Control: off
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(self), payment=()
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

| Header | Purpose |
|--------|---------|
| `Content-Security-Policy` | Whitelist exactly which scripts, images, and connections are allowed |
| `X-Frame-Options: DENY` | Prevent clickjacking — site cannot be embedded in iframes |
| `X-Content-Type-Options: nosniff` | Prevent MIME-type sniffing attacks |
| `Referrer-Policy` | Only send origin on cross-origin requests — protects customer URLs |
| `Permissions-Policy` | Disable camera, mic — only geolocation (for nearby salon prompt) |
| `Strict-Transport-Security` | Force HTTPS with preload — 1 year, all subdomains |

**Nonce-based script loading:** All inline scripts use a server-generated nonce (`'nonce-{random}'`) instead of `'unsafe-inline'` for scripts. This allows PostHog, Clarity, and Meta Pixel to load while blocking injected malicious scripts.

---

### Input Validation — Zod

**All input is validated at the system boundary** using **Zod** — TypeScript-first schema validation that runs on the edge.

| Where | What Gets Validated |
|-------|-------------------|
| API route body | Every `POST` / `PUT` / `PATCH` request body parsed through a Zod schema before touching business logic |
| URL params | Service slugs, booking IDs — validated as correct format |
| Query strings | Date formats, pagination params |
| Form submissions | Server Actions validate before any DB write |
| Webhook payloads | AiSensy, Meta CAPI, BetterStack — all validated before processing |

**Example patterns:**

```typescript
// packages/types/booking.ts — Zod schemas live alongside types
import { z } from 'zod'

export const createBookingSchema = z.object({
  branchId: z.string().min(1).max(50),
  serviceType: z.enum(['salon', 'spa']),
  serviceIds: z.array(z.string().min(1).max(50)).min(1).max(10),
  bookingDate: z.string().date(),                     // YYYY-MM-DD format
  bookingTime: z.string().regex(/^\d{2}:\d{2}$/),   // HH:mm format
  leadId: z.string().min(1).max(50).optional(),       // present only when campaign lead converted online
  notes: z.string().max(500).optional().transform((value) => value?.trim()),
})

export const leadFormSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().regex(/^\+91\d{10}$/),    // Indian phone format
  serviceInterestedId: z.string().min(1).max(50).optional(),
  utmSource: z.string().max(50).optional(),
  utmCampaign: z.string().max(100).optional(),
  utmMedium: z.string().max(50).optional(),
})

// app/api/bookings/route.ts — thin API route
export async function POST(req: Request) {
  const body = await req.json()
  const parsed = createBookingSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  // Only parsed.data reaches business logic — guaranteed clean
  return await createBooking(parsed.data)
}
```

**Rules:**
- Never trust client input — validate everything, even from authenticated users
- Zod schemas colocated with types in `packages/types/`
- API routes use `.safeParse()` — never `.parse()` (which throws and could leak error details)
- Error responses return `error.flatten()` — structured validation errors, no stack traces to client
- SQL injection is prevented by Drizzle ORM (parameterized queries) — Zod is an additional layer, not the only defense

---

### API Rate Limiting — Upstash Ratelimit

Rate limiting runs via **`@upstash/ratelimit`** backed by Upstash Redis (already in the stack). Applied in Next.js middleware before the request reaches any API route.

| Endpoint | Window | Limit | Why |
|----------|--------|-------|-----|
| `POST /api/bookings` | 1 minute | 5 requests | Prevent booking spam — no human books 5+ times per minute |
| `POST /api/leads` | 1 minute | 3 requests | Prevent lead form spam |
| `GET /api/availability` | 10 seconds | 10 requests | Prevent availability scraping — aggressive polling |
| `POST /api/auth/*` | 1 minute | 10 requests | Better Auth login — brute force protection |
| `POST /api/webhooks/*` | 1 second | 50 requests | AiSensy / Meta webhooks — high but bounded |
| `GET /api/services` | 10 seconds | 20 requests | Public endpoint — generous but bounded |
| All other `POST` | 1 minute | 10 requests | General write protection |
| All other `GET` | 10 seconds | 30 requests | General read protection |

**Implementation:**

```typescript
// middleware.ts — runs on Cloudflare Workers edge
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'),  // default: 10 per minute
  prefix: 'rgss:ratelimit',
})

// Rate limit key = IP + endpoint path
const key = `${ip}:${pathname}`
const { success, remaining } = await ratelimit.limit(key)

if (!success) {
  return Response.json(
    { error: 'Too many requests. Please try again shortly.' },
    { status: 429, headers: { 'Retry-After': '60' } }
  )
}
```

**Per-endpoint overrides** use different Ratelimit instances with specific windows (see table above).

**Rate limit headers returned on every response:**
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
Retry-After: 60  (only on 429)
```

---

### CORS Policy

**CORS is strict by default.** Only approved Royal Glow web origins are allowed to call the API.

```typescript
// middleware.ts or next.config.ts
const allowedOrigins = [
  'https://theroyalglow.in',
  'https://www.theroyalglow.in',
  'https://admin.theroyalglow.in',   // Payload CMS admin
]

// Development additions (never in prod)
if (process.env.NODE_ENV === 'development') {
  allowedOrigins.push('http://localhost:3000')
}
```

| Header | Value | Why |
|--------|-------|-----|
| `Access-Control-Allow-Origin` | request origin when it matches the allowlist | Only approved Royal Glow frontends can call the API |
| `Access-Control-Allow-Methods` | `GET, POST, PUT, PATCH, DELETE, OPTIONS` | Explicit method whitelist |
| `Access-Control-Allow-Headers` | `Content-Type, Authorization, X-Request-Id` | Only required headers |
| `Access-Control-Allow-Credentials` | `true` | Needed for Better Auth session cookies |
| `Access-Control-Max-Age` | `86400` | Cache preflight for 24h — reduces OPTIONS requests |

**Why not `Access-Control-Allow-Origin: *`:** Wildcard CORS allows any website to call your API — an attacker could build a page that books appointments, reads customer data, or submits fake leads through the Royal Glow API from their own domain. Exact origin matching prevents this entirely.

**Public API endpoints** (`/api/services`, `/api/availability`) are still read-only and rate-limited — CORS restricts where the browser call originates, not server-to-server calls. Agent/crawler access to these endpoints is unaffected by CORS (CORS is a browser-only enforcement).

---

### Additional Security Measures

| Measure | Implementation |
|---------|---------------|
| **CSRF protection** | Better Auth includes built-in CSRF token validation on all auth-related requests |
| **Session security** | `HttpOnly`, `Secure`, `SameSite=Lax` cookie flags on all session cookies via Better Auth config |
| **File upload validation** | Payload CMS + R2: file type whitelist (jpg, png, webp, pdf only), max size 10 MB, filename sanitisation |
| **SQL injection** | Drizzle ORM uses parameterized queries — no raw SQL concatenation ever |
| **XSS prevention** | React escapes output by default. CSP blocks inline scripts. No `dangerouslySetInnerHTML` without sanitisation. |
| **Dependency audit** | Trivy (CVE scan) + Socket.dev (supply chain attacks) in CI — fail on high/critical |
| **Secret rotation** | Neon connection string, Ably API key, Upstash token — rotated quarterly, stored in env vars, never in code |
| **Error exposure** | Production error responses return generic messages. Stack traces only in Sentry, never to client. |
| **Admin route protection** | `/admin/*` routes gated by Better Auth RBAC — role check in middleware before any admin page loads |
| **Webhook signature verification** | AiSensy and Meta webhook payloads verified via HMAC signature before processing |

---

## Quality & Testing Gates

Every deployment boundary has CI gates that must pass before code can flow to the next environment:

| Gate | dev → test | test → pprd | pprd → prod |
|------|-----------|-------------|-------------|
| Biome lint + format | ✅ | ✅ | ✅ |
| TypeScript type check | ✅ | ✅ | ✅ |
| Unit tests (Vitest) | ✅ | ✅ | ✅ |
| Integration tests | — | ✅ | ✅ |
| E2E tests (Playwright) | — | ✅ | ✅ |
| Lighthouse CI (≥ 95) | — | ✅ | ✅ |
| Security scan (Trivy + Socket.dev) | ✅ | ✅ | ✅ |
| Load test (k6) | — | — | ✅ |
| Manual approval | — | — | ✅ |

> See [testing.md](./testing.md) for the full testing strategy, tool ratings, and CI pipeline YAML.
> See [deployment.md](./deployment.md) for deployment configuration and pipeline details.
