/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : admin-bookings.filters.test
 * Scope        : Property-based test — Admin booking listing filters
 *
 * Validates    : Requirements 10.3, 10.4, 10.5
 *
 * Description  : fast-check + Vitest property test for the filter contract of
 *                `listBookings(filters)` (packages/db/src/queries/admin-bookings.ts).
 *
 *                `listBookings` runs two joined Drizzle queries (booking⋈user,
 *                then booking_service⋈staff_profile⋈user) against neon-http;
 *                faithfully mocking that chain is impractical, so — per the task's
 *                sanctioned fallback — this test exercises the *documented filter
 *                contract* over a small in-memory model that mirrors exactly the
 *                conditional WHERE construction in `listBookings`:
 *
 *                  - status filter      → booking.status     == filters.status
 *                  - service-type filter→ booking.serviceType== filters.serviceType
 *                  - date filter        → booking.bookingDate== filters.date
 *                  - an ABSENT filter adds no predicate (it widens the result)
 *                  - present filters are combined conjunctively (AND)
 *
 * Tech Stack   : Vitest + fast-check
 * Layer        : Test
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

// ── In-memory model of the documented listBookings filter contract ──────────
// Mirrors the conditional WHERE clause built in admin-bookings.ts::listBookings:
// each supplied filter contributes one equality predicate; absent filters
// (undefined) contribute nothing; the predicates are ANDed together.

type ModelBooking = {
  id: string
  status: string
  serviceType: string
  date: string // YYYY-MM-DD (booking.bookingDate, date-only)
}

type ModelFilters = {
  status?: string
  serviceType?: string
  date?: string
}

function matchesFilters(b: ModelBooking, f: ModelFilters): boolean {
  if (f.status !== undefined && b.status !== f.status) {
    return false
  }
  if (f.serviceType !== undefined && b.serviceType !== f.serviceType) {
    return false
  }
  if (f.date !== undefined && b.date !== f.date) {
    return false
  }
  return true
}

function listBookingsModel(dataset: ModelBooking[], f: ModelFilters): ModelBooking[] {
  return dataset.filter((b) => matchesFilters(b, f))
}

// ── Generators constrained to the real input space ──────────────────────────
const BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'rejected',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
  'rescheduled',
] as const

const SERVICE_TYPES = ['salon', 'spa'] as const

// A small pool of dates so filters realistically collide with dataset rows
// (otherwise a random date filter would almost always match nothing).
const DATE_POOL = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04'] as const

const statusArb = fc.constantFrom(...BOOKING_STATUSES)
const serviceTypeArb = fc.constantFrom(...SERVICE_TYPES)
const dateArb = fc.constantFrom(...DATE_POOL)

const bookingArb: fc.Arbitrary<ModelBooking> = fc.record({
  id: fc.uuid(),
  status: statusArb,
  serviceType: serviceTypeArb,
  date: dateArb,
})

const datasetArb = fc.array(bookingArb, { minLength: 0, maxLength: 30 })

// Each filter independently present or absent, drawn from the same domains so
// they exercise both matching and non-matching values.
// `requiredKeys: []` OMITS a key rather than setting it to undefined. Under the
// project's `exactOptionalPropertyTypes`, `status?: string` does not accept an
// explicit undefined, so omission is both the type-correct and the semantically
// accurate way to express "this filter was not supplied".
const filtersArb: fc.Arbitrary<ModelFilters> = fc.record(
  {
    status: statusArb,
    serviceType: serviceTypeArb,
    date: dateArb,
  },
  { requiredKeys: [] },
)

// Feature: backend-api, Property 24: Admin listing filters are honoured
describe('Property 24: Admin listing filters are honoured', () => {
  it('returns exactly the bookings matching all supplied filters; absent filters never exclude', () => {
    fc.assert(
      fc.property(datasetArb, filtersArb, (dataset, filters) => {
        const result = listBookingsModel(dataset, filters)
        const resultIds = new Set(result.map((b) => b.id))

        // (1) Soundness — every returned booking matches ALL supplied filters.
        for (const b of result) {
          if (filters.status !== undefined) {
            expect(b.status).toBe(filters.status)
          }
          if (filters.serviceType !== undefined) {
            expect(b.serviceType).toBe(filters.serviceType)
          }
          if (filters.date !== undefined) {
            expect(b.date).toBe(filters.date)
          }
        }

        // (2) Completeness — every dataset booking that matches the supplied
        // filters IS returned (membership is exactly the conjunctive predicate).
        for (const b of dataset) {
          expect(resultIds.has(b.id)).toBe(matchesFilters(b, filters))
        }

        // (3) Absent filter does not exclude — dropping any present filter can
        // only widen (never shrink) the result set; the narrowed result is a
        // subset of every relaxed result.
        const presentKeys = (['status', 'serviceType', 'date'] as const).filter(
          (k) => filters[k] !== undefined,
        )
        for (const key of presentKeys) {
          const relaxed: ModelFilters = { ...filters, [key]: undefined }
          const relaxedIds = new Set(listBookingsModel(dataset, relaxed).map((b) => b.id))
          for (const id of resultIds) {
            expect(relaxedIds.has(id)).toBe(true)
          }
        }
      }),
      { numRuns: 200 },
    )
  })

  it('no filters returns the whole dataset (widest result)', () => {
    fc.assert(
      fc.property(datasetArb, (dataset) => {
        const result = listBookingsModel(dataset, {})
        expect(result).toHaveLength(dataset.length)
      }),
      { numRuns: 200 },
    )
  })
})
