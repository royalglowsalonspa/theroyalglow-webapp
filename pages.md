# Pages & Routes — Complete Application Map

## Overview

Every page, route, and endpoint in the Royal Glow Salon & Spa application. Organized by audience and access level.

**Domain:** `theroyalglow.in`
**Subdomains:** `admin.theroyalglow.in` (Payload CMS) · `docs.theroyalglow.in` (Fumadocs) · `status.theroyalglow.in` (BetterStack)

---

## Route Groups (Next.js App Router)

| Route Group | Layout | Purpose |
|-------------|--------|---------|
| `(customer)` | Header + Footer + Nav | Public and authenticated customer pages |
| `(auth)` | Minimal centered card | Sign-in and onboarding flows |
| `(landing)` | No header/footer | Conversion-optimised ad landing pages |
| `(legal)` | Header + Footer + Nav | Static legal/policy pages (SSG) |
| `admin/` | Sidebar nav + RBAC gate | Internal staff portal |

---

## 1. Customer-Facing — Public (No Auth Required)

These pages are accessible to everyone. They form the marketing and discovery layer of the site.

| Route | Page Title | Summary | Rendering |
|-------|-----------|---------|-----------|
| `/` | Home | Premium hero section with a single "Book Now" CTA button. The button opens a 4-step booking dialog as an overlay (bottom sheet mobile, centered modal desktop). `/?book=1` deep-links auto-open the dialog. Minimal, brand-focused, no clutter. | SSR |
| `/services` | Services | All services listed by category with a Salon/SPA toggle filter. Each service card shows name, price (GST-inclusive), and duration. | SSR |
| `/offers` | Offers & Combos | Active promotions with terms, validity dates, and linked services. One offer per customer per day. | SSR |
| `/about` | About Us | Business story, team gallery (stylists + therapists), salon philosophy. Content managed via Payload CMS. | ISR (1h) |
| `/contact` | Contact | All social links, Google Maps embed, phone, email, and a feedback/enquiry form. | SSG |
| `/blog` | Blog | Beauty & wellness articles list. Content managed in Payload CMS, fetched via Payload REST API. | ISR (1h) |
| `/blog/[slug]` | Blog Post | Individual article with `BlogPosting` + `BreadcrumbList` JSON-LD. OG image generated per post. | ISR (1h) |
| `/faq` | FAQ | Frequently asked questions. `FAQPage` JSON-LD for Google AI Overviews optimisation. | SSG |

**Key components on public pages:**
- Cookie consent banner (two-tier: Accept All / Reject All / Manage Preferences)
- PWA install prompt (shown after 2nd visit)
- Push notification permission prompt (asked after first successful booking, not on first page load)

---

## 2. Customer-Facing — Authenticated (Sign-in Required)

These pages require Google OAuth sign-in. Accessible to role `customer` and above.

| Route | Page Title | Summary | Key Features |
|-------|-----------|---------|--------------|
| `/profile` | My Profile | All profile fields editable except email. Shows Member Since + Last Updated (DD/MM/YYYY). Notification preferences toggles (appointment reminders, membership alerts, marketing consent). | Edit name, phone, DOB, gender; toggle notifications |
| `/bookings` | My Bookings | Upcoming and past bookings in two tabs. Each booking shows services, date, time, status badge, and total amount. | Actions: Edit Services, Reschedule, Cancel (while pending/confirmed) |
| `/bookings/[id]` | Booking Detail | Full booking detail — status timeline, services list, assigned staff (after confirmation), notes, invoice link (after completion). | View status history, invoice PDF, Google Maps review link |
| `/membership` | SPA Membership | Active membership details: tier name, membership ID, hours remaining (visual progress bar), expiry date, session history. Past memberships in collapsed section. Only shown if customer has an active or past membership. | View tier, hours used/remaining, session log |
| `/gems` | Gems Catalogue | Gems balance display + redeemable services catalogue. Shows earn rate (1% of invoiced amount) and 1-year expiry rule. | View balance, browse redeemable services, transaction history |

**Booking dialog (overlay on homepage, not a separate page):**
- Step 1: Branch + Date + Time Slot
- Step 2: Salon/SPA toggle → select categories
- Step 3: Select services (multi-select, running total)
- Step 4: Summary — "Booking Submitted!" with total, payment note, gems balance

---

## 3. Auth Flow Pages

Minimal layout — centered card, no main navigation. Focused on conversion.

| Route | Page Title | Summary | Notes |
|-------|-----------|---------|-------|
| `/sign-in` | Sign In | Google OAuth entry point. Single "Sign in with Google" button. Before redirect, stores `book=1`, `utm_source`, and UTM fields in sessionStorage to survive OAuth redirect. | Only auth method; no email/password |
| `/onboarding` | Welcome Setup | First-time sign-in only. Collects: name, phone, DOB, gender, privacy consent (required), analytics consent (optional), marketing consent (optional). Redirects to `/` on completion. | Reads sessionStorage for acquisition source attribution |

---

## 4. Landing Pages (No Navigation)

Distraction-free pages optimised for ad conversion. No header, no footer, no navigation links.

| Route | Page Title | Summary | Notes |
|-------|-----------|---------|-------|
| `/book` | Book Now (Ad Landing) | Dedicated lead capture page for Meta/Instagram ad traffic only. 3-field form: Name, Phone, Service interest dropdown. Creates a `lead` row with source `meta_ad`. After submit, redirects to homepage booking dialog (`/?book=1&leadId={id}`). No sign-in required for lead capture. | Never link from homepage, GMB, or in-store QR to this page |

**Design rules for `/book`:**
- Trust signals above fold: Royal Glow name, 4.9 stars, 86 reviews, Bengaluru
- CTA text: "Continue to Booking" (not "Submit")
- Footer: address + phone only
- Meta Pixel: PageView fires on load; Lead event fires after form submit

---

## 5. Legal Pages (Static/SSG)

Static pages with customer layout (header + footer). Built once at build time, no revalidation needed.

| Route | Page Title | Summary | Requirement |
|-------|-----------|---------|-------------|
| `/privacy` | Privacy Policy | DPDP Act 2023 compliant. Data collection, usage, storage, sharing disclosure. Indian server storage declaration. | Mandatory — Indian law |
| `/terms` | Terms of Service | Governs use of the platform and services. Business protection. | Standard business practice |
| `/refund-policy` | Refund & Cancellation Policy | Cancellation window (4h free cancel), no-show consequences, reschedule rules (max 2 per booking). | Required for service businesses |

---

## 6. Admin Portal — `/admin/*`

All admin routes are RBAC-gated. Unauthenticated or under-privileged requests redirect to `/sign-in`. Layout: persistent sidebar navigation + top bar with role/name.

### 6a. Dashboard

| Route | Page Title | Min. Role | Summary |
|-------|-----------|-----------|---------|
| `/admin` | Dashboard | Receptionist | Today's overview: pending bookings count, today's revenue, upcoming appointments, pending actions (unreviewed bookings, leave requests, stale leads). Quick-action buttons. |

### 6b. Bookings

| Route | Page Title | Min. Role | Summary |
|-------|-----------|-----------|---------|
| `/admin/bookings` | All Bookings | Receptionist | Full booking list with filters: status, date range, staff, service type (Salon/SPA), walk-in flag. Data table with sort + search. |
| `/admin/bookings/new` | Create Walk-in | Receptionist | Walk-in booking form — skips pending, directly confirmed. Select customer, services, staff, time. |
| `/admin/bookings/[id]` | Booking Detail | Receptionist | Full booking management: approve/reject (with reason), assign staff to each service, mark in_progress/completed, reschedule, cancel, mark no-show, view status history log, add notes. |
| `/admin/waitlist` | Waitlist | Receptionist | Manage customers waiting for fully-booked slots. Promote to booking when slot opens. Notify customer. |

### 6c. Customers (CRM)

| Route | Page Title | Min. Role | Summary |
|-------|-----------|-----------|---------|
| `/admin/customers` | Customer List | Receptionist | Search by name/phone/email. Filter by tags (VIP, frequent, inactive, No-Show Risk). Sort by LTV, visit count, no-show count. |
| `/admin/customers/[id]` | Customer Profile | Receptionist | Complete customer view: booking history, invoices, gems balance, membership status, CRM tags, notes timeline, no-show tier, acquisition source, lifetime value. Add notes, assign tags. |

### 6d. Leads

| Route | Page Title | Min. Role | Summary |
|-------|-----------|-----------|---------|
| `/admin/leads` | Lead Pipeline | Receptionist | Kanban or table view: New → Contacted → Follow-up → Booked → Won / Lost. Filter by campaign, date, assigned staff. |
| `/admin/leads/[id]` | Lead Detail | Receptionist | Lead info: name, phone, service interest, UTM source/campaign, WhatsApp thread link (AiSensy), assigned receptionist. Notes timeline. Link to converted booking (if exists). |

### 6e. Staff Management

| Route | Page Title | Min. Role | Summary |
|-------|-----------|-----------|---------|
| `/admin/staff` | Staff List | Manager | All staff with designation (Stylist/Therapist/Receptionist/Manager), active status, current schedule summary. |
| `/admin/staff/new` | Add Staff | Manager | Create staff member: select user, assign designation, set bio/specialization, link services they can perform, set initial schedule. |
| `/admin/staff/[id]` | Staff Profile | Manager | Staff detail: schedule grid, leave history, performance summary (bookings completed, revenue attributed, utilisation rate), services assigned. |

### 6f. Schedule & Leave

| Route | Page Title | Min. Role | Summary |
|-------|-----------|-----------|---------|
| `/admin/schedule` | Staff Schedule | Receptionist | Weekly/daily calendar view of all staff availability. See who's working, who's on leave, open slots per staff member. |
| `/admin/leave` | Leave Management | Receptionist | Pending leave requests to approve/reject. Staff leave calendar (approved leaves). Direct mark-off for same-day absences. Warning if staff has confirmed bookings on requested date. |

### 6g. Service Catalog

| Route | Page Title | Min. Role | Summary |
|-------|-----------|-----------|---------|
| `/admin/services` | All Services | Manager | Services grouped by category (Salon and SPA). Toggle active/inactive. Drag to reorder display. |
| `/admin/services/new` | Add Service | Manager | Create service: name, category, price (GST-inclusive), duration, buffer time, gems config (redeemable, gems required), image, assign staff. |
| `/admin/services/[id]` | Edit Service | Manager | Edit all service fields: price, duration, active status, gems catalogue order, assigned staff, image. |

### 6h. Offers & Promotions

| Route | Page Title | Min. Role | Summary |
|-------|-----------|-----------|---------|
| `/admin/offers` | All Offers | Manager | List all offers: active, scheduled (future start), expired. Show type (percentage/flat/combo), linked services, validity period. |
| `/admin/offers/new` | Create Offer | Manager | Create offer: name, type, discount value, linked services, start/end dates, terms text. |
| `/admin/offers/[id]` | Edit Offer | Manager | Edit offer details or deactivate. View redemption count. |

### 6i. SPA Memberships

| Route | Page Title | Min. Role | Summary |
|-------|-----------|-----------|---------|
| `/admin/memberships` | All Memberships | Receptionist | List all memberships: active, expired, cancelled. Filter by tier (Silver/Gold/Platinum), status, customer. |
| `/admin/memberships/new` | Create Membership | Receptionist | Create membership for customer: select customer, select tier, override hours/price if negotiated, set start date. Generates `membership_purchase` invoice. |
| `/admin/memberships/[id]` | Membership Detail | Receptionist | View: tier, hours used/remaining, session history, expiry. Actions: record session (deduct hours), cancel membership. |

### 6j. Billing & Invoicing

| Route | Page Title | Min. Role | Summary |
|-------|-----------|-----------|---------|
| `/admin/billing` | All Invoices | Receptionist | Invoice list filterable by type (service, membership_purchase, membership_session), date range, payment status, payment method. |
| `/admin/billing/[id]` | Invoice Detail | Receptionist | Line items with snapshotted service/staff names, GST breakdown (base + GST = total), payment method, PDF preview, resend email button. |

### 6k. Reports & Analytics

| Route | Page Title | Min. Role | Summary |
|-------|-----------|-----------|---------|
| `/admin/reports` | Reports Overview | Manager | Top-level KPIs: today's revenue, this week's bookings, top service, busiest slot, new customers. Links to detailed reports. |
| `/admin/reports/financial` | Financial Report | Manager | Daily/monthly revenue charts. GST summary per month. Payment method breakdown (Cash/UPI/Card). Export-ready for CA. |
| `/admin/reports/salon` | Salon Analytics | Manager | Service category performance, most booked services, revenue by service, category trends over time. |
| `/admin/reports/spa` | SPA Analytics | Manager | Membership utilisation rates, session frequency, tier distribution, revenue from memberships vs per-session. |
| `/admin/reports/staff` | Staff Performance | Manager | Bookings per staff member, revenue attributed, utilisation rate (booked hours / available hours), customer satisfaction signals. |
| `/admin/reports/leads` | Lead Analytics | Manager | Lead conversion rate, revenue per Meta campaign, ROAS calculation, pipeline funnel visualisation, source comparison. |

### 6l. Settings & System

| Route | Page Title | Min. Role | Summary |
|-------|-----------|-----------|---------|
| `/admin/settings` | System Settings | Manager | Salon info, GST number, business hours, cancellation window config, no-show threshold config, gems earn rate, membership tier defaults. |
| `/admin/branches` | Branch Management | Owner | List all branches. Add new branch (name, address, phone, Google Maps, GPS, status). |
| `/admin/branches/[id]` | Edit Branch | Owner | Edit branch details: address, phone, status (operational/temporarily_closed/opens_soon/shutdown), close reason. |
| `/admin/users` | User Management | Owner | List all users (customers + staff). Assign/change roles (respects hierarchy). Suspend/ban accounts. View active sessions. Filter by role, status, signup date. |

### 6m. Developer-Only

| Route | Page Title | Min. Role | Summary |
|-------|-----------|-----------|---------|
| `/admin/integrations` | Integrations | Developer | View/edit integration configs: Ably channels, AiSensy webhook status, Meta Pixel/CAPI event log, Sentry DSN, BetterStack heartbeats. |
| `/admin/logs` | Error Logs | Developer | Sentry-sourced error log viewer. Filter by severity, date, route. Stack traces and breadcrumbs. |

### 6n. Staff-Only View (Stylist/Therapist)

Staff role does NOT access `/admin/*`. They have a minimal read-only view:

| Route | Page Title | Min. Role | Summary |
|-------|-----------|-----------|---------|
| `/admin` | My Schedule | Staff | Today's assigned appointments: customer first name, service, time, duration. Next 7 days upcoming. Cannot see: other staff bookings, customer contact details, prices, invoices, CRM data. |
| `/admin/leave` | My Leave | Staff | Submit leave request (date, type, reason). View own leave history and approval status. Withdraw pending requests. |

---

## 7. API Routes — `/api/*`

Thin layer: parse request, validate with Zod, delegate to business logic, return response.

### 7a. Authentication

| Route | Method | Summary |
|-------|--------|---------|
| `/api/auth/[...betterauth]` | ALL | Better Auth catch-all handler — sign-in, callback, session, sign-out, CSRF token. |

### 7b. Customer-Facing API

| Route | Method | Summary | Auth |
|-------|--------|---------|------|
| `/api/services` | GET | All service categories + services (Cloudflare KV cached). Public. | No |
| `/api/services/[slug]` | GET | Single service detail by slug. Public. | No |
| `/api/availability` | GET | Available time slots for a given date + optional staff/service IDs. Public. | No |
| `/api/bookings` | GET | List authenticated customer's bookings (upcoming + past). | Yes |
| `/api/bookings` | POST | Create a new booking. Optionally links a prior lead via `leadId`. | Yes |
| `/api/bookings/[id]` | GET | Single booking detail for the authenticated customer. | Yes |
| `/api/bookings/[id]/cancel` | POST | Cancel a booking (validates cancellation window rules). | Yes |
| `/api/bookings/[id]/reschedule` | POST | Reschedule a booking (validates max 2 reschedules, 1h minimum notice). | Yes |
| `/api/leads` | POST | Lead capture from `/book` page — saves to Neon, fires CAPI Lead event. | No |
| `/api/onboarding/complete` | POST | Save onboarding data (name, phone, DOB, gender, consents). Fires CAPI CompleteRegistration. | Yes |
| `/api/push/subscribe` | POST | Register a Web Push subscription endpoint in Neon. | Yes |
| `/api/push/unsubscribe` | DELETE | Remove a push subscription from Neon. | Yes |
| `/api/ably/token` | POST | Ably Token Auth — returns a scoped token based on user role. | Yes |

### 7c. Admin API

All routes require min. Receptionist role unless noted.

| Route | Method | Summary | Min. Role |
|-------|--------|---------|-----------|
| `/api/admin/bookings/[id]` | PATCH | Approve, reject (with reason), or assign staff to a booking. | Receptionist |
| `/api/admin/bookings/[id]/complete` | POST | Mark booking completed → generate invoice → email PDF → award gems → fire CAPI Purchase. | Receptionist |
| `/api/admin/memberships` | POST | Create a SPA membership → generate `membership_purchase` invoice. | Receptionist |
| `/api/admin/leave` | POST | Submit a leave request (staff self-service). | Staff |
| `/api/admin/leave` | PATCH | Approve or reject a leave request. | Receptionist |

### 7d. Background Job Endpoints (QStash)

Called by Upstash QStash scheduler. Verified via QStash signature header.

| Route | Schedule/Trigger | Summary |
|-------|-----------------|---------|
| `/api/jobs/appointment-reminders` | Every 15 min | Send 24h/1h push + email reminders for confirmed bookings. |
| `/api/jobs/membership-expiry` | Daily 12:30 AM IST | Send 30d/7d/1d membership expiry alerts (push + email). |
| `/api/jobs/birthday-emails` | Daily 9:30 AM IST | Birthday offer email (Brevo) + notification for today's birthdays. |
| `/api/jobs/membership-usage-nudges` | Daily 11:00 AM IST | Randomised batch: remind members of unused hours. |
| `/api/jobs/lead-followups` | Daily 10:30 AM IST | Alert receptionist of leads needing follow-up (48h+ stale). |
| `/api/jobs/daily-sales-report` | Daily 10:30 PM IST | Compile and send daily sales to Slack + email (Owner/Manager). |
| `/api/jobs/weekly-report` | Monday 9:00 AM IST | Weekly summary with week-over-week comparison. |
| `/api/jobs/gems-expiry-reminder` | Daily 10:30 AM IST | Push notification: gems expiring in 7 days. |
| `/api/jobs/post-service-followup` | +24h after completed | Post-service email with Google Maps review link (Brevo). |
| `/api/jobs/stale-booking-alert` | +2h after pending created | Alert receptionists of bookings pending too long. |
| `/api/jobs/noshow-check` | +15min after end_time | Alert receptionist if booking still "confirmed" after scheduled end. |
| `/api/jobs/membership-expired-notice` | +1h after expires_at | Final expiry email with renewal prompt. |

### 7e. Incoming Webhooks

Signature-verified. External services push data into the system.

| Route | Method | Source | Summary |
|-------|--------|--------|---------|
| `/api/webhooks/meta-leads` | POST | Meta Lead Gen | Receives leads from Meta/Instagram native lead forms (Option A backup flow). Saves to Neon, fires CAPI Lead event. |
| `/api/webhooks/aisensy` | POST | AiSensy | WhatsApp lead status change → updates lead record in Neon. |

---

## 8. External Subdomains

These are separate deployments, not part of the main Next.js app.

| Subdomain | Platform | Purpose | Access |
|-----------|----------|---------|--------|
| `admin.theroyalglow.in` | Payload CMS on Render | Marketing content management: blog posts, gallery photos, team bios, homepage banners, FAQ items. | Manager+ (2 seats) |
| `docs.theroyalglow.in` | Fumadocs (Next.js) | Technical documentation portal: architecture, API reference (auto-generated from OpenAPI spec via fumadocs-openapi), guides, business logic docs, changelog. | Public (developer reference) |
| `status.theroyalglow.in` | BetterStack | Uptime status page: 10 monitors, incident history, scheduled maintenance notices. | Public |

---

## 9. Special Files & Endpoints

| Path | Type | Summary |
|------|------|---------|
| `/sitemap.xml` | Generated | Static routes + dynamic blog posts from Payload API + FAQ. Submitted to Google Search Console. |
| `/robots.txt` | Generated | AI crawlers explicitly allowed (GPTBot, Claude-Web, PerplexityBot, Googlebot-Extended). |
| `/llms.txt` | Static | AI agent discovery file: site description, key pages, services, contact, API endpoints. |
| `/manifest.json` | Static | PWA manifest: Royal Glow branding, theme colour, icons, start_url. |
| `/sw.js` | Generated | Service worker: caches service menu, prices, contact, hours, gallery thumbnails, homepage shell. |
| `/opengraph-image` | Generated | Default branded OG image for social sharing (fallback when page-specific OG not set). |
| `/favicon.ico` | Static | Favicon. |
| `/apple-icon.png` | Static | 180x180 Apple homescreen icon for iOS PWA. |

---

## 10. Deep Links & UTM Contracts

These are not separate pages but specific URL patterns that trigger behaviour on existing pages.

| URL Pattern | Behaviour | Source |
|-------------|-----------|--------|
| `/?book=1` | Auto-opens the 4-step booking dialog on homepage | General deep-link |
| `/?book=1&utm_source=gmb` | Opens dialog + sets acquisition source `gmb` | Google Maps / Google My Business |
| `/?book=1&utm_source=walkin` | Opens dialog + sets acquisition source `walkin` | In-store QR code |
| `/book?utm_source=meta&utm_campaign=facial_may` | Meta ad landing page with campaign tracking | Meta/Instagram ads |
| `/?book=1&leadId={id}` | Opens dialog with lead context linked (post-lead-capture redirect) | After `/book` form submit |

---

## 11. Page Count Summary

| Section | Count |
|---------|-------|
| Customer public pages | 8 |
| Customer authenticated pages | 5 |
| Auth flow pages | 2 |
| Landing pages | 1 |
| Legal pages | 3 |
| Admin pages | 33 |
| API routes | 25 |
| Webhook endpoints | 2 |
| Job endpoints | 12 |
| External subdomains | 3 |
| Special files | 8 |
| **Total unique routes** | **~102** |

---

## 12. Role Access Matrix (Pages)

Quick reference: which roles can access which page sections.

| Section | Customer | Staff | Receptionist | Manager | Owner | Developer |
|---------|:--------:|:-----:|:------------:|:-------:|:-----:|:---------:|
| Public pages (`/`, `/services`, etc.) | Yes | Yes | Yes | Yes | Yes | Yes |
| Auth pages (`/profile`, `/bookings`, etc.) | Yes | Yes | Yes | Yes | Yes | Yes |
| `/admin` dashboard | -- | Limited | Full | Full | Full | Full |
| `/admin/bookings/*` | -- | -- | Full | Full | Full | Full |
| `/admin/customers/*` | -- | -- | Full | Full | Full | Full |
| `/admin/leads/*` | -- | -- | Full | Full | Full | Full |
| `/admin/staff/*` | -- | -- | -- | Full | Full | Full |
| `/admin/services/*` | -- | -- | -- | Full | Full | Full |
| `/admin/offers/*` | -- | -- | -- | Full | Full | Full |
| `/admin/reports/*` | -- | -- | -- | Full | Full | Full |
| `/admin/settings` | -- | -- | -- | Full | Full | Full |
| `/admin/branches/*` | -- | -- | -- | -- | Full | Full |
| `/admin/users` | -- | -- | -- | -- | Full | Full |
| `/admin/integrations` | -- | -- | -- | -- | -- | Full |
| `/admin/logs` | -- | -- | -- | -- | -- | Full |

---

## References

- [features.md](./features.md) — Full feature specifications and business rules
- [architecture.md](./architecture.md) — Infrastructure, routing, and project structure
- [authentication.md](./authentication.md) — Auth flow, roles, and permissions matrix
- [database-schema.md](./database-schema.md) — All 38 tables and relationships
- [background-jobs.md](./background-jobs.md) — All 19 scheduled/triggered jobs
- [seo.md](./seo.md) — JSON-LD schemas, sitemap, robots.txt, structured data
