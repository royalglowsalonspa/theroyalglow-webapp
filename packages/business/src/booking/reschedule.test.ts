/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-06-2026 & Updated - 25-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : reschedule.test
 * Scope        : Property-based test — Booking reschedule gating
 *
 * Validates    : Requirements 8.2
 *
 * Description  : fast-check + Vitest property test for `checkReschedulable`
 *                (packages/business/src/booking/reschedule.ts). Confirms the
 *                eligibility check permits a reschedule ONLY when the status is
 *                reschedulable (pending/confirmed) AND the count is below
 *                MAX_RESCHEDULES (2); reports MAX_RESCHEDULES once the count has
 *                reached the maximum; and reports NOT_RESCHEDULABLE for any
 *                other status.
 *
 * Tech Stack   : Vitest + fast-check
 * Layer        : Test
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { MAX_RESCHEDULES, RESCHEDULABLE_STATUSES, checkReschedulable } from './reschedule'

// Feature: backend-api, Property 20: Reschedule is gated by status and maximum count
describe('Property 20: Reschedule is gated by status and maximum count', () => {
  // Non-reschedulable booking statuses + arbitrary noise strings, mixed with the
  // genuinely reschedulable ones, so the generator covers the whole input space.
  const NON_RESCHEDULABLE = [
    'in_progress',
    'completed',
    'cancelled',
    'rejected',
    'no_show',
    'rescheduled',
  ]
  const statusArb = fc.oneof(
    fc.constantFrom(...RESCHEDULABLE_STATUSES),
    fc.constantFrom(...NON_RESCHEDULABLE),
    fc.string(),
  )
  // Counts spanning below, at, and above the maximum (incl. negatives).
  const countArb = fc.integer({ min: -3, max: MAX_RESCHEDULES + 5 })

  it('permits only reschedulable statuses below the maximum count, else maps to the right code', () => {
    fc.assert(
      fc.property(statusArb, countArb, (status, rescheduleCount) => {
        const result = checkReschedulable({ status, rescheduleCount })
        const isReschedulable = (RESCHEDULABLE_STATUSES as readonly string[]).includes(status)

        if (!isReschedulable) {
          // Status gate takes precedence regardless of count.
          expect(result.ok).toBe(false)
          expect(result.ok === false && result.code).toBe('NOT_RESCHEDULABLE')
          return
        }

        if (rescheduleCount >= MAX_RESCHEDULES) {
          expect(result.ok).toBe(false)
          expect(result.ok === false && result.code).toBe('MAX_RESCHEDULES')
          return
        }

        // Reschedulable status AND count strictly below the maximum → permitted.
        expect(result.ok).toBe(true)
      }),
      { numRuns: 200 },
    )
  })
})
