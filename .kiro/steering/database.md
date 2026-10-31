# Database Conventions & Schema

## Technology

- **Database:** Neon PostgreSQL 16 (serverless, branching)
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
| **GST** | All prices GST-inclusive, at the branch's rate in force for the line's SAC code (`branch_tax_version`); see GST Calculation. |

---

## Schema Files (main ones)

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
├── branch-setting.ts  ← branch_setting (each branch's hours and booking rules, as revisions)
├── tax.ts             ← branch_tax_version, invoice_sequence
└── system.ts          ← daily_sales_summary, monthly_gst_summary, audit_log, system_setting
```

Business hours and booking rules are per branch (`branch_setting`, R6.3): read
them with `getBranchPolicy` and decide with `packages/business/src/booking/policy.ts`.
A missing or unreadable setting is a 409 (`BRANCH_SETTINGS_INCOMPLETE`), never a
default. Revisions are never edited; a save adds the next one.

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
| Invoice | `{branch_invoice_prefix}/{financial_year}/{6+_digit_sequence}` — consecutive per branch and FY from `invoice_sequence` (older invoices keep `INV-1-2627-92921`) | `RS/2627/000123` |
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

There is no built-in rate. Each branch has effective-dated rates per SAC code
(`branch_tax_version`, integer basis points); a line uses the rate in force for
its SAC code at the invoice's branch and tax point, and a missing rate is a 409
(`TAX_CONFIGURATION_INCOMPLETE`), never a fallback. Use `prepareInvoiceTax` in
`packages/business/src/invoicing/tax.ts`:

```typescript
// Per line, after its largest-remainder share of the discount:
// taxable = round half up of amount × 10_000 / (10_000 + rateBps)
// tax = amount − taxable; CGST = floor(tax / 2); SGST = tax − CGST
// Invoice totals are the sums of the lines.
```

Issued invoices store every tax fact (issuer, tax point, number, per-line SAC
code, version, rate and amounts) and never change; render and report from the
stored values, never from today's rates.

---

## Gems (Loyalty) Rules

- **Earn:** 1 gem per ₹100 invoiced (floor). Only on `invoice_type = 'service'`.
- **NO gems** on membership purchases or membership sessions.
- **Expiry:** 365 days from earn date. Auto-expired by QStash gems-auto-expire job, which expires only each batch's **unspent** gems.
- **Redemption:** Against specific catalogue services only, NOT a ₹ discount. Usable at any branch; spends the earliest-expiring batches first (`loyalty_allocation`). Gems of a free service that is rejected, cancelled or missed are `returned`.
- **Cannot combine** with offers on the same booking.
- **Settlement:** gems spent at a branch other than the issuing one are owed by the issuing branch at the value per gem; SPA membership sessions at another branch are owed by the selling branch. Monthly, without GST (`settlement_entry`, 0021–0024).

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

- #[[file:knowledge-base/database-schema.md]] — Full table definitions, column specs, all indexes
- #[[file:knowledge-base/system-design/LLD.md]] — Detailed SQL, state machines, sequence diagrams
