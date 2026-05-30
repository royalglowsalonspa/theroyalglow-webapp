# Database Conventions & Schema

## Technology

- **Database:** Neon PostgreSQL 16 (serverless, branching, pg_cron)
- **ORM:** Drizzle ORM (pure TypeScript, edge-native, no binary)
- **Schema location:** `packages/db/schema/`
- **Migrations:** `packages/db/migrations/` (drizzle-kit generated)
- **Queries:** `packages/db/queries/`

---

## Conventions (MANDATORY)

| Convention | Rule |
|-----------|------|
| **Primary keys** | `text` — app-generated via `nanoid()` or `cuid2()`. NO auto-increment serial. |
| **Money** | `integer` in **paise** (₹1,000.00 = `100000`). NO floating point. |
| **Timestamps** | `timestamptz` everywhere. Stored UTC, displayed IST (UTC+5:30). |
| **Date display** | DD/MM/YYYY (`en-IN` locale) via `Intl.DateTimeFormat('en-IN')`. |
| **Currency display** | Indian numbering: `₹1,00,000.00` via `Intl.NumberFormat('en-IN')`. Always 2 decimals. |
| **Naming** | `snake_case` for tables and columns. Singular table names (`booking` not `bookings`). |
| **Enums** | PostgreSQL native `CREATE TYPE` enums. Defined in `packages/db/schema/enums.ts`. |
| **Soft deletes** | NOT used. Hard deletes with `audit_log` tracking. |
| **Foreign keys** | All FKs use appropriate `ON DELETE` (CASCADE for children, RESTRICT for references). |
| **Indexes** | Explicit on all FK columns, all WHERE/ORDER BY columns, composite for common patterns. |
| **Snapshots** | Price + service name frozen on `booking_service` and `invoice_item`. |
| **GST** | All prices GST-inclusive (18%, SAC 999721). Back-calc: `base = price ÷ 1.18`. |

---

## Schema Files (15)

```
packages/db/schema/
├── enums.ts           ← All PostgreSQL enums
├── auth.ts            ← user, session, account, verification (Better Auth managed)
├── profile.ts         ← customer_profile, staff_profile
├── service.ts         ← service_category, service, service_staff
├── schedule.ts        ← staff_schedule, staff_time_off, holiday, waitlist
├── booking.ts         ← booking, booking_service, booking_status_log, waitlist
├── invoice.ts         ← invoice, invoice_item
├── membership.ts      ← spa_membership, spa_membership_tier
├── offer.ts           ← offer, offer_service, offer_redemption
├── lead.ts            ← lead, lead_note
├── crm.ts             ← customer_tag, customer_tag_assignment, customer_note
├── loyalty.ts         ← loyalty_account, loyalty_transaction
├── notification.ts    ← notification, push_subscription
├── branch.ts          ← branch
└── system.ts          ← daily_sales_summary, monthly_gst_summary, audit_log, system_setting
```

---

## Key Enums

```typescript
// booking_status: pending → confirmed/rejected → in_progress → completed
// lead_status: new → contacted → follow_up → booked → won/lost
// payment_method: cash | upi | card | online
// invoice_type: service | membership_purchase | membership_session
// service_type: salon | spa
// discount_type: percentage | flat | combo_price
// spa_membership_status: active | expired | cancelled
// leave_approval_status: pending | approved | rejected
// staff_designation: receptionist | stylist | therapist | manager
// gender: male | female | other | prefer_not_to_say
// branch_status: operational | temporarily_closed | opens_soon | shutdown
```

---

## ID/Number Formats

| Entity | Format | Example |
|--------|--------|---------|
| Booking | `BK-{branch_code}-{YYMM}-{H\|S}-{5_random}[-M]` | `BK-RS-2605-H-38291` |
| Invoice | `INV-{branch_number}-{financial_year}-{5_digit_random}` | `INV-1-2627-92921` |
| Membership | `RG-MEM-{YY}-{branch_number}-{5_random}` | `RG-MEM-26-1-90872` |

---

## Connection Strategy

```typescript
// Pooled connection (app queries — via Neon pgBouncer)
import { db } from '@repo/db'

// Unpooled/direct connection (migrations only)
// Used by: drizzle-kit push/migrate
```

---

## GST Calculation

```typescript
const GST_RATE = 0.18

// Back-calculate from inclusive price
function splitGST(inclusivePaise: number) {
  const basePaise = Math.round(inclusivePaise / (1 + GST_RATE))
  const gstPaise = inclusivePaise - basePaise
  return { basePaise, gstPaise, totalPaise: inclusivePaise }
}
```

---

## Gems (Loyalty) Rules

- **Earn:** 1 gem per ₹100 invoiced (floor). Only on `invoice_type = 'service'`.
- **NO gems** on membership purchases or membership sessions.
- **Expiry:** 365 days from earn date. Auto-expired by pg_cron Job 7.
- **Redemption:** Against specific catalogue services only, NOT a ₹ discount.
- **Cannot combine** with offers on the same booking.

---

## Booking Lifecycle

```
pending → confirmed/rejected → in_progress → completed
                                              ↗ cancelled (from pending/confirmed)
                                              ↗ no_show (from confirmed, +15min after end_time)
                                              ↗ rescheduled (from confirmed)
```

Walk-ins skip `pending` → directly `confirmed`.

---

## Key Business Rules (DB-Level)

- **One offer per customer per day** (unique constraint: customer + date on `offer_redemption`)
- **One active membership per customer** (UNIQUE index on customer_id WHERE status='active')
- **Booking = one service_type only** (salon OR spa, never mixed)
- **Money: no floating point** — all calculations in paise, round at display only
- **Snapshot prices** — `booking_service.price_at_booking_paise` and `invoice_item.unit_price_paise` are frozen copies

---

## Reference

- #[[file:database-schema.md]] — Full table definitions, column specs, all indexes
- #[[file:system-design/LLD.md]] — Detailed SQL, state machines, sequence diagrams
