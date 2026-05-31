# Design Document — Phase 4: CRM, Leads & Memberships

## Overview

Phase 4 builds the customer-relationship layer of the RGSS platform on top of the booking backend delivered in Phase 3. It covers four cohesive feature areas that share the same layered architecture (API route → business logic → query layer) and the same standard response envelope already established in the codebase:

1. **Lead Pipeline** — capture cold Meta-ad traffic via a distraction-free `/book` landing page, persist leads with UTM attribution, and manage them through a kanban pipeline in the admin portal.
2. **CRM** — customer directory with search/filter/sort by lifetime value, plus per-customer profiles with tags, notes, and booking/invoice/membership history.
3. **SPA Memberships** — admin-created hour-based memberships (Silver/Gold/Platinum), session recording that deducts hours and generates ₹0 invoices, and a customer-facing membership view.
4. **Loyalty (Gems)** — a customer-facing gems balance + transaction history page, building on the gem-earning logic already wired into booking completion.

All four areas reuse the database schema already defined and pushed to Neon (`lead`, `lead_note`, `spa_membership`, `spa_membership_tier`, `loyalty_account`, `loyalty_transaction`, `customer_tag`, `customer_tag_assignment`, `customer_note`). No schema migrations are required for the core feature set; one small additive column is proposed for membership-session linkage (see Design Decisions). The admin sidebar already links to `/admin/customers`, `/admin/leads`, and `/admin/memberships` — these routes are 404 today and this phase makes them real.

### Goals

- Capture leads from paid campaigns with full UTM/attribution data, no authentication required.
- Give receptionists a kanban pipeline and lead-detail workflow (call, WhatsApp, status transitions, notes).
- Provide a searchable customer directory and rich per-customer profiles with manual tagging and notes.
- Let admins create memberships (with invoice generation, no gems) and record sessions (hour deduction, ₹0 invoice, no gems).
- Expose customer-facing `/membership` and `/gems` pages.
- Maintain the strict layer boundaries, paise money math, IST/DD-MM-YYYY display, and Indian-numbering currency formatting mandated by the steering files.

### Non-Goals (deferred to later phases)

- Meta Pixel browser events and CAPI server events (Phase 7) — the lead API exposes the data needed but does not fire pixel/CAPI calls.
- Automatic CRM tag assignment (`vip`, `loyal`, `no_show_*`, etc.) driven by background jobs (Phase 6) — this phase implements **manual** tagging and the tag data model; auto-tags are out of scope.
- Membership expiry reminders / auto-expiry via pg_cron + QStash (Phase 6).
- Gems redemption at checkout (the redemption *flow* in the booking/billing path) — this phase ships the read-only customer gems page and the catalogue listing; redemption write-path is deferred with the offers/checkout work.
- Email delivery internals (Resend templates) — membership/lead emails expose a logging extension point but do not send real email in this phase.
- Lead → customer linkage automation on sign-in (matching lead phone to a new user). The `convertedBookingId` linkage on booking creation IS in scope (already partially wired via `leadId` in the booking schema).

## Architecture

### Layer Boundaries (unchanged from existing codebase)

```
apps/web/src/app/(landing)/book/        ← /book lead-capture page (no auth, noindex)
apps/web/src/app/(customer)/membership/ ← customer membership view
apps/web/src/app/(customer)/gems/       ← customer gems view
apps/web/src/app/admin/leads/           ← lead kanban + detail
apps/web/src/app/admin/customers/       ← customer directory + profile
apps/web/src/app/admin/memberships/     ← membership list + create + detail
apps/web/src/app/api/leads/             ← public lead capture
apps/web/src/app/api/admin/leads/       ← admin lead management
apps/web/src/app/api/admin/customers/   ← admin CRM
apps/web/src/app/api/admin/memberships/ ← admin membership ops
apps/web/src/app/api/membership/        ← customer's own membership read
apps/web/src/app/api/gems/              ← customer's own gems read

packages/business/src/membership/       ← membership-number gen, hour math, validity
packages/business/src/lead/             ← phone normalisation, stale detection
packages/db/src/queries/leads.ts        ← lead CRUD + pipeline
packages/db/src/queries/customers.ts    ← CRM directory + profile aggregation
packages/db/src/queries/memberships.ts  ← membership + session + tier queries
packages/db/src/queries/loyalty.ts      ← gems account + transactions read
packages/types/src/lead.ts              ← Zod: lead capture, status update, note
packages/types/src/membership.ts        ← Zod: create membership, record session
packages/types/src/customer.ts          ← Zod: tag assign, note, customer filters
```

The rules hold exactly as in Phase 3:
- **API routes are thin**: parse → `safeParse` → call business/query functions → `apiSuccess(...)`. Wrapped in `withErrorHandler`. RBAC via `requireRole('receptionist')` for admin routes, `requireSession()` for customer routes, none for public `/api/leads`.
- **Business logic is pure**: no I/O, throws `AppError`, lives in `packages/business`.
- **All DB access in `packages/db/queries`**: Drizzle parameterized queries, `db.batch()` for multi-statement atomicity (neon-http has no interactive transactions).
- **Money is integer paise**; display formatting via `@rgss/business` currency/date utils only at the presentation layer.

### Request Flow (example: record a membership session)

```
POST /api/admin/memberships/[id]/sessions
  │
  ├─ requireRole('receptionist')                         (session.ts)
  ├─ recordSessionSchema.safeParse(body)                 (@rgss/types)
  ├─ getMembershipById(id)                               (queries/memberships.ts)
  ├─ assertSessionRecordable(membership, durationMin)    (@rgss/business/membership)
  │     └─ throws MEMBERSHIP_EXPIRED / MEMBERSHIP_INSUFFICIENT_HOURS / etc.
  ├─ generateBookingNumber(branchCode, date, 'spa', { membership:true })
  ├─ generateInvoiceNumber(branchNumber, date)
  ├─ recordMembershipSession(...)                        (queries — db.batch)
  │     ├─ insert booking (status completed, ₹0, isMembershipSession=true)
  │     ├─ insert booking_service snapshot rows
  │     ├─ insert invoice (type membership_session, total ₹0, gemsEarned 0)
  │     ├─ insert invoice_item rows
  │     └─ update spa_membership.usedHoursMinutes += durationMin
  └─ apiSuccess({ booking, invoice, remainingMinutes })
```

## Components and Interfaces

### 1. Lead Pipeline

#### 1.1 Types — `packages/types/src/lead.ts`

```typescript
import { z } from 'zod'

// Indian 10-digit mobile, optionally +91 / 0 prefixed. Normalised in business layer.
const indianPhone = z
  .string()
  .trim()
  .regex(/^(?:\+?91|0)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number')

export const createLeadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: indianPhone,
  email: z.string().email().optional(),
  serviceInterestedId: z.string().min(1).optional(),
  // attribution
  source: z.string().max(40).optional(),     // defaults to 'meta_ad' in handler
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(120).optional(),
  utmContent: z.string().max(120).optional(),
  utmTerm: z.string().max(120).optional(),
})
export type CreateLeadInput = z.infer<typeof createLeadSchema>

export const LEAD_STATUSES = ['new', 'contacted', 'follow_up', 'booked', 'won', 'lost'] as const

export const updateLeadStatusSchema = z.object({
  status: z.enum(LEAD_STATUSES),
  // required only when status === 'lost' (validated in business layer)
  reason: z.string().max(500).optional(),
})
export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>

export const addLeadNoteSchema = z.object({
  content: z.string().trim().min(1).max(1000),
})
export type AddLeadNoteInput = z.infer<typeof addLeadNoteSchema>

export const manualLeadSchema = createLeadSchema.extend({
  source: z.literal('manual').default('manual'),
})
```

#### 1.2 Business — `packages/business/src/lead/`

```typescript
// phone.ts — normalise to canonical +91XXXXXXXXXX for storage/dedup.
export function normaliseIndianPhone(raw: string): string

// status.ts — guard the lead state machine.
//   new → contacted → follow_up → booked → won/lost, plus new→lost, contacted→booked, etc.
// Throws BUSINESS_RULE_VIOLATION (409) for illegal transitions; requires reason on 'lost'.
const ALLOWED_LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]>
export function assertLeadTransition(from: LeadStatus, to: LeadStatus, reason?: string): void

// stale.ts — a lead is "stale" when status is 'new' and created >48h ago.
export function isLeadStale(status: LeadStatus, createdAt: Date, now?: Date): boolean
export function hoursSince(createdAt: Date, now?: Date): number
```

#### 1.3 Queries — `packages/db/src/queries/leads.ts`

```typescript
createLead(data): Promise<Lead>                       // insert, status 'new'
getLeadById(id): Promise<LeadWithDetails | null>      // lead + service name + assigned-to name + notes + linked customer/booking
getLeadsForPipeline(filters?): Promise<Lead[]>        // all non-archived, newest first, joined service name; group client-side by status
updateLead(id, patch): Promise<Lead | null>           // status, lastContactedAt, convertedBookingId, assignedTo
addLeadNote(leadId, authorId, content): Promise<LeadNote>
getLeadNotes(leadId): Promise<LeadNoteWithAuthor[]>   // newest first, author name
getServiceInterestOptions(): Promise<{id,name,serviceType}[]>  // active services for /book dropdown
```

`getLeadsForPipeline` returns flat rows; the kanban page buckets them by `status` into the five visible columns (New / Contacted / Follow-up / Booked / Won+Lost). Each row carries `daysSinceCapture` and `isStale` computed via the business helpers.

#### 1.4 API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/leads` | POST | none (public) | Create lead from `/book`. Defaults `source='meta_ad'`. Returns `{ leadId }`. Rate-limited (see Security). |
| `/api/admin/leads` | GET | receptionist | Pipeline list (optional `?status=` filter). |
| `/api/admin/leads` | POST | receptionist | Manual lead entry (`source='manual'`). |
| `/api/admin/leads/[id]` | GET | receptionist | Lead detail with notes + attribution. |
| `/api/admin/leads/[id]` | PATCH | receptionist | Update status (state-machine guarded) / assign. |
| `/api/admin/leads/[id]/notes` | POST | receptionist | Add a note. |

Lead capture handler shape (thin orchestrator):

```typescript
export const POST = withErrorHandler(async (req: Request) => {
  const body = await req.json().catch(() => null)
  const parsed = createLeadSchema.safeParse(body)
  if (!parsed.success) throw badRequest('Invalid lead data', parsed.error.flatten().fieldErrors)

  const phone = normaliseIndianPhone(parsed.data.phone)
  const lead = await createLead({
    ...parsed.data,
    phone,
    source: parsed.data.source ?? 'meta_ad',
  })
  // Extension point (Phase 7): fire Meta CAPI 'Lead' here.
  return apiSuccess({ leadId: lead.id }, { status: 201 })
})
```

#### 1.5 Pages

- **`apps/web/src/app/(landing)/book/page.tsx`** — server component that fetches service-interest options, renders a client `LeadCaptureForm`. Route group `(landing)` gets a minimal layout (no header/footer/nav). `metadata = { robots: { index:false, follow:false } }`. The form reads `utm_*` from `searchParams` (a Promise in Next 16) and passes them as hidden values. On success it shows the 1.5s "Thank you" state then `router.push('/?book=1&leadId=' + id)`. Phone field shows `+91` prefix; 10-digit validation; "Continue to Booking" CTA.
- **`apps/web/src/app/admin/leads/page.tsx`** — server component fetches pipeline rows, renders client `LeadKanban` (5 columns, cards show name, phone tap-to-call, service interest, campaign, days-since, stale dot). "+ Manual Lead" opens a dialog.
- **`apps/web/src/app/admin/leads/[id]/page.tsx`** — info card with actions (Call, WhatsApp deep link `https://wa.me/91...`, status transitions, Mark Lost with reason), attribution panel (source, utm, fbp/fbc shown if present, linked customer/booking), and a notes timeline with an add-note box.

### 2. CRM (Customers)

#### 2.1 Types — `packages/types/src/customer.ts`

```typescript
export const CUSTOMER_SORT = ['ltv', 'visits', 'last_visit', 'name', 'gems', 'noshows'] as const

export const customerListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),         // name / phone / email search
  sort: z.enum(CUSTOMER_SORT).default('ltv'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  tag: z.string().optional(),                        // slug filter
})

export const assignTagSchema = z.object({ tagId: z.string().min(1) })
export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})
export const addCustomerNoteSchema = z.object({
  content: z.string().trim().min(1).max(1000),
  bookingId: z.string().optional(),
})
```

#### 2.2 Queries — `packages/db/src/queries/customers.ts`

```typescript
// Directory: paginated, searchable, sortable. LTV/visits/gems read from
// customer_profile (totalSpentPaise, totalVisits, noshowCount) joined with the
// loyalty_account gems balance and a tags aggregate.
getCustomers(query): Promise<{ rows: CustomerListRow[]; totalCount: number }>

// Profile aggregation for /admin/customers/[id]:
getCustomerProfile(userId): Promise<CustomerProfileDetail | null>
//   → user (name/email/role), customer_profile KPIs, tags[], gems balance
getCustomerBookings(userId, limit, offset)       // history tab
getCustomerInvoices(userId, limit, offset)       // invoices tab
getCustomerMembership(userId)                    // active + past memberships
getCustomerNotes(userId)                         // notes tab, author names

// Tagging:
getAllTags(): Promise<CustomerTag[]>
createTag(data): Promise<CustomerTag>            // slugify name
assignTag(customerId, tagId, assignedBy)         // upsert (PK conflict → no-op)
removeTag(customerId, tagId)
addCustomerNote(customerId, authorId, content, bookingId?)
```

`getCustomers` sort mapping:
- `ltv` → `customer_profile.total_spent_paise DESC`
- `visits` → `total_visits DESC`
- `last_visit` → `last_visit_at DESC NULLS LAST`
- `name` → `user.name ASC`
- `gems` → `loyalty_account.gems_balance DESC NULLS LAST`
- `noshows` → `noshow_count DESC`

Search: case-insensitive `ILIKE` across `user.name`, `customer_profile.phone`, `user.email`. Tag filter joins `customer_tag_assignment`.

> **Note on "customer" identity:** customers are `user` rows with `role='customer'` that have a `customer_profile`. The directory selects users joined to `customer_profile`. Staff/admin users (no customer_profile) are excluded.

#### 2.3 API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/admin/customers` | GET | receptionist | Paginated directory (`meta` pagination). |
| `/api/admin/customers/[id]` | GET | receptionist | Profile detail (KPIs, tags, gems). |
| `/api/admin/customers/[id]` | PATCH | manager | Owner override (e.g. reset `noshowCount`). |
| `/api/admin/customers/[id]/tags` | POST | receptionist | Assign tag. |
| `/api/admin/customers/[id]/tags/[tagId]` | DELETE | receptionist | Remove tag. |
| `/api/admin/customers/[id]/notes` | POST | receptionist | Add note. |
| `/api/admin/tags` | GET | receptionist | List tags (autocomplete). |
| `/api/admin/tags` | POST | manager | Create tag. |

#### 2.4 Pages

- **`/admin/customers/page.tsx`** — search box, sort dropdown, tag filter, paginated table (Name, Phone, Tags, Visits, LTV, Gems, Last Visit). Pagination controls use `meta.page/totalPages`.
- **`/admin/customers/[id]/page.tsx`** — header (name, contact, since date, tag chips with add/remove), KPI cards (Visits, LTV, Avg Spend, No-shows, Gems), and tabs (Bookings / Invoices / Membership / Gems / Notes). Tabs lazy-load via their respective endpoints or are server-rendered on first paint.

### 3. SPA Memberships

#### 3.1 Types — `packages/types/src/membership.ts`

```typescript
export const createMembershipSchema = z.object({
  customerId: z.string().min(1),
  tierId: z.string().min(1),
  hoursMinutes: z.number().int().positive(),   // prefilled from tier, overridable
  pricePaise: z.number().int().nonnegative(),  // prefilled from tier, overridable
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validityDays: z.number().int().positive(),   // prefilled from tier, overridable
  paymentMethod: z.enum(['cash', 'upi', 'card']),
  notes: z.string().max(500).optional(),
})

export const recordSessionSchema = z.object({
  services: z.array(z.object({
    serviceId: z.string().min(1),
    staffId: z.string().optional(),
    durationMinutes: z.number().int().positive(),
  })).min(1),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // default today (IST)
})

export const cancelMembershipSchema = z.object({
  reason: z.string().trim().min(1).max(500),
})
```

#### 3.2 Business — `packages/business/src/membership/`

```typescript
// number.ts — RG-MEM-{YY}-{branchNumber}-{5random}, e.g. RG-MEM-26-1-90872
export function generateMembershipNumber(branchNumber: number, date: Date): string

// validity.ts — expiry = startDate + validityDays (end of day IST).
export function computeExpiry(startDate: Date, validityDays: number): Date

// hours.ts — guards for session recording.
export function assertSessionRecordable(
  m: { status: string; expiresAt: Date; totalHoursMinutes: number; usedHoursMinutes: number },
  requestedMinutes: number,
  now?: Date,
): void
//   throws MEMBERSHIP_EXPIRED (409) if status!=='active' or now>expiresAt
//   throws MEMBERSHIP_INSUFFICIENT_HOURS (409) if used+requested > total
export function remainingMinutes(total: number, used: number): number
```

#### 3.3 Queries — `packages/db/src/queries/memberships.ts`

```typescript
getMembershipTiers(): Promise<SpaMembershipTier[]>         // active, displayOrder
getMembershipById(id): Promise<MembershipDetail | null>     // + customer name, tier, sessions
getMemberships(filters?): Promise<MembershipListRow[]>      // admin list, filter tier/status
getActiveMembershipForCustomer(customerId): Promise<...>    // null if none
getMembershipSessions(membershipId): Promise<SessionRow[]>  // bookings where spaMembershipId = id, completed, with services

// Create membership + its purchase invoice atomically (db.batch):
createMembershipWithInvoice(params): Promise<{ membership, invoice }>
//   pre-checks one-active-per-customer via getActiveMembershipForCustomer
//   insert spa_membership (status active)
//   insert invoice (type membership_purchase, gemsEarned 0, paid)
//   insert invoice_item (single line: "<Tier> SPA Membership")
//   set spa_membership.invoiceId

// Record a session atomically (db.batch):
recordMembershipSession(params): Promise<{ booking, invoice, remainingMinutes }>
//   insert booking (completed, ₹0, isMembershipSession true, spaMembershipId set)
//   insert booking_service rows (snapshots)
//   insert invoice (type membership_session, total ₹0, gemsEarned 0, paid)
//   insert invoice_item rows
//   update spa_membership.usedHoursMinutes += totalMinutes

cancelMembership(id, reason): Promise<Membership | null>    // status cancelled, append reason to notes
```

The one-active-per-customer rule is also enforced at the DB level by the existing partial unique index `spa_membership_active_customer_idx`. The business/query layer pre-checks to return a friendly `MEMBERSHIP_ALREADY_ACTIVE` (409) instead of a raw DB unique-violation.

#### 3.4 API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/admin/memberships` | GET | receptionist | List (filter `?tier=&status=`). |
| `/api/admin/memberships` | POST | receptionist | Create membership + invoice. |
| `/api/admin/memberships/[id]` | GET | receptionist | Detail + sessions. |
| `/api/admin/memberships/[id]/sessions` | POST | receptionist | Record session. |
| `/api/admin/memberships/[id]/cancel` | POST | manager | Cancel membership. |
| `/api/admin/membership-tiers` | GET | receptionist | Tiers for the create form. |
| `/api/membership` | GET | session (customer) | Caller's own active + past memberships. |

#### 3.5 Pages

- **`/admin/memberships/page.tsx`** — list with tier/status filters; "+ Create Membership" → `/admin/memberships/new`.
- **`/admin/memberships/new/page.tsx`** — customer search, tier cards (prefill hours/price/validity, overridable), start date with auto-computed expiry preview, payment method, "Create Membership". Shows the side-effects note (invoice generated, no gems).
- **`/admin/memberships/[id]/page.tsx`** — hours-balance bar (used/remaining/total), expiry + days-left, session history table, "Record Session" (modal) and "Cancel Membership" (manager+). Record-session modal validates requested duration ≤ remaining.
- **`/(customer)/membership/page.tsx`** — customer's active membership card (tier, number, hours bar, validity, urgency banner ≤30d / ≤7d), session history, collapsible past memberships. If none active: empty state with a "call us" CTA.

### 4. Loyalty (Gems)

#### 4.1 Queries — `packages/db/src/queries/loyalty.ts` (read side; write side already exists in `admin-bookings.ts`)

```typescript
getLoyaltySummary(customerId): Promise<{ balance, totalEarned, totalRedeemed } | null>
getLoyaltyTransactions(customerId, limit, offset): Promise<TxRow[]>  // newest first, with invoice number + expiry
getRedeemableServices(): Promise<RedeemableServiceRow[]>  // service where isGemRedeemable, with gemsRequired
```

> The existing `getOrCreateLoyaltyAccount` and `addGemsTransaction` live in `admin-bookings.ts`. To keep the loyalty domain cohesive, these will be re-exported from (or moved to) `loyalty.ts` and re-exported through `queries/index.ts` without breaking the booking-completion import (which imports via `@rgss/db/queries`).

#### 4.2 API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/gems` | GET | session (customer) | Caller's balance + paginated transactions + redeemable catalogue. |

#### 4.3 Page

- **`/(customer)/gems/page.tsx`** — balance hero (current gems, lifetime earned/redeemed), redeemable-services catalogue grid (service name, gems required, "Redeem at your next visit" note — no online redemption in this phase), and a transaction history list (earned/redeemed/expired with date + invoice reference). Includes the "1 gem per ₹100, expires after 365 days" explainer.

### Navigation Integration

The `AdminSidebar` already lists Customers, Leads, Memberships. Two changes:
1. Customer-facing nav (`Header`/`MobileNav`) gains **Membership** and **Gems** links in the authenticated menu (alongside My Bookings / Profile).
2. The `/book` page is intentionally **not** linked anywhere on the site (ad-traffic only, per the lead-capture design doc).

## Data Models

All tables already exist in `packages/db/src/schema`. Summary of what each feature touches:

| Feature | Reads | Writes |
|---------|-------|--------|
| Lead capture | `service` (interest options) | `lead` |
| Lead pipeline | `lead`, `lead_note`, `service`, `user` | `lead`, `lead_note` |
| CRM directory | `user`, `customer_profile`, `loyalty_account`, `customer_tag_assignment`, `customer_tag` | — |
| CRM profile | + `booking`, `invoice`, `spa_membership`, `customer_note` | `customer_tag_assignment`, `customer_note`, `customer_tag` |
| Membership create | `spa_membership_tier`, `branch`, `user` | `spa_membership`, `invoice`, `invoice_item` |
| Record session | `spa_membership`, `service`, `staff_profile`, `branch` | `booking`, `booking_service`, `invoice`, `invoice_item`, `spa_membership` |
| Gems page | `loyalty_account`, `loyalty_transaction`, `service` | — |

### Proposed additive schema change (one column)

To attribute a membership-session booking's revenue and link sessions back cleanly, sessions reuse the existing `booking.spaMembershipId` and `booking.isMembershipSession` columns (already present). **No new column is strictly required.** The membership `invoiceId` linkage already exists on `spa_membership`. Therefore **Phase 4 requires zero migrations** unless validation reveals a gap during implementation. If a gap is found (e.g. needing `lead.fbp`/`lead.fbc` for CAPI), it will be added as an additive, nullable column and pushed via `drizzle-kit push` — but CAPI is out of scope for this phase, so `fbp`/`fbc` are deferred.

## Money, Date & Currency Conventions

- All amounts are integer **paise**. Membership price entered in the UI as rupees is converted to paise at the API boundary (`Math.round(rupees * 100)`), validated as integer paise in the Zod schema.
- Membership-purchase invoices: GST split via existing `splitGST` (18% inclusive). Gems earned = **0** (membership purchase). 
- Membership-session invoices: total ₹0, GST 0, gems 0.
- Display: `formatINR` (Indian numbering `₹10,000.00`) and `formatDateIN` (DD/MM/YYYY) from `@rgss/business/utils`. Hours display as `Xh Ym` from minutes.
- Expiry day-counts computed in IST.

## Error Handling

Reuses `withErrorHandler`, `AppError`, and the existing error-code registry. Codes used in this phase:

| Code | HTTP | Where |
|------|------|-------|
| `VALIDATION_ERROR` | 400 | Any failed `safeParse`; invalid phone. |
| `UNAUTHENTICATED` | 401 | Customer routes without a session. |
| `FORBIDDEN` | 403 | Admin routes below required role. |
| `NOT_FOUND` | 404 | Missing lead/customer/membership; non-owned customer membership. |
| `CONFLICT` / `BUSINESS_RULE_VIOLATION` | 409 | Illegal lead status transition. |
| `MEMBERSHIP_ALREADY_ACTIVE` | 409 | Creating a 2nd active membership. |
| `MEMBERSHIP_EXPIRED` | 409 | Recording a session on expired/cancelled membership. |
| `MEMBERSHIP_INSUFFICIENT_HOURS` | 409 | Session minutes exceed remaining. |

`reason`-required-on-`lost` and session-duration guards are enforced in the business layer (pure functions throwing `AppError`), keeping API routes thin. No new error codes are needed — all required codes already exist in `packages/errors/src/codes.ts`.

## Security Considerations

- **Public lead endpoint** (`POST /api/leads`) is the only unauthenticated write in this phase. It MUST be rate-limited (per-IP sliding window via `@upstash/ratelimit` if configured; otherwise a lightweight in-memory/no-op guard with a TODO until Upstash keys are provided) and strictly Zod-validated. No PII is echoed back beyond the created `leadId`.
- `/book` is `noindex, nofollow` and never linked internally.
- Admin routes enforce RBAC: list/detail/notes/status at `receptionist`; tag creation, customer overrides, and membership cancellation at `manager`.
- Customer self-service routes (`/api/membership`, `/api/gems`) scope strictly to `session.user.id` — a customer can never read another customer's data (404, not 403, for non-owned resources, matching the Phase 3 convention).
- WhatsApp/call links are client-side `tel:`/`https://wa.me` anchors built from the stored phone — no server-side outbound calls.
- Phone numbers stored normalised; never used in raw SQL string concatenation (Drizzle parameterized only).

## Testing Strategy

Per coding standards, no test files are committed unless explicitly requested. The verification approach for each task:

- **Business logic (pure):** typecheck + targeted unit reasoning for `normaliseIndianPhone`, `assertLeadTransition`, `generateMembershipNumber`, `computeExpiry`, `assertSessionRecordable`, `remainingMinutes`. These are deterministic and are the strongest unit-test candidates if tests are later requested.
- **Query layer:** typecheck against the live schema; `db.batch()` atomic paths reviewed for pre-generated IDs.
- **API routes:** typecheck with `SKIP_ENV_VALIDATION=1`; manual happy-path + RBAC-denied checks.
- **Pages:** typecheck; Next 16 async `params`/`searchParams` awaited correctly; server/client component boundaries respected.
- **Whole phase:** `SKIP_ENV_VALIDATION=1 bun run typecheck` and `bun run lint` (Biome) must pass before the phase is declared done.

## Design Decisions & Rationale

1. **Reuse existing schema, zero migrations.** All nine Phase 4 tables already exist and are pushed to Neon. The booking schema already carries `spaMembershipId` and `isMembershipSession`. This keeps the phase additive and low-risk. (Considered: adding `lead.fbp/fbc` now — rejected because CAPI is Phase 7.)
2. **Manual tags only this phase.** Auto-tag rules (`vip`, `loyal`, `no_show_*`) depend on background jobs (Phase 6). Shipping the tag *data model* + manual assignment now unblocks the CRM UI without coupling to the jobs runtime. (Considered: computing auto-tags on read — rejected as it duplicates Phase 6 logic and risks drift.)
3. **Membership session = completed ₹0 booking + membership_session invoice.** Matches the design doc and the database steering rules exactly (no gems, hour deduction, branch-locked). Reusing the booking/invoice tables means sessions appear in the customer's booking history and the admin billing list for free. (Considered: a separate `membership_session` table — rejected; the booking/invoice model already represents this and the schema was designed for it.)
4. **`db.batch()` for all multi-row writes.** neon-http has no interactive transactions; this is the established Phase 3 pattern and gives server-side atomicity. Pre-generate parent IDs so children reference them in the same batch.
5. **Gems redemption deferred.** The `/gems` page is read-only + catalogue display this phase. The redemption write-path belongs with the offers/checkout work (one-offer-or-gems-per-booking rule lives there). Shipping the read side now gives customers visibility and validates the loyalty data model.
6. **Lead state machine in the business layer.** Centralising allowed transitions in one pure function (mirroring the booking-status guards) keeps the API thin and the rules testable, and prevents illegal kanban moves from corrupting pipeline analytics.
7. **Loyalty query consolidation.** Read queries go in a dedicated `loyalty.ts`; the existing write helpers are re-exported there for domain cohesion without breaking the `@rgss/db/queries` import used by booking completion.
8. **Rupee→paise conversion at the API boundary.** The admin membership form collects rupees (human-friendly); the route converts once to paise before any business/DB call, so the entire money pipeline below the boundary is pure paise — consistent with the rest of the system.

## Correctness Properties

These are the invariants the implementation must uphold. The pure business-logic
functions are the primary property-based-testing targets; the query/API layers are
verified by the conditions noted alongside each property.

### Property 1: Phone normalisation is idempotent and canonical
For any valid Indian mobile input `p`, `normaliseIndianPhone(normaliseIndianPhone(p)) === normaliseIndianPhone(p)`, and the result always matches `^\+91[6-9]\d{9}$`.
**Validates: Requirements 1.3**

### Property 2: Normalisation preserves significant digits
The trailing 10 digits of `normaliseIndianPhone(p)` equal the trailing 10 digits of the digit-only form of `p` for any accepted input.
**Validates: Requirements 1.3**

### Property 3: Lead transitions are closed under the allowed map
`assertLeadTransition(from, to)` succeeds iff `to ∈ ALLOWED_LEAD_TRANSITIONS[from]`; every other pair throws `AppError` with HTTP 409.
**Validates: Requirements 2.2**

### Property 4: `lost` requires a reason
Any transition to `lost` without a non-empty `reason` throws `VALIDATION_ERROR`/`BUSINESS_RULE_VIOLATION`; with a reason it follows Property 3.
**Validates: Requirements 2.3**

### Property 5: Staleness boundary
`isLeadStale('new', createdAt, now)` is true iff `hoursSince(createdAt, now) >= 48`; for any status other than `new` it is always false.
**Validates: Requirements 2.4**

### Property 6: Membership number format
For any positive integer `branchNumber` and any `date`, `generateMembershipNumber` matches `^RG-MEM-\d{2}-\d+-\d{5}$`, where the `\d{2}` segment equals the date's two-digit year.
**Validates: Requirements 5.2**

### Property 7: Expiry monotonicity
`computeExpiry(start, days)` is strictly after `start` for `days >= 1`, and `computeExpiry(start, d1) < computeExpiry(start, d2)` whenever `d1 < d2`.
**Validates: Requirements 5.3**

### Property 8: Remaining hours never negative and conserved
`remainingMinutes(total, used) === total - used`, and the implementation guarantees `0 <= used <= total` after every successful session record (i.e. `used' = used + requested` only when `used + requested <= total`).
**Validates: Requirements 6.2**

### Property 9: Session recordability guard is exact
`assertSessionRecordable(m, req)` succeeds iff `m.status === 'active'` AND `now <= m.expiresAt` AND `m.usedHoursMinutes + req <= m.totalHoursMinutes`; each failing clause throws its specific code (`MEMBERSHIP_EXPIRED` for the first two, `MEMBERSHIP_INSUFFICIENT_HOURS` for the third).
**Validates: Requirements 6.3**

### Property 10: No gems on membership
Both membership-purchase and membership-session invoices always have `gemsEarned === 0`, and no `loyalty_transaction` of type `earned` is created for either.
**Validates: Requirements 5.5, 6.4**

### Property 11: One active membership per customer
At most one `spa_membership` row with `status='active'` exists per `customerId` (enforced by the partial unique index and pre-checked to return `MEMBERSHIP_ALREADY_ACTIVE`).
**Validates: Requirements 5.4**

### Property 12: GST split reconstructs the total
For membership-purchase invoices, `basePaise + gstPaise === totalPaise` exactly (integer paise), reusing the proven `splitGST` invariant.
**Validates: Requirements 5.6**

### Property 13: Rupee→paise conversion is integral
The amount persisted is always an integer number of paise; no floating-point money is ever stored.
**Validates: Requirements 5.6**

### Property 14: Customer self-scoping
`/api/membership` and `/api/gems` return only rows whose owning `customerId` equals the authenticated `session.user.id`; a request for another customer's resource yields 404, never another user's data.
**Validates: Requirements 7.4, 8.2**

### Property 15: Tag assignment is idempotent
Assigning a tag already present on a customer is a no-op (composite primary key conflict), leaving exactly one assignment row.
**Validates: Requirements 4.3**

### Property 16: Pagination totals are consistent
For the customer directory, `meta.totalCount` equals the count of rows matching the same filters, and `meta.totalPages === ceil(totalCount / pageSize)`.
**Validates: Requirements 3.4**
