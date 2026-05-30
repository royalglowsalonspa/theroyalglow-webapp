# Feature Implementation Guide

## Application Scope

| Module | Description |
|--------|-------------|
| Customer Website | Homepage, services, offers, about, contact, blog, FAQ |
| Booking System | 4-step dialog, status lifecycle, reschedule/cancel |
| Admin Portal | RBAC-gated, 6 roles, booking mgmt, billing, CRM |
| SPA Memberships | Silver/Gold/Platinum tiers, hour-based sessions |
| Loyalty (Gems) | Earn 1%/floor, catalogue redemption, 365-day expiry |
| CRM & Leads | Customer profiles, Meta ad lead pipeline, WhatsApp |
| Billing | GST-compliant invoices, PDF generation, email delivery |
| Scheduling | Staff schedules, leave request/approval workflow |
| Notifications | Web Push API + email (Resend/Brevo) |
| Realtime | Ably channels for live booking status, queue board |

---

## Customer Booking Flow

### 4-Step Dialog (over homepage, NOT a separate page)

1. **Branch + Details + Date/Slot** — name/email prefilled (not editable), date picker, time slot
2. **Choose Categories** — Salon/SPA toggle (one type per booking), multi-select categories
3. **Choose Services** — Service cards with multi-select, running total at bottom
4. **Summary** — "Booking Submitted!" (status: pending), services list, total, payment note

**Entry points:**
- Homepage "Book Now" button → opens dialog
- `/?book=1` deep-link → auto-opens dialog
- `/?book=1&utm_source=gmb` → dialog + source attribution
- `/?book=1&utm_source=walkin` → dialog + walk-in attribution

**NEVER redirect to `/book`** from homepage CTAs. `/book` is Meta ad lead capture only.

### Booking Numbering

Format: `BK-{branch_code}-{YYMM}-{H|S}-{5_random}[-M]`
- H = salon (hair/beauty), S = spa
- -M suffix for membership sessions

---

## Admin Portal (RBAC)

### Role Hierarchy

```
Developer → Owner → Manager → Receptionist → Staff → Customer
```

### Key Route → Role Mapping

| Route | Min. Role |
|-------|-----------|
| `/admin` (dashboard) | Receptionist |
| `/admin/bookings` | Receptionist |
| `/admin/customers`, `/admin/leads` | Receptionist |
| `/admin/billing` | Receptionist |
| `/admin/services`, `/admin/offers` | Manager |
| `/admin/staff`, `/admin/schedule` | Manager |
| `/admin/reports` | Manager |
| `/admin/settings`, `/admin/branches` | Manager (branches: Owner) |
| `/admin/users` | Owner |
| `/admin/integrations`, `/admin/logs` | Developer |

---

## SPA Memberships

- **Tiers:** Silver (8hrs/₹10k/90d), Gold (15hrs/₹15k/90d), Platinum (custom)
- **Access:** All SPA services in any tier — hours are the only constraint
- **Session recording:** Admin records → booking(completed, ₹0) + membership_session invoice
- **No gems** on purchase OR sessions
- **One active per customer** (DB constraint)
- **Hard expiry** with reminders at 30d/7d/1d

---

## Lead Pipeline (`/book` → Meta Ad Leads)

```
Meta ad → theroyalglow.in/book → 3-field form (name, phone, service)
  → POST /api/leads → lead row (source: meta_ad) + CAPI Lead event
  → Redirect to /?book=1&leadId={id}
  → Customer books → lead.converted_booking_id set → status: booked
```

**Lead statuses:** New → Contacted → Follow-up → Booked → Won/Lost

---

## Offers & Combos

- **Types:** percentage, flat, combo_price
- **Rules:** 1 offer/customer/day, applied at checkout by receptionist, cannot combine with gems
- **Salon only** (not SPA memberships)
- Auto-expire via pg_cron Job 3

---

## No-Show Policy

| Count | Action |
|-------|--------|
| 1-3 | CRM tag "No-Show Risk", no restriction |
| 4+ (within 90 days) | `booking_requires_approval = true` → Manager must approve |
| Recovery | 3 consecutive completed bookings → reset |

Walk-in no-shows do NOT count toward the tier.

---

## Background Jobs (19 Total)

**pg_cron (7):** Nightly sales summary, membership expire, offer expire, session cleanup, preprod sync, monthly GST, gems expire

**QStash Scheduled (8):** Appointment reminders (15min), membership expiry alerts, birthday emails, membership usage nudges, lead follow-ups, daily sales report, weekly report, gems expiry reminder

**QStash Triggered (4):** Post-service follow-up (+24h), stale pending alert (+2h), no-show check (+15min), membership expired notice (+1h)

---

## Realtime (Ably Channels)

- `booking:{bookingId}` — status changes
- `admin:bookings:{branchId}` — new/updated bookings for admin dashboard
- `admin:schedule:{date}` — staff schedule changes
- Token Auth (scoped per role)

---

## Email Strategy

| Type | Provider | Triggered By |
|------|----------|-------------|
| Invoice + booking confirmation | Resend | Synchronous in API request |
| Appointment reminders | Resend | QStash Job 8 |
| Birthday offers | Brevo | QStash Job 10 |
| Post-service follow-up | Brevo | QStash Job 16 (+24h) |
| Re-engagement | Brevo | Brevo automations (not our job) |

---

## Payment (Phase 1)

- Cash / UPI / Card at the counter — no online gateway
- Receptionist marks payment received + selects method
- Invoice generated inline → PDF → emailed immediately via Resend

---

## Reference

- #[[file:features.md]] — Complete feature specifications
- #[[file:background-jobs.md]] — All 19 jobs with SQL/schedules
- #[[file:authentication.md]] — Auth & RBAC design
- #[[file:design/README.md]] — UI wireframes and design specs
- #[[file:features/favourite-services.md]] — Favourite services feature spec
