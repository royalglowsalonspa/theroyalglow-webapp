# Implementation Plan: Backend API

## Overview

This plan converts the Backend API design into discrete, incremental coding steps for the RGSS monorepo (Bun + TypeScript strict, Next.js 16, Drizzle, Zod, `@rgss/errors`). It is built in the layered order from the design: API foundation → shared Zod schemas → pure business functions → query layer → availability service → customer API routes → admin API routes → UI wiring. Each step builds on the previous ones and ends by wiring code into a route or surface so nothing is orphaned.

Property-based tests are included as separate sub-tasks — one per correctness property from the design (28 total). Every property test uses **`fast-check` + Vitest**, runs a **minimum of 100 iterations**, exercises only pure functions or the query layer behind in-memory fakes (no real DB or external service), and carries the tag comment:

```
// Feature: backend-api, Property {n}: {title}
```

Conventions enforced throughout (per steering): money is integer paise, IDs are `nanoid`/`cuid2` text, timestamps are `timestamptz` (UTC stored, IST displayed), API routes are thin orchestrators (parse → Zod `.safeParse()` → business/queries → standard envelope), all errors flow through `withErrorHandler()`, and Drizzle queries are parameterized only.

> Test sub-tasks are marked with `*` and are optional (skippable for a faster MVP). Core implementation sub-tasks are never optional.

## Tasks

- [x] 1. API foundation (`apps/web/src/lib/api/`, `packages/errors/`)
  - [x] 1.1 Implement/verify response helpers
    - `apiSuccess<T>(data, meta?, status)`, `ok`, `created`, `noContent` building `{ success: true, data, meta? }` with `meta = { page, totalPages, totalCount }`
    - _Requirements: 1.1, 1.2_
  - [x]* 1.2 Write property test for the success envelope
    - **Property 1: Success envelope wraps data and pagination**
    - **Validates: Requirements 1.1, 1.2**
    - `fast-check` + Vitest, ≥100 runs, tag `// Feature: backend-api, Property 1: Success envelope wraps data and pagination`
  - [x] 1.3 Implement/verify `withErrorHandler()`
    - Serialize `AppError` to `{ success: false, error: { code, message, statusCode, requestId, retryable, details? } }` with HTTP status = `statusCode`; map non-`AppError` to `INTERNAL_ERROR`/500/`retryable: true` and report to Sentry; attach `requestId` from `x-request-id` or generate `req_{nanoid(12)}`
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7_
  - [x]* 1.4 Write property test for AppError serialization
    - **Property 2: AppError serializes to the error envelope with its status**
    - **Validates: Requirements 1.3, 1.4, 1.6**
    - ≥100 runs, tag `// Feature: backend-api, Property 2: AppError serializes to the error envelope with its status`
  - [x]* 1.5 Write property test for unexpected-error mapping
    - **Property 3: Unexpected errors become INTERNAL_ERROR 500**
    - **Validates: Requirements 1.5, 1.6**
    - ≥100 runs, tag `// Feature: backend-api, Property 3: Unexpected errors become INTERNAL_ERROR 500`
  - [x]* 1.6 Write unit test for Sentry reporting
    - Mock Sentry; assert `captureException` called once for a non-`AppError` and not called for an operational `AppError`
    - _Requirements: 1.7_
  - [x] 1.7 Implement/verify session and RBAC helpers (`session.ts`)
    - `requireSession()` (→ `UNAUTHENTICATED` 401), `getOptionalSession()`, `requireRole(minRole)` comparing against `customer < staff < receptionist < manager < owner < developer` (→ `FORBIDDEN` 403)
    - _Requirements: 5.1, 6.1, 10.1_
  - [x]* 1.8 Write property test for RBAC level comparison
    - **Property 23: Admin access requires at least Receptionist**
    - **Validates: Requirements 10.1**
    - ≥100 runs, tag `// Feature: backend-api, Property 23: Admin access requires at least Receptionist`
  - [x]* 1.9 Write unit tests for unauthenticated gates
    - Assert booking create and booking list return `UNAUTHENTICATED` 401 with no session
    - _Requirements: 5.1, 6.1_

- [x] 2. Shared Zod schemas (`packages/types/`)
  - [x] 2.1 Implement/verify envelope schemas in `api.ts`
    - `apiSuccessSchema<T>` (with optional pagination `meta`) and `apiErrorResponseSchema`
    - _Requirements: 1.1, 1.2_
  - [x] 2.2 Implement/verify input schemas
    - `service.ts`, `booking.ts` (create/cancel/reschedule), `lead.ts` (Indian phone), `admin-booking.ts` (`approve`/`reject`/`assign` discriminated union, `complete` with payment method)
    - _Requirements: 5.2, 5.3, 5.4, 7.1, 8.1, 9.1, 9.3, 11.1, 11.2, 12.1_
  - [x]* 2.3 Write unit tests for schema validation edge cases
    - Empty `serviceIds` rejected; reschedule/cancel payload shapes; admin action discriminated union
    - _Requirements: 5.3_

- [x] 3. Business: booking number and pricing (`packages/business/src/booking/`)
  - [x] 3.1 Implement `generateBookingNumber(branchCode, serviceType, date, isMembershipSession)`
    - Format `BK-{branchCode}-{YYMM}-{H|S}-{5 alphanumeric}` with `-M` suffix for membership sessions; `H` = salon, `S` = spa; `YYMM` from creation date
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [x]* 3.2 Write property test for booking-number format
    - **Property 9: Booking number matches the structured format**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
    - ≥100 runs, tag `// Feature: backend-api, Property 9: Booking number matches the structured format`
  - [x] 3.3 Implement `calculateBookingTotal(services)` and `addMinutesToTime(time, minutes)`
    - Integer paise sum of prices and minute sum of durations; `HH:MM` add with 24h wrap
    - _Requirements: 5.5, 5.6_
  - [x]* 3.4 Write property test for booking totals
    - **Property 10: Booking totals equal the sums of selected services**
    - **Validates: Requirements 5.5, 5.6**
    - ≥100 runs, tag `// Feature: backend-api, Property 10: Booking totals equal the sums of selected services`

- [x] 4. Business: reschedule eligibility and slot rules (`packages/business/src/booking/reschedule.ts`)
  - [x] 4.1 Implement `checkReschedulable({ status, rescheduleCount })` and `isBookableSlotStart(startTime, durationMinutes)`
    - Discriminated reschedule result gated by status and `MAX_RESCHEDULES = 2`; slot start aligned to the 30-min grid within open hours, finishing before close
    - _Requirements: 8.2, 8.3_
  - [x]* 4.2 Write property test for reschedule gating
    - **Property 20: Reschedule is gated by status and maximum count**
    - **Validates: Requirements 8.2**
    - ≥100 runs, tag `// Feature: backend-api, Property 20: Reschedule is gated by status and maximum count`
  - [x]* 4.3 Write property test for slot bookability
    - **Property 21: Slot bookability aligns to the grid within open hours**
    - **Validates: Requirements 8.3**
    - ≥100 runs, in its own test file, tag `// Feature: backend-api, Property 21: Slot bookability aligns to the grid within open hours`

- [x] 5. Business: GST and gems (`packages/business/src/invoicing/`, `packages/business/src/loyalty/`)
  - [x] 5.1 Implement `splitGST(inclusivePaise)`
    - `taxable = round(total / 1.18)`, `gst = total - taxable`, equal CGST/SGST halves (remainder paise to SGST); `taxable + gst === total` exactly
    - _Requirements: 12.2_
  - [x]* 5.2 Write property test for the GST split
    - **Property 27: GST split reconstructs the total exactly**
    - **Validates: Requirements 12.2**
    - ≥100 runs, tag `// Feature: backend-api, Property 27: GST split reconstructs the total exactly`
  - [x] 5.3 Implement `calculateGemsEarned(totalPaise, isMembershipSession)`
    - `floor(totalPaise / 10000)` for regular service; exactly `0` for membership sessions
    - _Requirements: 12.3, 12.4_
  - [x]* 5.4 Write property test for gems award
    - **Property 28: Gems award is floor of rupees, zero for membership sessions**
    - **Validates: Requirements 12.3, 12.4**
    - ≥100 runs, tag `// Feature: backend-api, Property 28: Gems award is floor of rupees, zero for membership sessions`

- [x] 6. Business: phone validation (`packages/business/src/lead/phone.ts`)
  - [x] 6.1 Implement Indian mobile validation/normalization
    - Accept `^(?:\+?91|0)?[6-9]\d{9}$`; normalize to `+91XXXXXXXXXX`
    - _Requirements: 9.3_
  - [x]* 6.2 Write property test for phone validation
    - **Property 22: Indian mobile validation accepts only valid numbers**
    - **Validates: Requirements 9.3**
    - ≥100 runs, tag `// Feature: backend-api, Property 22: Indian mobile validation accepts only valid numbers`

- [x] 7. Checkpoint — Ensure all tests pass
  - Ensure all foundation and business-layer tests pass, ask the user if questions arise.

- [x] 8. Query layer: services (`packages/db/src/queries/services.ts`)
  - [x] 8.1 Implement `getActiveCatalogue()`, `getServiceBySlug(slug)`, `getServicesByIds(ids)`
    - Active categories ordered by `displayOrder`, each with active services ordered by `displayOrder`; full projection (category name, price paise, duration, gem fields)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x]* 8.2 Write property test for catalogue filtering and ordering
    - **Property 4: Catalogue returns exactly the active, ordered records**
    - **Validates: Requirements 2.1, 2.2, 2.3**
    - ≥100 runs over generated category/service sets via in-memory fake, tag `// Feature: backend-api, Property 4: Catalogue returns exactly the active, ordered records`
  - [x]* 8.3 Write property test for service-by-slug projection
    - **Property 5: Service-by-slug returns the matching active service with full projection**
    - **Validates: Requirements 2.4**
    - ≥100 runs, tag `// Feature: backend-api, Property 5: Service-by-slug returns the matching active service with full projection`

- [x] 9. Query layer: bookings and leads (`packages/db/src/queries/bookings.ts`, `leads.ts`)
  - [x] 9.1 Implement booking read queries
    - `getBookingsByCustomer(customerId, statusFilter?)`, `getBookingByIdForCustomer(id, customerId)` returning services/status/timestamps
    - _Requirements: 6.2, 6.3, 6.4_
  - [x]* 9.2 Write property test for customer listing ownership and filter
    - **Property 14: Customer listing respects ownership and status filter**
    - **Validates: Requirements 6.2, 6.3**
    - ≥100 runs via in-memory fake dataset, tag `// Feature: backend-api, Property 14: Customer listing respects ownership and status filter`
  - [x]* 9.3 Write property test for owned single-booking detail
    - **Property 15: Owned single booking returns full detail**
    - **Validates: Requirements 6.4**
    - ≥100 runs, tag `// Feature: backend-api, Property 15: Owned single booking returns full detail`
  - [x] 9.4 Implement booking mutation queries
    - `createBookingWithServices(...)` (atomic txn writing `booking` + snapshotted `booking_service` rows), `cancelBooking(...)`, `rescheduleBooking(...)`, `insertStatusLog(...)`, `getDefaultStaffForService(...)`
    - _Requirements: 5.7, 7.1, 7.4, 7.5, 8.1, 8.4_
  - [x] 9.5 Implement `createLead(...)`
    - Insert `lead` with status `new`, default `source = 'meta_ad'`, optional UTM fields
    - _Requirements: 9.1, 9.4_

- [x] 10. Query layer: admin bookings (`packages/db/src/queries/admin-bookings.ts`, `invoices.ts`, `loyalty.ts`)
  - [x] 10.1 Implement `listBookings(filters)`
    - Cross-customer listing with customer/services/staff/status projection; status, date, service-type filters
    - _Requirements: 10.2, 10.3, 10.4, 10.5_
  - [x]* 10.2 Write property test for admin listing filters
    - **Property 24: Admin listing filters are honoured**
    - **Validates: Requirements 10.3, 10.4, 10.5**
    - ≥100 runs via in-memory fake dataset, tag `// Feature: backend-api, Property 24: Admin listing filters are honoured`
  - [x] 10.3 Implement admin mutation queries
    - `approveBooking(...)`, `rejectBooking(...)`, `assignStaff(...)`, and `completeBookingWithInvoice(...)` (single txn: status → completed + invoice with GST split + invoice items + gems credit + status log)
    - _Requirements: 11.1, 11.2, 11.4, 12.1_

- [x] 11. Availability service (`packages/business/src/booking/` or `apps/web/src/lib/api/`)
  - [x] 11.1 Implement availability slot generation and past-date rejection
    - Fixed 30-min grid within branch hours (open 10:00, last start 20:30, close 21:00); `endTime` = start + 30; mark unavailable outside hours, on holidays, and (for today, IST) before current IST time; reject past dates with `VALIDATION_ERROR` 400 before generating slots
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  - [x]* 11.2 Write property test for slot grid and flags
    - **Property 7: Availability slots form a 30-minute grid with correct flags**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.6**
    - ≥100 runs, tag `// Feature: backend-api, Property 7: Availability slots form a 30-minute grid with correct flags`
  - [x]* 11.3 Write property test for past-date rejection
    - **Property 8: Past dates are rejected**
    - **Validates: Requirements 3.4**
    - ≥100 runs, in its own test file, tag `// Feature: backend-api, Property 8: Past dates are rejected`

- [x] 12. Checkpoint — Ensure all tests pass
  - Ensure all query-layer and availability tests pass, ask the user if questions arise.

- [x] 13. Customer API routes (`apps/web/src/app/api/`)
  - [x] 13.1 Implement `GET /api/services` and `GET /api/services/[slug]`
    - Return active ordered catalogue; single active service or `NOT_FOUND` 404
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x]* 13.2 Write property test for unknown/inactive slug
    - **Property 6: Unknown or inactive slug yields NOT_FOUND**
    - **Validates: Requirements 2.5**
    - ≥100 runs against the route with a query-layer fake, tag `// Feature: backend-api, Property 6: Unknown or inactive slug yields NOT_FOUND`
  - [x] 13.3 Implement `GET /api/availability?date=&branchId=`
    - Validate/parse query, reject past dates (400), return slots with flags
    - _Requirements: 3.1, 3.4_
  - [x] 13.4 Implement `/api/bookings` (GET list + POST create) and `GET /api/bookings/[id]`
    - Require session; validate branch/services/slot; compute totals; snapshot services; create `pending` (or `confirmed` for walk-in); list only the caller's bookings with optional status filter; single owned booking or `NOT_FOUND` 404
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 6.1, 6.2, 6.3, 6.4, 6.5_
  - [x]* 13.5 Write property test for service snapshots
    - **Property 11: Each selected service is snapshotted**
    - **Validates: Requirements 5.7**
    - ≥100 runs with query-layer fake, tag `// Feature: backend-api, Property 11: Each selected service is snapshotted`
  - [x]* 13.6 Write property test for mixed-service-type rejection
    - **Property 12: Mixed service types are rejected**
    - **Validates: Requirements 5.4**
    - ≥100 runs, tag `// Feature: backend-api, Property 12: Mixed service types are rejected`
  - [x]* 13.7 Write property test for walk-in initial status
    - **Property 13: Walk-in bookings start confirmed**
    - **Validates: Requirements 5.9**
    - ≥100 runs, tag `// Feature: backend-api, Property 13: Walk-in bookings start confirmed`
  - [x]* 13.8 Write property test for cross-customer access
    - **Property 16: Cross-customer booking access yields NOT_FOUND**
    - **Validates: Requirements 6.5**
    - ≥100 runs, tag `// Feature: backend-api, Property 16: Cross-customer booking access yields NOT_FOUND`
  - [x]* 13.9 Write unit/edge tests for booking-create guards
    - 401 without session (5.1), empty `serviceIds` → 400 (5.3), forced unavailable slot → `BOOKING_SLOT_UNAVAILABLE` 409 (5.8), list 401 (6.1)
    - _Requirements: 5.1, 5.3, 5.8, 6.1_
  - [x] 13.10 Implement `POST /api/bookings/[id]/cancel`
    - Cancel owned `pending`/`confirmed` booking, record timestamp + reason, log transition; guard invalid states
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [x]* 13.11 Write property test for cancellation transition
    - **Property 17: Cancelling an active booking transitions to cancelled and logs it**
    - **Validates: Requirements 7.1, 7.4, 7.5**
    - ≥100 runs, tag `// Feature: backend-api, Property 17: Cancelling an active booking transitions to cancelled and logs it`
  - [x]* 13.12 Write property test for cancellation guards
    - **Property 18: Cancellation transition guards reject invalid states**
    - **Validates: Requirements 7.2, 7.3**
    - ≥100 runs, tag `// Feature: backend-api, Property 18: Cancellation transition guards reject invalid states`
  - [x] 13.13 Implement `POST /api/bookings/[id]/reschedule`
    - Move owned booking to a new slot, enforce `MAX_RESCHEDULES`, increment count, log transition; reject unavailable slot (409)
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [x]* 13.14 Write property test for rescheduling
    - **Property 19: Rescheduling updates the slot, increments the count, and logs it**
    - **Validates: Requirements 8.1, 8.4**
    - ≥100 runs, tag `// Feature: backend-api, Property 19: Rescheduling updates the slot, increments the count, and logs it`
  - [x] 13.15 Implement `POST /api/leads`
    - Public, validate Indian phone, create `new` lead, store UTM, return id
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x]* 13.16 Write integration tests for booking and lead happy paths
    - Valid booking yields `pending` + id + booking number with snapshots written atomically (5.2); valid lead yields `new` + id (9.1)
    - _Requirements: 5.2, 9.1_

- [x] 14. Admin API routes (`apps/admin/app/api/`, `apps/admin/src/lib/api/`)
  - [x] 14.1 Implement admin API foundation parity
    - `withErrorHandler()`, response helpers, `requireRole` in the admin app sharing the identical envelope/RBAC contracts
    - _Requirements: 10.1_
  - [x] 14.2 Implement `GET /api/bookings` (admin)
    - Require ≥ receptionist; list across customers with projection; honour status/date/service-type filters
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  - [x]* 14.3 Write unit test for admin listing projection
    - Assert returned rows carry customer name, services, assigned staff, status
    - _Requirements: 10.2_
  - [x] 14.4 Implement `PATCH /api/bookings/[id]` (approve/reject/assign)
    - Discriminated action; `approve` → confirmed + staff, `reject` → rejected + reason, `assign` → reassign; require `pending` for approve/reject else `BOOKING_INVALID_STATUS_TRANSITION` 409; log transitions with acting user
    - _Requirements: 11.1, 11.2, 11.3, 11.4_
  - [x]* 14.5 Write property test for approval/rejection transitions
    - **Property 25: Approval and rejection transition only from pending and are logged**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4**
    - ≥100 runs with query-layer fake, tag `// Feature: backend-api, Property 25: Approval and rejection transition only from pending and are logged`
  - [x] 14.6 Implement `POST /api/bookings/[id]/complete`
    - `confirmed`/`in_progress` → `completed` + service invoice (GST split) + gems award (zero for membership sessions); already-`completed` → 409
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_
  - [x]* 14.7 Write property test for completion transition and invoice
    - **Property 26: Completion transitions to completed and creates a service invoice**
    - **Validates: Requirements 12.1, 12.5**
    - ≥100 runs with query-layer fake, tag `// Feature: backend-api, Property 26: Completion transitions to completed and creates a service invoice`
  - [x]* 14.8 Write integration test for completion happy path
    - `confirmed`/`in_progress` booking becomes `completed` with invoice + gems credited in one transaction
    - _Requirements: 12.1_

- [x] 15. Checkpoint — Ensure all tests pass
  - Ensure all customer and admin route tests pass, ask the user if questions arise.

- [x] 16. UI wiring
  - [x] 16.1 Wire the services page (`apps/web/src/app/(customer)/services`)
    - Source categories/services from `GET /api/services`; loading state; error state with retry
    - _Requirements: 13.1, 13.2, 13.3_
  - [x]* 16.2 Write component test for the services page
    - MSW-mocked endpoint: data source (13.1), loading (13.2), error + retry (13.3)
    - _Requirements: 13.1, 13.2, 13.3_
  - [x] 16.3 Wire the booking dialog (`apps/web/src/components/booking/`)
    - On open load catalogue; on date select load availability; on submit `POST /api/bookings` and show booking number; show error message on failure
    - _Requirements: 14.1, 14.2, 14.3, 14.4_
  - [x]* 16.4 Write component test for the booking dialog
    - Catalogue on open (14.1), availability on date select (14.2), booking number on success (14.3), error message on failure (14.4)
    - _Requirements: 14.1, 14.2, 14.3, 14.4_
  - [x] 16.5 Wire the admin bookings page (`apps/admin/app/bookings`)
    - Load from `GET /api/bookings`; re-request on filter change; loading state in flight
    - _Requirements: 15.1, 15.2, 15.3_
  - [x]* 16.6 Write component test for the admin bookings page
    - Data source (15.1), re-request with filter params (15.2), loading state (15.3)
    - _Requirements: 15.1, 15.2, 15.3_

- [x] 17. Final checkpoint — Ensure all tests pass
  - Ensure the full suite (unit, property, integration, component) passes, ask the user if questions arise.

## Notes

- Sub-tasks marked with `*` are optional tests and can be skipped for a faster MVP; core implementation sub-tasks are never optional.
- Each property test is implemented once, runs ≥100 iterations on `fast-check` + Vitest, uses in-memory fakes for any query-layer dependency (no real DB or external service), and carries its `// Feature: backend-api, Property {n}: {title}` tag.
- Pure functions are tested directly; route-level properties run against the route with a faked query layer and mocked session/Sentry.
- Many modules already exist in the repo; implementation sub-tasks include verifying and extending the current behavior to satisfy the referenced requirements (notably the `-M` booking-number suffix and the admin app routes/UI wiring).
- Checkpoints provide incremental validation gates between layers.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "1.7", "2.1", "2.2"] },
    { "id": 1, "tasks": ["1.2", "1.4", "1.5", "1.6", "1.8", "1.9", "2.3", "3.1", "3.3", "4.1", "5.1", "5.3", "6.1", "14.1"] },
    { "id": 2, "tasks": ["3.2", "3.4", "4.2", "4.3", "5.2", "5.4", "6.2", "8.1", "9.1", "9.5", "10.1", "11.1"] },
    { "id": 3, "tasks": ["8.2", "8.3", "9.2", "9.3", "9.4", "10.2", "10.3", "11.2", "11.3"] },
    { "id": 4, "tasks": ["13.1", "13.3", "13.4", "13.10", "13.13", "13.15", "14.2", "14.4", "14.6"] },
    { "id": 5, "tasks": ["13.2", "13.5", "13.6", "13.7", "13.8", "13.9", "13.11", "13.12", "13.14", "13.16", "14.3", "14.5", "14.7", "14.8", "16.1", "16.3", "16.5"] },
    { "id": 6, "tasks": ["16.2", "16.4", "16.6"] }
  ]
}
```
