# Features & Application Scope

## Overview

Royal Glow Salon & Spa is a **fully digital business ecosystem** — not just a website. It covers every operational and customer-facing touchpoint of the business.

---

## System Modules

### 1. Customer-Facing Website
The public website — the primary touch point for customers.

**Pages & Routes:**
| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Premium hero section + single "Book Now" CTA button that opens the 4-step booking dialog over the homepage. `?book=1` deep-links auto-open the same dialog. Minimal, brand-focused. No clutter. |
| `/services` | Services | All services listed by category. Salon/SPA toggle filter. Prices shown GST-inclusive. |
| `/offers` | Offers & Combos | Active offers/combos with terms. One offer per customer per day. |
| `/about` | About | Business story, hair stylists, spa therapists, team gallery. |
| `/contact` | Contact | All socials, Google Maps embed, phone, email, feedback form. |
| `/profile` | Profile | All profile fields editable except email. Shows Member Since + Last Updated (DD/MM/YYYY format). |
| `/bookings` | My Bookings | Upcoming and past bookings. Actions: Edit Services, Reschedule, Cancel (while pending). |
| `/membership` | SPA Membership | Active membership details: tier, hours remaining, expiry, session history. Only shown if customer has an active or past membership. |
| `/gems` | Gems Catalogue | Redeemable services with gems balance display. |
| `/blog` | Blog | Beauty & wellness articles — content managed in Payload CMS, fetched via Payload REST API (ISR, 1h revalidation). |
| `/blog/[slug]` | Blog Post | Individual article page. `BlogPosting` + `BreadcrumbList` JSON-LD. ISR, 1h revalidation. OG image generated per post. |
| `/faq` | FAQ | Frequently asked questions. SSG (static at build time). `FAQPage` JSON-LD — optimised for Google AI Overviews. |
| `/privacy` | Privacy Policy | DPDP Act compliant. Static/SSG. |
| `/terms` | Terms of Service | Static/SSG. |
| `/refund-policy` | Refund & Cancellation | Cancellation window, no-show, reschedule rules. Static/SSG. |
| `/onboarding` | Onboarding | First-time sign-in only. Collect name, phone, DOB, gender, consents. Redirects to `/` on completion. |
| `/book` | Ad Landing Page | Dedicated distraction-free lead capture page for Meta/Instagram ad traffic only. No navigation header. Quick 3-field form creates a `lead` with source `meta_ad`, then sends the customer to the homepage booking dialog if they continue. **No sign-in required for lead capture.** No slot is reserved until a booking is submitted. |

**Design requirements:**
- Rich, premium aesthetic — high-end feel matching the brand
- 100% Lighthouse score (Performance, Accessibility, Best Practices, SEO)
- Fully responsive — mobile-first
- All prices displayed GST-inclusive (18% GST, SAC 999721)
- All dates displayed in DD/MM/YYYY format (Indian standard)

### Customer Reviews & Google Maps

All customer reviews are collected on **Google Maps / Google My Business only**. No in-app review system — Google Maps is the local SEO asset that drives discovery.

**Why Google Maps:** Your 4.9★ rating appears in local search results, Google Maps app, and customer decision-making. More reviews = higher local ranking. Lower friction than asking customers to visit your website.

**Review collection touchpoints:**

| Touchpoint | When | Action |
|-----------|------|--------|
| **Post-booking email** | Immediately after booking confirmed | Include Google Maps review link in Resend template |
| **Confirmation summary** | Step 4 of booking dialog | Card: "Help us grow — Leave a review on Google Maps" with button |
| **Invoice PDF** | Email + printed copy at checkout | Footer: "Rate us on Google Maps" with link |
| **Receptionist script** | At payment (physical) | "We'd love your feedback on Google Maps. Here's the link." |

**What NOT to do:**
- ❌ Don't ask for 5 stars only (looks fake)
- ❌ Don't incentivize with discounts (violates Google policy)
- ❌ Don't post fake reviews
- ❌ Don't build an in-app review table (unnecessary complexity)

**Monitoring:** Google My Business dashboard shows real-time review count and ratings — no custom tracking needed.

---

### 2. Booking & Scheduling System
Core business logic — manages appointments across all services and staff.

#### 2a. Onboarding Flow (First-Time User)
```
User clicks "Sign in with Google" → Google OAuth (scope: email, profile)
    ↓
First sign-in detected → redirect to /onboarding
    ↓
Onboarding form:
  • Name        (prefilled from Google, editable)
  • Email       (prefilled from Google, read-only)
  • Phone       (fetched from Google People API if available, else manual entry)
  • Date of Birth (manual entry, DD/MM/YYYY)
  • Gender      (select: Male / Female / Other / Prefer not to say)
  • Consent checkboxes:
      ☑ Required: "I agree to the Privacy Policy. My data is stored securely
                  on Indian servers and will not be shared with any
                  third-party organization." (links to /privacy)
      ☐ Optional: "Help us improve Royal Glow — allow anonymous usage
                  analytics." (analytics consent — DPDP Act)
      ☐ Optional: "Send me offers, updates & promotions via email
                  and notifications." (marketing consent — DPDP Act)
    ↓
Submit → customer_profile created
       → acquisition source assigned from saved first-touch context
         (`organic`, `gmb`, `walkin`, or converted `meta_ad` lead)
       → consent choices written to `rgss_cookie_consent` in localStorage
         { v:1, analytics: <checkbox1>, marketing: <checkbox2>, ts: now }
       → redirect to / (homepage) — cookie banner suppressed for any
         category already consented to at onboarding
```

#### 2b. Booking Flow (Multi-Step Dialog on Homepage)

Triggered by the "Book Now" button on `/` or by `/?book=1` deep-links. Opens a responsive dialog (bottom sheet on mobile, centered modal on desktop). **Not a separate page** — stays on the homepage with overlay, and the homepage CTA never redirects to `/book`.

Normal online bookings use this single dialog:
- `https://theroyalglow.in` with no UTM → default first-touch source `organic`
- `https://theroyalglow.in/?book=1&utm_source=gmb` → Google Maps/GMB source `gmb`
- `https://theroyalglow.in/?book=1&utm_source=walkin` → in-store QR source `walkin`

Before Google OAuth redirect, store `book=1`, `utm_source`, and any UTM fields in session/local storage so onboarding can still assign the correct first-touch source after login. Organic, GMB, and in-store QR customers create a normal `booking` through this flow; they are not inserted into the `lead` table unless they first came through `/book`.

**Step 1 — Branch + Your Details + Date/Slot:**
| Field | Behaviour |
|-------|-----------|
| Branch | **Single branch (Phase 1):** hidden, auto-selects Rayasandra. **Multi-branch (future):** radio cards showing operational branches only. Non-operational branches hidden. |
| Name | Prefilled from profile. Not editable. |
| Email | Prefilled from profile. Not editable. |
| Gender | Prefilled from profile. Editable (in case of shared account). |
| Date | Date picker. Only future dates. Holidays/closures greyed out. |
| Time Slot | Available slots based on branch hours + staff schedules. Fully booked slots greyed out. |

**Step 2 — Choose Categories:**
| Element | Behaviour |
|---------|-----------|
| Salon / SPA toggle | Filter toggle — switches between Salon categories and SPA categories. **One booking = one type only** (Salon OR SPA). No cross-type bookings. This keeps Salon and SPA data cleanly separated for analytics. |
| Categories | Multi-select cards within the chosen type. |

**Salon Categories:**
1. Haircut & Styling
2. Hair Colouring / Treatment
3. Facial & Skincare
4. Waxing
5. Manicure & Pedicure
6. Makeup Services
7. **Hair SPA & Head Therapies** *(head massage, hair spa, scalp treatments)*

**SPA Categories:**
1. Standard SPA Service *(Swedish, Thai, Aroma Therapy)*
2. Premium SPA Service *(Lomi Lomi, Balinese, Deep Tissue)*
3. VVIP SPA Service *(Hot Stone, Kerala Potli, Synchronic, Body Polish, Body Scrub)*

**Step 3 — Choose Services:**
- Shows all services under the selected categories
- **SPA services with 60min and 90min variants** display as **one card** with a duration selector (60 min / 90 min). Customer picks the duration inline — not two separate cards.
- Salon services (single duration each) display as individual cards.
- Each service card: name, price (GST-inclusive), duration
- Multi-select — customer can pick multiple services
- Running total displayed at bottom: "3 services · ₹3,500.00"

**Step 4 — Booking Summary:**
| Element | Content |
|---------|---------|
| Status badge | **"Booking Submitted!"** (not "Confirmed" — it's pending until staff approves) |
| Note | "Our team will confirm your booking shortly." |
| Selected services | List with individual prices |
| Total amount | Sum, GST-inclusive. "Inclusive of 18% GST" label. |
| Payment note | "Payment: Pay at the salon (Cash / UPI / Card)" |
| Gems balance | "You have X gems — Browse Gems Catalogue →" (link to /gems) |
| Actions | "Go to Home" / "View My Bookings" |

#### 2c. Booking Status Lifecycle
```
Customer books → pending
                   ↓
         Receptionist/Manager
             ┌───┬───┐
         approves  rejects
             ↓        ↓
         confirmed  rejected (with reason)
             ↓
         in_progress (customer in salon)
             ↓
         completed (service done, invoice generated)
```

**Customer actions by status:**
| Status | Available Actions |
|--------|------------------|
| `pending` | Edit services, Reschedule (date/time), Cancel booking |
| `confirmed` | Reschedule, Cancel booking |
| `rejected` | View rejection reason, Book again |
| `in_progress` | None (service ongoing) |
| `completed` | View invoice, Leave feedback |
| `cancelled` | Book again |

#### 2d. Google Calendar Integration
- **Scope requested:** `calendar.events` via **incremental consent** — NOT at initial sign-in
- **When prompted:** After the customer's **first booking is confirmed** by staff: "Add your appointments to Google Calendar?" [Allow]
- **Event created:** Only when booking status changes to `confirmed`. Contains: service name(s), date, time, salon address, Google Maps link
- **Event updated:** On reschedule → calendar event updated. On cancel → calendar event deleted.
- **Why incremental:** Asking for Calendar access during sign-in shows a scary Google permissions screen and drops conversion. Asking after a successful booking confirmation is contextually appropriate.

#### 2e. Staff Assignment
- Customer does **not** select staff during booking
- Receptionist/Manager assigns staff to each service when approving the booking
- Customer can add an optional "Staff Preference" note in the booking notes field (e.g., "Prefer Anjali for haircut")
- After confirmation, the assigned staff appears on the booking detail in `/bookings`

#### 2f. Other Booking Features
- Real-time availability per staff member (receptionist view)
- Time-slot management with buffer time between appointments
- Walk-in booking by receptionist (skips pending → directly confirmed). Walk-in no-shows do **not** count toward the no-show tier — walk-ins are only created when the customer is already physically present at the salon.
- Booking confirmation email (via Resend) + push notification on status change
- Appointment reminders: 24h + 1h before (push + email)
- Waitlist for fully booked slots

---

### 2h. Cancellation & No-Show Policy

#### Cancellation by customer
| When | Consequence |
|------|-------------|
| More than 4 hours before appointment | Free cancellation. No record. Slot released immediately. |
| Within 4 hours of appointment | Tagged in CRM. `late_cancellation_count++`. Staff phones customer to understand reason. **No fee ever.** |
| After booking is `in_progress` | Not possible — service is already running. |

**Reschedule rules:**
- Customer can reschedule **up to 2 times** per booking
- Each reschedule must be at least **1 hour** before the original appointment time
- 3rd reschedule attempt is blocked — customer must cancel and re-book fresh
- Prevents slot-hoarding with repeated reschedules on premium time slots

#### No-show tiers
| Cumulative no-shows | Consequence |
|--------------------|-------------|
| 1st, 2nd, 3rd | `noshow_count++`. CRM note auto-added. No restriction. |
| **4th** (within 90 days of 1st) | `booking_requires_approval = true`. Manager must approve all future bookings. Push + email to customer. CRM tag: **"No-Show Risk"** applied. |
| **5th** (any time) | ⚠️ warning note added to all future bookings visible to receptionist: *"Repeated no-shows — verify before confirming."* Receptionist can override per-booking. |

**Automatic recovery:** Customer completes **3 consecutive bookings** without a no-show → `booking_requires_approval = false`, "No-Show Risk" tag removed. `consecutive_completed_bookings` resets to 0 on every no-show.

**Walk-ins:** No-show status on a walk-in does **not** count toward the no-show tier. Walk-in bookings are only created when the customer is physically present — there is no pre-booked slot to miss.

#### Cancellation by the salon
| When | Action |
|------|--------|
| < 2 hours before appointment | Apology push + email + priority rebooking offer. If an offer was applied to the booking — it is reinstated on their next booking (doesn’t expire). |
| > 2 hours before appointment | Apology push + email + reschedule link. |
| Membership session cancelled by salon | Hours **not** deducted from membership pool. |

---

### 2g. Offers & Combos
Active promotions displayed on `/offers`. Managed by owner/manager from admin panel.

**Offer types:**
| Type | Example | How It Works |
|------|---------|-------------|
| Percentage off | "20% off all Facials this week" | Discount applied to linked services |
| Flat discount | "₹500 off any Hair Treatment" | Fixed ₹ amount deducted |
| Combo price | "Hair + Facial + Manicure = ₹2,999" | Bundle price replaces individual service prices |

**Business rules:**
- One offer per customer per day (enforced in DB: unique customer + date)
- Offers have start_date and end_date — auto-activate and expire
- Offer applied at checkout by receptionist (not self-service during booking)
- Cannot combine with gems redemption on the same booking
- Offer terms displayed on each offer card (e.g., "Valid on weekdays only")

---

### 3. CRM & Customer Management
Manage the full customer relationship — existing customers, normal bookings, and campaign leads from Meta/Instagram ads.

#### 3a. Existing Customer Tracking
**Features:**
- Customer profiles: name, phone, email, DOB, gender, visit history
- Tags / segments (e.g., VIP, frequent visitor, inactive)
- Notes per customer (staff can add service notes after each visit)
- Customer lifetime value tracking
- Visit frequency analytics
- Revenue per customer (total spend across all visits)
- Acquisition source stored per customer (`organic`, `meta_ad`, `gmb`, `walkin`) with UTM fields when campaign data exists. This is first-touch attribution and should not be overwritten by later visits.

#### 3b. Lead Pipeline — `/admin/leads`
For prospects captured from Meta/Instagram ads through `/book` or Meta native lead webhooks. A normal customer who books through organic search/root-domain discovery, GMB, the in-store QR link, or direct navigation is a booking/customer, not a lead.

**Lead vs Booking — key distinction:**
| | Lead | Booking |
|--|------|--------|
| Created by | Meta/Instagram `/book` lead form or Meta native lead webhook | 4-step homepage booking dialog, organic/GMB/in-store QR customer, or receptionist walk-in entry |
| DB table | `lead` | `booking` |
| Slot reserved? | ❌ No | ✅ Yes |
| Sign-in required? | ❌ No for capture | ✅ Yes for customer self-booking; admin roles can create walk-ins |
| Next step | Customer continues to booking flow, or receptionist follows up if they drop off | Receptionist approves/assigns |
| Converts when | Customer submits a booking linked to the lead, or receptionist creates one after follow-up | Already a booking |
| Linked via | `lead.converted_booking_id` set on conversion | — |

**Primary flow — Option B: Website landing page (finalized)**

```
Meta ad (Facebook / Instagram)
    ↓
theroyalglow.in/book?utm_source=meta&utm_campaign=facial_may
    ↓ (Pixel: PageView fires; Lead fires after form submit)
Quick lead form — no sign-in required:
    • Name
    • Phone
    • Service interested in (dropdown: Haircut, Facial, Waxing, SPA, etc.)
    ↓ Submit
POST /api/leads → Lead row saved to Neon:
    • name, phone, service_interested_id
    • source = 'meta_ad'
    • utm_source, utm_campaign, utm_content (from URL params)
    • status = 'new', created_at = now()
CAPI Lead event fires to Meta (server-side)
    ↓
Browser redirects to the homepage booking dialog with the lead context preserved
    /?book=1&leadId={lead.id}
    ↓
Customer signs in/onboards if needed and submits the 4-step booking dialog
    ↓
POST /api/bookings → Booking row saved as `pending`
    ↓
lead.converted_booking_id set → lead status = 'booked'
    ↓
If the customer drops off, receptionist follows up from /admin/leads using phone/WhatsApp
```

**The `/book` page — design rules:**
- Dedicated route, fully separate from the main site
- Used only by Meta/Instagram ad traffic. Never link homepage CTAs, GMB, Google Maps, or the in-store QR to `/book`.
- **No navigation menu, no header links** — only one action on this page
- No sign-in prompt — cold traffic won't sign in
- Trust signals above the fold: Royal Glow name, 4.9★ 86 reviews, Bengaluru
- 3 fields only — Name, Phone, Service interest (dropdown)
- CTA button text: **"Continue to Booking"** (not "Submit" — tells them what happens next)
- After submit: brief thank-you message → redirect into the homepage booking dialog with the lead context
- Footer: address + phone only

**Wireframe:**
```
┌─────────────────────────────────────┐
│  Royal Glow Salon & Spa             │
│  ⭐ 4.9 · 86 reviews · Bengaluru    │
│                                     │
│  "Tell us what you're looking for"  │
│                                     │
│  Name    [________________]         │
│  Phone   [________________]         │
│  Service [Facial & Skincare    ▼]   │
│                                     │
│  [  Continue to Booking  ]          │
│                                     │
│  📍 Parappana Agrahara, Bengaluru   │
└─────────────────────────────────────┘
```

**Backup flow — Option A: Meta Native Lead Gen Form**

Used when running high-volume campaigns or before website is fully live. The form appears inside the Instagram/Facebook app (pre-filled from user's Meta profile — higher fill rate, lower friction). Downside: no website visit, so Pixel retargeting audiences do not build from this touchpoint.

```
Meta ad → Instant Form inside Instagram/Facebook app (pre-filled name/phone)
    ↓ User submits
Meta sends lead data via webhook → POST /api/webhooks/meta-leads
    • name, phone, service_interested_id (mapped from form questions)
    • ad_id, campaign_id, adset_id (for attribution)
    → Lead row saved to Neon (same schema as Option B)
CAPI Lead event fires (confirms receipt back to Meta)
    ↓
Same lead pipeline in /admin/leads; if the customer books on the website later, the lead is linked through `converted_booking_id`
```

The Neon schema, `/admin/leads` pipeline, and AiSensy workflow are **identical for both options** — only the data entry point differs (form submission vs Meta webhook).

**Lead status pipeline:**
`New Lead → Contacted → Follow-up → Booked → Won / Lost`

**Fields per lead:**
- Name, phone, email
- Service interested in
- UTM campaign / ad source (auto-captured from URL)
- Status (receptionist updates)
- Notes (call notes, preferences mentioned)
- Assigned to (receptionist / manager)
- Linked booking (once they convert)
- Created date, last contacted date

#### 3c. WhatsApp Lead Management — AiSensy
All WhatsApp conversations from Meta ads are managed through **AiSensy** (free tier — 1,000 conversations/month).

**What AiSensy provides:**
- Shared team inbox — receptionist and manager see all leads in one place
- Lead pipeline with status labels
- Agent assignment — specific leads assigned to specific staff
- Quick replies — pre-saved responses (menu link, pricing, directions)
- Broadcast messages — send offers to opted-in leads
- Meta Click-to-WhatsApp ad integration — lead data auto-captured

**Webhook integration:**
When lead status changes in AiSensy → webhook fires → Neon DB updated. Single source of truth stays in Neon.

#### 3d. Meta Ad Attribution
- **Meta Pixel** (browser-side) — fires PageView, ViewContent, Purchase events
- **Meta Conversions API / CAPI** (server-side, from Next.js API route) — reliable Purchase events unaffected by iOS privacy blocking or ad blockers
- UTM parameters stored on every customer and lead record at first touch
- Manager can query: *which campaign generated most revenue this month* — directly from Neon

---

### 4. Admin Portal

Internal tool for staff. Role-based access control (RBAC). URL: `theroyalglow.in/admin`

#### Role Hierarchy
```
Developer
    └─ Owner
        └─ Manager
            └─ Receptionist
                └─ Staff (Stylist / Therapist)
```

> Owner has a dedicated manager. If manager leaves, Owner assigns a different staff member as Manager. Owner does not manage day-to-day operations but has full access to everything.

#### Role Permissions Matrix

| Permission | Developer | Owner | Manager | Receptionist | Staff |
|-----------|:---------:|:-----:|:-------:|:------------:|:-----:|
| **Staff & User Management** | | | | | |
| Add / remove Owner | ✅ | ❌ | ❌ | ❌ | ❌ |
| Add / remove Manager | ✅ | ✅ | ❌ | ❌ | ❌ |
| Add / remove Receptionist | ✅ | ✅ | ✅ | ❌ | ❌ |
| Add / remove Staff (Stylist/Therapist) | ✅ | ✅ | ✅ | ❌ | ❌ |
| View all staff profiles | ✅ | ✅ | ✅ | ✅ (read-only) | ❌ |
| **Bookings** | | | | | |
| View all bookings (any staff) | ✅ | ✅ | ✅ | ✅ | ❌ |
| View own bookings only | ✅ | ✅ | ✅ | ✅ | ✅ |
| Accept / reject bookings | ✅ | ✅ | ✅ | ✅ | ❌ |
| Assign staff to bookings | ✅ | ✅ | ✅ | ✅ | ❌ |
| Create walk-in bookings | ✅ | ✅ | ✅ | ✅ | ❌ |
| Mark in_progress / completed | ✅ | ✅ | ✅ | ✅ | ❌ |
| Reschedule / cancel bookings | ✅ | ✅ | ✅ | ✅ | ❌ |
| Mark no-show | ✅ | ✅ | ✅ | ✅ | ❌ |
| Manage waitlist | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Billing & Invoicing** | | | | | |
| Generate invoices | ✅ | ✅ | ✅ | ✅ | ❌ |
| Edit line items on invoice | ✅ | ✅ | ✅ | ✅ | ❌ |
| Apply offers at checkout | ✅ | ✅ | ✅ | ✅ | ❌ |
| Mark payment received | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Service Catalog** | | | | | |
| Edit service prices | ✅ | ✅ | ✅ | ❌ | ❌ |
| Add / edit / delete services | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage gems catalogue | ✅ | ✅ | ✅ | ❌ | ❌ |
| **SPA Memberships** | | | | | |
| Create customer membership | ✅ | ✅ | ✅ | ✅ | ❌ |
| Edit membership (hours/price) at creation | ✅ | ✅ | ✅ | ✅ | ❌ |
| Record membership session | ✅ | ✅ | ✅ | ✅ | ❌ |
| Cancel a membership | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit membership tier defaults | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Offers & Promotions** | | | | | |
| Create / edit / delete offers | ✅ | ✅ | ✅ | ❌ | ❌ |
| **CRM & Leads** | | | | | |
| View customer profiles | ✅ | ✅ | ✅ | ✅ | ❌ |
| Add customer notes | ✅ | ✅ | ✅ | ✅ | ❌ |
| Tag customers | ✅ | ✅ | ✅ | ✅ | ❌ |
| View leads (/admin/leads) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Manage lead pipeline | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Scheduling & Leave** | | | | | |
| View all staff schedules | ✅ | ✅ | ✅ | ✅ | ❌ |
| Edit staff schedules | ✅ | ✅ | ✅ | ❌ | ❌ |
| Submit own leave request | ✅ | ✅ | ✅ | ✅ | ✅ |
| Approve / reject leave requests | ✅ | ✅ | ✅ | ✅ | ❌ |
| Mark day-off for any staff | ✅ | ✅ | ✅ | ✅ | ❌ |
| View own leave history | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Reports & Analytics** | | | | | |
| Financial reports (revenue, GST) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Salon analytics dashboard | ✅ | ✅ | ✅ | ❌ | ❌ |
| SPA analytics (separate from Salon) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Booking analytics | ✅ | ✅ | ✅ | ✅ (basic today's view) | ❌ |
| Staff performance metrics | ✅ | ✅ | ✅ | ❌ | ❌ |
| **System & Settings** | | | | | |
| System settings (salon info, GST, hours) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Integration management | ✅ | ❌ | ❌ | ❌ | ❌ |
| View error logs | ✅ | ❌ | ❌ | ❌ | ❌ |
| Payload CMS content | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Branch Management** | | | | | |
| Add / edit branches | ✅ | ✅ | ❌ | ❌ | ❌ |
| View branch details | ✅ | ✅ | ✅ | ✅ | ❌ |

#### Staff view (Stylist / Therapist)
Staff have a minimal, clean view focused only on their own work:
- Today's appointments (customer name, service, time, duration)
- Customer service notes relevant to their assigned booking (e.g., "allergic to ammonia")
- Own upcoming bookings (next 7 days)
- Own past completed bookings
- Submit leave request
- View own leave history and approval status
- **Cannot see:** other staff's bookings, customer contact details (phone/email), prices, invoices, any CRM data

#### Receptionist view
Full operational control of day-to-day business:
- Today's full booking dashboard (all staff)
- Walk-in booking creation
- Booking accept/reject/assign/reschedule
- Customer check-in and check-out
- Billing and invoice generation
- SPA membership creation and session recording
- Customer CRM notes and tagging
- Lead pipeline management
- Leave approval for all staff
- View all staff schedules

#### Manager view
All receptionist capabilities plus:
- Edit service prices and catalog
- Create/edit offers and promotions
- Edit membership tier defaults
- Cancel memberships
- Financial reports and analytics
- Staff performance metrics
- System settings

#### Owner view
All manager capabilities plus:
- Add/remove managers, receptionists, and staff
- Full business analytics and reporting

#### Developer view
All owner capabilities plus:
- Integration management (Ably, AiSensy, Meta Pixel, Sentry)
- Error log viewer
- System-level configuration

#### Staff Leave Approval Workflow

Leave requests use a **request → review → decision** model. The booking system uses `approval_status = 'approved'` as the only filter for blocking a staff member's availability — `pending` requests never block any slot.

**Leave statuses:**
| Status | Availability impact | Who sets it |
|--------|--------------------|-|
| `pending` | None — bookings unaffected | Staff (self-submit) |
| `approved` | **Blocks slot availability** for that date | Receptionist / Manager |
| `rejected` | None | Receptionist / Manager |

**Leave types:** Sick · Casual · Personal · Other

**Flow — staff self-submit:**
```
Staff submits leave request for a date
    ↓ approval_status = 'pending'
    ↓ Push + email → all Receptionists and Manager: "New leave request from [Name] for [date]"
    ↓
Receptionist / Manager reviews in /admin/leave
    ├── Approve
    │       ↓ approval_status = 'approved'
    │       ↓ Date now blocks staff availability in booking scheduler
    │       ↓ Push + email → staff: "Your leave on DD/MM/YYYY has been approved"
    │       ↓ If staff has confirmed bookings on that date:
    │         ⚠️ Warning shown: "[Name] has X confirmed booking(s) — reassign manually"
    │         (approval not blocked — reassignment is receptionist's task)
    │
    └── Reject (with reason)
            ↓ approval_status = 'rejected', rejection_reason stored
            ↓ Push + email → staff: "Your leave request was not approved: [reason]"
```

**Flow — admin direct mark-off:**

When a Receptionist/Manager directly creates a leave entry (e.g., marking a sick staff member absent same-day, recording a pre-approved absence):
- Entry created with `approval_status = 'approved'` immediately — no pending step
- Existing confirmed bookings on that date are flagged in the dashboard for manual reassignment
- Receptionist reassigns each booking to another available staff member

**Staff self-service rules:**
- Can submit leave for any future date
- Can **withdraw** a `pending` request (before review) — sets status to withdrawn, no notification needed
- Cannot withdraw or cancel an `approved` leave — must contact Manager
- `/admin/leave` shows own leave history with full status trail

#### Admin Route Map

All admin routes are under `theroyalglow.in/admin`. Access to each route is enforced by the RBAC matrix above — unauthenticated or under-privileged requests redirect to `/admin/login`.

| Route | Page | Min. Role |
|-------|------|-----------|
| `/admin` | Dashboard — today's overview: bookings, revenue, pending actions | Receptionist |
| **Bookings** | | |
| `/admin/bookings` | All bookings list — filterable by status, date, staff, type (Salon/SPA) | Receptionist |
| `/admin/bookings/new` | Create walk-in booking | Receptionist |
| `/admin/bookings/[id]` | Booking detail — approve/reject, assign staff, mark status, view notes | Receptionist |
| `/admin/waitlist` | Waitlist management — promote to booking when slot opens | Receptionist |
| **Customers (CRM)** | | |
| `/admin/customers` | Customer list — search, filter by tag, sort by LTV / visit count / no-show count | Receptionist |
| `/admin/customers/[id]` | Customer profile — booking history, invoices, notes, tags, no-show tier, membership | Receptionist |
| **Leads** | | |
| `/admin/leads` | Lead pipeline — New → Contacted → Follow-up → Booked → Won/Lost | Receptionist |
| `/admin/leads/[id]` | Lead detail — notes, UTM source, WhatsApp thread link, linked booking | Receptionist |
| **Staff** | | |
| `/admin/staff` | Staff list with designation, schedule status | Manager |
| `/admin/staff/new` | Add new staff member | Manager |
| `/admin/staff/[id]` | Staff profile — schedule, leave history, performance summary | Manager |
| **Schedule & Leave** | | |
| `/admin/schedule` | Weekly/daily staff schedule view — all staff availability at a glance | Receptionist |
| `/admin/leave` | Leave requests — approve/reject, view all staff leave calendar | Receptionist |
| **Service Catalog** | | |
| `/admin/services` | All services grouped by category — Salon and SPA | Manager |
| `/admin/services/new` | Add new service (name, category, price, duration, gems config) | Manager |
| `/admin/services/[id]` | Edit service — price, duration, gems redeemable/required/catalogue order | Manager |
| **Offers & Promotions** | | |
| `/admin/offers` | All offers list — active, scheduled, expired | Manager |
| `/admin/offers/new` | Create offer (percentage, flat, combo price) with linked services and validity | Manager |
| `/admin/offers/[id]` | Edit or deactivate offer | Manager |
| **SPA Memberships** | | |
| `/admin/memberships` | All memberships — active, expired, cancelled. Filter by tier. | Receptionist |
| `/admin/memberships/new` | Create membership for a customer — tier, hours, price, start date | Receptionist |
| `/admin/memberships/[id]` | Membership detail — session history, hours used/remaining, record session, cancel | Receptionist |
| **Billing & Invoicing** | | |
| `/admin/billing` | All invoices — filterable by type (service, membership_purchase, membership_session), date | Receptionist |
| `/admin/billing/[id]` | Invoice detail — line items, GST breakdown, PDF preview, resend email | Receptionist |
| **Reports & Analytics** | | |
| `/admin/reports` | Analytics overview — revenue KPIs, top services, busiest slots | Manager |
| `/admin/reports/financial` | Financial report — daily/monthly revenue, GST summary, Cash / UPI / Card breakdown | Manager |
| `/admin/reports/salon` | Salon analytics — service breakdown, category performance | Manager |
| `/admin/reports/spa` | SPA analytics — membership utilisation, session frequency, tier distribution | Manager |
| `/admin/reports/staff` | Staff performance — bookings per staff, revenue attributed, utilisation rate | Manager |
| `/admin/reports/leads` | Lead analytics — conversion rate, revenue per Meta campaign, pipeline funnel | Manager |
| **Settings** | | |
| `/admin/settings` | System settings — salon info, GST number, business hours, policy config keys (cancellation window, no-show thresholds etc.) | Manager |
| `/admin/users` | User management — list all users, assign/change roles, suspend/ban, view sessions | Owner |
| **Developer only** | | |
| `/admin/integrations` | Integration management — Ably, AiSensy, Meta Pixel/CAPI, Sentry config | Developer |
| `/admin/logs` | Error log viewer — Sentry-sourced, filterable by severity | Developer |

---

### 5. Billing & Invoicing

Billing differs between Salon and SPA. Both use the same invoice system but with different flows.

#### 5a. Salon Billing
**Payment method: Cash / UPI / Card (no online payment gateway integration).**

No online payment gateway at launch. Payment is collected physically by the receptionist (cash, customer scans store UPI QR, or card swipe machine). The receptionist selects the payment mode at checkout. The system handles everything digital around it.

**Flow:**
1. Booking marked `completed` by receptionist
2. Receptionist applies any offer (if applicable) — max 1 per customer per day
3. Receptionist enters: amount received, payment mode (Cash / UPI / Card)
4. `service` invoice generated: itemised services, back-calculated GST, total GST-inclusive
5. Gems earned: `floor(total_rupees × 0.01)`
6. PDF invoice generated → emailed to customer via Resend

**Features:**
- Receptionist marks payment as received at checkout (selects Cash, UPI, or Card)
- Generate branded PDF invoice on checkout
- Email invoice automatically to customer via Resend (with PDF attachment)
- Invoice includes: service(s), staff, duration, amount (GST-inclusive), payment mode, date, Royal Glow branding
- Revenue tracking per service / staff member / day
- Daily sales summary emailed to owner via pg_cron nightly job (includes Cash / UPI / Card breakdown)

#### 5b. SPA Billing — Non-Member
Identical to Salon billing. Per-service individual pricing (see SPA Service Seed Data in database-schema.md). Gems earned normally.

#### 5c. SPA Billing — Membership Session
Session cost: **₹0**. Invoice type: `membership_session`.
- `membership_session` invoice (\u20b90) is a usage record, not a payment
- Shows: service performed, staff, duration, hours used, hours remaining, membership expiry
- **No gems earned** on membership sessions
- Emailed to customer as session confirmation

#### 5d. SPA Billing — Membership Purchase
Lump sum invoice at time of membership creation. Invoice type: `membership_purchase`.
- Amount: negotiated price (based on tier default, overridable)
- GST-inclusive, SAC 999721
- **No gems earned** on membership purchases
- Emailed as a membership welcome invoice

**Why no online payment gateway at launch:**
- Zero online gateway fees (Razorpay/Cashfree charge 2–3% per transaction)
- Zero integration complexity — no webhook handling, no refund flows, no PCI compliance overhead
- UPI is handled directly (customer scans store QR) — receptionist just records the mode
- Card is handled via physical swipe machine — receptionist records the mode
- Typical for premium Indian salons at this stage

**Future Phase 2 — Online Payment (if needed):**
When online pre-payment or advance booking deposits are needed, integrate **Razorpay** or **Cashfree**. Schema already accommodates this via `payment_method` enum (`online`) and `payment_reference` column.

---

### 6. SPA Memberships

SPA memberships are purchased packages of hours. Members can book any SPA service using their hours pool.

**Membership tiers:**
| Tier | Default Hours | Default Price | Default Validity |
|------|-------------|---------------|------------------|
| Silver | 8 hours | ₹10,000 | 90 days |
| Gold | 15 hours | ₹15,000 | 90 days |
| Platinum | Set by Owner/Manager | Set by Owner/Manager | Set by Owner/Manager |

All tiers give access to **all SPA services** (Standard, Premium, VVIP). Hours are the only constraint.

**Branch-locked:** Membership sessions can only be recorded at the branch where the membership was purchased. If a customer wants SPA hours at a different branch, they need a separate membership for that branch.

**Creating a membership:**
- Admin (Receptionist/Manager/Owner/Developer) goes to `/admin/memberships/new`
- Selects customer, selects tier
- Hours and price are pre-filled from tier defaults — **fully overridable** at creation (negotiated deals)
- Sets start date (defaults to today)
- Expiry auto-calculated: `start_date + validity_days`
- Membership created → `membership_purchase` invoice generated (₹ amount)
- Invoice emailed to customer via Resend
- Customer notified: "Your Royal Glow SPA Membership is active!"
- **No gems earned on membership purchase**

**Recording a session:**
- Admin goes to `/admin/memberships` → find customer → Record Session
- Selects service(s) performed, confirms duration
- System validates remaining hours before allowing
- Booking record created (status: `completed`, total: ₹0, `is_membership_session: true`)
- `membership_session` invoice (₹0) emailed to customer
- Hours deducted from membership pool
- **No gems earned on membership sessions**

**Customer view (`/membership` page):**
- Active membership: Tier name, Membership ID (#RGMEM26XXXXX)
- Hours: X hrs used / Y hrs total / Z hrs remaining (with visual progress bar)
- Valid until: DD/MM/YYYY
- Session history: list of all sessions with date, service, duration
- Past memberships (expired/cancelled) shown in a collapsed section

**Expiry reminders (automated):**
| Trigger | Message |
|---------|---------|
| 30 days before expiry | "Your membership expires in 30 days. X hours remaining." |
| 7 days before expiry | "Urgent: Expires in 7 days. Book your remaining hours!" |
| 1 day before expiry | "Last chance: Expires tomorrow. Unused hours will be forfeited." |
| Hours < 60 min remaining | "Less than 1 hour left on your membership." |

**Hard expiry:** Unused hours are forfeited after `expires_at`. No rollover.

---

### 7. Marketing Automation
**Features:**
- Post-service follow-up email (automated, sent via Brevo)
- Promotional campaign emails (bulk, via Brevo)
- Birthday offers by email + notification (auto-triggered on customer DOB)
- Re-engagement email for customers inactive > 60 days
- Marketing consent management (opt-in / opt-out on onboarding form)
- WhatsApp broadcast to opted-in leads via AiSensy
- Campaign-to-revenue tracking via UTM attribution in Neon

---

### 8. Analytics Dashboard
**Features:**
- Daily / weekly / monthly revenue
- Most booked services
- Busiest time slots
- Customer acquisition and retention rates
- Staff utilization rates
- Marketing email open/click rates (from Brevo)
- **Lead conversion rate** — leads from Meta ads → bookings
- **Revenue per Meta campaign** — which ad spend actually converted to paying customers
- **Lead pipeline status overview** — open leads, follow-ups due, conversion funnel

---

### 9. User Management (Admin)
Custom `/admin/users` page built on Better Auth admin APIs.

**Features:**
- List all users (customers + staff)
- Assign / change roles
- Suspend / ban accounts
- View session history
- Filter by role, status, signup date

---

### 10. PWA (Progressive Web App)
The site is installable on a customer's phone — icon on homescreen, app-like experience, no app store.

**Features:**
- `manifest.json` with Royal Glow branding, theme colour, icons
- Service worker caches: service menu + prices, contact page, hours, gallery thumbnails, homepage shell
- Offline access to cached content (service menu, contact, prices) — works on bad network
- Add-to-homescreen prompt shown after 2nd visit (not first — first visit feels pushy)
- Custom branded prompt using `beforeinstallprompt` event, not the browser's default banner

**What works offline:** Service menu, prices, contact, hours, gallery thumbnails
**What doesn't:** Booking, profile, admin — these need the server

---

### 11. Push Notifications (Web Push API)
Browser push notifications for appointment reminders — no app required, works via PWA service worker.

**Notifications sent:**
| Notification | Timing | Content |
|-------------|--------|--------|
| Appointment reminder | 24h before | "Your [service] at Royal Glow is tomorrow at [time]" |
| Appointment reminder | 1h before | "Your appointment at Royal Glow starts in 1 hour" |
| Booking confirmed | Immediately | "Booking confirmed! [service], [date], [time]" |
| Booking rescheduled | Immediately | "Your appointment has been moved to [new time]" |

**Permission strategy:**
- Never ask on first page load (users auto-deny)
- Ask after successful booking: "Want a reminder 1 hour before your appointment?"
- Context-appropriate prompt → 3–5x higher opt-in rate

**Technical flow:**
1. Customer allows notifications → push subscription saved to Neon DB
2. QStash scheduler runs every 15 min → finds bookings in next 24h/1h without matching reminder notifications
3. Sends push via Web Push API (`web-push` npm library)
4. Customer taps notification → opens booking detail page

**Cost: ₹0** — Web Push API is free, unlimited, built into every modern browser.

---

### 12. Image Optimization
Premium salon = high-quality gallery. All images served in next-gen formats with zero layout shift.

**Strategy:**
| Layer | What It Does |
|-------|-------------|
| Next.js `<Image>` | Auto WebP/AVIF conversion, responsive `srcset`, lazy loading by default |
| Cloudflare Polish | Auto-compresses images at edge (free plan, lossless) |
| Cloudflare R2 | Serves gallery/service images — no egress fees |
| Blur placeholder | `placeholder="blur"` on gallery images — premium feel during load |

**Rules:**
- Upload originals at 2000px max width
- Next.js generates responsive variants: 640, 750, 1080, 1200, 1920
- Format: WebP served to modern browsers, AVIF where supported, JPEG fallback
- Above-fold images: `priority={true}` (preloaded, no lazy loading)
- Below-fold: lazy loading (Next.js default)
- Every image: explicit `width` + `height` attributes (CLS = 0)
- Every image: descriptive `alt` text
- No paid image CDN needed — Cloudinary/Imgix are for millions of images, not a salon gallery of 50–200 images

---

### 13. Accessibility (a11y)
WCAG 2.1 AA compliant across the entire site. Required for Lighthouse 100% Accessibility score.

**Standards:** WCAG 2.1 Level AA

**Requirements:**
| Area | Implementation |
|------|---------------|
| Keyboard navigation | Full site operable without a mouse. Tab order follows visual layout. No keyboard traps. |
| Focus management | Visible focus ring on all interactive elements. Focus moved to modal/dialog on open, returned on close. |
| ARIA labels | All icon buttons, form fields, and non-obvious elements have `aria-label` or `aria-labelledby`. |
| Colour contrast | Minimum 4.5:1 for normal text, 3:1 for large text (WCAG AA). Verified with design tokens. |
| Semantic HTML | `<nav>`, `<main>`, `<header>`, `<footer>`, `<section>`, `<article>` — not just `<div>` everywhere. |
| Skip links | "Skip to main content" hidden link at top of page — visible on focus for keyboard users. |
| Alt text | Every `<Image>` has descriptive `alt` text. Decorative images: `alt=""`. |
| Form errors | Errors announced via `aria-live="polite"`. Inputs linked to error messages via `aria-describedby`. |
| Motion | Animations respect `prefers-reduced-motion`. No auto-playing video. |
| Touch targets | Minimum 44×44px touch targets on all interactive elements (WCAG 2.5.5). |

**Tooling:**
- **Lighthouse CI** — Accessibility score must be 100 to pass CI gate
- **Vitest + axe-core** (`@axe-core/react`) — automated a11y checks in unit tests
- **Playwright** — keyboard navigation E2E tests (tab through booking flow)
- **Manual** — screen reader check (NVDA/VoiceOver) before each major release

---

### 14. Branch Management

Multi-branch support for future expansion. Currently single-branch (Rayasandra).

**Admin page:** `/admin/branches` (Owner + Developer only)

**Branch fields:**
| Field | Description |
|-------|-------------|
| Number | Single digit (1, 2, 3…). Used in invoice numbers (`INV-1-...`). |
| Code | 2-char uppercase (`RS`, `MH`). Used in booking numbers (`BK-RS-...`). |
| Name | Display name: "Rayasandra", "Marathahalli" |
| Address | Full address (line1, line2, city, state, pincode) |
| Phone | Branch-specific phone |
| Email | Branch-specific email (optional) |
| Google Maps | URL + Place ID for embed + reviews |
| GPS | Latitude + Longitude |
| Status | `operational` / `temporarily_closed` / `opens_soon` / `shutdown` |
| Close reason | Why temporarily closed (shown to customers) |
| Opening date | When branch opened or will open |
| Primary | One branch is marked primary (auto-selected in single-branch booking) |

**Note:** All branches share the same operating hours (defined in the global `business_hour` table). No per-branch hour overrides.

**Status behaviour:**
| Status | Visible to customers | Bookable |
|--------|---------------------|----------|
| `operational` | ✅ Yes | ✅ Yes |
| `temporarily_closed` | ✅ Yes (with reason banner) | ❌ No |
| `opens_soon` | ✅ Yes (greyed out with label) | ❌ No |
| `shutdown` | ❌ Hidden | ❌ No |

**Staff are NOT branch-scoped.** All stylists/therapists appear in the assignment dropdown regardless of branch. With a small team this is intentionally simple — receptionist assigns based on designation (Stylist for Salon, Therapist for SPA).

**Reference numbers with branch:**
- Booking: `#BKRS2605H38291` (branch code embedded)
- Invoice: `#INV1262792921` (branch number embedded)
- Membership: `#RGMEM26190872` (branch number embedded — sessions at originating branch only)

---

### 15. Legal Pages
Required by Indian law (DPDP Act 2023) and standard business practice.

**Pages:**
| Page | URL | Why Required |
|------|-----|--------------|
| Privacy Policy | `/privacy` | Mandatory under India's Digital Personal Data Protection Act 2023. Explains what data is collected, how it's used, stored, shared. Required before collecting any personal data. |
| Terms of Service | `/terms` | Business protection. Governs use of the site and services. |
| Cookie Consent Banner | Site-wide (banner component) | Required for cookies beyond strictly necessary (analytics, marketing pixels). DPDP Act + GDPR standard. |
| Refund & Cancellation Policy | `/refund-policy` | Required for any service business. Explains cancellation window, no-show policy, rescheduling rules. |

**Cookie Consent — Categories:**

| Category | Always On | What it covers | Default |
|----------|-----------|----------------|---------|
| **Necessary** | ✅ Yes | Better Auth session cookie, CSRF token | Always ON — non-interactive |
| **Analytics** | ❌ No | PostHog (product analytics), Microsoft Clarity (heatmaps + session recordings) | OFF |
| **Marketing** | ❌ No | Meta Pixel (ad attribution), Meta CAPI (server-side conversion events) | OFF |

**Banner design — Two-tier (no paid tool):**

**When the banner shows:**
- First visit with no `rgss_cookie_consent` in localStorage (unauthenticated visitors)
- Signed-in users: banner is **suppressed** for any category already consented to at onboarding
  - Both checked at onboarding → banner never shows for that user
  - Only marketing checked → banner skips the analytics row; shows marketing toggle only
  - Nothing checked → full banner shows as normal
- Re-shown after 365-day expiry

**Visual hierarchy (nudge-friendly, legally compliant):**
- **`[Accept All]`** — full-width solid button, brand primary colour, prominent size
- **`[Reject All]`** — ghost/outline button, same row, visually secondary
- **`Manage Preferences ›`** — small text link, right-aligned or below buttons
- Copy (warm, not scary):
  > _"We use cookies to improve your experience and show you relevant offers.
  > You're in control — change your preferences any time."_

**Level 1 (default view):**
- Floating bar at bottom of screen
- Contains: copy + `[Accept All]` + `[Reject All]` + `Manage Preferences ›`
  - "Accept All" → `analytics: true`, `marketing: true`, bar dismisses
  - "Reject All" → `analytics: false`, `marketing: false`, bar dismisses
  - "Manage Preferences ›" → expands inline to Level 2

**Level 2 (expanded, in-place):**
- Three rows, each with a labelled toggle:
  - _Necessary_ — "Session & security" — toggle locked ON, greyed out, non-clickable
  - _Analytics_ — "Improve Royal Glow (PostHog, Clarity)" — toggle default OFF
  - _Marketing_ — "Personalised offers (Meta Pixel)" — toggle default OFF
  - `[Save Preferences]` button saves and dismisses

**Storage:**
```json
{ "v": 1, "analytics": false, "marketing": false, "ts": 1716163200000 }
```
- Key: `rgss_cookie_consent`, 365-day expiry
- Footer link "Cookie Preferences" re-opens the banner at any time
- PostHog and Clarity only initialise after `analytics: true`
- Meta Pixel and Meta CAPI only fire after `marketing: true`
- No `Cookiebot` / `OneTrust` needed — custom component, zero dependency

**DPDP Act key requirements covered:**
- Clear notice of what data is collected (Privacy Policy)
- Purpose limitation — data used only for stated purposes
- User consent before analytics tracking (analytics checkbox on onboarding → seeds `analytics` flag, PostHog/Clarity load immediately for that user)
- User consent before marketing emails and ad attribution (marketing checkbox on onboarding → seeds `marketing` flag, Meta Pixel/CAPI enabled)
- Right to access/delete personal data (handled via `/profile` or support email)
- Data localisation — Neon DB + Render hosted in Singapore (closest compliant region)

---

## User Journey Map

### Customer Journey
```
Discovery → Visit theroyalglow.in → Sign in (Google OAuth)
→ First time: /onboarding (name, phone, DOB, gender, consent)
→ Homepage: "Book Now" button opens the 4-step booking dialog
→ Dialog Step 1: date & time slot
→ Dialog Step 2: Salon/SPA toggle → select categories
→ Dialog Step 3: select services from categories
→ Dialog Step 4: "Booking Submitted!" summary (total GST-inclusive, "Pay at salon")
→ Booking in pending status
→ Receptionist approves → status: confirmed
→ Push notification + email: "Booking confirmed!"
→ Google Calendar event created (if Calendar access granted)
→ Push reminder 24h + 1h before
→ Visit salon → Service completed → Invoice (email + PDF)
→ Gems earned on paid amount
→ Follow-up marketing email (if opted in)
→ 2nd visit prompt: "Add Royal Glow to homescreen"
```

### Staff Journey
```
Log in → View today's schedule 
→ Customer arrives → Check in 
→ Complete service → Add notes 
→ Manager generates invoice → Customer checks out
```

### Owner Journey
```
Log in → View business dashboard 
→ Review analytics → Manage staff 
→ Send marketing campaign → Review reports
```

---

## Out of Scope (Current Phase)

- Payment gateway integration *(Phase 2 — Razorpay or Cashfree when online pre-payment is needed)*
- Mobile app *(future phase — PWA covers the need at launch)*
- Inventory management *(future phase)*
