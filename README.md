# Royal Glow Salon & Spa (RGSS) — Project Context

## What This Is
Full-stack business solution for **Royal Glow Salon & Spa** by **Roshini**.  
Covers: website, CRM, customer management, marketing automation, database, creative design, analytics, scheduling, backend automations — a fully digital scalable business ecosystem.

## Tech Stack (Decided)
| Layer | Choice |
|-------|--------|
| Runtime | Bun |
| Language | TypeScript + JavaScript |
| Styling | Tailwind CSS v4 |
| Framework | Next.js 16.2.6 (App Router) |
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
- **Google OAuth only** — callback on own domain (`theroyalglow.in/api/auth/callback/google`) so branding shows correctly on Google consent screen
- Better Auth Cloud free tier ($0/mo) provides: dashboard, audit logs, user management, session monitoring, org oversight, user analytics
- **6 concrete RBAC roles** (via Better Auth roles & permissions plugin):
  1. **Customer** — real end users booking services
  2. **Staff** (Stylist / Therapist) — view own bookings, submit leaves
  3. **Receptionist** — day-to-day ops: bookings, billing, memberships, CRM, leave approvals
  4. **Manager** — full operational access: services, offers, reports, staff, settings
  5. **Owner** — full business access including `/admin/users`
  6. **Developer** — full access + integrations, error logs, system config
- First-time login → onboarding prompt to collect: name, phone number, gender, DOB, consent checkboxes
- Admin panel page `/admin/users` built in-house using `auth.api.listUsers()` for custom user management UI

## Email Strategy
- **Transactional (Resend):** welcome email on sign-in, booking confirmations, invoices (PDF attachment), appointment reminders, membership alerts
- **Marketing (Brevo):** post-service follow-up, re-engagement, seasonal offers, birthday offers — with automatic unsubscribe management
- **React Email:** build email templates in React/TypeScript matching site design tokens
- **Legal:** marketing emails need unsubscribe link + marketing consent checkbox on onboarding (CAN-SPAM, GDPR, India DPDP Act)

## Business Info (Locked)
- **Domain:** theroyalglow.in
- **Subdomains:** admin.theroyalglow.in (Payload CMS), status.theroyalglow.in (BetterStack), docs.theroyalglow.in (Fumadocs)
- **Email:** hello@theroyalglow.in
- **Phone:** +91 63601 35720
- **Address:** 1st Floor, Narmada Complex, 48/3, Rayasandra Main Rd, Above SBI Bank, Naganathapura, Parappana Agrahara, Bengaluru, Karnataka 560100, India
- **Hours:** Mon–Fri 10:00–21:00, Sat–Sun 10:00–22:00
- **GMB:** 4.9 ★ 86 reviews, category: Day Spa

## Database Schema (Locked)
- **38 tables** across 13 domains: Auth (4), Profiles (2), Services (3), Scheduling (4), Bookings (4), Billing (2), SPA Memberships (2), Offers (3), CRM & Leads (5), Loyalty (2), Notifications (2), Branches (1), System (4)
- **Money:** integer in paise (₹1 = 100 paise). No floating point.
- **IDs:** text (nanoid/cuid2), no auto-increment serial.
- **Timestamps:** timestamptz (UTC stored, IST displayed).
- **Date display:** DD/MM/YYYY (Indian standard) via `Intl.DateTimeFormat('en-IN')`.
- **GST-inclusive pricing:** All customer-facing prices include 18% GST (SAC 999721). Invoice back-calculates base.
- **Salon/SPA separation:** booking.service_type = 'salon' or 'spa'. No cross-type bookings. Enables clean analytics split.
- **Loyalty gems:** McDonald's-style catalogue. 1% of final invoiced amount earned (floor). Gems unlock specific services from catalogue, NOT a ₹ discount. One catalogue service per booking. NO gems on membership purchases or membership sessions. Gems expire **1 year (365 days)** after earning.
- **Offers:** 3 types (percentage, flat, combo_price). 1 offer/customer/day. Applied at checkout by receptionist. Cannot combine with gems. Salon only.
- **Booking lifecycle:** pending → confirmed/rejected → in_progress → completed. Walk-ins skip pending.
- **Invoice types:** `service` (normal, gems earned), `membership_purchase` (lump sum, no gems), `membership_session` (₹0 usage record, no gems).
- **Invoice numbering:** `INV-{branch_number}-{financial_year}-{5_digit_random}` (e.g., `INV-1-2627-92921`, display: `#INV1262792921`). Random 5-digit, no sequence, no reset. Retry on collision.
- **Booking numbering:** `BK-{branch_code}-{YYMM}-{H|S}-{5_random}[-M]` (e.g., `BK-RS-2605-H-38291`, display: `#BKRS2605H38291`). H=salon, S=spa, -M suffix for membership sessions.
- **Membership numbering:** `RG-MEM-{YY}-{branch_number}-{5_random}` (e.g., `RG-MEM-26-1-90872`, display: `#RGMEM26190872`). Branch number embedded — sessions restricted to originating branch only.
- **Snapshots:** service name + price frozen on booking_service and invoice_item.
- **Denormalized:** customer_profile.total_visits, total_spent_paise.
- **Key enums:** booking_status, invoice_type, spa_membership_status, service_type, discount_type, notification_type (with membership + gems events), staff_designation, leave_approval_status, leave_type, branch_status.
- **Schema files (15):** auth.ts, profile.ts, service.ts, schedule.ts, booking.ts, invoice.ts, membership.ts, offer.ts, lead.ts, crm.ts, loyalty.ts, notification.ts, branch.ts, system.ts, enums.ts.
- See database-schema.md for full ERD, column definitions, indexes, SPA seed data.

## Background Jobs (Locked)
- **Source of truth:** [background-jobs.md](./background-jobs.md)
- **Total: 19 jobs — 7 pg_cron + 8 QStash scheduled + 4 QStash triggered**
- **pg_cron (7 — pure SQL, run inside Neon `main`):**
  1. Nightly sales summary — `0 18 * * *` UTC (11:30 PM IST)
  2. Membership auto-expire — `30 18 * * *` UTC (12:00 AM IST)
  3. Offer auto-expire — `35 18 * * *` UTC (12:05 AM IST)
  4. Session cleanup — `0 21 * * 0` UTC (2:30 AM IST Sunday)
  5. Monthly GST summary — `30 19 1 * *` UTC (1:00 AM IST, 1st of month)
  6. Gems auto-expire — `40 18 * * *` UTC (12:10 AM IST)
  7. Preprod DB sync — GitHub Actions cron `30 19 * * *` UTC (1:00 AM IST) + PII anonymisation
- **QStash scheduled (8 — HTTP → Next.js API routes):** appointment reminders (every 15min), membership expiry alerts, birthday emails, membership usage nudges, lead follow-up reminders, daily sales report, weekly summary report, gems expiry reminder
- **QStash triggered (4 — event-driven with delay):** post-service follow-up (+24h), stale pending booking alert (+2h), no-show check (+15min after end_time), membership expired notice (+1h after expires_at)
- All jobs ping BetterStack heartbeat URLs on success. Silent failure is detected and alerted.

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
- **Consent:** Required privacy checkbox + optional analytics + optional marketing checkboxes (DPDP Act).
- **Service categories:** Salon (Haircut & Styling, Hair Colouring/Treatment, Facial & Skincare, Waxing, Manicure & Pedicure, Makeup Services, **Hair SPA & Head Therapies**) + SPA (Standard, Premium, VVIP).

## Admin Portal Roles (Locked)
6-role system. Admin hierarchy: Developer → Owner → Manager → Receptionist → Staff (Stylist/Therapist). Customer is the 6th role (public-facing, no admin access).
- **Developer:** Full access including integrations, error logs, system config. Can assign Owner role.
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
- **Web Push API** — `web-push` npm. Appointment reminders (24h + 1h before), booking confirmations. Push subscription in Neon, triggered by QStash every 15 min. ₹0, unlimited.
- **Image optimization** — Next.js `<Image>` (WebP/AVIF, srcset, lazy), Cloudflare Polish (lossless at edge), R2 serving, blur placeholders. No paid CDN needed. CLS=0 via explicit width/height.

## Security (Locked)
- **Zod** — input validation on every API route. `.safeParse()` only, schemas in `packages/types/`
- **@upstash/ratelimit** — per-endpoint sliding windows. Bookings: 5/min, leads: 3/min, auth: 10/min
- **CSP headers** — strict, nonce-based script loading, whitelist PostHog/Clarity/Meta/Sentry/Ably origins
- **CORS** — exact origin matching (`theroyalglow.in` only), no wildcard `*`, credentials allowed
- **Session cookies** — HttpOnly, Secure, SameSite=Lax via Better Auth. CSRF built-in.
- **SQL injection** — Drizzle parameterized queries, no raw SQL
- **XSS** — React auto-escape + CSP, no dangerouslySetInnerHTML without sanitisation
- **File uploads** — type whitelist (jpg/png/webp/pdf), 10 MB max, filename sanitisation
- **Dependency audit** — Trivy + Socket.dev in CI, fail on high/critical
- **Webhook verification** — HMAC signature check on AiSensy + Meta payloads

## SEO & AI Search (Locked)
- Local SEO: Google My Business fully configured, NAP consistent, GMB booking/action link → `https://theroyalglow.in/?book=1&utm_source=gmb`
- In-store QR posters → `https://theroyalglow.in/?book=1&utm_source=walkin`
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

## Payment & Billing (Locked)
- **Phase 1: Cash / UPI / Card at the counter.** No online gateway. Receptionist marks payment received and selects payment mode. System generates branded PDF invoice → emailed to customer via Resend.
- Zero gateway fees, zero PCI overhead, zero integration complexity at launch.
- **Phase 2:** Razorpay or Cashfree when online pre-payment/deposits needed. Schema already accommodates it (`payment_method` enum includes `'online'`, `payment_reference` column exists in `invoice` table).

## Observability & Analytics (Locked)
- **Sentry** — error monitoring. 5k errors/mo free. Next.js + Cloudflare Workers SDK.
- **BetterStack** — uptime (10 monitors) + `status.theroyalglow.in` + heartbeats for pg_cron/QStash/GitHub Actions jobs + 1 GB logs/mo. Replaces UptimeRobot + Cronitor.
- **PostHog** — product analytics. 1M events/mo free. Funnels, feature flags, session replay, cohorts.
- **Microsoft Clarity** — heatmaps + session recordings. Free forever.
- **Checkly** — synthetic monitoring. Real Playwright scripts in prod. 5 checks free.
- Datadog, UptimeRobot, Cronitor, Plausible, GA4 all eliminated.

## CRM & Lead Tracking (Locked)
- **No external CRM** — all customer data in Neon, CRM is built as admin views (`/admin/customers`, `/admin/leads`)
- **AiSensy** (free, 1k conversations/mo) — WhatsApp team inbox for Meta ad leads, pipeline, agent assignment, quick replies
- **Meta Pixel** (browser) + **Meta Conversions API/CAPI** (server-side from Next.js) — ad attribution, Purchase events
- **UTM params** stored on every customer + lead record at first touch in Neon
- **Lead pipeline:** New → Contacted → Follow-up → Booked → Won/Lost
- **`/book` landing page** — Meta/Instagram ad lead capture only. Creates a `lead` with source `meta_ad`. No sign-in required, no slot reserved. Customer continues to homepage booking dialog via `/?book=1&leadId={id}`.
- AiSensy webhook → Neon DB when lead status changes

## Data Stack (Locked)
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
- **Background job source of truth:** [background-jobs.md](./background-jobs.md); summary docs should link there instead of duplicating full job inventories

## Key Decisions Log
- Supabase fully replaced. Better Auth vs Neon Auth compared — Better Auth wins on RBAC maturity.
- Booking routes: Homepage "Book Now" opens 4-step dialog over `/`; never redirects to `/book`. `/book` is Meta/Instagram lead capture only.
- Acquisition sources: `organic` (root domain, no UTM), `gmb` (`/?book=1&utm_source=gmb`), `walkin` (`/?book=1&utm_source=walkin`), `meta_ad` (converted `/book` lead).

## Testing & Quality (Full Strategy in testing.md)
- **Static:** TypeScript strict + Biome + Ultracite (replaced ESLint + Prettier)
- **Unit/Integration:** Vitest + @faker-js/faker + MSW
- **Component:** Vitest + React Testing Library
- **E2E:** Playwright (5 browsers) + axe-core
- **Visual regression:** Meticulous AI (free <5 devs)
- **Performance:** Lighthouse CI (performance ≥ 95; accessibility, best practices, SEO = 100) + Unlighthouse + @next/bundle-analyzer
- **Load:** k6 (local execution)
- **Security:** Trivy + Semgrep + OWASP ZAP + Socket.dev
- **Monitoring:** BetterStack (uptime) + Checkly (synthetic) + Sentry (errors)
- **Mutation:** Stryker (quarterly)
- **Pre-commit:** Husky + lint-staged → Biome check on staged files
- **CI:** GitHub Actions (free 2000 min/mo)
- **Total cost:** $0/month

## Scale & Performance Targets
- Scalability: 20k–50k users future-proof
- Lighthouse gates: performance ≥ 95; accessibility, best practices, and SEO = 100
- Feel: rich, premium (high-end services for premium customers)
- Sub-100ms responses globally via Cloudflare edge

## Application Scope
- Customer-facing website
- Booking / scheduling system
- CRM & customer management
- Billing & invoicing (GST-compliant)
- Admin portal (receptionist, manager, owner views)
- SPA memberships (Silver/Gold/Platinum)
- Loyalty gems programme (catalogue-based redemption)
- Branch management (single branch Phase 1, multi-branch ready)
- Marketing automation
- Analytics
- Backend automations (19 scheduled/triggered jobs)

## Auth Comparison Notes (Why Better Auth Won)
- Supabase Auth: branding doesn't show on Google OAuth screen (callback via `*.supabase.co`) on free plan
- Auth.js v5: no built-in RBAC plugin, manual wiring needed
- Clerk: best DX but custom domain (needed for branding) is Pro only
- WorkOS AuthKit: good dashboard but costs money
- Auth0: ruled out for cost/complexity
- **Better Auth:** callback on own domain, built-in roles/permissions plugin, TypeScript-first, stores data in own Neon DB (PII under your control), $0 forever
