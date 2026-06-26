# Implementation Plan — Gems Redemption

## Overview

Implements online gems redemption on `apps/web` per the design: a thin API route
orchestrates Zod validation → pure business helpers (`packages/business/loyalty`) →
a guarded data-access write (`packages/db/queries`). A successful redemption creates
a ₹0 `booking` (marked `is_gems_redemption`, earns zero gems, never combines with an
offer), paid via a single guarded data-modifying CTE that is atomic, race-safe, and
idempotent (client `idempotencyKey` persisted on `booking.redemption_key` with a
partial unique index).

Tasks are ordered bottom-up: error codes + schema + types + business + query layer
first, API after the query layer, UI after the API, verification last. Property-based
tests (fast-check + Vitest, ≥100 iterations) cover the 5 correctness properties.
Test sub-tasks are marked optional with `*`. Money stays in integer paise; gems stay
whole integers; all responses use the standard success/error envelope.

## Tasks

- [ ] 1. Add gems redemption error codes
  - [ ] 1.1 Register new error codes in `packages/errors/src/codes.ts`
    - Add `GEMS_SERVICE_NOT_REDEEMABLE` and `GEMS_INSUFFICIENT_BALANCE` to the `ERROR_CODES` registry
    - Ensure `AppError` factories/usages and any code-to-status mapping still compile with the two new codes
    - `GEMS_INSUFFICIENT_BALANCE` must be a distinct code from `GEMS_SERVICE_NOT_REDEEMABLE`, `NOT_FOUND`, and `VALIDATION_ERROR`
    - _Requirements: 11.1, 3.4, 3.5, 3.6_

- [ ] 2. Apply additive, nullable schema changes
  - [ ] 2.1 Extend `booking` schema in `packages/db/src/schema/booking.ts`
    - Add `isGemsRedemption: boolean('is_gems_redemption').notNull().default(false)`
    - Add `gemsRedeemed: integer('gems_redeemed')` (nullable)
    - Add `redemptionKey: text('redemption_key')` (nullable)
    - Add partial unique index `booking_redemption_key_uidx` on `redemption_key` `WHERE redemption_key IS NOT NULL`
    - All additions nullable/defaulted so existing bookings are unaffected (no destructive migration)
    - _Requirements: 6.1, 9.1, 10.1, 10.2_

  - [ ] 2.2 Add `bookingId` FK to `loyalty_transaction` in `packages/db/src/schema/loyalty.ts`
    - Add `bookingId: text('booking_id').references(() => booking.id, { onDelete: 'set null' })` (nullable)
    - Use the lazy `() =>` reference pattern to avoid a circular import between `loyalty.ts` and `booking.ts`
    - _Requirements: 4.2, 9.1_

- [ ] 3. Add redemption request types
  - [ ] 3.1 Create `redeemGemsSchema` in `packages/types/src/loyalty.ts`
    - Fields: `serviceId` (min 1), `branchId` (min 1), `bookingDate` (`/^\d{4}-\d{2}-\d{2}$/`), `startTime` (`/^\d{2}:\d{2}$/`), `idempotencyKey` (`z.string().min(8).max(64)`)
    - Export `RedeemGemsInput = z.infer<typeof redeemGemsSchema>`
    - Re-export from `packages/types/src/index.ts` alongside the booking schemas
    - Schema MUST NOT accept any client-supplied gems amount (Req 7.3)
    - _Requirements: 6.2, 7.3, 11.4_

  - [ ]* 3.2 Write unit tests for `redeemGemsSchema`
    - Reject missing/short (`<8`) / overlong (`>64`) `idempotencyKey`, malformed date/time, empty ids
    - Accept a valid body
    - _Requirements: 6.2, 11.4_

- [ ] 4. Implement pure business helpers
  - [ ] 4.1 Create `packages/business/src/loyalty/redeem.ts`
    - Implement `computeAffordability(balance, services)` returning each service with `affordable = gemsRequired != null && gemsRequired > 0 && balance >= gemsRequired`
    - Implement `assertRedeemable(service, balance)`: throw `GEMS_SERVICE_NOT_REDEEMABLE` (400) when inactive / not redeemable / null or non-positive `gemsRequired`; throw `GEMS_INSUFFICIENT_BALANCE` (409) when eligible but `balance < gemsRequired`; otherwise return the server-side `gemsRequired`
    - Pure functions only (no I/O); throw `AppError`
    - Export both via the `packages/business` index; reuse existing `isBookableSlotStart`, `addMinutesToTime`, `generateBookingNumber` (no changes)
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.4, 3.5, 3.6, 7.2, 7.3_

  - [ ]* 4.2 Write property test for affordability
    - **Property 2: Affordability is all-or-nothing**
    - Generate random integer `balance` + random service lists (nullable/0/negative `gemsRequired`, `balance = 0`); assert each `affordable` flag matches `gemsRequired != null && gemsRequired > 0 && balance >= gemsRequired`
    - fast-check + Vitest, `{ numRuns: 100 }`, tagged `// Feature: gems-redemption, Property 2: Affordability is all-or-nothing`
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [ ]* 4.3 Write property test for eligibility gate
    - **Property 3: Eligibility gate charges the server-side amount or rejects**
    - Generate random `(isActive, gemsRedeemable, gemsRequired)` + balances + a random "client value"; assert `assertRedeemable` returns exactly `gemsRequired` iff eligible AND `balance >= gemsRequired`, throws `GEMS_SERVICE_NOT_REDEEMABLE` on ineligible, throws `GEMS_INSUFFICIENT_BALANCE` when eligible but short, and the returned charge ignores the client value
    - fast-check + Vitest, `{ numRuns: 100 }`, tagged `// Feature: gems-redemption, Property 3: Eligibility gate charges the server-side amount or rejects`
    - **Validates: Requirements 3.1, 3.4, 3.5, 3.6, 7.2, 7.3**

- [ ] 5. Implement the data-access layer
  - [ ] 5.1 Create `packages/db/src/queries/redemptions.ts`
    - `getRedeemableServiceById(serviceId)`: live re-read joining the service to its category for `serviceType` (`salon`/`spa`), returning `gemsRequired`, `gemsRedeemable`, `isActive`, `durationMinutes`, `pricePaise`, `name` (or `null`) for execution-time re-validation
    - `redeemServiceWithGems(...)`: the single guarded data-modifying CTE via Drizzle parameterized `sql` — `UPDATE loyalty_account SET gems_balance = gems_balance - req, total_gems_redeemed = total_gems_redeemed + req WHERE id = accountId AND gems_balance >= req` gating `INSERT … SELECT … FROM guard` for `booking`, `booking_service`, and the `redeemed` `loyalty_transaction`
    - Pre-generate all ids with `nanoid()`; charge the SERVER-side `gemsRequired`; booking fields: `status='pending'`, `total_amount_paise=0`, `is_walkin=false`, `offerId=null`, `is_gems_redemption=true`, `gems_redeemed=req`, `redemption_key=idempotencyKey`; `booking_service.price_at_booking_paise=0`; store the `redeemed` transaction `gemsAmount` as positive `req` (history-display convention) linked via `bookingId`
    - 0 returned rows → throw `GEMS_INSUFFICIENT_BALANCE`; catch the `redemption_key` unique-constraint violation → return the existing booking (`{ duplicate: true, ... }`), never a 500
    - Re-export both from the `packages/db` queries index; reuse `getRedeemableServices`, `getDefaultStaffForService`, `getOrCreateLoyaltyAccount`, `getLoyaltySummary`, `getBranchById` (no changes)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 6.1, 7.1_

  - [ ]* 5.2 Write property test for the catalogue filter
    - **Property 1: Catalogue filter admits exactly the eligible services**
    - Generate random service arrays (random `gemsRedeemable`, `isActive`, nullable `gemsRequired`); assert membership iff `gemsRedeemable === true && isActive === true && gemsRequired != null`
    - fast-check + Vitest, `{ numRuns: 100 }`, tagged `// Feature: gems-redemption, Property 1: Catalogue filter admits exactly the eligible services`
    - **Validates: Requirements 1.2, 1.3**

  - [ ]* 5.3 Write property test for the guarded-deduction model
    - **Property 4: Guarded deduction preserves the balance invariant**
    - Build a pure in-memory reducer mirroring `UPDATE … WHERE gems_balance >= req`; generate a random initial balance + random sequence of integer costs; assert each accepted attempt deducts exactly its cost and increments `totalGemsRedeemed` and logs one `redeemed` txn, each rejected attempt is a no-op, balance never negative, and cumulative accepted ≤ initial balance
    - fast-check + Vitest, `{ numRuns: 100 }`, tagged `// Feature: gems-redemption, Property 4: Guarded deduction preserves the balance invariant`
    - **Validates: Requirements 3.1, 3.2, 4.1, 4.3, 5.2, 5.3, 5.4**

  - [ ]* 5.4 Write property test for idempotent redemption
    - **Property 5: Idempotent redemption deducts at most once per key**
    - Generate sequences with repeated idempotency keys interleaved with distinct ones; assert each key deducts gems at most once and every duplicate submission returns the same record without further deduction
    - fast-check + Vitest, `{ numRuns: 100 }`, tagged `// Feature: gems-redemption, Property 5: Idempotent redemption deducts at most once per key`
    - **Validates: Requirements 6.1**

- [ ] 6. Checkpoint — data and business layer
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement the API routes (thin orchestrators)
  - [ ] 7.1 Create `GET apps/web/src/app/api/gems/route.ts`
    - `requireSession()` → 401 if unauthenticated
    - Resolve balance via `getOrCreateLoyaltyAccount` + `getLoyaltySummary` (0 if no account); load `getRedeemableServices()` and drop `gemsRequired == null` rows; apply `computeAffordability(balance, services)`
    - Return `apiSuccess({ balance, totalEarned, totalRedeemed, catalogue })` (standard envelope); no DB queries inline beyond the query-layer calls
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 8.3, 11.3, 11.4_

  - [ ] 7.2 Create `POST apps/web/src/app/api/gems/redeem/route.ts`
    - Pipeline: `requireSession()` (401) → `redeemGemsSchema.safeParse` (400) → `getOrCreateLoyaltyAccount(session.user.id)` → `getBranchById(branchId)` (400 if missing/not operational) → `getRedeemableServiceById(serviceId)` (404 if null) → `assertRedeemable(service, balance)` → `isBookableSlotStart(startTime, duration)` (409 if not) → `getDefaultStaffForService(serviceId)` (400 if none) → `generateBookingNumber(branch.code, serviceType, date)` → `redeemServiceWithGems({ ... server gemsRequired ... })`
    - Resolve the account from the SESSION, never client ids; pass the SERVER `gemsRequired` to the write; on `{ duplicate: true }` return the existing booking
    - Return `apiSuccess({ bookingNumber, reference, gemsSpent, newBalance }, _, 201)`
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 6.1, 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 10.1, 10.2, 11.1, 11.2, 11.3, 11.4_

  - [ ]* 7.3 Write route tests with an in-memory fake data layer
    - Cases: insufficient → 409 `GEMS_INSUFFICIENT_BALANCE`, balance unchanged, nothing persisted; success → 201 with `isGemsRedemption=true`, `gemsRedeemed=cost`, `totalAmountPaise=0`, `offerId=null`, one linked `redeemed` txn, `newBalance = balance - cost`; concurrency/double-spend → at most the feasible subset succeeds, balance never negative; idempotency → same key twice deducts once; auth → no session ⇒ 401, no write; re-validation → service mutated to inactive/non-redeemable ⇒ rejected and client gems amount ignored; not-found → unknown `serviceId` ⇒ 404; no account ⇒ balance 0 ⇒ non-zero cost rejects as insufficient
    - _Requirements: 3.2, 4.1, 4.2, 4.3, 5.2, 5.3, 5.4, 6.1, 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 9.1, 10.1, 10.2, 11.1, 11.2, 11.3_

  - [ ]* 7.4 Write the integration happy-path test (real DB)
    - Against a seeded redeemable service, assert all four writes persist together (balance deduction, `totalGemsRedeemed` increment, `redeemed` txn, booking + booking_service) on success and none persist after a forced guard failure (atomicity)
    - Assert `getRedeemableServices` returns rows ordered by `gemsCatalogueOrder` ascending, nulls last
    - _Requirements: 1.5, 4.4_

- [ ] 8. Implement the presentation layer
  - [ ] 8.1 Create `apps/web/src/components/gems/RedeemFlow.tsx` (`'use client'`)
    - For an affordable service: open a dialog → pick date → fetch `GET /api/availability` → pick slot → confirm → `POST /api/gems/redeem` with a generated `idempotencyKey` (stable per attempt); disable the confirm button while in-flight; show the booking reference + updated balance on success
    - Non-affordable services disabled with a "Not enough gems" hint
    - WCAG 2.1 AA: dialog focus trap, labelled controls, `aria-live` on the result region
    - _Requirements: 2.1, 2.2, 6.1, 9.2, 9.3_

  - [ ] 8.2 Edit `apps/web/src/app/(customer)/gems/page.tsx`
    - Remove the read-only "ask our team at the counter / no online redemption" copy
    - Render the catalogue through `RedeemFlow`, passing the initial `balance` + `catalogue` (with affordability) from the server component; keep the balance hero + history
    - _Requirements: 1.1, 1.4, 2.1, 2.2, 9.2_

  - [ ]* 8.3 Write the RedeemFlow component test
    - Vitest + React Testing Library: affordable service opens the dialog; date/slot selection calls `/api/availability`; confirm POSTs to `/api/gems/redeem` with a generated `idempotencyKey`; confirmation shows reference + updated balance; confirm button disabled while in-flight; non-affordable services disabled; assert dialog focus trap, labelled controls, `aria-live` result region
    - _Requirements: 2.1, 2.2, 6.1, 9.2, 9.3_

- [ ] 9. Verification
  - [ ] 9.1 Run typecheck + lint and apply the schema
    - Run the workspace typecheck and Biome lint; fix any errors surfaced by the new codes, schema, types, business, query, API, and UI changes
    - Apply the additive schema with `cd packages/db && bunx drizzle-kit push` (additive/nullable only — no destructive migration)
    - _Requirements: 2.1, 2.2, 4.4_

- [ ] 10. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each property test uses fast-check + Vitest with a minimum of 100 iterations and is tagged `// Feature: gems-redemption, Property {n}: {title}`.
- Properties 1–5 target the pure cores and an in-memory model; DB atomicity (Req 4.4) and catalogue ordering (Req 1.5) are covered by the integration test (7.4).
- The guarded atomic write is the one justified use of Drizzle's parameterized `sql` template; it uses bound parameters, never string concatenation.
- Money stays in integer paise; gems stay whole integers; all API responses use the standard success/error envelope.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2", "3.1"] },
    { "id": 1, "tasks": ["3.2", "4.1", "5.1"] },
    { "id": 2, "tasks": ["4.2", "4.3", "5.2", "5.3", "5.4", "7.1", "7.2"] },
    { "id": 3, "tasks": ["7.3", "7.4", "8.1"] },
    { "id": 4, "tasks": ["8.2", "8.3"] },
    { "id": 5, "tasks": ["9.1"] }
  ]
}
```
