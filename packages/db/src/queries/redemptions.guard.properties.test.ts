/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-08-2026 & Updated - 04-08-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : redemptions.guard.properties.test
 * Scope        : Property-based tests — Guarded gems-deduction write
 *
 * Feature      : gems-redemption
 * Properties   : 4 — Guarded deduction preserves the balance invariant
 *                5 — Idempotent redemption deducts at most once per key
 * Validates    : Requirements 3.1, 3.2, 4.1, 4.3, 5.2, 5.3, 5.4, 6.1
 *
 * Description  : fast-check + Vitest property tests over a pure in-memory model
 *                of the guarded data-modifying CTE in
 *                packages/db/src/queries/redemptions.ts
 *                (`redeemServiceWithGems`). The real statement needs a live
 *                Postgres, so — exactly as the design's Testing Strategy
 *                prescribes — these properties run against a reducer that
 *                mirrors its semantics step for step:
 *
 *                  1. the pre-write `redemption_key` lookup, which resolves an
 *                     already-honoured key to its booking BEFORE — and therefore
 *                     independently of — the balance guard
 *                  2. the guard `UPDATE loyalty_account
 *                       SET gems_balance = gems_balance - req,
 *                           total_gems_redeemed = total_gems_redeemed + req
 *                     WHERE id = :account AND gems_balance >= req`
 *                  3. every downstream `INSERT … SELECT … FROM guard` inserts
 *                     ZERO rows when the guard matched zero rows
 *                  4. the `booking_redemption_key_uidx` partial unique index,
 *                     which for two concurrent FIRST attempts aborts (and
 *                     therefore rolls back) the WHOLE statement on a duplicate
 *                     `redemption_key`, after which the query function resolves
 *                     the replay to the already-created booking — the same
 *                     outcome step 1 yields, so the model folds the two
 *
 *                DB-level atomicity (Req 4.4) and SQL ordering (Req 1.5) are
 *                verified by redemptions.integration.test.ts, not here.
 *
 * Responsibilities :
 * - Accepted attempts deduct exactly their cost, bump totalGemsRedeemed by
 *   exactly their cost, and log exactly one positive `redeemed` transaction
 * - Rejected attempts are complete no-ops (nothing persisted at all)
 * - The balance is never negative and cumulative accepted ≤ initial balance
 * - A repeated idempotency key never deducts twice
 *
 * Tech Stack   : Vitest + fast-check
 * Layer        : Test
 *
 * Dependencies : fast-check, vitest
 *
 * Notes        : Gems are whole integers. Non-positive costs never reach this
 *                write — `assertRedeemable` rejects them first (Property 3) — so
 *                the generators emit positive integer costs only.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

// ── The model ───────────────────────────────────────────────────────────────

/** One redemption submission, as the route hands it to the guarded write. */
type Attempt = {
  /** Client idempotency key → `booking.redemption_key`. */
  key: string
  /** SERVER-side gemsRequired (Req 7.3). Always a positive integer. */
  cost: number
  serviceId: string
  serviceName: string
}

/** The `booking` row a successful redemption creates. */
type ModelBooking = {
  id: string
  redemptionKey: string
  status: 'pending'
  totalAmountPaise: 0
  isGemsRedemption: true
  gemsRedeemed: number
  offerId: null
  serviceId: string
  priceAtBookingPaise: 0
}

/** The `loyalty_transaction` row a successful redemption creates. */
type ModelTransaction = {
  type: 'redeemed'
  /** Stored POSITIVE — the history display applies the sign (Req 4.5). */
  gemsAmount: number
  bookingId: string
}

type ModelStore = {
  gemsBalance: number
  totalGemsRedeemed: number
  bookings: ModelBooking[]
  transactions: ModelTransaction[]
}

type Outcome =
  /** Guard matched a row → all four writes committed together. */
  | { kind: 'accepted'; bookingId: string; gemsSpent: number; newBalance: number }
  /** Guard matched 0 rows → GEMS_INSUFFICIENT_BALANCE, nothing persisted. */
  | { kind: 'rejected' }
  /** redemption_key unique violation → statement rolled back, replay resolved. */
  | { kind: 'duplicate'; bookingId: string }

function initialStore(balance: number): ModelStore {
  return { gemsBalance: balance, totalGemsRedeemed: 0, bookings: [], transactions: [] }
}

/**
 * Apply one attempt, mirroring the guarded CTE. Returns a NEW store — a rejected
 * or rolled-back attempt returns the store it was given, unchanged.
 */
function applyAttempt(
  store: ModelStore,
  attempt: Attempt,
  bookingId: string,
): { store: ModelStore; outcome: Outcome } {
  // Step 1 — the pre-write redemption_key lookup. A key already honoured resolves
  // straight to its booking, ahead of and independently of the balance guard: the
  // remaining balance after the first deduction may no longer cover the cost, and
  // a replay must NOT be reported as insufficient balance. It also stands in for
  // the partial unique index, which catches the same collision for two concurrent
  // FIRST attempts (aborting and rolling back the whole statement, so the guard's
  // deduction is undone) and resolves to the same already-created booking.
  const existing = store.bookings.find((b) => b.redemptionKey === attempt.key)
  if (existing) {
    return { store, outcome: { kind: 'duplicate', bookingId: existing.id } }
  }

  // Step 2 — the guard. `UPDATE … WHERE gems_balance >= req` matches no row when
  // the balance is short, so nothing downstream inserts anything.
  if (store.gemsBalance < attempt.cost) {
    return { store, outcome: { kind: 'rejected' } }
  }

  // Step 3 — the guard matched, so all four writes commit together.
  const booking: ModelBooking = {
    id: bookingId,
    redemptionKey: attempt.key,
    status: 'pending',
    totalAmountPaise: 0,
    isGemsRedemption: true,
    gemsRedeemed: attempt.cost,
    offerId: null,
    serviceId: attempt.serviceId,
    priceAtBookingPaise: 0,
  }
  const next: ModelStore = {
    gemsBalance: store.gemsBalance - attempt.cost,
    totalGemsRedeemed: store.totalGemsRedeemed + attempt.cost,
    bookings: [...store.bookings, booking],
    transactions: [
      ...store.transactions,
      { type: 'redeemed', gemsAmount: attempt.cost, bookingId: bookingId },
    ],
  }
  return {
    store: next,
    outcome: {
      kind: 'accepted',
      bookingId,
      gemsSpent: attempt.cost,
      newBalance: next.gemsBalance,
    },
  }
}

// ── Generators ──────────────────────────────────────────────────────────────

const balanceArb = fc.oneof(
  { arbitrary: fc.constant(0), weight: 1 },
  { arbitrary: fc.integer({ min: 0, max: 2000 }), weight: 4 },
)

/** Costs are positive whole gems; `assertRedeemable` rejects anything else. */
const costArb = fc.integer({ min: 1, max: 900 })

/** Distinct keys — isolates the balance arithmetic from idempotency. */
const distinctAttemptsArb = fc.array(costArb, { maxLength: 10 }).map((costs) =>
  costs.map(
    (cost, index): Attempt => ({
      key: `key-distinct-${index}`,
      cost,
      serviceId: `svc-${index}`,
      serviceName: `Service ${index}`,
    }),
  ),
)

/** A tiny key pool so repeats are frequent, interleaved with distinct keys. */
const repeatingAttemptsArb = fc
  .array(fc.tuple(fc.constantFrom('k1', 'k2', 'k3'), costArb, fc.boolean()), {
    minLength: 1,
    maxLength: 12,
  })
  .map((rows) =>
    rows.map(
      ([pooledKey, cost, usePool], index): Attempt => ({
        key: usePool ? pooledKey : `key-unique-${index}`,
        cost,
        serviceId: `svc-${index}`,
        serviceName: `Service ${index}`,
      }),
    ),
  )

// ===========================================================================
// Feature: gems-redemption, Property 4: Guarded deduction preserves the balance
//          invariant
// Validates: Requirements 3.1, 3.2, 4.1, 4.3, 5.2, 5.3, 5.4
// ===========================================================================
describe('Property 4: Guarded deduction preserves the balance invariant', () => {
  it('deducts exactly on accept, is a total no-op on reject, and never goes negative', () => {
    fc.assert(
      fc.property(balanceArb, distinctAttemptsArb, (initialBalance, attempts) => {
        let store = initialStore(initialBalance)
        let accepted = 0

        for (const [index, attempt] of attempts.entries()) {
          const before = store
          const { store: after, outcome } = applyAttempt(store, attempt, `bk-${index}`)

          if (outcome.kind === 'accepted') {
            accepted += attempt.cost

            // Balance and lifetime total move by EXACTLY the cost (Req 4.1, 4.3).
            expect(after.gemsBalance).toBe(before.gemsBalance - attempt.cost)
            expect(after.totalGemsRedeemed).toBe(before.totalGemsRedeemed + attempt.cost)
            expect(outcome.newBalance).toBe(after.gemsBalance)
            expect(outcome.gemsSpent).toBe(attempt.cost)

            // Exactly one `redeemed` transaction, stored positive and linked to
            // the new booking (Req 4.2, 4.5).
            expect(after.transactions).toHaveLength(before.transactions.length + 1)
            const tx = after.transactions.at(-1) as ModelTransaction
            expect(tx).toEqual({
              type: 'redeemed',
              gemsAmount: attempt.cost,
              bookingId: outcome.bookingId,
            })

            // Exactly one ₹0 redemption booking that can never carry an offer
            // (Req 9.1, 10.1, 10.2).
            expect(after.bookings).toHaveLength(before.bookings.length + 1)
            const created = after.bookings.at(-1) as ModelBooking
            expect(created.totalAmountPaise).toBe(0)
            expect(created.priceAtBookingPaise).toBe(0)
            expect(created.isGemsRedemption).toBe(true)
            expect(created.gemsRedeemed).toBe(attempt.cost)
            expect(created.offerId).toBeNull()
            expect(created.redemptionKey).toBe(attempt.key)
          } else {
            // Guard matched 0 rows → balance, totals and the log are untouched
            // and NOTHING was persisted (Req 3.2, 5.2).
            expect(outcome.kind).toBe('rejected')
            expect(after).toEqual(before)
            expect(attempt.cost).toBeGreaterThan(before.gemsBalance)
          }

          // The guard forbids a negative balance at every step (Req 5.4).
          expect(after.gemsBalance).toBeGreaterThanOrEqual(0)
          store = after
        }

        // Cumulative accepted deductions never exceed what was available (Req 5.3, 5.4).
        expect(accepted).toBeLessThanOrEqual(initialBalance)
        expect(store.gemsBalance).toBe(initialBalance - accepted)
        expect(store.totalGemsRedeemed).toBe(accepted)
        // One transaction and one booking per accepted attempt — no orphans.
        expect(store.transactions).toHaveLength(store.bookings.length)
        expect(store.transactions.reduce((sum, tx) => sum + tx.gemsAmount, 0)).toBe(accepted)
      }),
      { numRuns: 300 },
    )
  })

  it('cannot double-spend when concurrent attempts jointly exceed the balance (Req 5.3)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        costArb,
        costArb,
        (initialBalance, costA, costB) => {
          const attempts: Attempt[] = [
            { key: 'k-a', cost: costA, serviceId: 'svc-a', serviceName: 'A' },
            { key: 'k-b', cost: costB, serviceId: 'svc-b', serviceName: 'B' },
          ]

          // Two submissions serialise on the row lock the guarded UPDATE takes;
          // whichever order they land in, the joint spend is bounded.
          for (const order of [attempts, [...attempts].reverse()]) {
            let store = initialStore(initialBalance)
            let spent = 0
            for (const [index, attempt] of order.entries()) {
              const { store: after, outcome } = applyAttempt(store, attempt, `bk-${index}`)
              if (outcome.kind === 'accepted') {
                spent += attempt.cost
              }
              store = after
            }
            expect(spent).toBeLessThanOrEqual(initialBalance)
            expect(store.gemsBalance).toBeGreaterThanOrEqual(0)
            if (costA + costB > initialBalance) {
              // At most the feasible subset succeeds.
              expect(store.bookings.length).toBeLessThan(2)
            }
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})

// ===========================================================================
// Feature: gems-redemption, Property 5: Idempotent redemption deducts at most
//          once per key
// Validates: Requirements 6.1
// ===========================================================================
describe('Property 5: Idempotent redemption deducts at most once per key', () => {
  it('deducts gems at most once per idempotency key (Req 6.1)', () => {
    fc.assert(
      fc.property(balanceArb, repeatingAttemptsArb, (initialBalance, attempts) => {
        let store = initialStore(initialBalance)
        const deductionsByKey = new Map<string, number>()

        for (const [index, attempt] of attempts.entries()) {
          const { store: after, outcome } = applyAttempt(store, attempt, `bk-${index}`)
          if (outcome.kind === 'accepted') {
            deductionsByKey.set(attempt.key, (deductionsByKey.get(attempt.key) ?? 0) + 1)
          } else {
            // Neither a rejection nor a replay may move the balance.
            expect(after.gemsBalance).toBe(store.gemsBalance)
            expect(after.totalGemsRedeemed).toBe(store.totalGemsRedeemed)
          }
          store = after
        }

        // No key is ever charged twice.
        for (const count of deductionsByKey.values()) {
          expect(count).toBe(1)
        }
        // One persisted booking per charged key.
        expect(new Set(store.bookings.map((b) => b.redemptionKey)).size).toBe(store.bookings.length)
        expect(store.bookings).toHaveLength(deductionsByKey.size)
        expect(store.gemsBalance).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 300 },
    )
  })

  it('returns the SAME redemption record for every duplicate submission of a succeeded key (Req 6.1)', () => {
    fc.assert(
      fc.property(balanceArb, repeatingAttemptsArb, (initialBalance, attempts) => {
        let store = initialStore(initialBalance)
        // key → the booking id the first accepted submission created.
        const recordByKey = new Map<string, string>()

        for (const [index, attempt] of attempts.entries()) {
          const { store: after, outcome } = applyAttempt(store, attempt, `bk-${index}`)

          if (outcome.kind === 'accepted') {
            recordByKey.set(attempt.key, outcome.bookingId)
          } else if (recordByKey.has(attempt.key)) {
            // A resubmission of an already-succeeded key must resolve to that
            // same record, with no further deduction.
            expect(outcome.kind).toBe('duplicate')
            expect(outcome.kind === 'duplicate' ? outcome.bookingId : null).toBe(
              recordByKey.get(attempt.key),
            )
            expect(after.gemsBalance).toBe(store.gemsBalance)
          }

          store = after
        }
      }),
      { numRuns: 300 },
    )
  })
})
