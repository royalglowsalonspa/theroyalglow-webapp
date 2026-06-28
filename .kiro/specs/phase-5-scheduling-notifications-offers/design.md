# Design Document — Phase 5: Scheduling, Notifications & Offers

## Overview

Phase 5 adds the operational layer that keeps staff capacity, customer communication, and promotions running on top of the booking and CRM foundations from Phases 3–4. It covers three cohesive areas, all built on the same layered architecture (API route → business logic → query layer) and the same standard response envelope already established:

1. **Staff Scheduling & Leave** — weekly staff availability grid, leave request submission (staff self-service), and an approve/reject workflow (receptionist/manager), with a state machine guarding transitions and a conflict check against confirmed bookings.
2. **Notifications & Realtime** — a persistent `notification` record model with an in-app notification feed + bell, Web Push subscription management, an Ably token endpoint for realtime channel auth, and notification creation hooks fired on key booking/lead/leave events.
3. **Offers** — admin offer management (percentage / flat / combo_price), a customer-facing active-offers display, and offer application + redemption at checkout (one offer per customer per day, salon-only, cannot combine with gems).

All underlying tables already exist and are pushed to Neon (`staff_schedule`, `staff_time_off`, `business_hour`, `holiday`, `notification`, `push_subscription`, `offer`, `offer_service`, `offer_redemption`). **No migrations are required** for the core feature set.

### Goals

- Let managers define and view staff weekly schedules and let staff submit/withdraw leave; let receptionists/managers approve/reject leave with a confirmed-booking conflict check.
- Persist notifications, expose an in-app feed + unread bell, manage Web Push subscriptions, and provide an Ably token endpoint scoped per role/user.
- Fire notification records on booking confirmation/rejection/reschedule/cancellation, lead staleness, and leave decisions (the actual push/email *send* is an extension point until provider keys are configured).
- Let managers create/edit offers, show active offers to customers, and apply an offer at admin checkout with the one-per-day, salon-only, no-gems-combination rules enforced.
- Maintain strict layer boundaries, integer paise money math, IST/DD-MM-YYYY display, and Indian-numbering currency formatting.

### Non-Goals (deferred to later phases)

- **Actual Web Push delivery** (the `web-push` library send) and **Resend email delivery** — Phase 6 (background jobs) wires the real sends; this phase persists `notification` rows and exposes a single `dispatchNotification` extension point that no-ops/logs until `WEB_PUSH_PRIVATE_KEY` / `RESEND_API_KEY` are set.
- **QStash scheduled/triggered jobs** (reminders, no-show checks, expiry sweeps) — Phase 6.
- **Ably server-side publishing** of realtime events — this phase ships the **token auth endpoint** and the client subscription pattern; publishing on mutations is an extension point until `ABLY_API_KEY` is confirmed working end-to-end (Phase 6 / observability).
- **Same-day mark-off with automatic booking reassignment + customer notification** (design doc §6) — the leave model and conflict *detection* are in scope; the automated reassignment+notify pipeline is deferred to Phase 6 with the jobs.
- **QStash offer auto-expiry job** (Job 3) — Phase 6. This phase computes "active" by date range at read time and supports a manual deactivate toggle.

## Architecture

### Layer Boundaries (unchanged)

```
apps/web/src/app/schedule/          ← weekly staff grid (manager)
apps/web/src/app/leave/             ← leave approval queue (receptionist)
apps/web/src/app/staff/schedule/          ← staff's own schedule + leave (staff)
apps/admin/src/app/offers/          ← offer management (manager)
apps/web/src/app/(customer)/offers/       ← active offers (already exists; wire to live data)
apps/admin/src/app/api/schedule/    ← schedule CRUD
apps/admin/src/app/api/leave/       ← leave list + approve/reject
apps/admin/src/app/api/me/leave/    ← staff submit/withdraw/list own
apps/admin/src/app/api/offers/      ← offer CRUD
apps/web/src/app/api/offers/              ← public active offers
apps/web/src/app/api/notifications/       ← caller's feed + mark-read
apps/web/src/app/api/push/subscribe/      ← store/remove push subscription
apps/web/src/app/api/ably/token/          ← Ably token auth (scoped)

packages/business/src/scheduling/         ← leave state machine, schedule helpers
packages/business/src/offers/             ← discount math, applicability rules
packages/business/src/notifications/      ← notification content builders
packages/db/src/queries/schedule.ts       ← schedule + leave + conflict queries
packages/db/src/queries/notifications.ts   ← notification feed + push subscriptions
packages/db/src/queries/offers.ts          ← offer CRUD + redemption
packages/types/src/schedule.ts             ← Zod: schedule, leave
packages/types/src/notification.ts         ← Zod: push subscribe, mark-read
packages/types/src/offer.ts                ← Zod: offer create/update, apply
apps/web/src/lib/notifications/dispatch.ts  ← single extension point for push/email send
apps/web/src/lib/realtime/ably.ts           ← Ably client helper (token-based)
```

Rules hold exactly as before: thin API routes (`parse → safeParse → business/query → apiSuccess`), wrapped in `withErrorHandler`; pure business logic throwing `AppError`; all DB access in `packages/db/queries` using `db.batch()` for multi-row atomicity; integer paise; display formatting only at the presentation layer.

### RBAC mapping (per features.md)

| Surface | Min role |
|---------|----------|
| `/schedule`, `/api/schedule` | manager |
| `/leave` (approve/reject), `/api/leave` | receptionist |
| `/staff/leave` submit/withdraw, `/api/staff/leave` | staff |
| `/offers`, `/api/offers` | manager |
| `/api/offers` (public active offers) | none |
| `/api/notifications`, `/api/push/subscribe`, `/api/ably/token` | session (any authenticated) |
| Offer application at checkout (`/api/bookings/[id]/complete` extension) | receptionist |

### Request Flow (example: approve leave with conflict detection)

```
PATCH /api/leave/[id]
  │
  ├─ requireRole('receptionist')                        (session.ts)
  ├─ approveLeaveSchema.safeParse(body)                 (@rgss/types)
  ├─ getLeaveById(id)                                   (queries/schedule.ts)
  ├─ assertLeaveTransition(current, 'approved')         (@rgss/business/scheduling)
  ├─ getConfirmedBookingsForStaffOnDate(staffId, date)  (queries/schedule.ts)
  │     └─ returns conflicts[] (confirmed bookings on the leave date)
  ├─ updateLeaveStatus(id, 'approved', reviewerId)
  ├─ createNotification(staffUserId, 'leave_approved', ...) (queries/notifications.ts)
  │     └─ dispatchNotification(...)  ← extension point (no-op until keys)
  └─ apiSuccess({ leave, conflicts })   // UI surfaces conflicts for manual reassignment
```

## Components and Interfaces

### 1. Staff Scheduling & Leave

#### 1.1 Types — `packages/types/src/schedule.ts`

```typescript
import { z } from 'zod'

// A weekly schedule row per (staff, dayOfWeek 0–6). Times are HH:MM 24h.
export const upsertScheduleSchema = z.object({
  staffId: z.string().min(1),
  entries: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    isWorking: z.boolean(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  })).length(7),
})

export const LEAVE_TYPES = ['sick', 'casual', 'personal', 'other'] as const
export const submitLeaveSchema = z.object({
  leaveType: z.enum(LEAVE_TYPES),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),   // single day per row (matches unique (staff,date))
  reason: z.string().max(500).optional(),
})
export const approveLeaveSchema = z.object({ action: z.literal('approve') })
export const rejectLeaveSchema = z.object({
  action: z.literal('reject'),
  rejectionReason: z.string().trim().min(1).max(500),
})
export const leaveDecisionSchema = z.discriminatedUnion('action', [approveLeaveSchema, rejectLeaveSchema])
```

#### 1.2 Business — `packages/business/src/scheduling/`

```typescript
// leave-status.ts — leave state machine: pending → approved/rejected/withdrawn.
const ALLOWED_LEAVE_TRANSITIONS: Record<LeaveStatus, LeaveStatus[]>
export function assertLeaveTransition(from: LeaveStatus, to: LeaveStatus): void
//   throws BUSINESS_RULE_VIOLATION (409) for illegal transitions
//   (approved/rejected/withdrawn are terminal; pending → any)

// schedule.ts — validate a weekly schedule entry.
export function assertValidScheduleEntry(e: { isWorking: boolean; startTime: string|null; endTime: string|null }): void
//   if isWorking, startTime & endTime required and start < end (else VALIDATION_ERROR 400)
export function dayOfWeekLabel(n: number): string   // 0=Sun … 6=Sat
```

#### 1.3 Queries — `packages/db/src/queries/schedule.ts`

```typescript
getStaffSchedule(staffId): Promise<StaffScheduleRow[]>          // 7 rows (or fewer; UI fills gaps)
upsertStaffSchedule(staffId, entries): Promise<void>           // db.batch upsert per (staff,dayOfWeek)
getWeeklyScheduleGrid(weekStartISO): Promise<StaffWeekRow[]>   // all active staff + their schedule + leave-on-dates + booking counts
submitLeave(staffId, data): Promise<StaffTimeOff>             // status pending; unique (staff,date) → friendly conflict
getLeaveById(id): Promise<LeaveWithStaff | null>
getLeaveRequests(filters?): Promise<LeaveRow[]>               // admin queue, filter by status; + staff name
getLeaveForStaff(staffId): Promise<LeaveRow[]>                // staff's own history
updateLeaveStatus(id, status, reviewerId, rejectionReason?): Promise<StaffTimeOff | null>
withdrawLeave(id, staffId): Promise<StaffTimeOff | null>      // only own + only pending
getConfirmedBookingsForStaffOnDate(staffId, dateISO): Promise<ConflictRow[]>  // join booking_service → booking where status='confirmed'
getStaffProfileByUserId(userId): Promise<{ id } | null>        // resolve staff_profile.id from session user
```

#### 1.4 API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/schedule` | GET | manager | Weekly grid (`?weekStart=YYYY-MM-DD`). |
| `/api/schedule` | PUT | manager | Upsert a staff member's 7-day schedule. |
| `/api/leave` | GET | receptionist | Leave queue (`?status=`). |
| `/api/leave/[id]` | PATCH | receptionist | Approve/reject (reject needs reason); returns conflicts on approve. |
| `/api/staff/leave` | GET | staff | Caller's own leave history. |
| `/api/staff/leave` | POST | staff | Submit a leave request. |
| `/api/staff/leave/[id]` | DELETE | staff | Withdraw own pending request. |

#### 1.5 Pages

- **`/schedule/page.tsx`** — week navigator (prev/today/next via `?weekStart=`), staff × 7-day grid showing working hours, leave badges, and booking counts. A per-staff "Edit schedule" panel does the PUT upsert. (Realtime slot animation from the design doc is deferred with Ably publishing; the grid reflects live DB on load/refetch.)
- **`/leave/page.tsx`** — pending/approved/rejected tabs; each pending card shows staff, dates, reason, and a conflict warning (confirmed bookings on that date) with Approve/Reject (reject → reason). On approve, surfaces remaining conflicts for manual reassignment via the existing admin booking detail.
- **`/staff/schedule/page.tsx`** (+ `/staff/leave`) — staff sees their own weekly schedule (read-only) and leave history, can submit a new leave request and withdraw a pending one. A new `staff/` route group/layout gated to role ≥ staff.

### 2. Notifications & Realtime

#### 2.1 Types — `packages/types/src/notification.ts`

```typescript
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
})
export const markReadSchema = z.object({
  ids: z.array(z.string().min(1)).optional(),   // omit → mark all read
})
```

> **Note on schema:** the existing `notification` table has no `readAt`/`isRead` column. "Read" state is modelled via the existing `status` enum is unsuitable (it's pending/sent/failed for delivery). To support an in-app unread bell **without a migration**, this phase treats a notification as "unread" until the client calls mark-read, tracked by an **additive nullable `read_at timestamptz` column** on `notification`. This is the one small additive migration in Phase 5 (nullable, backward-compatible) — pushed via `drizzle-kit push`. (Alternative considered: a separate `notification_read` table — rejected as overkill for a single boolean-ish timestamp.)

#### 2.2 Business — `packages/business/src/notifications/`

```typescript
// content.ts — pure builders returning { title, body } for each notification type,
// mirroring the catalog in design/notifications-realtime.md §2.
export function buildNotificationContent(type: NotificationType, data: Record<string, string>): { title: string; body: string }
```

#### 2.3 Queries — `packages/db/src/queries/notifications.ts`

```typescript
createNotification(params): Promise<Notification>   // channel default 'push'; status 'pending'
getNotificationsForUser(userId, limit, offset): Promise<NotificationRow[]>  // newest first
getUnreadCount(userId): Promise<number>             // where read_at IS NULL
markNotificationsRead(userId, ids?): Promise<void>  // ids omitted → all for user
savePushSubscription(userId, sub): Promise<PushSubscription>  // upsert by endpoint
removePushSubscription(userId, endpoint): Promise<void>       // set isActive false
getActivePushSubscriptions(userId): Promise<PushSubscription[]>
```

#### 2.4 Dispatch extension point — `apps/web/src/lib/notifications/dispatch.ts`

```typescript
// Single seam between creating a notification record and actually delivering it.
// Phase 5 persists the row and calls this; it no-ops (logs) unless provider keys
// are configured. Phase 6 implements web-push + Resend here.
export async function dispatchNotification(notification: Notification): Promise<void>
```

#### 2.5 API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/notifications` | GET | session | Caller's feed + unread count. |
| `/api/notifications` | PATCH | session | Mark read (ids or all). |
| `/api/push/subscribe` | POST | session | Store a push subscription. |
| `/api/push/subscribe` | DELETE | session | Deactivate a subscription (by endpoint). |
| `/api/ably/token` | POST | session | Issue an Ably token request scoped to the caller's channels/role. |

`/api/ably/token`: if `ABLY_API_KEY` is configured, use the Ably REST SDK to create a token request scoped to `customer:{userId}:*` (and `admin:*` for admin roles); if not configured, return `503 SERVICE_UNAVAILABLE` with a clear message so the client degrades gracefully.

#### 2.6 UI

- **Notification bell** — a client component in the admin shell header + customer header showing unread count, opening a dropdown feed (mark-all-read). Polls `/api/notifications` on an interval; upgrades to Ably live updates when the token endpoint is live (extension point).
- **Push opt-in** — a small client helper that, after a successful booking, requests permission and POSTs the subscription to `/api/push/subscribe`. Service worker registration file under `apps/web/public/sw.js` handles the `push` event (added but inert until VAPID keys exist).

### 3. Offers

#### 3.1 Types — `packages/types/src/offer.ts`

```typescript
export const OFFER_TYPES = ['percentage', 'flat', 'combo_price'] as const
export const createOfferSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional(),
  offerType: z.enum(OFFER_TYPES),
  discountPercentage: z.number().int().min(1).max(100).optional(),
  discountAmountPaise: z.number().int().positive().optional(),
  comboPricePaise: z.number().int().positive().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  serviceIds: z.array(z.string().min(1)).min(1),
  terms: z.string().max(1000).optional(),
}).refine(/* the field matching offerType is present; endDate >= startDate */)
export const updateOfferSchema = createOfferSchema.partial().extend({ isActive: z.boolean().optional() })
export const applyOfferSchema = z.object({ offerId: z.string().min(1) })
```

#### 3.2 Business — `packages/business/src/offers/`

```typescript
// discount.ts — pure paise math.
export function computeOfferDiscount(
  offer: { offerType: OfferType; discountPercentage?: number|null; discountAmountPaise?: number|null; comboPricePaise?: number|null },
  subtotalPaise: number,
): { discountPaise: number; finalPaise: number }
//   percentage → floor(subtotal * pct/100); flat → min(amount, subtotal);
//   combo_price → max(0, subtotal - comboPrice). finalPaise = subtotal - discountPaise, clamped ≥ 0.

// applicability.ts — guards (throw AppError).
export function assertOfferActive(offer, now?): void          // OFFER_EXPIRED (409) if !isActive or now outside [start,end]
export function assertOfferSalonOnly(serviceTypes: string[]): void  // OFFER_NOT_APPLICABLE (409) if any 'spa'
```

#### 3.3 Queries — `packages/db/src/queries/offers.ts`

```typescript
getActiveOffers(now?): Promise<OfferWithServices[]>   // isActive && date range, + linked service names
getAllOffersAdmin(): Promise<OfferRow[]>
getOfferById(id): Promise<OfferWithServices | null>
createOfferWithServices(data): Promise<Offer>         // db.batch: offer + offer_service rows
updateOffer(id, patch): Promise<Offer | null>         // + replace offer_service set when serviceIds provided
deactivateOffer(id): Promise<Offer | null>
getOfferRedemptionForCustomerOnDate(customerId, dateISO): Promise<OfferRedemption | null>  // one-per-day check
recordOfferRedemption(offerId, customerId, bookingId, dateISO): Promise<OfferRedemption>
```

#### 3.4 API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/offers` | GET | none | Active offers for the customer offers page. |
| `/api/offers` | GET | manager | All offers. |
| `/api/offers` | POST | manager | Create offer + service links. |
| `/api/offers/[id]` | GET | manager | Offer detail. |
| `/api/offers/[id]` | PATCH | manager | Update / toggle active. |

Offer application is integrated into the existing **booking completion** route as an optional extension: when an `offerId` is supplied to `POST /api/bookings/[id]/complete`, the route validates active + salon-only + one-per-day (no active gems redemption on the same booking), computes the discounted total via `computeOfferDiscount`, writes the invoice `discountAmountPaise`, and records an `offer_redemption`. Gems are then earned on the **discounted** total.

#### 3.5 Pages

- **`/offers/page.tsx`** — list + create/edit form (type-specific fields, service multi-select, date range, active toggle).
- **`/(customer)/offers/page.tsx`** — already exists with placeholder content; wire it to `GET /api/offers` (loading/error/empty states), showing each active offer with its discount and applicable services.

### Navigation Integration

- Admin sidebar already links Schedule, Leave, Offers — these become real.
- Add a **notification bell** to both the admin shell header and the customer header.
- Add a minimal **`/staff`** area (schedule + leave) gated to role ≥ staff via middleware.

## Data Models

All tables exist. Touch summary:

| Feature | Reads | Writes |
|---------|-------|--------|
| Schedule grid | `staff_schedule`, `staff_profile`, `user`, `booking`, `staff_time_off` | `staff_schedule` |
| Leave | `staff_time_off`, `staff_profile`, `user`, `booking`, `booking_service` | `staff_time_off`, `notification` |
| Notifications | `notification`, `push_subscription`, `user` | `notification`, `push_subscription` |
| Offers | `offer`, `offer_service`, `service`, `offer_redemption` | `offer`, `offer_service`, `offer_redemption` |
| Offer at checkout | + `booking`, `invoice` | `offer_redemption`, `invoice` (discount) |

### Additive schema change (one nullable column)

`notification.read_at timestamptz NULL` — supports the in-app unread bell without a separate table. Additive and backward-compatible; applied via `cd packages/db && bunx drizzle-kit push`. This is the **only** migration in Phase 5.

## Money, Date & Currency Conventions

- Offer discounts are integer **paise**; `computeOfferDiscount` clamps `finalPaise ≥ 0` and never produces fractional paise. Rupee inputs in the offer form convert to paise once at the API boundary.
- Gems on a discounted booking are earned on the **discounted total** (`calculateGemsEarned(finalPaise)`), preserving the existing rule.
- Dates display DD/MM/YYYY (`formatDateIN`); currency Indian numbering (`formatINR`); times 24h stored, 12h displayed.
- Leave/schedule dates are IST calendar dates stored as `YYYY-MM-DD` text (matching the existing `staff_time_off.date` / `holiday.date` text columns).

## Error Handling

Reuses `withErrorHandler`, `AppError`, and the existing code registry. Codes used:

| Code | HTTP | Where |
|------|------|-------|
| `VALIDATION_ERROR` | 400 | Failed `safeParse`; invalid schedule times; reject without reason. |
| `UNAUTHENTICATED` | 401 | Session routes without a session. |
| `FORBIDDEN` | 403 | Below required role; staff acting on another staff's leave. |
| `NOT_FOUND` | 404 | Missing leave/offer/notification; non-owned staff leave. |
| `CONFLICT` / `BUSINESS_RULE_VIOLATION` | 409 | Illegal leave transition; duplicate leave date; duplicate offer redemption (one-per-day). |
| `OFFER_EXPIRED` | 409 | Applying an inactive/out-of-range offer. |
| `OFFER_NOT_APPLICABLE` | 409 | Offer on a spa booking, or combining with gems. |
| `SERVICE_UNAVAILABLE` | 503 | `/api/ably/token` when `ABLY_API_KEY` not configured. |

All required codes already exist in `packages/errors/src/codes.ts` (`OFFER_EXPIRED`, `OFFER_NOT_APPLICABLE`, `OFFER_MAX_USAGE_REACHED`, `BUSINESS_RULE_VIOLATION`, `SERVICE_UNAVAILABLE`, etc.). No new error codes are needed.

## Security Considerations

- `/api/offers` is the only public read in this phase; no writes, strictly active offers, no PII.
- Staff leave routes scope strictly to the caller's own `staff_profile` (resolved from session `user.id`); a staff member can never read, submit, or withdraw another staff member's leave (404/403, never another's data).
- Notification + push + Ably-token routes scope to `session.user.id`; the Ably token grants only the caller's own customer channels (and `admin:*` only for admin roles).
- Push subscription endpoints are stored verbatim but never echoed to other users; subscriptions are deactivated (soft) on unsubscribe.
- Offer application enforces the one-offer-per-customer-per-day DB unique constraint plus a pre-check for a friendly error, and refuses to combine with a gems redemption on the same booking.
- All queries are Drizzle-parameterized; no raw SQL concatenation.

## Testing Strategy

Per coding standards, no test files are committed unless requested. Verification per task:
- **Business logic (pure):** `assertLeaveTransition`, `assertValidScheduleEntry`, `computeOfferDiscount`, `assertOfferActive`, `assertOfferSalonOnly`, `buildNotificationContent` — deterministic, the strongest PBT candidates.
- **Query layer:** typecheck against the live schema; `db.batch()` atomic paths reviewed for pre-generated IDs; the additive `read_at` column pushed before notification queries are exercised.
- **API routes:** typecheck with `SKIP_ENV_VALIDATION=1`; RBAC-denied + happy paths reasoned through.
- **Pages:** typecheck; Next 16 async `params`/`searchParams` awaited; server/client boundaries respected.
- **Whole phase:** `SKIP_ENV_VALIDATION=1 bun run typecheck` and `bun run lint` (Biome) must pass before done.

## Design Decisions & Rationale

1. **One small additive migration (`notification.read_at`).** An in-app unread bell needs a per-notification read marker; the existing `status` enum tracks *delivery*, not *read*. A nullable timestamp is the minimal, backward-compatible change. (Considered reusing `sentAt` — rejected: conflates delivery with read.)
2. **External sends are extension points, not implementations.** `ABLY_API_KEY`, `WEB_PUSH_PRIVATE_KEY`, and `RESEND_API_KEY` are declared in `env.ts` but empty in `.env.local`. Building the full backend + UI with a single `dispatchNotification` seam and a graceful `503` on the Ably token route keeps the whole phase buildable and testable today; Phase 6 fills the seam. This mirrors the Phase 4 rate-limit approach.
3. **Realtime: token endpoint now, publishing later.** The Ably token-auth endpoint and client subscription scaffolding are low-risk and unblock the bell. Server-side `publish` on every mutation is deferred to avoid coupling core flows to an unverified realtime pipeline; the UI degrades to polling.
4. **Leave is single-day rows.** The `staff_time_off` table has a unique `(staff_id, date)` constraint, so a multi-day request is submitted as one row per day (the UI can expand a range into rows). This matches the schema exactly and keeps conflict detection per-date simple.
5. **Offer application rides the existing completion route.** Offers apply at checkout (receptionist), so extending `POST /api/bookings/[id]/complete` with an optional `offerId` is cohesive and avoids a parallel checkout path. The one-per-day unique index + salon-only + no-gems rules are enforced there.
6. **Same-day mark-off + auto-reassignment deferred.** Detecting conflicts on leave approval is in scope and valuable immediately; the automated reassignment + customer-notify pipeline depends on the notification *send* layer and is naturally a Phase 6 concern.
7. **`db.batch()` for all multi-row writes**; pre-generate parent IDs so children reference them — the established neon-http pattern.

## Correctness Properties

These invariants must hold. The pure business functions are the primary PBT targets.

### Property 1: Leave transitions are closed under the allowed map
`assertLeaveTransition(from, to)` succeeds iff `to ∈ ALLOWED_LEAVE_TRANSITIONS[from]`; every other pair throws `AppError` 409. `approved`, `rejected`, and `withdrawn` are terminal (no outgoing transitions).
**Validates: Requirements 2.3, 2.4**

### Property 2: Reject requires a reason
A leave decision with `action: 'reject'` and an empty/whitespace `rejectionReason` is rejected with `VALIDATION_ERROR` (400); with a non-empty reason it follows Property 1.
**Validates: Requirements 2.5**

### Property 3: Working schedule entries are well-formed
`assertValidScheduleEntry(e)` succeeds iff (`e.isWorking === false`) OR (`startTime` and `endTime` are both present and `startTime < endTime`); otherwise it throws `VALIDATION_ERROR` (400).
**Validates: Requirements 1.2**

### Property 4: Leave conflict detection is exact
`getConfirmedBookingsForStaffOnDate(staffId, date)` returns exactly the bookings in status `confirmed` whose date equals `date` and which have a `booking_service` row assigned to `staffId` — no more, no fewer.
**Validates: Requirements 2.6**

### Property 5: Offer discount is bounded and integral
For any non-negative integer `subtotalPaise`, `computeOfferDiscount` returns integer `discountPaise` and `finalPaise` with `0 ≤ discountPaise ≤ subtotalPaise`, `finalPaise = subtotalPaise − discountPaise`, and `finalPaise ≥ 0`.
**Validates: Requirements 5.2**

### Property 6: Percentage discount never exceeds the stated fraction
For an offer of type `percentage` with `discountPercentage = p`, `discountPaise = floor(subtotalPaise * p / 100)` and thus `discountPaise ≤ subtotalPaise` for all `p ∈ [1,100]`.
**Validates: Requirements 5.2**

### Property 7: Offer active guard is exact on the date range
`assertOfferActive(offer, now)` succeeds iff `offer.isActive === true` AND `startDate ≤ now ≤ endDate` (inclusive, by calendar date); each failing clause throws `OFFER_EXPIRED` (409).
**Validates: Requirements 4.4, 5.3**

### Property 8: Salon-only enforcement
`assertOfferSalonOnly(serviceTypes)` succeeds iff no element equals `'spa'`; otherwise throws `OFFER_NOT_APPLICABLE` (409).
**Validates: Requirements 5.4**

### Property 9: One offer per customer per day
At most one `offer_redemption` row can exist for a given `(customerId, redeemedDate)` (DB unique constraint), and the application path pre-checks to return a `CONFLICT`/`OFFER_NOT_APPLICABLE` 409 rather than a raw unique violation.
**Validates: Requirements 5.5**

### Property 10: Notification self-scoping
`getNotificationsForUser`, `getUnreadCount`, and `markNotificationsRead` operate only on rows whose `userId` equals the authenticated `session.user.id`; the unread count equals the number of that user's notifications with `read_at IS NULL`.
**Validates: Requirements 3.2, 3.3**

### Property 11: Notification content is total
`buildNotificationContent(type, data)` returns a non-empty `title` and `body` for every `NotificationType` value (total function over the enum).
**Validates: Requirements 3.5**

### Property 12: Gems on discounted total
When an offer is applied at completion, gems earned equal `calculateGemsEarned(finalPaise)` where `finalPaise` is the post-discount total, and no gems redemption coexists with an offer on the same booking.
**Validates: Requirements 5.6, 5.7**
