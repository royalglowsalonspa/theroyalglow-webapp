# High-Level Design (HLD) — Royal Glow Salon & Spa

> **Document Classification:** System Design — Staff Engineer Review  
> **Version:** 1.0  
> **Author:** Engineering Lead  
> **Last Updated:** 2026-08-29<br>
> **Status:** Current Production Architecture<br>
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
- Auto-expiry on membership end date (QStash job)
- Renewal prompts at 30/7/1 day milestones

#### FR-3: Loyalty & Gems System
- Earn rate: 1 gem per ₹100 invoiced (floor, awarded at invoice generation)
- Expiry: 365 days from earn date (1-year rolling window)
- Redemption against a service catalogue
- Auto-expiry job (QStash job), reminder push 7 days before (QStash Job 15)

#### FR-4: Admin Portal with RBAC
- 6 hierarchical roles: Customer < Staff < Receptionist < Manager < Owner < Developer
- Role-gated middleware in the standalone admin app for root paths on `admin.theroyalglow.in`
- Role assignment hierarchy enforcement (can only assign below own level)
- Custom `/users` panel for user management

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
- Monthly GST summary aggregation (QStash job)

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
| **Scalability** | Concurrent user support (pprd load test) | 50 users |
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

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ CLIENTS                                                                     │
│ Browser / PWA: customer site + admin portal + Ably subscriptions            │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ DNS + AWS DELIVERY                                                          │
│ Cloudflare authoritative DNS only (no Cloudflare application compute)       │
│             │                                                               │
│             ├── theroyalglow.in ───────▶ CloudFront ─▶ Lambda (apps/web)    │
│             └── admin.theroyalglow.in ─▶ CloudFront ─▶ Lambda (apps/admin)  │
│                                          SST sst.aws.Nextjs / OpenNext       │
│                                          ap-southeast-1                      │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────────────┐
│ Neon PostgreSQL 16  │  │ Upstash             │  │ External app services    │
│ dev/test/pprd/prod  │  │ Redis: rate limits  │  │ Ably, Resend, Brevo,     │
│ source of truth     │  │ QStash: jobs        │  │ PostHog, BetterStack     │
└─────────────────────┘  └─────────────────────┘  └──────────────────────────┘
          │                         │                         │
          └─────────────────────────┼─────────────────────────┘
                                    ▼
          ┌─────────────────────────┴─────────────────────────┐
          │ Unchanged workloads and storage                   │
          │ Render: Payload CMS at cms.theroyalglow.in        │
          │ Cloud Run: apps/invoicing PDF service             │
          │ Cloudflare R2: media, invoice PDFs, DB backups    │
          └───────────────────────────────────────────────────┘
```

### 3.3 Component Breakdown

| Layer | Location | Responsibility | Key Constraint |
|-------|----------|---------------|----------------|
| **Presentation (Web)** | `apps/web/app/` | Customer React Server/Client Components, layouts, pages | Zero business logic |
| **API (Web, Thin)** | `apps/web/app/api/` | Parse request → Zod validate → delegate → JSON response | No DB queries here |
| **Presentation (Admin)** | `apps/admin/app/` | Admin React Server/Client Components, layouts, root-path pages | Zero business logic |
| **API (Admin, Thin)** | `apps/admin/app/api/` | Parse request → Zod validate → delegate → JSON response | No DB queries here |
| **UI Components** | `apps/web/components/`, `apps/admin/components/` | shadcn/ui primitives and app-specific feature components | Pure presentation |
| **Business Logic** | `packages/business/` | Pure functions, domain rules, calculations | No I/O, no framework deps |
| **Data Access** | `packages/db/` | Drizzle ORM schemas, query builders, migrations | Only package that imports Drizzle |
| **CMS** | `apps/cms/` | Payload CMS v3 — blog, gallery, team bios, banners, FAQ, plus the bookable service catalogue | Marketing content + service catalogue authoring (synced to `public.*`) |
| **Infrastructure** | `sst.config.ts`, `render.yaml` | SST v3 AWS web/admin IaC and Render CMS service definition | Platform-specific |



### 3.4 Technology Decisions Matrix

| Category | Choice | Alternatives Considered | Why This Choice |
|----------|--------|------------------------|-----------------|
| **Framework** | Next.js 16 (App Router) | Remix, SvelteKit, Astro | SSR + SSG + API routes in one; React ecosystem; largest community |
| **Toolchain** | Bun | npm, pnpm, Node.js scripts | Fast installs, native TypeScript scripts, and workspace support; SST/OpenNext packages production server output for Lambda |
| **Database** | Neon PostgreSQL 16 | Supabase, PlanetScale, Turso, Xata | Branching, serverless auto-scaling, and Drizzle integration; all scheduled jobs use QStash HTTP routes |
| **ORM** | Drizzle ORM | Prisma, Kysely | Pure TypeScript, no runtime binary, strong schema-first workflow, and portable Lambda/Node packaging |
| **Auth** | Better Auth | Clerk, Auth.js, Supabase Auth | Self-hosted, Google OAuth shows the Royal Glow domain, built-in RBAC plugin, sessions in Neon |
| **Web + Admin Compute** | AWS Lambda + CloudFront via SST `sst.aws.Nextjs` | Render, Vercel | Declarative SST deployment, ARM64 SSR Lambda per app, CloudFront delivery, and generic OpenNext packaging |
| **CMS Hosting** | Render (Singapore) | Railway, Fly.io | Payload CMS stays on its existing Node service near Neon; it is not part of the AWS compute deployment |
| **PDF Rendering** | Google Cloud Run | Lambda, in-process rendering | Existing invoicing service remains isolated from web/admin compute |
| **Realtime** | Ably | Pusher, Socket.io, Supabase Realtime | 6M messages/month free, 200 concurrent connections, Token Auth |
| **CMS** | Payload CMS v3 | Sanity, Strapi, Contentful | Self-hosted Next.js plugin, media to R2, schema in TypeScript, zero vendor lock-in |
| **Email (Transactional)** | Resend | SendGrid, Postmark | Modern DX, React Email templates, generous free tier, fast delivery |
| **Email (Marketing)** | Brevo | Mailchimp, ConvertKit | Built-in unsubscribe management, automation workflows, DPDP-compliant, free tier |
| **Rate Limiting + Queue** | Upstash Redis + QStash | Self-hosted Redis, managed queues | Redis stores distributed API rate-limit state; QStash schedules and triggers background jobs. Five-minute catalogue/availability caches remain planned. |
| **File Storage** | Cloudflare R2 | AWS S3, Supabase Storage | S3-compatible, zero egress fees, and unchanged by the AWS compute deployment |
| **Infrastructure as Code** | SST v3 | Lower-level AWS IaC, manual resources | `sst.config.ts` provisions `sst.aws.Nextjs` for both apps and manages required Cloudflare DNS records |
| **Monorepo** | Turborepo + Bun Workspaces | Nx, standalone repositories | Bun handles packages; Turborepo handles task orchestration and caching |
| **UI Components** | shadcn/ui + Radix | Material UI, Chakra, Mantine | Copy-paste ownership, Radix accessibility, zero runtime overhead, fully customizable |
| **Styling** | Tailwind CSS v4 | CSS Modules, styled-components, Emotion | Utility-first, design tokens, native cascade layers, zero runtime JS |
| **Animation** | motion (motion.dev) | GSAP, react-spring | Free tier, respects `prefers-reduced-motion`, clean API |
| **Validation** | Zod | Yup, io-ts, Valibot | TypeScript-native inference, composable schemas, industry standard for Next.js |
| **Analytics** | PostHog | Google Analytics, Mixpanel | 1M events/mo free, feature flags, funnels, session replay |
| **Error Monitoring** | Sentry | Highlight.io, Datadog | Guarded web/admin browser capture, wrapped API-error capture, and optional Cloud Run invoicing capture. Payload CMS is not wired; production source-map upload is not implemented. |
| **Feature Flags** | PostHog | LaunchDarkly, Unleash | Already in stack for analytics; flags provide an instant release kill switch |

---


## 4. Data Architecture

### 4.1 Database Strategy

**Engine:** Neon PostgreSQL 16 (serverless, auto-scaling compute, connection pooling built-in)

**Branch Strategy (Git-like Database Environments):**

| Neon Branch | Environment | Purpose | Reset Policy |
|-------------|-------------|---------|--------------|
| `prod` | Production | Live customer data, QStash jobs target here | Never reset |
| `pprd` | Pre-production | UAT with anonymised prod data | Auto-reset daily from `prod` + PII stripped |
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
│  CURRENT DATA PATHS                                             │
├─────────────────────────────────────────────────────────────────┤
│  Neon PostgreSQL (source of truth)                              │
│  ├── /api/services reads catalogue rows directly through Drizzle│
│  └── /api/availability reads business-hours settings directly  │
│                                                                   │
│  Upstash Redis                                                  │
│  └── Distributed per-endpoint sliding-window rate-limit state   │
│                                                                   │
│  QStash                                                         │
│  └── Scheduled and triggered background jobs                    │
└─────────────────────────────────────────────────────────────────┘
```

No Redis response cache is implemented for service catalogue or availability. A five-minute Upstash read-through cache remains planned; Neon stays authoritative.

**Planned Cache Key Patterns (not implemented):**

| Cache | Proposed Key Format | Proposed TTL | Required Invalidation |
|-------|---------------------|--------------|-----------------------|
| Service catalogue | `services:{branch_id}` | 5 min | Catalogue sync or service mutation |
| Slot availability | `availability:{branch_code}:{YYYY-MM-DD}` | 5 min | Booking or schedule state change |
| Rate limit (implemented) | `ratelimit:{endpoint}:{identifier}` | Sliding window | Auto-expires |

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
| Admin UI | Custom `/users` page for branded management |

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
│      ↓          requests. No admin portal access.                  │
│  Receptionist → Lowest admin role. Bookings, check-in,         │
│      ↓          billing, memberships, leave approvals.         │
│  Manager      → Full operational access: staff, services,      │
│      ↓          reports, scheduling, settings.                 │
│  Owner        → Full business access including /users    │
│      ↓                                                        │
│  Developer    → Everything + /integrations, /logs              │
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
| **Background Jobs** | 12 | QStash signature | Scheduled/triggered work (appointment reminders, reports, alerts) — hosted in `apps/admin`, served from `admin.theroyalglow.in/api/jobs/*` |
| **Webhooks** | 2 | Signature-verified | Meta Lead Gen Forms, AiSensy status changes |
| **Total** | **35** | | |

**Endpoint Inventory:**

```
/api/auth/[...betterauth]              ← Better Auth (login, callback, session, sign-out)

/api/services                           ← GET: all categories + services (direct Neon via Drizzle; no Redis cache)
/api/services/[slug]                    ← GET: single service detail (direct Neon via Drizzle; no Redis cache)
/api/availability                       ← GET: generic 30-minute grid from Neon-backed business-hours settings; no Redis cache
/api/bookings                           ← GET: customer bookings | POST: create booking
/api/bookings/[id]                      ← GET: booking detail
/api/bookings/[id]/cancel               ← POST: cancel booking
/api/bookings/[id]/reschedule           ← POST: reschedule booking
/api/leads                              ← POST: campaign lead capture (/book form)
/api/onboarding/complete                ← POST: save onboarding data
/api/push/subscribe                     ← POST: register push subscription
/api/push/unsubscribe                   ← DELETE: remove push subscription
/api/ably/token                         ← POST: scoped Ably JWT (Token Auth)

# Admin API — hosted in apps/admin, served from admin.theroyalglow.in/api/* (no /admin prefix)
/api/bookings/[id]                      ← PATCH: approve, reject, assign staff
/api/bookings/[id]/complete             ← POST: mark completed + invoice + gems + CAPI
/api/memberships                        ← POST: create membership + invoice
/api/leave                              ← POST: submit leave | PATCH: approve/reject

# Background jobs — hosted in apps/admin, served from admin.theroyalglow.in/api/jobs/*
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
| `admin:bookings` | Developer, Owner, Manager, Receptionist | Mount dashboard `/` or `/bookings` (admin.theroyalglow.in) |
| `admin:schedule:{YYYY-MM-DD}` | Admin roles with schedule access | View specific date in schedule |
| `admin:leave` | Admin roles with leave-review access | Mount `/leave` (admin.theroyalglow.in) |
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
        │ POST /api/           │                    │                   │
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

> **Decision update (pg_cron → QStash):** pg_cron is no longer used. All
> scheduled jobs run on QStash; only the `pprd` branch reset (Job 5) runs on
> GitHub Actions cron. The free-tier prod Neon compute scales to zero after
> ~5 min idle and pg_cron only fires while the compute is awake, so the
> late-night windows would silently never run. QStash wakes the compute via an
> HTTP POST, so the jobs run reliably at ₹0. See `background-jobs.md`.

| Engine | Location | Use For | Free Tier |
|--------|----------|---------|-----------|
| **QStash** | Upstash HTTP queue → Next.js `/api/jobs/*` | ALL scheduled + triggered jobs (DB maintenance via `@rgss/db` query fns + external HTTP: email, push, Slack) | 500 messages/day |
| **GitHub Actions cron** | GitHub CI | Control-plane only — Neon `pprd` branch reset + PII strip (Job 5) | 2,000 min/mo |

**Routing Rule:** every scheduled/triggered job is a QStash message POSTing a
`/api/jobs/...` route — including the pure-SQL maintenance jobs. Only Job 5
(Neon branch reset, a control-plane op) lives in GitHub Actions.

### 8.2 Job Categories

**Nightly Maintenance (QStash scheduled — 6 jobs; + Job 5 on GitHub Actions):**

| # | Job | Schedule (UTC) | IST Equivalent |
|---|-----|---------------|----------------|
| 1 | Nightly sales summary | `0 18 * * *` | 11:30 PM |
| 2 | Membership auto-expire | `30 18 * * *` | 12:00 AM |
| 3 | Offer auto-expire | `35 18 * * *` | 12:05 AM |
| 4 | Session cleanup | `0 21 * * 0` | 2:30 AM Sunday |
| 5 | pprd DB sync (GitHub Actions) | `30 19 * * *` | 1:00 AM |
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
| `pprd` | Pre-production | On merge | `pprd` |
| `prod` | Production | Push/path-triggered; external approval if configured | `prod` |

### 9.2 Pipeline Stages

| PR Target | Checks Run | Purpose |
|-----------|-----------|---------|
| → `dev` | Lint (Biome) + Unit Tests (Vitest) + Type Check (tsc) + Build + Dependency Audit | Fast feedback on code quality |
| → `test` | All above + Integration Tests + Playwright E2E + Lighthouse CI | Functional correctness verification |
| → `pprd` | All above + k6 Load Test + OWASP ZAP Security Scan + Smoke Tests | Performance and security gates |
| → `prod` | All above + external approval if configured → `deploy-aws.yml` → SST deploy → conditional web/admin health gate (`AWS_DOMAINS_LIVE=true`) | Production release gate |

Committed Drizzle migrations are applied separately through `migrate.yml`, using the unpooled connection and the required `dev → test → pprd → prod` order. GitHub branch/environment approval settings are external and are not implemented as jobs in `deploy-aws.yml`.

**Production deployment:**

```text
[Push to prod or manual dispatch; external approval if configured]
       │
       ▼
[GitHub OIDC to AWS]
       │
       ▼
[bunx sst deploy --stage production]
       │
       ├── apps/web   → Lambda + CloudFront
       └── apps/admin → Lambda + CloudFront
       │
       ▼
[If AWS_DOMAINS_LIVE=true: retry both /api/health endpoints
 up to 6 times, waiting 15 seconds; notify best-effort on failure]
```

A failed SST/Pulumi update can partially apply. Operators inspect logs, stack state, and both public applications before manually dispatching a known-good `git_ref` if needed.

### 9.3 Feature Flag Strategy

**Principle: Deploy ≠ Release**

- **Deploy** = a successful SST deployment places code in production on Lambda + CloudFront.
- **Release** = a feature becomes visible through PostHog flags.

```
1. Deploy with flag OFF → code in prod, invisible
2. Flag ON: role = 'developer' → self-test in production
3. Flag ON: role = 'owner' | 'manager' → stakeholder preview
4. Flag ON: 10% of customers → monitor Sentry for errors
5. Flag ON: 100% → full release
6. Remove flag + dead code after 2 weeks stable
```

### 9.4 Rollback Plan

| Tier | Scenario | Action | Time to Recover |
|------|----------|--------|-----------------|
| **Tier 1** | Flagged UI/feature bug | Feature flag OFF | **< 10 seconds** |
| **Tier 2** | Successful but bad app release | Run `deploy-aws.yml` with a previous tag/SHA in `git_ref` | **3–5 minutes** |
| **Tier 3** | Bad migration (data corrupted) | Forward-fix migration or Neon PITR | **< 10 minutes** |
| **Tier 4** | Full Neon disaster | Restore from R2 weekly backup to emergency DB | **< 30 minutes** |

A failed SST/Pulumi update can leave resources partially changed. Inspect deployment logs and stack state, verify both health endpoints, and redeploy a known-good ref when production is unhealthy.

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
│  ├── Coverage: AWS Lambda (web/admin) + Render CMS + client React           │
│  ├── Source maps: errors point to original TypeScript                        │
│  └── Free: 5,000 errors/month                                               │
│                                                                               │
│  Layer 2: BETTERSTACK — Uptime + Status + Logs + Job Monitoring             │
│  ├── 10 HTTP monitors (all critical endpoints)                               │
│  ├── Public status page: status.theroyalglow.in                              │
│  ├── Heartbeat monitors: QStash scheduled jobs, GitHub Actions jobs            │
│  ├── Logs: CloudWatch for Lambda; Render logs for Payload CMS                │
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
| **Level 1: Alert** | Health check failure, error rate spike | Notify operator; disable a PostHog flag when applicable | BetterStack + Sentry |
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
| 6 | Payload CMS | `cms.theroyalglow.in` | Every 3 min |
| 7 | Neon DB probe | Via API health endpoint | Every 3 min |
| 8 | Ably connectivity | Via test endpoint | Every 3 min |
| 9 | Upstash Redis | Via API probe | Every 3 min |
| 10 | Cloudflare R2 | Via test asset | Every 3 min |

---


## 11. Security Design

### 11.1 Defense in Depth

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ DEFENSE IN DEPTH                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ DELIVERY                                                                    │
│ ├── CloudFront distributions terminate public application traffic          │
│ ├── ACM certificates cover web/admin custom domains                         │
│ └── Cloudflare remains authoritative DNS; it runs no app compute            │
│                                                                             │
│ APPLICATION                                                                 │
│ ├── HTTPS redirects + HSTS                                                  │
│ ├── CSP: nonce-based script loading, strict-dynamic                         │
│ ├── CORS: exact origin matching                                             │
│ ├── Rate limiting: Upstash Redis sliding windows                            │
│ ├── CSRF: Better Auth session protections                                   │
│ └── Request IDs for traceability                                            │
│                                                                             │
│ DATA + AUTH                                                                 │
│ ├── Zod .safeParse() at every API boundary                                  │
│ ├── Drizzle parameterized queries                                           │
│ ├── HttpOnly, Secure, SameSite=Lax session cookies                          │
│ └── Neon pooled app connections; unpooled migrations only                   │
│                                                                             │
│ SUPPLY CHAIN                                                                │
│ └── Trivy, Socket.dev, and Semgrep CI checks                                │
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
| **AWS Lambda** | Managed request scaling | Separate ARM64 SSR/API function for each Next.js app through `sst.aws.Nextjs` |
| **CloudFront** | Global managed CDN | Static assets and application delivery from edge locations; dynamic requests route to Lambda |
| **Neon DB** | Serverless auto-scale | Compute scales on demand and can scale to zero on non-production branches |
| **Upstash Redis** | Serverless | Distributed API rate-limit state; `/api/health` also probes connectivity. Catalogue and availability responses read Neon directly. |
| **Ably** | Managed | Realtime channels and Token Auth without self-hosted WebSocket infrastructure |
| **Render** | Single service | Payload CMS only; no web/admin compute fallback |

**Stateless Design:** Sessions live in PostgreSQL, not Lambda memory. Any Lambda execution environment can serve a request; no sticky sessions are required.

### 12.2 Performance Optimizations

| Optimization | Layer | Impact |
|-------------|-------|--------|
| **Static delivery** | CloudFront + S3 | Static assets served near users, including Indian edge locations |
| **SSR/API compute** | Lambda `ap-southeast-1` | Compute remains near Neon to reduce sequential database round trips |
| **Service catalogue data path** | Neon via Drizzle | Direct authoritative reads; a five-minute Upstash cache is planned, not implemented |
| **Availability data path** | Neon settings + pure TypeScript | Uncached 30-minute grid; booking/staff/leave/holiday inputs are not wired yet |
| **ISR** | Next.js + SST/OpenNext | Revalidates eligible content without rendering every request |
| **SSG** | Next.js | Legal pages, FAQ, and contact built as static HTML |
| **Image optimization** | Next.js Image | Responsive formats, lazy loading, and placeholders |
| **PWA** | Browser Service Worker + manifest | Core assets available for offline use |
| **Streaming SSR** | React Suspense | Progressive HTML delivery |

### 12.3 Capacity Planning

| Service | Included / Free Allowance | Expected Usage at Launch | Headroom |
|---------|---------------------------|--------------------------|----------|
| AWS Lambda | 1M requests + 400,000 GB-seconds/month | ~5K requests/day | Large |
| CloudFront | 1 TB transfer + 10M requests/month | Salon-scale web traffic | Large |
| Neon DB | 0.5 GB storage, 3 GB transfer | ~50 MB, ~500 MB/month | 10x+ |
| Upstash Redis | 10K requests/day | ~500/day | 20x |
| Upstash QStash | 500 messages/day | ~50/day | 10x |
| Cloudflare R2 | 10 GB, 10M operations/month | ~2 GB, ~100K operations | 5x–100x |
| Ably | 6M messages/month | ~50K/month | 120x |
| Sentry | 5K errors/month | ~50/month | 100x |
| PostHog | 1M events/month | ~50K/month | 20x |

Use AWS Budgets and CloudWatch metrics to detect unexpected spend or duration. Optimize query shape and Upstash caching before changing the Lambda region or adding more infrastructure.

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
| Flagged feature issue | 0 | < 10 seconds | Disable PostHog flag |
| Successful but bad app release | 0 | 3–5 minutes | Redeploy a previous tag/SHA through `deploy-aws.yml` |
| Failed SST/Pulumi update | Unknown until inspected | Depends on partial update state | Inspect stack/logs and health; redeploy known-good ref if needed |
| Bad DB migration | ~0 seconds | < 10 minutes | Forward-fix migration or Neon PITR |
| Neon infrastructure outage | ≤ 7 days | < 30 minutes | Restore pg_dump from R2 to emergency Neon project |
| R2 bucket loss | ≤ 1 week | < 1 hour | Restore retained source or regenerate media/invoices where possible |

### 13.3 Disaster Recovery Procedure

**Tier 1 — App Release:**

1. Disable the affected PostHog flag when possible.
2. For a release rollback, run the **Deploy AWS** workflow with `git_ref` set to the last known-good tag or SHA.
3. Verify `theroyalglow.in/api/health` and `admin.theroyalglow.in/api/health` after deployment.
4. If an SST/Pulumi update fails, inspect deployment logs and stack state, verify both health endpoints, and redeploy the known-good ref if resources are unhealthy or partially updated.

**Tier 2 — Database Point-in-Time Recovery:**

1. Create a Neon recovery branch from the timestamp before corruption.
2. Verify data and apply required forward migrations on the recovery branch.
3. Update the SST `DatabaseUrl` secret and redeploy both apps.
4. Switch back only after the canonical branch is healthy.

**Tier 3 — Full DR from R2 Backup:**

1. Download the latest weekly backup from Cloudflare R2.
2. Provision an emergency Neon project or branch.
3. Restore the dump and run integrity checks.
4. Update the SST `DatabaseUrl` secret.
5. Redeploy through `deploy-aws.yml` and verify both health endpoints.
6. After primary recovery, reconcile data, switch back, and decommission the emergency database.


---

## 14. Trade-offs & Design Decisions

| # | Decision | Trade-off Accepted | Mitigation Strategy |
|---|----------|-------------------|---------------------|
| 1 | **Monolith over microservices** | Less fault isolation between domains | Strict layer separation in monorepo; domain boundaries enforced by package imports |
| 2 | **Managed/free-tier services** | Provider limits and cold starts | Monitor real usage; keep services replaceable through narrow adapters |
| 3 | **Google OAuth only** | Users without Google accounts cannot register | Eliminates password storage and recovery flows |
| 4 | **Lambda + CloudFront via SST/OpenNext** | Lambda cold starts and community-maintained OpenNext packaging | Co-locate Lambda with Neon, use static/ISR delivery, measure hot reads, and add the planned Upstash cache only where justified |
| 5 | **Better Auth over Clerk** | Less polished dashboard, newer library | Custom `/users` admin page; full control over session data |
| 6 | **Session-based auth (not JWT)** | DB lookup per request | Revocable sessions; pooled Neon connection; cache only where safe |
| 7 | **Ably managed realtime** | External dependency | Avoids operating WebSocket infrastructure; app falls back to polling |
| 8 | **QStash over pg_cron** | External job delivery service | QStash wakes sleeping Neon compute; jobs are idempotent and heartbeat-monitored |
| 9 | **Drizzle over Prisma** | Smaller community | Pure TypeScript with no runtime binary keeps Lambda packaging portable |
| 10 | **Upstash Redis rate limiting** | External managed-state dependency | Monitor Redis health and preserve each endpoint's configured fail-open/fail-closed policy |
| 11 | **nanoid PKs over auto-increment** | Slightly larger index size | Prevents enumeration attacks; no sequential IDs exposed in URLs |
| 12 | **Paise over decimal for money** | Requires conversion for display | `formatINR()` eliminates floating-point precision bugs |
| 13 | **Hard deletes over soft deletes** | Cannot undelete | `audit_log` captures deletions; simpler queries |
| 14 | **Separate customer and admin Next.js apps** | Two deployments and duplicated app shell configuration | Shared domain packages; SST declares both apps in one `sst.config.ts` |
| 15 | **Bun toolchain** | Smaller ecosystem than npm/Node tooling | Production Next.js output is packaged by SST/OpenNext for Lambda |

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
| **SST** | Infrastructure-as-code framework; `sst.aws.Nextjs` deploys each Next.js app through OpenNext to Lambda + CloudFront |
| **CloudFront** | AWS content delivery network in front of the web and admin Lambda applications |
| **QStash** | Upstash's HTTP message queue for delayed/scheduled job delivery |
| **IST** | Indian Standard Time (UTC+5:30) — all user-facing times displayed in IST |
| **DPDP Act** | Digital Personal Data Protection Act 2023 (India's privacy law) |

---

## Appendix B: Infrastructure Cost Summary

| Service | Included / Free Allowance | Paid Threshold | Notes |
|---------|---------------------------|----------------|-------|
| AWS Lambda | 1M requests + 400,000 GB-seconds/month | Usage above allowance | `apps/web` + `apps/admin` compute |
| Amazon CloudFront | 1 TB transfer + 10M requests/month | Usage above allowance | Separate distribution per app |
| Amazon S3 | 5 GB for initial free period | Storage/requests after allowance | SST-managed static assets only; not a replacement for R2 |
| Neon DB | 0.5 GB, 3 GB transfer | Storage > 0.5 GB | Primary PostgreSQL database |
| Upstash Redis | 10K requests/day | Higher throughput | Distributed API rate limits; planned response caching is not implemented |
| Upstash QStash | 500 messages/day | More jobs | Scheduled and triggered jobs |
| Cloudflare R2 | 10 GB, 10M operations | Storage > 10 GB | Media, invoice PDFs, and DB backups |
| Ably | 6M messages/month, 200 connections | Capacity exceeded | Realtime |
| Render | Free tier | Always-on CMS requirements | Payload CMS only |
| Sentry | 5K errors/month | Error volume | Errors and source maps |
| BetterStack | 10 monitors, 1 GB logs | More monitors/checks | Uptime and heartbeats |
| PostHog | 1M events/month | Event volume | Analytics and feature flags |
| Clarity | Unlimited | — | Session replay |
| Checkly | 5 checks, 10K runs | More checks | Synthetic monitoring |
| **CURRENT BASELINE** | Mostly free allowances | Usage-based | **Approximately $0.50–1/month per M2AWS.md** |

---

## Appendix C: DNS & Routing Map

```
theroyalglow.in (Cloudflare authoritative DNS → AWS CloudFront → apps/web Lambda)
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
└── /api/*                   Customer API routes

admin.theroyalglow.in        Cloudflare DNS → AWS CloudFront → apps/admin Lambda
cms.theroyalglow.in          Cloudflare DNS → Payload CMS on Render (Singapore)
docs.theroyalglow.in         Cloudflare DNS → Mintlify-hosted documentation
r2.theroyalglow.in           Cloudflare R2 object storage custom domain
status.theroyalglow.in       Cloudflare DNS → BetterStack status page
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
> linked throughout this document within the `theroyalglow-webapp/` documentation repository.
