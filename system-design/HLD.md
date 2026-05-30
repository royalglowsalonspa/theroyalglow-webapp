# High-Level Design (HLD) — Royal Glow Salon & Spa

> **Document Classification:** System Design — Staff Engineer Review  
> **Version:** 1.0  
> **Author:** Engineering Lead  
> **Last Updated:** 2026-05-23  
> **Status:** Approved for Implementation  
> **Review Panel:** Principal Engineer Design Review

---

## 1. Executive Summary

### 1.1 Business Context

Royal Glow Salon & Spa is a premium beauty and wellness establishment located in Bengaluru, India. The business operates across salon services (haircuts, facials, makeup) and SPA services (massage, aromatherapy) with plans for multi-branch expansion.

### 1.2 System Purpose

This document describes the high-level design of a **full-stack digital operations platform** that encompasses:

- **Customer-facing**: Online booking, service discovery, loyalty program, membership management
- **Operations**: Staff scheduling, leave management, CRM, lead pipeline, billing/invoicing
- **Analytics**: Revenue reporting, campaign attribution, conversion funnels, staff performance

### 1.3 Scale Targets

| Metric | Target |
|--------|--------|
| Registered users | 20,000–50,000 |
| Daily active users | 50–200 |
| Concurrent users (peak) | 50 |
| Application routes | ~104 pages |
| Database tables | 38 |
| API endpoints | 35 |
| Background jobs | 19 |

### 1.4 Key Constraints

| Constraint | Impact |
|-----------|--------|
| **Solo developer** | No microservices, minimal ops overhead, single consistent stack |
| **₹0/month infrastructure** | All free tiers at launch — generous enough for salon scale |
| **India-first** | DPDP Act compliance, IST timezone, INR currency (paise), GST 18% |
| **Premium brand** | Lighthouse ≥95 performance, 100 accessibility/SEO, motion-rich UI |

---


## 2. System Requirements

### 2.1 Functional Requirements

#### FR-1: Customer Booking Flow
- 4-step booking dialog (Service Selection → Date/Time → Confirmation → Submitted)
- Deep-link support: `?book=1&utm_source=gmb` auto-opens dialog with attribution
- Walk-in QR code booking, Meta/Instagram ad lead capture (`/book`)
- Reschedule and cancellation with policy enforcement

#### FR-2: SPA Membership Management
- Three tiers: Silver / Gold / Platinum
- Hour-based session tracking with deduction on service completion
- Auto-expiry on membership end date (pg_cron Job 2)
- Renewal prompts at 30/7/1 day milestones

#### FR-3: Loyalty & Gems System
- Earn rate: 1 gem per ₹100 invoiced (floor, awarded at invoice generation)
- Expiry: 365 days from earn date (1-year rolling window)
- Redemption against a service catalogue
- Auto-expiry job (pg_cron Job 7), reminder push 7 days before (QStash Job 15)

#### FR-4: Admin Portal with RBAC
- 6 hierarchical roles: Customer < Staff < Receptionist < Manager < Owner < Developer
- Role-gated middleware on all `/admin/*` routes
- Role assignment hierarchy enforcement (can only assign below own level)
- Custom `/admin/users` panel for user management

#### FR-5: CRM & Lead Pipeline
- Lead sources: Meta ads (`/book` form), organic, GMB deep-link, walk-in QR
- Pipeline stages: New → Contacted → Follow-up → Booked → Won / Lost
- Meta Conversions API (CAPI) server-side events: Lead, CompleteRegistration, Purchase
- AiSensy WhatsApp integration for shared team inbox
- 48-hour stale follow-up alerts (QStash Job 12)

#### FR-6: Invoice Generation with GST
- GST rate: 18% (SAC code 999721)
- GST-inclusive pricing: back-calculate base = price ÷ 1.18
- PDF generation inline on booking completion
- Email delivery via Resend (synchronous — customer still at counter)
- Monthly GST summary aggregation (pg_cron Job 6)

#### FR-7: Staff Scheduling & Leave Management
- Weekly recurring schedules per staff member
- Leave request → approval workflow (Manager/Receptionist approves)
- Real-time schedule updates via Ably (`admin:schedule:{date}` channel)
- Holiday calendar (branch-level)

#### FR-8: Realtime Notifications
- Booking status changes (Pending → Confirmed → In-Progress → Completed)
- Staff schedule changes and leave approvals
- Web Push API for native-style notifications (free, unlimited)
- Ably WebSocket for in-app live UI updates (~50ms delivery)

#### FR-9: Multi-Branch Support
- Branch entity in database, all bookings/invoices scoped to branch
- Branch selector in admin views
- Staff assigned per branch
- Branch-specific operating hours and holidays

### 2.2 Non-Functional Requirements

| Category | Requirement | Target |
|----------|-------------|--------|
| **Latency** | Global response time (edge computing) | < 100ms |
| **Availability** | Uptime target | 99.9% |
| **Security** | Privacy compliance | India DPDP Act 2023 |
| **Security** | Vulnerability coverage | OWASP Top 10 |
| **Performance** | Lighthouse Performance score | ≥ 95 |
| **Performance** | Lighthouse Accessibility score | 100 |
| **Performance** | Lighthouse SEO score | 100 |
| **Cost** | Monthly infrastructure budget at launch | ₹0 |
| **Scalability** | Concurrent user support (preprod load test) | 50 users |
| **Recoverability** | Recovery Point Objective (RPO) | ~0 seconds |
| **Recoverability** | Recovery Time Objective (RTO) | < 5 minutes |
| **Compliance** | Cookie consent | 2-tier banner (Necessary + opt-in Analytics/Marketing) |
| **Accessibility** | WCAG compliance level | 2.1 AA |

---


## 3. Architecture Overview

### 3.1 Architecture Style

**Decision: Monolithic modular architecture** (not microservices)

| Factor | Rationale |
|--------|-----------|
| Team size | Single developer — no team boundaries to split on |
| Communication overhead | Zero inter-service communication (no gRPC, no service mesh) |
| Deployment complexity | One build, one deploy, one rollback |
| Data consistency | Single database, no distributed transactions |
| Stack consistency | TypeScript end-to-end, same tooling everywhere |

The architecture uses **strict layer separation** within a monorepo to achieve the modularity benefits of microservices without the operational burden. Each layer has explicit import boundaries enforced by the package structure.

### 3.2 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                         │
│                                                                                   │
│    Browser / PWA (Next.js React App)                                             │
│    ├── Customer Pages: /, /services, /bookings, /membership, /gems               │
│    ├── Admin Portal: /admin/* (RBAC-gated)                                       │
│    └── Ably WebSocket Subscription (Token Auth, subscribe-only)                  │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │ HTTPS (TLS 1.3)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           EDGE LAYER (Cloudflare)                                 │
│                                                                                   │
│    ┌──────────────┐    ┌──────────────────┐    ┌────────────────────────┐        │
│    │ Cloudflare   │    │ Cloudflare Pages │    │ Cloudflare Workers     │        │
│    │ DNS + DDoS   │───▶│ (Static CDN)     │───▶│ (Edge SSR + API)       │        │
│    │ + WAF        │    │                  │    │ 50ms CPU wall time     │        │
│    └──────────────┘    └──────────────────┘    └──────────┬─────────────┘        │
│                                                            │                      │
│    ┌──────────────────┐                                    │                      │
│    │ Cloudflare KV    │◀── L1 Edge Cache (5-min TTL)       │                      │
│    │ (service catalog)│                                    │                      │
│    └──────────────────┘                                    │                      │
└────────────────────────────────────────────────────────────┼──────────────────────┘
                                                             │
                              ┌───────────────────────────────┼───────────────────┐
                              │                               │                   │
                              ▼                               ▼                   ▼
┌──────────────────────────────────┐  ┌────────────────────────────┐  ┌──────────────────┐
│  Render (Singapore)              │  │  Neon DB (PostgreSQL 16)   │  │  Upstash          │
│  ├── Heavy SSR fallback          │  │  ├── 4 branches:           │  │  ├── Redis         │
│  │   (exceeds 50ms CPU)          │  │  │   dev/test/pprd/prod    │  │  │   (cache, rate   │
│  └── Payload CMS v3              │  │  ├── pg_cron (7 jobs)      │  │  │    limiting)     │
│      (admin.theroyalglow.in)     │  │  ├── Drizzle ORM           │  │  └── QStash        │
│                                  │  │  └── Connection pooling     │  │      (12 HTTP jobs)│
└──────────────────────────────────┘  └────────────────────────────┘  └──────────────────┘
                                                                                │
                              ┌──────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────────────────────────────┐
              │               │                                       │
              ▼               ▼                                       ▼
┌──────────────────┐  ┌──────────────────┐               ┌──────────────────────┐
│  Cloudflare R2   │  │  Ably            │               │  External Services   │
│  (S3-compatible) │  │  (Realtime)      │               │  ├── Resend (email)  │
│  ├── Images      │  │  ├── 6 channels  │               │  ├── Brevo (mktg)   │
│  ├── PDF invoices│  │  ├── Token Auth  │               │  ├── web-push       │
│  └── DB backups  │  │  └── ~50ms push  │               │  └── Slack webhooks │
└──────────────────┘  └──────────────────┘               └──────────────────────┘
```

### 3.3 Component Breakdown

| Layer | Location | Responsibility | Key Constraint |
|-------|----------|---------------|----------------|
| **Presentation** | `apps/web/app/` | React Server/Client Components, layouts, pages | Zero business logic |
| **UI Components** | `apps/web/components/` | shadcn/ui primitives, booking dialog, admin widgets | Pure presentation |
| **API (Thin)** | `apps/web/app/api/` | Parse request → Zod validate → delegate → JSON response | No DB queries here |
| **Business Logic** | `packages/business/` | Pure functions, domain rules, calculations | No I/O, no framework deps |
| **Data Access** | `packages/db/` | Drizzle ORM schemas, query builders, migrations | Only package that imports Drizzle |
| **CMS** | `apps/cms/` | Payload CMS v3 — blog, gallery, team bios, banners, FAQ | Marketing content only |
| **Infrastructure** | Edge config, wrangler | Cloudflare Workers config, R2 bindings, KV namespaces | Platform-specific |



### 3.4 Technology Decisions Matrix

| Category | Choice | Alternatives Considered | Why This Choice |
|----------|--------|------------------------|-----------------|
| **Framework** | Next.js 16 (App Router) | Remix, SvelteKit, Astro | SSR + SSG + API routes in one; edge-ready via `@cloudflare/next-on-pages`; React ecosystem; largest community |
| **Runtime** | Bun | Node.js, Deno | 3x faster installs, native TypeScript, faster test runs, drop-in Node.js compatibility |
| **Database** | Neon PostgreSQL 16 | Supabase (2 free projects only), PlanetScale (removed free tier), Turso (SQLite limits), Xata (no cron) | Branching (10 free = 4 environments), pg_cron native, serverless auto-scaling, Drizzle-native |
| **ORM** | Drizzle ORM | Prisma (binary can't run on CF Workers), Kysely (less schema-first) | Pure TypeScript, zero binary, runs natively on Cloudflare Workers V8 isolate, excellent DX |
| **Auth** | Better Auth | Clerk ($$ for custom domain), Auth.js (no RBAC plugin), Supabase Auth (branding on free tier) | Self-hosted, Google OAuth shows YOUR domain on consent screen, built-in RBAC plugin, sessions in your DB |
| **Hosting (Edge)** | Cloudflare Pages + Workers | Vercel (expensive at scale), Netlify (less edge compute) | Generous free tier, global edge, no bandwidth overage surprises, R2/KV/Workers all in one platform |
| **Hosting (Origin)** | Render (Singapore) | Railway, Fly.io | Free tier sufficient for CMS + heavy SSR fallback, closest free-tier region to India |
| **Realtime** | Ably | Pusher (200k/day vs 6M/month), Socket.io (self-hosted infra), Supabase Realtime (coupled to Supabase DB) | 6M messages/month free, 200 concurrent, edge-compatible SDK, Token Auth |
| **CMS** | Payload CMS v3 | Sanity (vendor lock-in), Strapi (heavier), Contentful (limited free tier) | Self-hosted Next.js plugin, media to R2, schema in TypeScript, zero vendor lock-in |
| **Email (Transactional)** | Resend | SendGrid, Postmark | Modern DX, React Email templates, generous free tier, fast delivery |
| **Email (Marketing)** | Brevo | Mailchimp, ConvertKit | Built-in unsubscribe management, automation workflows, DPDP-compliant, free tier |
| **Cache** | Upstash Redis | Cloudflare Durable Objects (paid), self-hosted Redis (ops overhead) | Serverless, works on CF Workers, rate limiting SDK, QStash included |
| **File Storage** | Cloudflare R2 | AWS S3 (egress fees), Supabase Storage | S3-compatible, zero egress fees, 10 GB free, same platform as hosting |
| **Monorepo** | Turborepo + Bun Workspaces | Nx (heavier), pnpm workspaces alone | Bun handles packages, Turborepo handles task orchestration + caching; minimal config |
| **UI Components** | shadcn/ui + Radix | Material UI (heavy runtime), Chakra (opinionated), Mantine | Copy-paste ownership, Radix accessibility, zero runtime overhead, fully customizable |
| **Styling** | Tailwind CSS v4 | CSS Modules, styled-components, Emotion | Utility-first, design tokens, v4 native cascade layers, zero runtime JS |
| **Animation** | motion (motion.dev) | GSAP (license complexity), react-spring | Free tier covers all needs, respects `prefers-reduced-motion`, clean API |
| **Validation** | Zod | Yup, io-ts, Valibot | TypeScript-native inference, composable schemas, industry standard for Next.js |
| **Analytics** | PostHog | Google Analytics (DPDP concern), Mixpanel (limited free) | 1M events/mo free, feature flags, funnels, session replay — all-in-one |
| **Error Monitoring** | Sentry | Highlight.io (smaller), Datadog ($31/host/mo) | Industry standard, CF Workers support, source maps, 5k errors/mo free |
| **Feature Flags** | PostHog | LaunchDarkly (expensive), Unleash (self-hosted overhead) | Already in stack for analytics; flags are a free add-on |

---


## 4. Data Architecture

### 4.1 Database Strategy

**Engine:** Neon PostgreSQL 16 (serverless, auto-scaling compute, connection pooling built-in)

**Branch Strategy (Git-like Database Environments):**

| Neon Branch | Environment | Purpose | Reset Policy |
|-------------|-------------|---------|--------------|
| `main` | Production | Live customer data, pg_cron runs here | Never reset |
| `preprod` | Pre-production | UAT with anonymised prod data | Auto-reset daily from `main` + PII stripped |
| `test` | QA / CI | Seeded fixtures for automated tests | Wiped and reseeded every CI run |
| `dev` | Development | Developer sandbox | Scales to zero when idle |

**Connection Strategy:**
- Pooled connection string for application queries (via Neon's built-in PgBouncer)
- Unpooled (direct) connection string for migrations only (`drizzle-kit push/migrate`)

### 4.2 Data Model Overview

**38 tables across 13 domains:**

| Domain | Tables | Key Entities |
|--------|--------|-------------|
| Auth | 4 | `user`, `session`, `account`, `verification` |
| Profiles | 2 | `customer_profile`, `staff_profile` |
| Services | 3 | `service_category`, `service`, `service_staff` |
| Scheduling | 4 | `staff_schedule`, `staff_time_off`, `holiday`, `waitlist` |
| Bookings | 4 | `booking`, `booking_service`, `booking_note`, `booking_history` |
| Billing | 2 | `invoice`, `invoice_item` |
| SPA Memberships | 2 | `spa_membership`, `spa_membership_tier` |
| Offers | 3 | `offer`, `offer_service`, `offer_redemption` |
| CRM/Leads | 5 | `lead`, `lead_note`, `customer_tag`, `customer_tag_assignment`, `customer_note` |
| Loyalty | 2 | `loyalty_account`, `loyalty_transaction` |
| Notifications | 2 | `notification`, `push_subscription` |
| Branches | 1 | `branch` |
| System | 5 | `daily_sales_summary`, `monthly_gst_summary`, `audit_log`, `system_setting`, `feature_flag_override` |

**Key Conventions:**

| Convention | Implementation |
|-----------|---------------|
| Primary keys | `text` via `nanoid()` — prevents enumeration attacks |
| Money | `integer` in paise (₹1,000.00 = `100000`) — no floating-point errors |
| Timestamps | `timestamptz` stored UTC, displayed IST (UTC+5:30) |
| Date display | DD/MM/YYYY (`en-IN` locale) |
| Currency display | Indian numbering: ₹1,00,000.00 (lakhs, not Western commas) |
| Soft deletes | Not used — hard deletes with `audit_log` tracking |
| Naming | `snake_case`, singular table names |
| Enums | PostgreSQL native `CREATE TYPE` enums |
| Snapshots | Price/name snapshotted on `invoice_item` and `booking_service` |
| GST | All prices GST-inclusive; back-calculate: base = price ÷ 1.18 |

### 4.3 Caching Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    THREE-LAYER CACHE HIERARCHY                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  L1: Cloudflare KV (Edge)                                        │
│  ├── Service catalog + categories                                │
│  ├── TTL: 5 minutes                                              │
│  ├── Scope: Global edge (200+ PoPs)                              │
│  └── Invalidation: Write-through on service/offer CRUD           │
│                                                                   │
│  L2: Upstash Redis (Regional)                                    │
│  ├── Slot availability per date per branch                       │
│  ├── Rate limit counters (sliding window)                        │
│  ├── TTL: 5 minutes (availability), sliding (rate limits)        │
│  └── Invalidation: DELETE key on booking confirm/cancel          │
│                                                                   │
│  L3: Neon PostgreSQL (Source of Truth)                            │
│  ├── All business data                                           │
│  ├── No TTL — persistent                                        │
│  └── Authoritative for all cache misses                          │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Cache Key Patterns:**

| Cache | Key Format | TTL | Invalidation Trigger |
|-------|-----------|-----|---------------------|
| Service catalog | `services:all` | 5 min | Admin creates/edits/deletes service |
| Single service | `services:{slug}` | 5 min | Admin edits service |
| Slot availability | `availability:{branch_code}:{YYYY-MM-DD}` | 5 min | Booking confirmed/cancelled |
| Rate limit | `ratelimit:{endpoint}:{identifier}` | Sliding window | Auto-expires |

### 4.4 File Storage

**Platform:** Cloudflare R2 (S3-compatible, zero egress fees)

| Use Case | Bucket Path | Access Pattern | Size Estimate |
|----------|------------|----------------|---------------|
| Service images | `media/services/` | Public CDN URL | ~500 MB |
| Gallery photos | `media/gallery/` | Public CDN URL | ~1 GB |
| Staff avatars | `media/team/` | Public CDN URL | ~50 MB |
| Invoice PDFs | `invoices/{YYYY}/{MM}/` | Signed URL (private) | ~100 MB/year |
| Weekly DB backups | `backups/weekly/` | Signed URL (private) | ~200 MB (8 weeks) |
| CMS uploads | `cms/` | Public CDN URL | ~500 MB |

**Access Control:**
- Public bucket: `media/*`, `cms/*` — served via Cloudflare CDN with cache headers
- Private bucket: `invoices/*`, `backups/*` — signed URLs generated server-side, 1-hour expiry

---


## 5. Authentication & Authorization

### 5.1 Auth Architecture

**Library:** Better Auth (self-hosted, TypeScript-native)

| Component | Implementation |
|-----------|---------------|
| Provider | Google OAuth 2.0 only (no email/password) |
| Session storage | PostgreSQL `session` table (HttpOnly, Secure, SameSite=Lax cookies) |
| CSRF protection | Built-in via Better Auth |
| Token type | Session-based (not JWT) — revocable, server-validated |
| Dashboard | Better Auth Cloud free tier (audit logs, user analytics) |
| Admin UI | Custom `/admin/users` page for branded management |

**Why Google OAuth only:**
- Eliminates password-related vulnerabilities (credential stuffing, weak passwords, reset flows)
- All salon customers in India have Google accounts
- Reduces auth surface area for a solo developer
- Google consent screen shows "Royal Glow Salon & Spa" with custom branding

### 5.2 RBAC Model

**6-tier role hierarchy (strict, enforced at middleware level):**

```
┌──────────────────────────────────────────────────────────────┐
│  ROLE HIERARCHY (ascending privilege)                          │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  Customer     → Public pages, own bookings/profile/gems        │
│      ↓                                                        │
│  Staff        → Own schedule, assigned booking notes, leave    │
│      ↓          requests. NO /admin/* access.                  │
│  Receptionist → Lowest admin role. Bookings, check-in,         │
│      ↓          billing, memberships, leave approvals.         │
│  Manager      → Full operational access: staff, services,      │
│      ↓          reports, scheduling, settings.                 │
│  Owner        → Full business access including /admin/users    │
│      ↓                                                        │
│  Developer    → Everything + /admin/integrations, /admin/logs  │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

**Role Assignment Rules:**

| Assigning Role | Can Assign |
|---------------|------------|
| Developer | `owner` and all below |
| Owner | `manager`, `receptionist`, `staff` |
| Manager | `receptionist`, `staff` |
| Receptionist | — (cannot assign roles) |

### 5.3 OAuth Flow

```
┌──────────┐    ┌──────────────┐    ┌────────────────────┐    ┌──────────────┐
│  User    │    │  Google      │    │  Better Auth       │    │  Neon DB     │
│  Browser │    │  OAuth 2.0   │    │  (API Route)       │    │  (Sessions)  │
└────┬─────┘    └──────┬───────┘    └──────────┬─────────┘    └──────┬───────┘
     │                  │                       │                      │
     │ 1. Click "Sign in with Google"           │                      │
     │──────────────────────────────────────────▶                      │
     │                  │                       │                      │
     │ 2. Redirect to Google consent            │                      │
     │◀─────────────────────────────────────────│                      │
     │                  │                       │                      │
     │ 3. User grants consent                   │                      │
     │─────────────────▶│                       │                      │
     │                  │                       │                      │
     │                  │ 4. Callback with code  │                      │
     │                  │──────────────────────▶│                      │
     │                  │                       │                      │
     │                  │                       │ 5. Exchange code      │
     │                  │                       │    for tokens         │
     │                  │◀──────────────────────│                      │
     │                  │                       │                      │
     │                  │                       │ 6. Create/find user   │
     │                  │                       │────────────────────── ▶
     │                  │                       │                      │
     │                  │                       │ 7. Create session     │
     │                  │                       │──────────────────────▶│
     │                  │                       │                      │
     │ 8. Set HttpOnly cookie + redirect        │                      │
     │◀─────────────────────────────────────────│                      │
     │                  │                       │                      │
     │ 9. Check: has customer_profile?          │                      │
     │    YES → / (homepage)                    │                      │
     │    NO  → /onboarding (first-time setup)  │                      │
     │                  │                       │                      │
```

**First-Time Onboarding (`/onboarding`):**
- Pre-filled: name (from Google), email (read-only from Google)
- Collected: phone, date of birth, gender
- Consent: Privacy Policy (required), analytics (optional), marketing (optional)
- Attribution: `acquisition_source` persisted from `sessionStorage` (GMB/walkin/organic/meta_ad)

### 5.4 Google OAuth Scopes

| Scope | When Requested | Purpose |
|-------|---------------|---------|
| `email` | Sign-in | User identification |
| `profile` | Sign-in | Name, avatar pre-fill |
| `user.phonenumbers.read` | Sign-in | Phone pre-fill (People API) |
| `calendar.events` | After first booking confirmed | "Add to Google Calendar?" prompt (incremental consent) |

---


## 6. API Design

### 6.1 Architecture Pattern

**Thin API Layer Pattern:**

```
Request → Parse → Zod Validate → Business Logic (packages/business) → Response
```

API routes (`apps/web/app/api/`) are thin orchestrators. They:
1. Extract request body/params/query
2. Validate with Zod schema (`.safeParse()`)
3. Call business logic functions from `packages/business/`
4. Return standardised JSON response

**No database queries in API routes.** All data access goes through `packages/db/queries/`.

**Standard Response Shape:**

```typescript
// Success
{
  success: true,
  data: T
}

// Error
{
  success: false,
  error: {
    code: "BOOKING_SLOT_UNAVAILABLE",  // machine-readable
    message: "The selected time slot is no longer available.",  // human-readable
    statusCode: 409,
    requestId: "req_abc123xyz"  // for support/debugging
  }
}
```

### 6.2 API Groups

| Group | Count | Auth | Purpose |
|-------|-------|------|---------|
| **Auth** | 1 | Public | Better Auth catch-all (`/api/auth/[...betterauth]`) |
| **Customer** | 13 | Authenticated | Services, availability, bookings, leads, onboarding, push, ably token |
| **Admin** | 7 | Role-gated | Booking management, memberships, leave, staff ops |
| **Background Jobs** | 12 | QStash signature | Scheduled/triggered work (appointment reminders, reports, alerts) |
| **Webhooks** | 2 | Signature-verified | Meta Lead Gen Forms, AiSensy status changes |
| **Total** | **35** | | |

**Endpoint Inventory:**

```
/api/auth/[...betterauth]              ← Better Auth (login, callback, session, sign-out)

/api/services                           ← GET: all categories + services (KV cached)
/api/services/[slug]                    ← GET: single service detail
/api/availability                       ← GET: slots for date + staff (Redis cached)
/api/bookings                           ← GET: customer bookings | POST: create booking
/api/bookings/[id]                      ← GET: booking detail
/api/bookings/[id]/cancel               ← POST: cancel booking
/api/bookings/[id]/reschedule           ← POST: reschedule booking
/api/leads                              ← POST: campaign lead capture (/book form)
/api/onboarding/complete                ← POST: save onboarding data
/api/push/subscribe                     ← POST: register push subscription
/api/push/unsubscribe                   ← DELETE: remove push subscription
/api/ably/token                         ← POST: scoped Ably JWT (Token Auth)

/api/admin/bookings/[id]                ← PATCH: approve, reject, assign staff
/api/admin/bookings/[id]/complete       ← POST: mark completed + invoice + gems + CAPI
/api/admin/memberships                  ← POST: create membership + invoice
/api/admin/leave                        ← POST: submit leave | PATCH: approve/reject

/api/jobs/appointment-reminders         ← POST (QStash): 24h/1h push + email
/api/jobs/membership-expiry             ← POST (QStash): 30d/7d/1d alerts
/api/jobs/birthday-emails               ← POST (QStash): birthday offer
/api/jobs/membership-usage-nudges       ← POST (QStash): randomised usage email
/api/jobs/lead-followups                ← POST (QStash): stale lead alerts
/api/jobs/daily-sales-report            ← POST (QStash): Slack + email report
/api/jobs/weekly-report                 ← POST (QStash): weekly summary
/api/jobs/gems-expiry-reminder          ← POST (QStash): 7-day gems expiry push
/api/jobs/post-service-followup         ← POST (QStash triggered): review request
/api/jobs/stale-booking-alert           ← POST (QStash triggered): 2h pending alert
/api/jobs/noshow-check                  ← POST (QStash triggered): 15min no-show
/api/jobs/membership-expired-notice     ← POST (QStash triggered): expired final notice

/api/webhooks/meta-leads                ← POST: Meta Lead Gen Form webhook
/api/webhooks/aisensy                   ← POST: AiSensy status change
```

### 6.3 Rate Limiting Strategy

**Implementation:** `@upstash/ratelimit` via Upstash Redis (sliding window algorithm)

| Tier | Limit | Endpoints | Rationale |
|------|-------|-----------|-----------|
| **Lead** | 3 requests/min | `/api/leads` | Prevent spam lead submissions |
| **Booking** | 5 requests/min | `/api/bookings` (POST), `/api/bookings/[id]/cancel` | Prevent booking abuse |
| **Standard** | 10 requests/min | All authenticated customer API routes | General protection |
| **Relaxed** | 30 requests/10s | `/api/services`, `/api/availability` | High-frequency browse endpoints |
| **Webhook** | 50 requests/sec | `/api/webhooks/*` | Meta/AiSensy burst traffic |
| **Auth** | 10 requests/min | `/api/auth/*` | Prevent OAuth abuse |

**Rate Limit Response:**

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again in 45 seconds.",
    "statusCode": 429,
    "retryAfter": 45
  }
}
```

---


## 7. Realtime Architecture

### 7.1 Ably Channel Design

**Core Principles:**
- All publishes are **server-side only** (via `ABLY_PRIVATE_KEY` in API routes)
- Clients use **Token Auth** — scoped JWT per user/role, subscribe-only (no publish capability)
- WebSocket connections stay open for the session — no polling, no refresh buttons
- ~50ms delivery latency from publish to UI update

**Channel Reference:**

| Channel Pattern | Audience | Subscribe Trigger |
|----------------|---------|-------------------|
| `customer:{userId}:bookings` | Individual customer | Mount `/bookings` page |
| `booking:{bookingId}` | Customer + Admin + Assigned Staff | Mount booking detail view |
| `admin:bookings` | Developer, Owner, Manager, Receptionist | Mount `/admin` or `/admin/bookings` |
| `admin:schedule:{YYYY-MM-DD}` | Admin roles with schedule access | View specific date in schedule |
| `admin:leave` | Admin roles with leave-review access | Mount `/admin/leave` |
| `staff:{staffId}:schedule` | Individual staff member | Mount staff dashboard |

**Token Capability Scoping:**

```
Customer token:
  subscribe: ["customer:usr_abc:bookings", "booking:bkg_xyz", "booking:bkg_abc"]
  publish:   []  ← NEVER

Admin token (Developer/Owner/Manager/Receptionist):
  subscribe: ["admin:bookings", "admin:schedule:*", "admin:leave", "booking:*"]
  publish:   []  ← NEVER

Staff token:
  subscribe: ["staff:stf_def:schedule", "booking:bkg_xyz"]
  publish:   []  ← NEVER
```

### 7.2 Event Flow

**Example: Receptionist approves a booking**

```
┌────────────────┐    ┌─────────────────┐    ┌──────────┐    ┌──────────────────┐
│ Admin Browser  │    │ Next.js API      │    │ Neon DB  │    │ Ably             │
│ (/admin)       │    │ Route            │    │          │    │                  │
└───────┬────────┘    └────────┬─────────┘    └────┬─────┘    └────────┬─────────┘
        │                      │                    │                   │
        │ POST /api/admin/     │                    │                   │
        │ bookings/:id/approve │                    │                   │
        │─────────────────────▶│                    │                   │
        │                      │                    │                   │
        │                      │ UPDATE booking     │                   │
        │                      │ SET status =       │                   │
        │                      │ 'confirmed'        │                   │
        │                      │───────────────────▶│                   │
        │                      │                    │                   │
        │                      │ Publish to channels │                  │
        │                      │────────────────────────────────────── ▶│
        │                      │                    │                   │
        │                      │  customer:{userId}:bookings            │
        │                      │  booking:{bookingId}                   │
        │                      │  admin:bookings                        │
        │                      │  staff:{staffId}:schedule              │
        │                      │  admin:schedule:{date}                 │
        │                      │                    │                   │
        │                      │◀───── 200 OK ─────│                   │
        │◀─────────────────────│                    │                   │
        │                      │                    │                   │
```

**Simultaneously on the customer's browser:**

```
Ably subscription (customer:{userId}:bookings)
    ↓ receives: { event: "booking.status_changed", data: { toStatus: "confirmed" } }
    ↓
React state update (useEffect callback)
    ↓
UI re-renders: Status badge animates "Pending" → "Confirmed" (motion.dev)
    ↓
No page reload. No user action. ~50ms from admin click to customer UI change.
```

---

## 8. Background Processing

### 8.1 Dual-Engine Design

| Engine | Location | Use For | Free Tier |
|--------|----------|---------|-----------|
| **pg_cron** | Inside Neon DB (PostgreSQL extension) | Pure SQL operations — aggregations, status updates, cleanup | Unlimited |
| **QStash** | Upstash HTTP queue | Anything requiring external HTTP calls — email, push, Slack, webhooks | 500 messages/day |

**Split Rule:**
- Job only touches the database → **pg_cron** (runs closest to data, zero latency)
- Job needs external services (Resend, web-push, Slack, Ably) → **QStash** (HTTP-triggered)

### 8.2 Job Categories

**Nightly Maintenance (pg_cron — 7 jobs):**

| # | Job | Schedule (UTC) | IST Equivalent |
|---|-----|---------------|----------------|
| 1 | Nightly sales summary | `0 18 * * *` | 11:30 PM |
| 2 | Membership auto-expire | `30 18 * * *` | 12:00 AM |
| 3 | Offer auto-expire | `35 18 * * *` | 12:05 AM |
| 4 | Session cleanup | `0 21 * * 0` | 2:30 AM Sunday |
| 5 | Preprod DB sync (GitHub Actions) | `30 19 * * *` | 1:00 AM |
| 6 | Monthly GST summary | `30 19 1 * *` | 1:00 AM (1st) |
| 7 | Gems auto-expire | `40 18 * * *` | 12:10 AM |

**Customer Notifications (QStash scheduled — 5 jobs):**

| # | Job | Schedule | External Calls |
|---|-----|---------|---------------|
| 8 | Appointment reminders | Every 15 min | web-push + Resend |
| 9 | Membership expiry alerts | Daily 12:30 AM IST | web-push + Resend |
| 10 | Birthday emails | Daily 9:30 AM IST | Brevo + web-push |
| 11 | Membership usage nudges | Daily 11:00 AM IST | web-push + Resend |
| 15 | Gems expiry reminder | Daily 10:30 AM IST | web-push only |

**Operational (QStash scheduled — 3 jobs):**

| # | Job | Schedule | External Calls |
|---|-----|---------|---------------|
| 12 | Lead follow-up reminders | Daily 10:30 AM IST | web-push |
| 13 | Daily sales report | Daily 10:30 PM IST | Slack + Resend |
| 14 | Weekly summary report | Monday 9:00 AM IST | Slack + Resend |

**Event-Driven Delayed (QStash triggered — 4 jobs):**

| # | Job | Trigger | Delay | External Calls |
|---|-----|---------|-------|---------------|
| 16 | Post-service follow-up | booking → completed | +24 hours | Brevo |
| 17 | Stale pending booking alert | booking created as pending | +2 hours | web-push |
| 18 | No-show check | booking end_time reached | +15 minutes | web-push |
| 19 | Membership expired notice | membership expires_at passes | +1 hour | Resend |

### 8.3 Reliability

| Mechanism | Coverage |
|-----------|----------|
| **QStash auto-retry** | 3x exponential backoff on non-2xx responses |
| **BetterStack heartbeats** | Every job pings a heartbeat URL on success — alert on missed ping |
| **Idempotency** | All jobs check for prior execution (e.g., `notification` log row exists) before re-running |
| **Monitoring** | Failed jobs trigger BetterStack alert → Slack #alerts-critical |

**Idempotency Pattern (example — appointment reminders):**

```sql
-- Before sending: check if we already sent this reminder
SELECT 1 FROM notification
WHERE booking_id = :bookingId
  AND type = 'reminder_24h';

-- If exists → skip (already sent)
-- If not exists → send push + email, then INSERT notification row
```

---


## 9. Deployment & CI/CD

### 9.1 Branch Strategy

```
feature/* ──▶ dev ──▶ test ──▶ pprd ──▶ prod
                                         │
                                    [Manual Approval]
```

| Branch | Environment | Auto-deploy | DB Branch |
|--------|-------------|-------------|-----------|
| `feature/*` | Local dev | — | `dev` |
| `dev` | Development | On merge | `dev` |
| `test` | QA / CI | On merge | `test` |
| `pprd` | Pre-production | On merge | `preprod` |
| `prod` | Production | After manual approval | `main` |

### 9.2 Pipeline Stages

| PR Target | Checks Run | Purpose |
|-----------|-----------|---------|
| → `dev` | Lint (Biome) + Unit Tests (Vitest) + Type Check (tsc) + Build + Dependency Audit (Trivy + Socket.dev) | Fast feedback on code quality |
| → `test` | All above + Integration Tests + Playwright E2E (Chromium) + Lighthouse CI (score gates) | Functional correctness verification |
| → `pprd` | All above + k6 Load Test (50 concurrent) + OWASP ZAP Security Scan + Smoke Tests | Performance and security gates |
| → `prod` | All above + Manual Approval → Deploy to Cloudflare Pages → DB Migrations → Health Check → Post-deploy Smoke Tests + Backup Verify | Production release with safety net |

**Pipeline Visualization:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                               │
│  PR → dev:    [Lint] [Types] [Unit Tests] [Build] [Dep Audit]               │
│                  │                                                            │
│  PR → test:     └──▶ [Integration Tests] [Playwright E2E] [Lighthouse CI]   │
│                              │                                                │
│  PR → pprd:                  └──▶ [k6 Load Test] [OWASP ZAP] [Smoke]        │
│                                          │                                    │
│  PR → prod:                              └──▶ [Manual Approval]              │
│                                                      │                        │
│                                          ┌───────────▼───────────┐           │
│                                          │ Deploy to Cloudflare  │           │
│                                          │ Run DB Migrations     │           │
│                                          │ Upload Source Maps     │           │
│                                          └───────────┬───────────┘           │
│                                                      │                        │
│                                          ┌───────────▼───────────┐           │
│                                          │ Health Check (3x retry)│           │
│                                          │ Smoke Test Critical    │           │
│                                          │ Verify Backup Exists   │           │
│                                          │ Notify Success/Failure │           │
│                                          └───────────────────────┘           │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Feature Flag Strategy

**Principle: Deploy ≠ Release**

- **Deploy** = code is live on Cloudflare edge (happens on every merge to prod)
- **Release** = feature is visible to users (controlled by PostHog flags)

**Rollout Stages:**

```
1. Deploy with flag OFF → code in prod, invisible
2. Flag ON: role = 'developer' → self-test in production
3. Flag ON: role = 'owner' | 'manager' → stakeholder preview
4. Flag ON: 10% of customers → monitor Sentry for errors
5. Flag ON: 100% → full release
6. Remove flag + dead code after 2 weeks stable
```

**PostHog Integration:**

```typescript
// Server-side flag evaluation (Server Components)
const showNewFeature = await posthog.isFeatureEnabled('new-booking-flow', session.user.id)

// Conditional rendering
{showNewFeature ? <NewBookingFlow /> : <LegacyBookingFlow />}
```

### 9.4 Rollback Plan

| Tier | Scenario | Action | Time to Recover |
|------|----------|--------|-----------------|
| **Tier 1** | UI bug after deploy | Feature flag OFF | **< 10 seconds** |
| **Tier 2** | App crash / 500 errors | Cloudflare rollback to previous deploy | **< 30 seconds** |
| **Tier 3** | Bad migration (data corrupted) | Neon PITR — branch from pre-migration point | **< 5 minutes** |
| **Tier 4** | Full disaster (Neon outage) | Restore from R2 weekly backup to emergency DB | **< 30 minutes** |

**Auto-Rollback:** If the post-deploy health check fails 3 times, the pipeline automatically promotes the previous Cloudflare deployment — no human intervention needed.

---


## 10. Observability & Monitoring

### 10.1 Five-Layer Observability Stack (All ₹0/month)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY LAYERS — ZERO COST                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Layer 1: SENTRY — Error Monitoring                                          │
│  ├── What broke and why? Stack traces, error context                         │
│  ├── Coverage: Cloudflare Workers + Render + Client-side React               │
│  ├── Source maps: errors point to original TypeScript                        │
│  └── Free: 5,000 errors/month                                               │
│                                                                               │
│  Layer 2: BETTERSTACK — Uptime + Status + Logs + Job Monitoring             │
│  ├── 10 HTTP monitors (all critical endpoints)                               │
│  ├── Public status page: status.theroyalglow.in                              │
│  ├── Heartbeat monitors: pg_cron, QStash, GitHub Actions jobs                │
│  ├── Log aggregation: 1 GB/month (Cloudflare Workers + Render)               │
│  └── Free: all of the above                                                  │
│                                                                               │
│  Layer 3: POSTHOG — Product Analytics + Feature Flags                        │
│  ├── Funnels: booking flow drop-off, lead conversion                         │
│  ├── Cohorts: Meta campaign vs organic vs GMB vs walk-in                     │
│  ├── Session replay: watch user journeys before drop-off                     │
│  ├── Feature flags: progressive rollout control                              │
│  └── Free: 1M events/month                                                   │
│                                                                               │
│  Layer 4: MICROSOFT CLARITY — Heatmaps + Session Recordings                 │
│  ├── Click heatmaps: where users interact on every page                      │
│  ├── Scroll depth: how far users read services/offers                        │
│  ├── Rage click detection: frustration signals                               │
│  └── Free: unlimited (no caps)                                               │
│                                                                               │
│  Layer 5: CHECKLY — Synthetic Monitoring                                     │
│  ├── Real Playwright scripts running against production                      │
│  ├── 5 checks: homepage, booking dialog, sign-in, admin, API health         │
│  ├── Validates "does it actually work?" vs just "is it up?"                  │
│  └── Free: 5 checks, 10K runs/month                                          │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Alert Escalation

| Level | Trigger Conditions | Response | Channel |
|-------|-------------------|----------|---------|
| **Level 1: Auto** | Health check failure, error rate spike | Auto-rollback, feature flag auto-disable | Automated (no human) |
| **Level 2: Notify** | R2 slow, email delivery lag, non-critical degradation | Developer awareness, can wait | Slack #alerts |
| **Level 3: Urgent** | Site down, DB unreachable, deploy failed | Immediate action needed | SMS + Push + Slack #alerts-critical |
| **Level 4: Escalate** | Level 3 not acknowledged in 15 minutes | Force attention during business hours | Phone call via BetterStack |

### 10.3 Uptime Monitors (10 slots used)

| # | Monitor | Endpoint | Checks |
|---|---------|----------|--------|
| 1 | Homepage | `theroyalglow.in` | Every 3 min |
| 2 | GMB deep-link | `theroyalglow.in/?book=1&utm_source=gmb` | Every 3 min |
| 3 | Walk-in QR deep-link | `theroyalglow.in/?book=1&utm_source=walkin` | Every 3 min |
| 4 | Campaign lead page | `theroyalglow.in/book` | Every 3 min |
| 5 | API health | `theroyalglow.in/api/health` | Every 3 min |
| 6 | Payload CMS | `admin.theroyalglow.in` | Every 3 min |
| 7 | Neon DB probe | Via API health endpoint | Every 3 min |
| 8 | Ably connectivity | Via test endpoint | Every 3 min |
| 9 | Upstash Redis | Via API probe | Every 3 min |
| 10 | Cloudflare R2 | Via test asset | Every 3 min |

---


## 11. Security Design

### 11.1 Defense in Depth

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DEFENSE IN DEPTH LAYERS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  EDGE (Cloudflare)                                                           │
│  ├── DDoS mitigation (automatic, always-on)                                  │
│  ├── WAF rules (managed + custom)                                            │
│  ├── Bot management (challenge suspicious traffic)                           │
│  └── Rate limiting at edge (before reaching Workers)                         │
│                                                                               │
│  TRANSPORT                                                                    │
│  ├── HTTPS only (HTTP → HTTPS redirect)                                      │
│  ├── TLS 1.3 enforced                                                        │
│  ├── HSTS header: max-age=31536000; includeSubDomains; preload               │
│  └── Certificate: Cloudflare Universal SSL (auto-renewed)                    │
│                                                                               │
│  APPLICATION                                                                  │
│  ├── CSP: nonce-based script loading, strict-dynamic                         │
│  ├── CORS: exact origin matching (theroyalglow.in only, no wildcard *)       │
│  ├── Rate limiting: per-endpoint sliding windows (Upstash Redis)             │
│  ├── CSRF: built-in via Better Auth session cookies                          │
│  └── Request ID: generated per request for traceability                      │
│                                                                               │
│  DATA VALIDATION                                                              │
│  ├── Zod schemas on EVERY API route (.safeParse() at boundary)               │
│  ├── No raw client input reaches business logic — ever                       │
│  ├── Type coercion blocked (string "true" ≠ boolean true)                    │
│  └── File upload validation: MIME type + size limits                          │
│                                                                               │
│  DATABASE                                                                     │
│  ├── Drizzle ORM: parameterized queries (no raw SQL concatenation)           │
│  ├── No SQL injection possible through ORM layer                             │
│  ├── Connection via pooler (PgBouncer) — connection limits enforced          │
│  └── Neon network isolation (only allowed IPs/services can connect)          │
│                                                                               │
│  AUTH                                                                         │
│  ├── HttpOnly cookies (not accessible via JavaScript)                        │
│  ├── Secure flag (HTTPS only)                                                │
│  ├── SameSite=Lax (CSRF protection)                                         │
│  ├── Session-based (revocable, server-validated — not stateless JWT)         │
│  └── 30-day session expiry with weekly cleanup                               │
│                                                                               │
│  DEPENDENCIES                                                                 │
│  ├── Trivy: CVE scanning on every PR (HIGH/CRITICAL = PR blocked)            │
│  ├── Socket.dev: supply chain attack detection (typosquatting, install scripts)│
│  ├── Semgrep: SAST rules for common vulnerability patterns                    │
│  └── Automated weekly dependency update checks with issue creation            │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Compliance — India DPDP Act 2023

| Requirement | Implementation |
|-------------|---------------|
| **Lawful purpose & consent** | Privacy Policy at `/privacy` with explicit opt-in for analytics/marketing |
| **Purpose limitation** | Data used only for booking, communication, and analytics (if consented) |
| **Data minimization** | Collect only: name, email, phone, DOB, gender. No Aadhaar, no address |
| **Storage limitation** | Session cleanup (30 days), gems expiry (365 days), backup retention (56 days) |
| **Right to erasure** | Account deletion flow removes user + all linked records |
| **Data localization** | Neon DB deployed in Singapore (closest available region to India) |
| **Consent management** | 2-tier cookie banner: Necessary (always on) + Analytics/Marketing (opt-in) |
| **No PII in logs** | Sentry/BetterStack scrub email/phone before storage |
| **Breach notification** | BetterStack incident → Slack alert → investigation within 72 hours |

**Cookie Consent Architecture:**

```
┌──────────────────────────────────────────────┐
│  Cookie Banner — 2-Tier System               │
├──────────────────────────────────────────────┤
│                                                │
│  Top Level: [Accept All] [Reject All]         │
│             [Manage Preferences]              │
│                                                │
│  Manage Preferences:                          │
│  ┌────────────────────────────────────┐      │
│  │ ☑ Necessary (always on, greyed out)│      │
│  │   Session cookies, CSRF token      │      │
│  │                                    │      │
│  │ ☐ Analytics                        │      │
│  │   PostHog, Microsoft Clarity       │      │
│  │                                    │      │
│  │ ☐ Marketing                        │      │
│  │   Meta Pixel, Conversions API      │      │
│  └────────────────────────────────────┘      │
│  [Save Preferences]                           │
│                                                │
│  Storage: localStorage key                    │
│  `rgss_cookie_consent: { v, analytics,        │
│                          marketing, ts }`     │
│  Retention: 365 days                          │
└──────────────────────────────────────────────┘
```

---


## 12. Scalability & Performance

### 12.1 Horizontal Scaling

| Component | Scaling Model | Mechanism |
|-----------|--------------|-----------|
| **Cloudflare Workers** | Auto-scale globally | Runs on 200+ edge PoPs; new instances spawn per-request |
| **Cloudflare Pages** | Static CDN | Cached at every edge node; infinite horizontal scale for static assets |
| **Neon DB** | Serverless auto-scale | Compute scales up on demand, scales to zero on idle (dev/test branches) |
| **Upstash Redis** | Serverless | Per-request pricing, no provisioned capacity |
| **Ably** | Managed | Handles 200 concurrent connections on free tier; auto-scales on paid |
| **Render** | Single instance | Sufficient for CMS + SSR fallback (< 10 requests/day to heavy SSR) |

**Stateless Design:** No server-side session storage in memory. All sessions are DB-backed (PostgreSQL). Any Worker instance can serve any request — no sticky sessions needed.

### 12.2 Performance Optimizations

| Optimization | Layer | Impact |
|-------------|-------|--------|
| **Edge SSR** | Cloudflare Workers | Sub-100ms server response for all dynamic pages |
| **KV edge cache** | Cloudflare KV | Service catalog served from nearest PoP (< 5ms) |
| **Redis slot cache** | Upstash | Availability queries served from cache (< 5ms vs ~100ms DB) |
| **ISR** | Next.js | Blog content revalidated every 1 hour (zero server cost between) |
| **SSG** | Next.js | Legal pages, FAQ, contact — built at deploy time, served as static HTML |
| **Image optimization** | Next.js Image + Cloudflare Polish | Auto WebP/AVIF, responsive srcset, lazy loading, blur placeholders |
| **PWA** | Service Worker + manifest | Core assets cached for offline access (service menu, prices, contact) |
| **Font optimization** | `next/font` | Self-hosted fonts, no CLS from FOUT, preloaded |
| **Bundle splitting** | Next.js App Router | Per-route code splitting, parallel route loading |
| **Streaming SSR** | React Suspense | Progressive HTML delivery — header renders before data resolves |
| **Prefetching** | `<Link>` hover prefetch | Next page assets loaded on hover (perceived 0ms navigation) |

### 12.3 Capacity Planning

**Current Free Tier Limits vs Expected Usage:**

| Service | Free Tier Limit | Expected Usage at Launch | Headroom |
|---------|----------------|------------------------|----------|
| Neon DB | 0.5 GB storage, 3 GB transfer | ~50 MB, ~500 MB/mo | 10x+ |
| Upstash Redis | 10K requests/day | ~500/day | 20x |
| Upstash QStash | 500 messages/day | ~50/day | 10x |
| Cloudflare Workers | 100K requests/day | ~5K/day | 20x |
| Cloudflare R2 | 10 GB, 10M ops/mo | ~2 GB, ~100K ops | 5x–100x |
| Cloudflare KV | 100K reads/day | ~10K reads/day | 10x |
| Ably | 6M messages/month | ~50K/month | 120x |
| Sentry | 5K errors/month | ~50/month | 100x |
| PostHog | 1M events/month | ~50K/month | 20x |

**First Paid Upgrade:** Neon Launch plan at $19/month — triggered only when exceeding 0.5 GB storage. At salon scale, this takes 6-12 months minimum.

**Growth Path:**

| Users | Infrastructure Change | Monthly Cost |
|-------|----------------------|-------------|
| 0–1,000 | All free tiers | ₹0 |
| 1,000–10,000 | Neon Launch ($19), possibly Ably paid | ~$19–39 |
| 10,000–50,000 | + Cloudflare Pro ($20), Render Starter ($7) | ~$46–66 |

---


## 13. Disaster Recovery & Business Continuity

### 13.1 Backup Strategy

| Backup Type | Frequency | Retention | Storage | Automation |
|-------------|-----------|-----------|---------|-----------|
| **Neon PITR** (automatic) | Continuous (WAL archiving) | 7 days | Neon infrastructure | Fully automatic |
| **Weekly pg_dump** | Every Sunday 7:30 AM IST | 8 weeks (56 days) | Cloudflare R2 (`backups/weekly/`) | GitHub Actions cron |
| **Monthly restore test** | 1st of every month | — | Temporary Neon `test` branch | GitHub Actions cron |

**Backup Verification:** Monthly automated restore test downloads the latest R2 backup, restores it to the `test` branch, and runs integrity checks (row counts on critical tables). Prevents silent backup corruption.

### 13.2 RTO/RPO Targets

| Scenario | RPO | RTO | Recovery Method |
|----------|-----|-----|-----------------|
| App code issue | 0 (no data loss) | < 30 seconds | Cloudflare deployment rollback |
| Bad DB migration | ~0 seconds | < 5 minutes | Neon PITR branch from pre-migration timestamp |
| Neon infrastructure outage | ≤ 7 days (weekly backup) | < 30 minutes | Restore pg_dump from R2 to emergency Neon project |
| Cloudflare global outage | N/A (static content) | Depends on Cloudflare | Wait for resolution (extremely rare) |
| R2 bucket loss | ≤ 1 week (backup cadence) | < 1 hour | Restore from local or regenerate (images from CMS, invoices regenerated) |

### 13.3 Disaster Recovery Procedure

**Tier 1 — Code Rollback (< 30 seconds):**
```bash
# List recent deployments
wrangler pages deployments list --project-name=rgss-web

# Promote previous deployment
wrangler pages deployments rollback --project-name=rgss-web --deployment-id=<previous_id>
```

**Tier 2 — Database Point-in-Time Recovery (< 5 minutes):**
```bash
# Create branch from specific timestamp (before corruption)
curl -X POST "https://console.neon.tech/api/v2/projects/$PROJECT_ID/branches" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"branch": {"name": "recovery-YYYY-MM-DD", "parent_id": "main", "parent_timestamp": "2026-05-23T10:00:00Z"}}'

# Update app DATABASE_URL to point to recovery branch
# Fix migration, apply to recovery branch, then swap back
```

**Tier 3 — Full DR from R2 Backup (< 30 minutes):**
```
1. Download latest weekly backup from R2
2. Provision emergency Neon project (or branch in alternate region)
3. Restore pg_dump to emergency DB
4. Update DATABASE_URL in Cloudflare Pages environment variables
5. Trigger redeploy — app now points to emergency DB
6. Once primary recovered: sync data, switch back, decommission emergency
```

---

## 14. Trade-offs & Design Decisions

| # | Decision | Trade-off Accepted | Mitigation Strategy |
|---|----------|-------------------|---------------------|
| 1 | **Monolith over microservices** | Less fault isolation between domains | Strict layer separation in monorepo; domain boundaries enforced by package imports |
| 2 | **Free tiers only at launch** | Limited resources, potential cold starts | Free tiers are 10-100x above expected usage; Render cold start acceptable for CMS (internal use only) |
| 3 | **Google OAuth only (no email/password)** | Users without Google accounts cannot register | 99%+ of Indian smartphone users have Google; eliminates password-related attack surface entirely |
| 4 | **Edge-first (Cloudflare Workers)** | 50ms CPU wall time limit per request | Render fallback for heavy SSR; business logic kept lightweight; DB queries are fast (Neon serverless) |
| 5 | **Better Auth over Clerk** | Less polished admin dashboard, newer library | Custom `/admin/users` page; actively maintained; full control over session data |
| 6 | **Session-based auth (not JWT)** | Requires DB lookup per request | Sessions are cacheable; DB lookup is < 5ms on Neon; sessions are revocable (critical for banning users) |
| 7 | **Ably over SSE** | External dependency for realtime | SSE incompatible with CF Workers' CPU limits for long-lived connections; Ably free tier is 120x above usage |
| 8 | **pg_cron over external scheduler** | Jobs tied to Neon availability | Neon's 99.95% SLA; BetterStack heartbeat alerts on missed runs; jobs are idempotent |
| 9 | **Drizzle over Prisma** | Smaller community, fewer tutorials | Prisma binary cannot run on CF Workers (V8 isolate); Drizzle is pure TS, growing fast |
| 10 | **No Redis on day one (availability cache)** | Slightly higher DB load initially | Neon handles 50 DAU easily; add Redis cache in week 2-4 when traffic grows (~30 min implementation) |
| 11 | **nanoid PKs over auto-increment** | Slightly larger index size | Prevents enumeration attacks; no sequential IDs exposed in URLs |
| 12 | **Paise over decimal for money** | Requires conversion for display | `formatINR()` utility handles it; eliminates floating-point precision bugs permanently |
| 13 | **Hard deletes over soft deletes** | Cannot "undelete" | `audit_log` table captures all deletions; simpler queries (no `WHERE deleted_at IS NULL` everywhere) |
| 14 | **Single Next.js app (customer + admin)** | Admin routes in same bundle | Code splitting ensures admin-only code isn't sent to customers; RBAC middleware rejects unauthorized access |
| 15 | **Bun over Node.js** | Less mature runtime | Drop-in compatible; 3x faster installs; can switch back to Node.js if needed with zero code changes |

---


## 15. Future Roadmap

### Phase 2 (Post-Launch, Month 2-4)

| Feature | Technical Approach | Dependency |
|---------|-------------------|-----------|
| **Online payments** | Razorpay or Cashfree integration; payment link in booking confirmation; webhook for payment status | Razorpay Test Mode → Live activation |
| **Google Calendar integration** | Incremental OAuth consent for `calendar.events`; auto-create/update/delete events on booking lifecycle | Already designed in auth flow |
| **Multi-branch booking** | Branch selector in booking dialog Step 1; all queries scoped by `branch_id` | `branch` table already in schema |
| **Staff performance dashboard** | Utilisation %, revenue per staff, customer satisfaction | Requires 2+ months of booking data |

### Phase 3 (Month 4-8)

| Feature | Technical Approach | Dependency |
|---------|-------------------|-----------|
| **Mobile app** | PWA enhancement (push, offline, install prompt) OR React Native (shared business logic from `packages/business/`) | Evaluate PWA adoption first |
| **AI scheduling optimization** | ML model for staff allocation based on historical booking patterns, no-show prediction | Requires 6+ months of data |
| **Automated marketing** | Brevo workflow triggers based on customer behavior segments | Brevo API integration |
| **Inventory management** | Product tracking for salon supplies (shampoo, oils, tools) | New DB domain (~4 tables) |
| **Customer loyalty tiers** | Bronze/Silver/Gold customer tiers based on annual spend | Requires LTV aggregation |

### Phase 4 (Month 8+)

| Feature | Technical Approach |
|---------|-------------------|
| **Multi-language support** | next-intl for Kannada/Hindi UI; content stays English |
| **Video consultations** | Ably Video (WebRTC) for pre-service consultations |
| **Franchise model** | Multi-tenant architecture with branch isolation |

---

## Appendix A: Domain Glossary

| Term | Definition |
|------|-----------|
| **Booking** | A customer's request for one or more services at a specific date/time |
| **Walk-in** | An in-person booking created by the receptionist (no prior online request) |
| **Lead** | A potential customer captured via Meta ads, Google, or organic — before they become a registered user |
| **Gems** | Loyalty points: 1 gem earned per ₹100 invoiced; 365-day expiry |
| **SPA Membership** | Prepaid hour-based membership (Silver/Gold/Platinum) for SPA services |
| **Paise** | 1/100th of ₹1. All money stored as integer paise to avoid floating-point errors |
| **SAC 999721** | GST Service Accounting Code for salon and beauty services |
| **PITR** | Point-in-Time Recovery — Neon's continuous backup allowing restore to any second |
| **KV** | Cloudflare Key-Value store — edge-distributed cache |
| **QStash** | Upstash's HTTP message queue for delayed/scheduled job delivery |
| **IST** | Indian Standard Time (UTC+5:30) — all user-facing times displayed in IST |
| **DPDP Act** | Digital Personal Data Protection Act 2023 (India's privacy law) |

---

## Appendix B: Infrastructure Cost Summary

| Service | Free Tier | Paid Threshold | First Paid Plan |
|---------|-----------|---------------|-----------------|
| Cloudflare Pages + Workers | 100K req/day | High traffic | Pro $20/mo |
| Neon DB | 0.5 GB, 3 GB transfer | Storage > 0.5 GB | Launch $19/mo |
| Upstash Redis | 10K req/day | Higher throughput | Pro $10/mo |
| Upstash QStash | 500 msg/day | More jobs | Pro (included with Redis) |
| Cloudflare R2 | 10 GB, 10M ops | Storage > 10 GB | Pay-as-you-go |
| Cloudflare KV | 100K reads/day | Higher reads | Pay-as-you-go |
| Ably | 6M msg/mo, 200 connections | Capacity exceeded | $29/mo |
| Render | Free (spins down) | Always-on needed | Starter $7/mo |
| Sentry | 5K errors/mo | Error volume | Team $26/mo |
| BetterStack | 10 monitors, 1 GB logs | More monitors/checks | Starter $24/mo |
| PostHog | 1M events/mo | Event volume | Scale (usage-based) |
| Clarity | Unlimited | — | Always free |
| Checkly | 5 checks, 10K runs | More checks | Developer $7/mo |
| **TOTAL AT LAUNCH** | — | — | **₹0/month** |

---

## Appendix C: DNS & Routing Map

```
theroyalglow.in (root domain — Cloudflare DNS)
├── /                        Homepage + "Book Now" dialog
├── /services                Service catalogue
├── /offers                  Active offers & combos
├── /about                   Story, team gallery
├── /contact                 Socials, Google Maps, form
├── /profile                 [Auth required] Edit profile
├── /bookings                [Auth required] Upcoming & past
├── /bookings/[id]           [Auth required] Booking detail
├── /membership              [Auth required] SPA membership
├── /gems                    [Auth required] Loyalty balance
├── /blog                    Blog list (ISR from Payload)
├── /blog/[slug]             Blog post (ISR, 1h revalidation)
├── /faq                     FAQ (SSG, FAQPage JSON-LD)
├── /book                    Meta/Instagram lead capture (no nav)
├── /sign-in                 Google OAuth entry
├── /onboarding              [Auth required] First-time setup
├── /privacy                 DPDP Act (SSG)
├── /terms                   Terms of Service (SSG)
├── /refund-policy           Refund & Cancellation (SSG)
├── /admin/*                 [RBAC] Admin portal
└── /api/*                   API routes (35 endpoints)

admin.theroyalglow.in        Payload CMS (Render, Singapore)
docs.theroyalglow.in         Fumadocs documentation portal
status.theroyalglow.in       BetterStack public status page
```

---

## Appendix D: Key Metrics & SLOs

| Service Level Objective | Target | Measurement |
|------------------------|--------|-------------|
| API response time (p95) | < 200ms | Checkly + Sentry performance |
| Homepage TTFB | < 100ms | Lighthouse CI + Checkly |
| Booking flow completion rate | > 60% | PostHog funnel |
| Error rate | < 0.1% of requests | Sentry |
| Uptime | 99.9% (43.8 min downtime/month max) | BetterStack |
| Deploy frequency | Multiple times/week | GitHub Actions |
| Lead time (commit → prod) | < 1 hour (with pipeline) | GitHub Actions timing |
| Mean Time to Recovery (MTTR) | < 5 minutes | Rollback tier selection |
| Lighthouse Performance | ≥ 95 | Lighthouse CI gate |
| Lighthouse Accessibility | 100 | Lighthouse CI gate |

---

> **Document End**  
> This HLD was prepared following MAANG/FAANG system design review standards.  
> For detailed implementation specifications, refer to the individual documentation files  
> linked throughout this document within the `rgss_solutions_kiro/` documentation repository.
