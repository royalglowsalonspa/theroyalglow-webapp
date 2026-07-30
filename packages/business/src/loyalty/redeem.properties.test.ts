/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-08-2026 & Updated - 04-08-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : redeem.properties.test
 * Scope        : Property-based tests — Gems redemption business gate
 *
 * Feature      : gems-redemption
 * Properties   : 2 — Affordability is all-or-nothing
 *                3 — Eligibility gate charges the server-side amount or rejects
 * Validates    : Requirements 2.1, 2.2, 2.3, 3.1, 3.4, 3.5, 3.6, 7.2, 7.3
 *
 * Description  : fast-check + Vitest property tests for the pure redemption core
 *                (packages/business/src/loyalty/redeem.ts). Both functions are
 *                pure, so the real implementations run unmodified — no mocks, no
 *                I/O. Complements packages/business/src/loyalty/gems.test.ts,
 *                which covers the EARNING side.
 *
 * Responsibilities :
 * - computeAffordability: each flag is true iff the full positive gem cost is
 *   covered by the balance; every other field and the list order survive
 * - assertRedeemable: returns exactly the server-read gemsRequired when eligible
 *   AND affordable, throws GEMS_SERVICE_NOT_REDEEMABLE (400) when ineligible,
 *   throws GEMS_INSUFFICIENT_BALANCE (409) when eligible but short
 * - The returned charge never reflects a client-supplied gems amount (Req 7.3)
 *
 * Features / Functionality :
 * - Generators deliberately cover the edge cases the design calls out:
 *   gemsRequired = null / 0 / negative, balance = 0, and balance exactly equal
 *   to the cost (the inclusive boundary)
 *
 * Tech Stack   : Vitest + fast-check
 * Layer        : Test
 *
 * Dependencies : fast-check, vitest, @rgss/errors, ./redeem
 *
 * Notes        : Gems are whole integers — every generator emits integers only,
 *                never floats. Each property runs a minimum of 100 iterations.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { type AssertableService, assertRedeemable, computeAffordability } from './redeem'

// ── Generators ──────────────────────────────────────────────────────────────

// Gem costs deliberately span the invalid space (null / 0 / negative) as well as
// realistic positive catalogue prices.
const gemsRequiredArb = fc.oneof(
  { arbitrary: fc.constant(null), weight: 1 },
  { arbitrary: fc.constant(0), weight: 1 },
  { arbitrary: fc.integer({ min: -500, max: -1 }), weight: 1 },
  { arbitrary: fc.integer({ min: 1, max: 5000 }), weight: 4 },
)

// Balances include 0 (a brand-new account) and the whole realistic range.
const balanceArb = fc.oneof(
  { arbitrary: fc.constant(0), weight: 1 },
  { arbitrary: fc.integer({ min: 0, max: 10_000 }), weight: 4 },
)

// A catalogue item as the /api/gems route shapes it, before affordability.
const catalogueItemArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 12 }),
  name: fc.string({ minLength: 1, maxLength: 24 }),
  // Money is integer paise — never a float.
  pricePaise: fc.integer({ min: 0, max: 10_000_000 }),
  gemsRequired: gemsRequiredArb,
})

const catalogueArb = fc.array(catalogueItemArb, { maxLength: 12 })

const assertableServiceArb: fc.Arbitrary<AssertableService> = fc.record({
  isActive: fc.boolean(),
  gemsRedeemable: fc.boolean(),
  gemsRequired: gemsRequiredArb,
})

/** The specification's predicate, written independently of the implementation. */
function isAffordable(balance: number, gemsRequired: number | null): boolean {
  if (gemsRequired === null) {
    return false
  }
  if (gemsRequired <= 0) {
    return false
  }
  return balance >= gemsRequired
}

/** Eligible = live catalogue data permits redemption at a positive whole cost. */
function isEligible(service: AssertableService): boolean {
  return (
    service.isActive === true &&
    service.gemsRedeemable === true &&
    service.gemsRequired !== null &&
    service.gemsRequired > 0
  )
}

// ===========================================================================
// Feature: gems-redemption, Property 2: Affordability is all-or-nothing
// Validates: Requirements 2.1, 2.2, 2.3
// ===========================================================================
describe('Property 2: Affordability is all-or-nothing', () => {
  it('flags each item affordable iff gemsRequired != null && > 0 && balance >= gemsRequired', () => {
    fc.assert(
      fc.property(balanceArb, catalogueArb, (balance, services) => {
        const result = computeAffordability(balance, services)

        // One annotated item per input item, in the same order.
        expect(result).toHaveLength(services.length)

        for (const [index, item] of result.entries()) {
          const source = services[index] as (typeof services)[number]
          expect(item.affordable).toBe(isAffordable(balance, source.gemsRequired))

          // Annotation only — every other field survives untouched.
          expect(item.id).toBe(source.id)
          expect(item.name).toBe(source.name)
          expect(item.pricePaise).toBe(source.pricePaise)
          expect(item.gemsRequired).toBe(source.gemsRequired)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('treats the balance boundary as inclusive and never affords a zero balance', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5000 }), (cost) => {
        const [exact, oneShort, zero] = [cost, cost - 1, 0].map(
          (balance) =>
            computeAffordability(balance, [{ gemsRequired: cost }])[0] as { affordable: boolean },
        ) as [{ affordable: boolean }, { affordable: boolean }, { affordable: boolean }]

        // balance == cost is affordable (all-or-nothing, fully covered).
        expect(exact.affordable).toBe(true)
        // One gem short is never a partial redemption.
        expect(oneShort.affordable).toBe(false)
        // A zero balance affords nothing with a positive cost.
        expect(zero.affordable).toBe(false)
      }),
      { numRuns: 100 },
    )
  })
})

// ===========================================================================
// Feature: gems-redemption, Property 3: Eligibility gate charges the
//          server-side amount or rejects
// Validates: Requirements 3.1, 3.4, 3.5, 3.6, 7.2, 7.3
// ===========================================================================
describe('Property 3: Eligibility gate charges the server-side amount or rejects', () => {
  it('returns exactly the server gemsRequired when eligible and covered, else throws the right code', () => {
    fc.assert(
      fc.property(
        assertableServiceArb,
        balanceArb,
        // A value the client might try to smuggle in. It is attached to the
        // service object under a different key so it can never be read as the
        // cost; the assertion below proves the charge is the SERVER value.
        fc.integer({ min: -1000, max: 10_000 }),
        (service, balance, clientValue) => {
          const withClientValue = { ...service, clientGemsRequired: clientValue }
          const eligible = isEligible(service)
          const covered = service.gemsRequired !== null && balance >= service.gemsRequired

          if (!eligible) {
            // Inactive / not redeemable / null or non-positive cost (Req 3.4–3.6).
            let thrown: unknown
            try {
              assertRedeemable(withClientValue, balance)
            } catch (error) {
              thrown = error
            }
            expect(thrown).toBeInstanceOf(AppError)
            expect((thrown as AppError).code).toBe(ERROR_CODES.GEMS_SERVICE_NOT_REDEEMABLE)
            expect((thrown as AppError).statusCode).toBe(400)
            return
          }

          if (!covered) {
            // Eligible but short — a DISTINCT code from the ineligible case (Req 11.1).
            let thrown: unknown
            try {
              assertRedeemable(withClientValue, balance)
            } catch (error) {
              thrown = error
            }
            expect(thrown).toBeInstanceOf(AppError)
            expect((thrown as AppError).code).toBe(ERROR_CODES.GEMS_INSUFFICIENT_BALANCE)
            expect((thrown as AppError).statusCode).toBe(409)
            expect((thrown as AppError).code).not.toBe(ERROR_CODES.GEMS_SERVICE_NOT_REDEEMABLE)
            return
          }

          // Eligible AND covered → the charge is exactly the server-side cost.
          const charge = assertRedeemable(withClientValue, balance)
          expect(charge).toBe(service.gemsRequired)
          // Whole gems only, and never the client's value unless it happens to
          // coincide with the server's.
          expect(Number.isInteger(charge)).toBe(true)
          if (clientValue !== service.gemsRequired) {
            expect(charge).not.toBe(clientValue)
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('rejects an ineligible service before the balance is ever consulted', () => {
    // For every ineligible combination the outcome is GEMS_SERVICE_NOT_REDEEMABLE
    // regardless of how large the balance is — eligibility is checked first.
    fc.assert(
      fc.property(
        assertableServiceArb.filter((s) => !isEligible(s)),
        fc.integer({ min: 0, max: 1_000_000 }),
        (service, balance) => {
          expect(() => assertRedeemable(service, balance)).toThrow(AppError)
          try {
            assertRedeemable(service, balance)
          } catch (error) {
            expect((error as AppError).code).toBe(ERROR_CODES.GEMS_SERVICE_NOT_REDEEMABLE)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
