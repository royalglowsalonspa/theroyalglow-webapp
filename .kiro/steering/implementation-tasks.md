# Implementation Plan — Ordered Tasks

## Phase 0: Project Scaffolding

### 0.1 Monorepo Setup
- [ ] Initialize root `package.json` with Bun workspaces: `apps/*`, `packages/*`, `docs`
- [ ] Create `turbo.json` with task pipeline: `build`, `dev`, `lint`, `typecheck`, `test`
- [ ] Set up `apps/web/` — Next.js 16.2.6 with App Router, `next.config.ts`
- [ ] Set up Tailwind CSS v4 with design tokens from `design/UIUX_Design/`
- [ ] Install and configure shadcn/ui (Radix primitives)
- [ ] Set up Biome + Ultracite (linting/formatting)
- [ ] Set up Husky + lint-staged (pre-commit hooks)
- [ ] Create `.env.example` files and `apps/web/src/env.ts` (t3-env + Zod validation)
- [ ] Set up TypeScript strict config (root + per-app extends)

### 0.2 Package Setup
- [ ] Create `packages/db/` — Drizzle ORM + Neon client + `drizzle.config.ts`
- [ ] Create `packages/types/` — Zod schemas (start with `api.ts` response types)
- [ ] Create `packages/errors/` — `AppError` class + `codes.ts` registry
- [ ] Create `packages/business/` — empty structure with `utils/currency.ts` and `utils/date.ts`
- [ ] Create `packages/logger/` — structured JSON logger

---

## Phase 1: Database & Auth Foundation

### 1.1 Database Schema
- [ ] Define all enums in `packages/db/schema/enums.ts`
- [ ] Create auth tables: `user`, `session`, `account`, `verification`
- [ ] Create profile tables: `customer_profile`, `staff_profile`
- [ ] Create service tables: `service_category`, `service`, `service_staff`
- [ ] Create branch table
- [ ] Run initial migration (`drizzle-kit generate` + `drizzle-kit migrate`)

### 1.2 Authentication
- [ ] Install Better Auth + Google OAuth provider
- [ ] Configure Better Auth with Drizzle adapter writing to Neon
- [ ] Set up `apps/web/app/api/auth/[...betterauth]/route.ts`
- [ ] Implement middleware for session validation + RBAC checks
- [ ] Create `/sign-in` page (Google OAuth button)
- [ ] Create `/onboarding` page (name, phone, DOB, gender, consent checkboxes)
- [ ] Implement `sessionStorage` for preserving UTM/booking context across OAuth redirect
- [ ] Create `POST /api/onboarding/complete` route

### 1.3 Seed Data
- [ ] Create seed script for: branch (Rayasandra), service categories, services, SPA tiers
- [ ] Create test user accounts for each role

---

## Phase 2: Core Customer Experience

### 2.1 Customer Layout & Public Pages
- [ ] Root layout: fonts, providers, metadata, Tailwind
- [ ] Customer layout: header, footer, nav (mobile + desktop)
- [ ] Homepage (`/`) — hero section, "Book Now" CTA, service highlights
- [ ] Services page (`/services`) — categories, Salon/SPA toggle, service cards
- [ ] About page (`/about`) — story, team gallery
- [ ] Contact page (`/contact`) — map, phone, email, form
- [ ] FAQ page (`/faq`) — SSG, FAQPage JSON-LD

### 2.2 Booking System
- [ ] `GET /api/services` — all categories + services (Cloudflare KV cache-ready)
- [ ] `GET /api/availability` — slots for date + staff
- [ ] Booking dialog component (4-step modal over homepage)
  - Step 1: Details + Date/Slot picker
  - Step 2: Salon/SPA toggle + category selection
  - Step 3: Service multi-select with running total
  - Step 4: Summary + submission
- [ ] `POST /api/bookings` — create booking (validate slot, generate booking number)
- [ ] `/bookings` page — list upcoming + past bookings
- [ ] `/bookings/[id]` page — booking detail, status timeline
- [ ] `POST /api/bookings/[id]/cancel` + `POST /api/bookings/[id]/reschedule`

### 2.3 Profile & Auth Pages
- [ ] `/profile` — editable fields (not email), notification preferences
- [ ] Protected route middleware (redirect to `/sign-in` if unauthenticated)

---

## Phase 3: Admin Portal — Core Operations

### 3.1 Admin Layout & Dashboard
- [ ] Admin layout: sidebar navigation, role-based menu items
- [ ] Admin middleware: RBAC check per route
- [ ] Dashboard (`/admin`) — today's bookings, revenue, pending actions

### 3.2 Booking Management
- [ ] `/admin/bookings` — list, filter by status/date/staff/type
- [ ] `/admin/bookings/[id]` — approve/reject, assign staff, mark status
- [ ] `/admin/bookings/new` — walk-in creation (skip pending)
- [ ] `PATCH /api/admin/bookings/[id]` — approve, reject, assign
- [ ] `POST /api/admin/bookings/[id]/complete` — mark completed + generate invoice + award gems

### 3.3 Billing & Invoicing
- [ ] Create scheduling tables: `staff_schedule`, `staff_time_off`, `holiday`
- [ ] Create booking tables: `booking`, `booking_service`, `booking_status_log`
- [ ] Create invoice tables: `invoice`, `invoice_item`
- [ ] Invoice generation logic in `packages/business/invoicing/`
- [ ] PDF invoice generation (React Email template → PDF)
- [ ] Invoice email delivery via Resend (synchronous)
- [ ] `/admin/billing` — invoice list, detail view

---

## Phase 4: CRM, Leads & Memberships

### 4.1 CRM
- [ ] Create CRM tables: `customer_tag`, `customer_tag_assignment`, `customer_note`
- [ ] `/admin/customers` — search, filter, sort by LTV
- [ ] `/admin/customers/[id]` — profile, history, notes, tags

### 4.2 Lead Pipeline
- [ ] Create lead tables: `lead`, `lead_note`
- [ ] `/book` page — Meta ad lead capture form (3 fields, no auth)
- [ ] `POST /api/leads` — create lead + fire CAPI Lead event
- [ ] `/admin/leads` — kanban pipeline view
- [ ] `/admin/leads/[id]` — detail, notes, UTM, WhatsApp link

### 4.3 SPA Memberships
- [ ] Create membership tables: `spa_membership`, `spa_membership_tier`
- [ ] `POST /api/admin/memberships` — create membership + invoice
- [ ] `/admin/memberships` — list, filter by tier/status
- [ ] `/membership` (customer) — tier, hours remaining, session history
- [ ] Session recording flow (admin marks session → deduct hours)

### 4.4 Loyalty (Gems)
- [ ] Create loyalty tables: `loyalty_account`, `loyalty_transaction`
- [ ] Gems earning logic on booking completion
- [ ] `/gems` (customer) — catalogue + balance
- [ ] Gems redemption at checkout

---

## Phase 5: Scheduling, Notifications & Offers

### 5.1 Staff Scheduling & Leave
- [ ] `/admin/schedule` — weekly/daily staff availability grid
- [ ] `/admin/leave` — submit, approve, reject leave requests
- [ ] `POST /api/admin/leave` — leave CRUD
- [ ] Staff view: own schedule + leave history

### 5.2 Notifications & Realtime
- [ ] Create notification tables: `notification`, `push_subscription`
- [ ] Web Push subscription flow (`POST /api/push/subscribe`)
- [ ] Ably token auth route (`POST /api/ably/token`)
- [ ] Ably channel subscriptions for booking status + admin dashboard
- [ ] Push notification on booking status changes

### 5.3 Offers
- [ ] Create offer tables: `offer`, `offer_service`, `offer_redemption`
- [ ] `/admin/offers` — create/edit offers
- [ ] `/offers` (customer) — active offers display
- [ ] Offer application at checkout

---

## Phase 6: Background Jobs & Automation

- [ ] Set up pg_cron jobs (7): nightly sales, membership expire, offer expire, session cleanup, preprod sync, monthly GST, gems expire
- [ ] Set up QStash scheduled jobs (8): reminders, birthday, nudges, reports, follow-ups
- [ ] Set up QStash triggered jobs (4): post-service, stale booking, no-show, expired notice
- [ ] BetterStack heartbeat integration for all jobs

---

## Phase 7: SEO, PWA & Polish

- [ ] JSON-LD: LocalBusiness, BeautySalon, Service, BreadcrumbList, FAQPage, Organization
- [ ] `sitemap.ts` + `robots.ts` (allow AI crawlers)
- [ ] `llms.txt` + `llms-full.txt` at site root
- [ ] PWA: manifest.json, service worker, offline support
- [ ] Cookie consent banner (2-tier: necessary + opt-in analytics/marketing)
- [ ] Legal pages: `/privacy`, `/terms`, `/refund-policy` (SSG)
- [ ] Meta Pixel + CAPI integration
- [ ] PostHog analytics integration (gated behind consent)

---

## Phase 8: CMS & Blog

- [ ] Set up `apps/cms/` — Payload CMS v3 with Neon + R2
- [ ] Collections: blog, gallery, team, banners, FAQ
- [ ] `/blog` + `/blog/[slug]` — fetch from Payload API (ISR, 1h revalidation)

---

## Phase 9: Testing & CI/CD

- [ ] GitHub Actions: CI workflow (lint, typecheck, unit tests, build)
- [ ] GitHub Actions: Integration + E2E (Playwright, Lighthouse CI)
- [ ] GitHub Actions: Load test + security (k6, Trivy, OWASP ZAP)
- [ ] GitHub Actions: Deploy to prod (Cloudflare Pages)
- [ ] Health check endpoint (`GET /api/health`)
- [ ] Weekly backup workflow (pg_dump → R2)

---

## Phase 10: Observability & Launch

- [ ] Sentry integration (error monitoring + source maps)
- [ ] BetterStack uptime monitors + status page
- [ ] PostHog funnels + feature flags
- [ ] Checkly synthetic monitoring
- [ ] Launch checklist verification
- [ ] DNS: point theroyalglow.in → Cloudflare Pages
- [ ] Fumadocs documentation site at docs.theroyalglow.in

---

## Implementation Principles

1. **Start with schema** — get DB tables right first, everything builds on data
2. **Vertical slices** — implement booking end-to-end before starting CRM
3. **API first** — build API routes, then UI that consumes them
4. **Mobile first** — customer pages designed for 375px, adapted to desktop
5. **Feature flags** — ship to prod hidden behind PostHog flags, enable gradually
6. **No gold-plating** — get the core flow working, polish later

---

## Reference

- #[[file:deployment.md]] — Full CI/CD pipeline specification
- #[[file:git-workflow.md]] — Branch strategy and protection rules
- #[[file:launch-checklist.md]] — Pre-launch verification checklist
- #[[file:testing.md]] — Complete testing strategy
