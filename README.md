# Royal Glow Salon & Spa (RGSS) — Project Context

## What This Is
Full-stack business solution for **Royal Glow Salon & Spa** by **Roshini**.  
Covers: website, CRM, customer management, marketing automation, database, creative design, analytics, scheduling, backend automations — a fully digital scalable business ecosystem.

## Tech Stack (Decided)
| Layer | Choice |
|-------|--------|
| Runtime | Bun |
| Language | TypeScript + JavaScript |
| Styling | Tailwind CSS |
| Framework | Next.js 16 (App Router) |
| UI | React |
| **Primary DB** | **Neon DB** (PostgreSQL, 4 branches, pg_cron, Drizzle ORM) |
| **Realtime** | **Ably** (6M messages/mo free — booking status, queue board, staff availability) |
| **File Storage** | **Cloudflare R2** (10 GB free — photos, invoices) |
| **Cache + Queue** | **Upstash Redis + QStash** |
| **Edge Cache** | **Cloudflare KV** |
| **Search** | Postgres FTS / pg_trgm in Neon (upgrade to Algolia later) |
| **CMS** | **Payload CMS v3** — self-hosted on Render, writes to Neon DB, media to Cloudflare R2 |
| Hosting | Cloudflare Pages + Workers (edge) |
| Origin / CMS Host | Render (SSR fallback + Payload CMS admin — free tier, Singapore region) |
| Auth | **Better Auth** |
| Transactional Email | **Resend** + React Email |
| Marketing Email | **Brevo** |
| E2E Testing | **Playwright** |
| Load Testing | **k6** |
| Performance gate | **Lighthouse CI** |
| CI/CD | **GitHub Actions** |

## Authentication Design (Better Auth)
- **Google OAuth only** — callback on own domain (`yourdomain.com/api/auth/callback/google`) so branding shows correctly on Google consent screen
- Better Auth Cloud free tier ($0/mo) provides: dashboard, audit logs, user management, session monitoring, org oversight, user analytics
- **User roles:**
  1. **Customer** — real end users
  2. **Admin** — receptionist, hairstylist, therapist, manager
  3. **Owner / Co-owner / Developer**
- First-time login → onboarding prompt to collect: name, phone number, gender, DOB, email
- Admin panel page `/admin/users` built in-house using `auth.api.listUsers()` for custom user management UI

## Email Strategy
- **Transactional (Resend):** welcome email on sign-in, billing/invoice after service (PDF attachment)
- **Marketing (Brevo):** post-service marketing emails, bulk sends, unsubscribe management
- **React Email:** build email templates in React/TypeScript matching site design tokens
- **Legal:** marketing emails need unsubscribe link + marketing consent checkbox on onboarding (CAN-SPAM, GDPR, India DPDP Act)

## Business Info (Locked)
- **Domain:** theroyalglow.in
- **Subdomains:** admin.theroyalglow.in (Payload CMS), status.theroyalglow.in (BetterStack)
- **Email:** hello@theroyalglow.in
- **Phone:** +91 63601 35720
- **Address:** 1st Floor, Narmada Complex, 48/3, Rayasandra Main Rd, Above SBI Bank, Naganathapura, Parappana Agrahara, Bengaluru, Karnataka 560100, India
- **Hours:** Mon–Fri 10:00–21:00, Sat–Sun 10:00–22:00
- **GMB:** 4.9 ★ 86 reviews, category: Day Spa

## Database Schema (Locked)
- **36 tables** across 12 domains: Auth (4), Profiles (2), Services (3), Scheduling (4), Bookings (4), Billing (2), SPA Memberships (2), Offers (3), CRM & Leads (5), Loyalty (2), Notifications (2), System (3)
- **Money:** integer in paise (₹1 = 100 paise). No floating point.
- **IDs:** text (nanoid/cuid2), no auto-increment serial.
- **Timestamps:** timestamptz (UTC stored, IST displayed).
- **Date display:** DD/MM/YYYY (Indian standard) via `Intl.DateTimeFormat('en-IN')`.
- **GST-inclusive pricing:** All customer-facing prices include 18% GST (SAC 999721). Invoice back-calculates base.
- **Salon/SPA separation:** booking.service_type = 'salon' or 'spa'. No cross-type bookings. Enables clean analytics split.
- **Loyalty gems:** McDonald's-style catalogue. 1% of bill earned (floor). Gems unlock specific services from catalogue, NOT a ₹ discount. One catalogue service per booking. NO gems on membership purchases or membership sessions.
- **Offers:** 3 types (percentage, flat, combo_price). 1 offer/customer/day. Applied at checkout by receptionist. Cannot combine with gems. Salon only.
- **Booking lifecycle:** pending → confirmed/rejected → in_progress → completed. Walk-ins skip pending.
- **Invoice types:** `service` (normal, gems earned), `membership_purchase` (lump sum, no gems), `membership_session` (₹0 usage record, no gems).
- **Invoice numbering:** `RG-{year}-{4-digit seq}`, resets April 1. Membership numbers: `RG-MEM-{year}-{4-digit seq}`.
- **Snapshots:** service name + price frozen on booking_service and invoice_item.
- **Denormalized:** customer_profile.total_visits, total_spent_paise.
- **Key enums:** booking_status, invoice_type, spa_membership_status, service_type, discount_type, notification_type (with membership events), staff_designation.
- **Schema files:** auth.ts, profile.ts, service.ts, schedule.ts, booking.ts, invoice.ts, membership.ts, offer.ts, lead.ts, crm.ts, loyalty.ts, notification.ts, system.ts, enums.ts.
- **pg_cron jobs:** daily_sales (00:30), push reminders (*/15min), inactive tagging (Mon 03:00), daily email (22:00), waitlist (*/30min), seq resets (Apr 1), loyalty reconciliation (Sun 04:00), membership expiry reminders (09:00 daily), membership auto-expire (00:30).
- See docs/database-schema.md for full ERD, column definitions, indexes, SPA seed data.

## SPA Memberships (Locked)
- **Tiers:** Silver (8hrs, ₹10k, 90d), Gold (15hrs, ₹15k, 90d), Platinum (Owner/Manager sets defaults).
- **Access:** Option B — all SPA services accessible in any tier. Hours are the only constraint.
- **Creation:** Receptionist/Manager/Owner/Developer. No approval needed. Hours + price overridable at creation for negotiated deals.
- **Session recording:** Admin records session → booking(completed, ₹0, is_membership_session:true) + membership_session invoice (₹0) → hours deducted.
- **No gems** on purchase OR on sessions.
- **Expiry:** Hard expire. Reminders at 30d/7d/1d. Auto-expire by pg_cron. No rollover.
- **One active membership per customer** (DB-level UNIQUE index on customer_id WHERE status='active').
- **Customer sees:** /membership page — tier, hours remaining, expiry, session history.

## Customer-Facing Flow (Locked)
- **Onboarding:** Google OAuth → /onboarding → prefilled name/email/phone → DOB, gender, consent checkboxes → /
- **Booking:** "Book Now" button on homepage opens a 4-step dialog over the homepage (not a redirected page). `/?book=1` only deep-links to auto-open this same dialog:
  1. Details + Date/Slot (name/email prefilled, not editable)
  2. Salon/SPA toggle (one type per booking — no cross-type). Categories multi-select.
  3. Services multi-select with running total
  4. Summary: "Booking Submitted!" (pending), "Pay at the salon", gems balance link
- **Acquisition attribution:** first-touch source is captured before auth/onboarding and written to `customer_profile.acquisition_source`: root domain without UTM → `organic`, `/?book=1&utm_source=gmb` → `gmb`, `/?book=1&utm_source=walkin` → `walkin`, and converted `/book` campaign leads → `meta_ad`.
- **Status lifecycle:** pending → confirmed/rejected → in_progress → completed
- **Staff assignment:** Receptionist assigns on approval. Customer can add preference note.
- **Google Calendar:** Incremental consent. Calendar scope requested only after first confirmed booking. Event created on confirmation only.
- **Consent:** Required privacy checkbox + optional marketing checkbox (DPDP Act).
- **Service categories:** Salon (Haircut & Styling, Hair Colouring/Treatment, Facial & Skincare, Waxing, Manicure & Pedicure, Makeup Services, **Hair SPA & Head Therapies**) + SPA (Standard, Premium, VVIP).

## Admin Portal Roles (Locked)
5-role hierarchy: Developer → Owner → Manager → Receptionist → Staff (Stylist/Therapist)
- **Developer:** Full access including integrations, error logs, system config.
- **Owner:** Full access except adding/removing Developer. Can add/remove Manager. Has dedicated Manager — if Manager leaves, Owner reassigns.
- **Manager:** Can add/remove Receptionist/Staff. Edit prices, offers, membership tier defaults. Financial reports. System settings.
- **Receptionist:** Accept/reject/assign/schedule bookings. Billing + invoices. Create memberships + record sessions. CRM notes. Approve leaves. Walk-ins. Cannot edit prices.
- **Staff:** View own bookings only. Customer service notes for own assignments. Submit/view own leaves. No CRM, no prices, no billing.

## Payload CMS Scope (Locked)
Payload CMS (`admin.theroyalglow.in`) manages ONLY marketing content: banners, gallery, team bios, blog, FAQ.
Service catalog, bookings, memberships, billing → all in custom admin (`theroyalglow.in/admin`). NOT in Payload — services are live business data wired to invoices, gems, memberships.

## Accessibility & Legal (Locked)
- **a11y** — WCAG 2.1 AA. Lighthouse Accessibility = 100 required to merge. Semantic HTML, skip links, ARIA, visible focus ring, focus trap in modals, `prefers-reduced-motion`. `@axe-core/react` in Vitest. Playwright keyboard navigation E2E.
- **Legal pages** — `/privacy` (DPDP Act 2023 mandatory), `/terms`, `/refund-policy`, cookie consent banner (custom, lightweight). PostHog + Meta Pixel gated behind Accept. Consent in `localStorage` 365 days.

## PWA, Push Notifications & Image Optimization (Locked)
- **PWA** — manifest.json, service worker. Installable on phone. Offline: service menu, prices, contact, gallery. Add-to-homescreen prompt after 2nd visit.
- **Web Push API** — `web-push` npm. Appointment reminders (24h + 1h before), booking confirmations. Push subscription in Neon, triggered by pg_cron. ₹0, unlimited.
- **Image optimization** — Next.js `<Image>` (WebP/AVIF, srcset, lazy), Cloudflare Polish (lossless at edge), R2 serving, blur placeholders. No paid CDN needed. CLS=0 via explicit width/height.


- **Zod** — input validation on every API route. `.safeParse()` only, schemas in `packages/types/`
- **@upstash/ratelimit** — per-endpoint sliding windows. Bookings: 5/min, leads: 3/min, auth: 10/min
- **CSP headers** — strict, nonce-based script loading, whitelist PostHog/Clarity/Meta/Sentry/Ably origins
- **CORS** — exact origin matching (`royalglow.com` only), no wildcard `*`, credentials allowed
- **Session cookies** — HttpOnly, Secure, SameSite=Lax via Better Auth. CSRF built-in.
- **SQL injection** — Drizzle parameterized queries, no raw SQL
- **XSS** — React auto-escape + CSP, no dangerouslySetInnerHTML without sanitisation
- **File uploads** — type whitelist (jpg/png/webp/pdf), 10 MB max, filename sanitisation
- **Dependency audit** — Trivy + Socket.dev in CI, fail on high/critical
- **Webhook verification** — HMAC signature check on AiSensy + Meta payloads


- Local SEO: Google My Business fully configured, NAP consistent, GMB booking/action link → `https://theroyalglow.in/?book=1&utm_source=gmb`
- JSON-LD: LocalBusiness + BeautySalon + Service + BreadcrumbList + FAQPage + Organization — server-side Next.js
- Sitemap: Next.js 16 built-in `app/sitemap.ts`, submitted to Google Search Console on launch
- robots.txt: AI crawlers explicitly allowed (GPTBot, Claude-Web, PerplexityBot, Googlebot-Extended)
- Semantic HTML: non-negotiable — `<header>`, `<main>`, `<section>`, `<address>`, `<time>` — never `<div onClick>`
- Forms: every input labelled, aria-required, fieldset/legend, aria-live on dynamic content
- Agent endpoints: clean RESTful API routes for services, availability, bookings, leads — WebMCP-ready
- `llms.txt` + `llms-full.txt` at site root — AI agent discovery files with site info, services, contact, API endpoints
- All AI crawlers explicitly allowed: GPTBot, ChatGPT-User, ClaudeBot, PerplexityBot, Applebot-Extended, Google-Extended, CCBot, cohere-ai
- AI Overview optimization: answer-first content pattern on every page, FAQPage JSON-LD, E-E-A-T signals
- SSR/SSG for all public pages, no-JS fallback for core content


- **Phase 1: Cash only at the counter.** No gateway. Receptionist marks payment received. System generates branded PDF invoice → emailed to customer via Resend.
- Zero gateway fees, zero PCI overhead, zero integration complexity at launch.
- **Phase 2:** Razorpay or Cashfree when online pre-payment/deposits needed. Schema already accommodates it (`payment_method`, `payment_reference` columns to be added to `invoices` table).
- **Sentry** — error monitoring. 5k errors/mo free. Next.js + Cloudflare Workers SDK.
- **BetterStack** — uptime (10 monitors) + `status.royalglow.com` + pg_cron heartbeats + 1 GB logs/mo. Replaces UptimeRobot + Cronitor.
- **PostHog** — product analytics. 1M events/mo free. Funnels, feature flags, session replay, cohorts.
- **Microsoft Clarity** — heatmaps + session recordings. Free forever.
- Datadog, UptimeRobot, Cronitor, Plausible, GA4 all eliminated.
- **No external CRM** — all customer data in Neon, CRM is built as admin views (`/admin/crm`, `/admin/leads`)
- **AiSensy** (free, 1k conversations/mo) — WhatsApp team inbox for Meta ad leads, pipeline, agent assignment, quick replies
- **Meta Pixel** (browser) + **Meta Conversions API/CAPI** (server-side from Next.js) — ad attribution, Purchase events
- **UTM params** stored on every customer + lead record at first touch in Neon
- **Lead pipeline:** New → Contacted → Follow-up → Booked → Won/Lost
- **Landing page form** between Meta ad and WhatsApp — captures lead in Neon BEFORE WhatsApp opens
- AiSensy webhook → Neon DB when lead status changes
- **Neon DB** — primary DB. Free forever. 4 branches = 4 envs. pg_cron. Drizzle ORM + Better Auth native.
- **Ably** — realtime push (booking status, queue board, staff availability). 6M messages/mo free. API publishes to Ably channel after writing to Neon.
- **Cloudflare R2** — file storage. 10 GB free. Photos, service images, PDF invoices. No egress fees.
- **Upstash Redis + QStash** — cache + queue. Booking slot cache, API rate limiting, background jobs.
- **Cloudflare KV** — edge cache. Service listings, static data globally.
- **Postgres FTS / pg_trgm** — search inside Neon. Free. Upgrade to Algolia later.
- Deploy Cloudflare on **Mumbai / Singapore** region for India latency.
- Monthly cost: **₹0** vs $150–300/mo on AWS. First upgrade: Neon Launch $19/mo at 0.5 GB storage.

## Branch Strategy (Single Developer)
- **Git branches:** `prod`, `pprd`, `test`, `dev` (NOT `main` for git)
- **Neon DB branches:** `main` (prod), `preprod` (pprd), `test`, `dev` 
- Prod → Preprod replication: GitHub Actions cron every 24h using **Neon Branch Reset API** (copy-on-write, near-instant) then PII anonymisation script
- No `pg_dump`/restore needed — Neon branching handles it at storage layer
- **Canonical branch mapping:** Git branches = `dev`, `test`, `pprd`, `prod`; Neon branches = `dev`, `test`, `preprod`, `main`
- **Canonical DB secret names:** `DATABASE_URL_DEV`, `DATABASE_URL_TEST`, `DATABASE_URL_PPRD`, `DATABASE_URL_PROD`
- **Background job source of truth:** `docs/background-jobs.md`; summary docs should link there instead of duplicating full job inventories

- Supabase fully replaced. Better Auth vs Neon Auth compared — Better Auth wins on RBAC maturity.
- **pg_cron jobs: 9 total** (database-schema.md authoritative): daily sales, push reminders, inactive tagging, daily email, waitlist, loyalty reconciliation, membership expiry reminders, membership auto-expire, membership hours alert

## Testing & Quality (Full Strategy in docs/testing.md)
- **Static:** TypeScript strict + Biome + Ultracite (replaced ESLint + Prettier)
- **Unit/Integration:** Vitest + @faker-js/faker + MSW
- **Component:** Vitest + React Testing Library
- **E2E:** Playwright (5 browsers) + axe-core
- **Visual regression:** Meticulous AI (free <5 devs)
- **Performance:** Lighthouse CI + Unlighthouse + @next/bundle-analyzer
- **Load:** k6 (local execution)
- **Security:** Trivy + Semgrep + OWASP ZAP + Socket.dev
- **Monitoring:** BetterStack (uptime) + Checkly (synthetic) + Sentry (errors)
- **Mutation:** Stryker (quarterly)
- **Pre-commit:** Husky + lint-staged → Biome check on staged files
- **CI:** GitHub Actions (free 2000 min/mo)
- **Total cost:** $0/month

## Scale & Performance Targets
- Scalability: 20k–50k users future-proof
- 100% PageSpeed & Lighthouse scores
- Feel: rich, premium (high-end services for premium customers)
- Sub-100ms responses globally via Cloudflare edge

## Application Scope
- Customer-facing website
- Booking / scheduling system
- CRM & customer management
- Billing & invoicing
- Admin portal (receptionist, manager, owner views)
- Marketing automation
- Analytics
- Backend automations

## Auth Comparison Notes (Why Better Auth Won)
- Supabase Auth: branding doesn't show on Google OAuth screen (callback via `*.supabase.co`) on free plan
- Auth.js v5: no built-in RBAC plugin, manual wiring needed
- Clerk: best DX but custom domain (needed for branding) is Pro only
- WorkOS AuthKit: good dashboard but costs money
- Auth0: ruled out for cost/complexity
- **Better Auth:** callback on own domain, built-in roles/permissions plugin, TypeScript-first, stores data in own Supabase Postgres (PII stays under RLS), $0 forever
