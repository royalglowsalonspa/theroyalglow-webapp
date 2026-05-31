# Implementation Plan: Phase 5 — Scheduling, Notifications & Offers

## Overview

Implement the operational layer on top of Phases 3–4: Staff Scheduling & Leave, Notifications & Realtime, and Offers. All tables exist; the only schema change is one additive nullable column (`notification.read_at`) pushed via drizzle-kit. Work follows the established layered architecture (Zod types → pure business logic → Drizzle query layer → thin API routes → pages), with external sends (push/email/Ably publish) behind a single `dispatchNotification` extension point and a graceful `503` on the Ably token route. Verification uses `SKIP_ENV_VALIDATION=1 bun run typecheck` and `bun run lint` (Biome).

## Tasks

- [x] 1. Scheduling & Leave domain types and business logic
  - Create `packages/types/src/schedule.ts`: `upsertScheduleSchema` (staffId + 7 entries of dayOfWeek/isWorking/startTime/endTime), `LEAVE_TYPES`, `submitLeaveSchema` (leaveType, date, reason?), `approveLeaveSchema`/`rejectLeaveSchema` + `leaveDecisionSchema` discriminated union; export inferred types + `LeaveStatus`/`LeaveType`
  - Create `packages/business/src/scheduling/leave-status.ts`: `ALLOWED_LEAVE_TRANSITIONS` (pending→[approved,rejected,withdrawn]; others terminal) + `assertLeaveTransition(from,to)` throwing `BUSINESS_RULE_VIOLATION` 409
  - Create `packages/business/src/scheduling/schedule.ts`: `assertValidScheduleEntry(e)` (working ⇒ start&end present & start<end, else `badRequest` 400) + `dayOfWeekLabel(n)`
  - Add `packages/business/src/scheduling/index.ts`; re-export from `packages/business/src/index.ts` and `packages/types/src/index.ts` (use str_replace to append)
  - _Requirements: 1.2, 2.3, 2.4, 2.5_

- [x] 2. Offers domain types and business logic
  - Create `packages/types/src/offer.ts`: `OFFER_TYPES`, `createOfferSchema` (name, description?, offerType, type-specific discount fields, startDate, endDate, serviceIds[], terms?) with refine for type-field presence + endDate≥startDate, `updateOfferSchema` (partial + isActive), `applyOfferSchema`; export inferred types
  - Create `packages/business/src/offers/discount.ts`: `computeOfferDiscount(offer, subtotalPaise)` → `{ discountPaise, finalPaise }` (percentage=floor(sub*pct/100); flat=min(amount,sub); combo=max(0,sub-combo); clamp final≥0)
  - Create `packages/business/src/offers/applicability.ts`: `assertOfferActive(offer, now?)` (`OFFER_EXPIRED` 409) + `assertOfferSalonOnly(serviceTypes)` (`OFFER_NOT_APPLICABLE` 409)
  - Add `packages/business/src/offers/index.ts`; re-export from business + types indexes (append)
  - _Requirements: 5.2, 5.3, 5.4_

- [x] 3. Notifications domain types, business content, and read_at migration
  - Create `packages/types/src/notification.ts`: `pushSubscribeSchema` (endpoint url, keys{p256dh,auth}), `markReadSchema` (ids?[])
  - Create `packages/business/src/notifications/content.ts`: `buildNotificationContent(type, data)` returning `{ title, body }` for every `notificationTypeEnum` value (total over the enum; mirror the catalog in design/notifications-realtime.md §2)
  - Add `packages/business/src/notifications/index.ts`; re-export from business + types indexes (append)
  - Add additive nullable column `readAt` (`read_at timestamptz`) to `packages/db/src/schema/notification.ts`, then run `cd packages/db && bunx drizzle-kit push` to apply it to Neon (reads `packages/db/.env`)
  - _Requirements: 3.5_

- [x] 4. Scheduling & Leave query layer
  - Create `packages/db/src/queries/schedule.ts`: `getStaffProfileByUserId(userId)`, `getStaffSchedule(staffId)`, `upsertStaffSchedule(staffId, entries)` (db.batch delete-then-insert or per-day upsert on unique (staff,dayOfWeek)), `getWeeklyScheduleGrid(weekStartISO)` (active staff + schedule + approved leave on the 7 dates + per-day confirmed booking counts), `submitLeave(staffId, data)`, `getLeaveById(id)`, `getLeaveRequests(filters?)` (+ staff name), `getLeaveForStaff(staffId)`, `updateLeaveStatus(id, status, reviewerId, rejectionReason?)`, `withdrawLeave(id, staffId)`, `getConfirmedBookingsForStaffOnDate(staffId, dateISO)` (join booking_service→booking where status='confirmed')
  - Re-export `./schedule` from `packages/db/src/queries/index.ts` (append)
  - _Requirements: 1.3, 1.4, 2.2, 2.3, 2.6, 2.7_

- [x] 5. Notifications query layer + dispatch extension point
  - Create `packages/db/src/queries/notifications.ts`: `createNotification(params)`, `getNotificationsForUser(userId, limit, offset)`, `getUnreadCount(userId)` (read_at IS NULL), `markNotificationsRead(userId, ids?)`, `savePushSubscription(userId, sub)` (upsert by endpoint), `removePushSubscription(userId, endpoint)`, `getActivePushSubscriptions(userId)`
  - Re-export `./notifications` from queries index (append)
  - Create `apps/web/src/lib/notifications/dispatch.ts`: `dispatchNotification(notification)` — no-op + structured log unless `WEB_PUSH_PRIVATE_KEY`/`RESEND_API_KEY` configured; clear Phase-6 TODO
  - _Requirements: 3.2, 3.3, 3.4, 3.5_

- [x] 6. Offers query layer
  - Create `packages/db/src/queries/offers.ts`: `getActiveOffers(now?)` (isActive && date range, + linked service names), `getAllOffersAdmin()`, `getOfferById(id)` (+ services), `createOfferWithServices(data)` (db.batch: offer + offer_service rows), `updateOffer(id, patch)` (replace offer_service set when serviceIds provided), `deactivateOffer(id)`, `getOfferRedemptionForCustomerOnDate(customerId, dateISO)`, `recordOfferRedemption(offerId, customerId, bookingId, dateISO)`
  - Re-export `./offers` from queries index (append)
  - _Requirements: 4.4, 5.4, 5.5_

- [x] 7. Scheduling & Leave API routes
  - Create `apps/web/src/app/api/admin/schedule/route.ts`: GET (`requireRole('manager')`, `?weekStart=` → `getWeeklyScheduleGrid`) + PUT (`requireRole('manager')`, `upsertScheduleSchema` → validate each entry via `assertValidScheduleEntry` → `upsertStaffSchedule`)
  - Create `apps/web/src/app/api/admin/leave/route.ts`: GET (`requireRole('receptionist')`, `?status=` → `getLeaveRequests`)
  - Create `apps/web/src/app/api/admin/leave/[id]/route.ts`: PATCH (`requireRole('receptionist')`, `leaveDecisionSchema` → `getLeaveById` notFound → `assertLeaveTransition` → `updateLeaveStatus`; on approve fetch + return `getConfirmedBookingsForStaffOnDate` conflicts; create `leave_approved`/`leave_rejected` notification + dispatch)
  - Create `apps/web/src/app/api/staff/leave/route.ts`: GET (`requireRole('staff')`, resolve staffProfile from session, `getLeaveForStaff`) + POST (`submitLeave`, friendly 409 on duplicate date)
  - Create `apps/web/src/app/api/staff/leave/[id]/route.ts`: DELETE (`withdrawLeave(id, staffId)`, 404/403 if not own/pending)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 6.1, 6.2_

- [x] 8. Notifications, Push & Ably API routes
  - Create `apps/web/src/app/api/notifications/route.ts`: GET (`requireSession`, `getNotificationsForUser` + `getUnreadCount`, scoped to session.user.id) + PATCH (`markReadSchema` → `markNotificationsRead`)
  - Create `apps/web/src/app/api/push/subscribe/route.ts`: POST (`pushSubscribeSchema` → `savePushSubscription`) + DELETE (`removePushSubscription` by endpoint)
  - Create `apps/web/src/app/api/ably/token/route.ts`: POST (`requireSession`; if `env.ABLY_API_KEY` present use Ably REST to create a token request scoped to `customer:{userId}:*` plus `admin:*` for admin roles; else throw `AppError` SERVICE_UNAVAILABLE 503). Add `ably` dependency only if available; otherwise guard the import so the 503 path needs no package
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 6.1, 6.2_

- [x] 9. Offers API routes + checkout application
  - Create `apps/web/src/app/api/offers/route.ts`: GET (public, `getActiveOffers`)
  - Create `apps/web/src/app/api/admin/offers/route.ts`: GET (`requireRole('manager')`, `getAllOffersAdmin`) + POST (`createOfferSchema` → `createOfferWithServices`)
  - Create `apps/web/src/app/api/admin/offers/[id]/route.ts`: GET (`getOfferById`) + PATCH (`updateOfferSchema` → `updateOffer`/`deactivateOffer`)
  - Extend `apps/web/src/app/api/admin/bookings/[id]/complete/route.ts`: accept optional `offerId`; when present, load offer → `assertOfferActive` → `assertOfferSalonOnly` (from booking service types) → pre-check `getOfferRedemptionForCustomerOnDate` (409) → reject if gems redemption also requested (`OFFER_NOT_APPLICABLE`) → `computeOfferDiscount` → set invoice `discountAmountPaise` + recompute taxable/gst on discounted total → `recordOfferRedemption` → gems on discounted total. Preserve existing behaviour when no offerId
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2_

- [x] 10. Scheduling & Leave pages
  - Create `apps/web/src/app/admin/schedule/page.tsx` (+ client grid): week navigator (`?weekStart=`), staff × 7-day grid (working hours, leave badges, booking counts), per-staff edit panel calling PUT
  - Create `apps/web/src/app/admin/leave/page.tsx` (+ client queue): pending/approved/rejected tabs, conflict warning per pending card, Approve/Reject (reject → reason); on approve surface conflicts
  - Create `apps/web/src/app/staff/layout.tsx` (gated role ≥ staff) + `apps/web/src/app/staff/schedule/page.tsx` (own read-only schedule) + `apps/web/src/app/staff/leave/page.tsx` (own leave history + submit + withdraw pending)
  - Add `/staff` to middleware protected paths (min role staff) in `apps/web/src/middleware.ts`
  - _Requirements: 1.1, 1.4, 2.2, 2.6, 2.7, 6.4_

- [x] 11. Offers pages + notification bell
  - Create `apps/web/src/app/admin/offers/page.tsx` (+ client): list + create/edit form (type-specific fields, service multi-select, date range, active toggle)
  - Wire `apps/web/src/app/(customer)/offers/page.tsx` to `GET /api/offers` (loading/error/empty), showing each active offer with discount + applicable services
  - Create `apps/web/src/components/notifications/NotificationBell.tsx` (`'use client'`): unread badge + dropdown feed, polls `/api/notifications`, mark-all-read; mount in the admin shell header and the customer `Header`
  - _Requirements: 3.2, 3.3, 3.4, 4.4, 5.4, 6.3_

- [x] 12. Verification — typecheck and lint
  - Run `SKIP_ENV_VALIDATION=1 bun run typecheck` across the workspace; resolve all type errors in new files (no `any`, no `@ts-ignore`)
  - Run `bun run lint` (Biome) and fix any genuine new issues (ignore pre-existing CRLF/import-order baseline)
  - Verify Next 16 async `params`/`searchParams`/`headers()` are awaited in every new page/route; confirm the `read_at` column is pushed and notification queries compile
  - _Requirements: 6.1, 6.2_

## Notes

- All Phase 5 tables already exist in `packages/db/src/schema`. The single schema change is `notification.read_at` (nullable) in Task 3 — push with `cd packages/db && bunx drizzle-kit push`.
- Reuse existing helpers: `withErrorHandler`/`apiSuccess`, `requireSession`/`requireRole`, `splitGST`, `calculateGemsEarned`, `generateInvoiceNumber`, `formatINR`/`formatDateIN`. All error codes used are already in `packages/errors/src/codes.ts`.
- Use `db.batch()` (not `db.transaction`) for multi-row writes — neon-http has no interactive transactions. Pre-generate parent IDs.
- External sends are extension points: `dispatchNotification` no-ops until `WEB_PUSH_PRIVATE_KEY`/`RESEND_API_KEY` are set; `/api/ably/token` returns 503 until `ABLY_API_KEY` is configured. No core flow depends on these being live.
- Money is integer paise; convert rupees→paise once at the API boundary. Gems on a discounted booking are earned on the discounted total.
- Staff routes scope strictly to the caller's own `staff_profile`; notification/push/ably routes scope to `session.user.id`. Non-owned resources return 404, never another user's data.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2", "3"] },
    { "id": 1, "tasks": ["4", "5", "6"] },
    { "id": 2, "tasks": ["7", "8", "9"] },
    { "id": 3, "tasks": ["10", "11"] },
    { "id": 4, "tasks": ["12"] }
  ]
}
```
