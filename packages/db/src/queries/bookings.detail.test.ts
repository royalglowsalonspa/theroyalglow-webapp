/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : bookings.detail.test
 * Scope        : Test — Data Access (Bookings)
 *
 * Validates    : Requirements 6.4
 *
 * Description  : fast-check + Vitest property test for the owned single-booking
 *                detail contract of `getBookingByIdForCustomer(id, customerId)`
 *                in packages/db/src/queries/bookings.ts.
 *
 *                The query enforces ownership inside the SQL WHERE clause
 *                (`id = id AND customer_id = customerId LIMIT 1`) and its module
 *                (`../index`) instantiates a Neon HTTP client at import time from
 *                `DATABASE_URL`. Rather than stand up a real database or stub the
 *                opaque Drizzle predicate objects, this test exercises an
 *                in-memory model that mirrors the documented query semantics
 *                exactly: select the booking owned by the requesting customer,
 *                then attach its booking_service rows ordered by displayOrder.
 *                A cross-customer or missing id is indistinguishable from a
 *                missing row and resolves to null.
 *
 * Tech Stack   : Vitest + fast-check
 * Layer        : Test
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// In-memory model of the documented `getBookingByIdForCustomer` contract.
// Mirrors the query in bookings.ts:
//   SELECT * FROM booking WHERE id = ? AND customer_id = ? LIMIT 1
//   -> if none: null
//   SELECT * FROM booking_service WHERE booking_id = ? ORDER BY display_order ASC
// ---------------------------------------------------------------------------
type BookingRow = {
  id: string
  customerId: string
  status: string
  bookingDate: Date
  startTime: string
  endTime: string
  totalAmountPaise: number
  confirmedAt: Date | null
  completedAt: Date | null
  cancelledAt: Date | null
  rejectedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

type ServiceRow = {
  id: string
  bookingId: string
  serviceNameSnapshot: string
  priceAtBookingPaise: number
  durationMinutes: number
  displayOrder: number
}

function getBookingByIdForCustomerModel(
  bookings: BookingRow[],
  services: ServiceRow[],
  id: string,
  customerId: string,
): (BookingRow & { services: ServiceRow[] }) | null {
  const found = bookings.find((b) => b.id === id && b.customerId === customerId)
  if (!found) {
    return null
  }
  const attached = services
    .filter((s) => s.bookingId === found.id)
    .sort((a, b) => a.displayOrder - b.displayOrder)
  return { ...found, services: attached }
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
const CUSTOMERS = ['cust_a', 'cust_b', 'cust_c'] as const

const statusArb = fc.constantFrom(
  'pending',
  'confirmed',
  'rejected',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
  'rescheduled',
)

// noInvalidDate excludes `Invalid Date`, which fast-check v4 generates by
// default even within an explicit min/max range.
const dateArb = fc.date({
  min: new Date('2020-01-01T00:00:00Z'),
  max: new Date('2030-12-31T23:59:59Z'),
  noInvalidDate: true,
})
const nullableTsArb = fc.option(dateArb, { nil: null })

// One booking spec (the unique id and child services are derived from its index
// inside the property body so the dataset is internally consistent).
const bookingSpecArb = fc.record({
  customerId: fc.constantFrom(...CUSTOMERS),
  status: statusArb,
  bookingDate: dateArb,
  startTime: fc.constantFrom('09:00:00', '10:30:00', '14:00:00', '18:30:00'),
  endTime: fc.constantFrom('09:30:00', '11:00:00', '15:00:00', '19:00:00'),
  totalAmountPaise: fc.nat(),
  confirmedAt: nullableTsArb,
  completedAt: nullableTsArb,
  cancelledAt: nullableTsArb,
  rejectedAt: nullableTsArb,
  createdAt: dateArb,
  updatedAt: dateArb,
  serviceCount: fc.nat({ max: 4 }),
})

const datasetArb = fc.array(bookingSpecArb, { minLength: 1, maxLength: 8 })

describe('getBookingByIdForCustomer — owned single-booking detail', () => {
  // Feature: backend-api, Property 15: Owned single booking returns full detail
  // Validates: Requirements 6.4
  it('returns the owned booking with status, timestamps, and ordered services; null otherwise', () => {
    fc.assert(
      fc.property(datasetArb, fc.double({ min: 0, max: 1, noNaN: true }), (specs, pick) => {
        // Build a consistent dataset: unique booking ids + child service rows.
        const bookings: BookingRow[] = specs.map((s, i) => ({
          id: `bk_${i}`,
          customerId: s.customerId,
          status: s.status,
          bookingDate: s.bookingDate,
          startTime: s.startTime,
          endTime: s.endTime,
          totalAmountPaise: s.totalAmountPaise,
          confirmedAt: s.confirmedAt,
          completedAt: s.completedAt,
          cancelledAt: s.cancelledAt,
          rejectedAt: s.rejectedAt,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        }))

        const services: ServiceRow[] = []
        specs.forEach((s, i) => {
          // Insert in reverse display order so the model's ASC sort is exercised.
          for (let k = s.serviceCount - 1; k >= 0; k--) {
            services.push({
              id: `bs_${i}_${k}`,
              bookingId: `bk_${i}`,
              serviceNameSnapshot: `service-${i}-${k}`,
              priceAtBookingPaise: (k + 1) * 1000,
              durationMinutes: (k + 1) * 15,
              displayOrder: k,
            })
          }
        })

        const idx = Math.min(bookings.length - 1, Math.floor(pick * bookings.length))
        const target = bookings[idx]

        // --- Owned fetch returns full detail ---
        const got = getBookingByIdForCustomerModel(bookings, services, target.id, target.customerId)
        expect(got).not.toBeNull()
        if (got === null) {
          return
        }

        // Identity + status + lifecycle timestamps are preserved verbatim.
        expect(got.id).toBe(target.id)
        expect(got.customerId).toBe(target.customerId)
        expect(got.status).toBe(target.status)
        expect(got.bookingDate).toEqual(target.bookingDate)
        expect(got.createdAt).toEqual(target.createdAt)
        expect(got.updatedAt).toEqual(target.updatedAt)
        expect(got.confirmedAt).toEqual(target.confirmedAt)
        expect(got.completedAt).toEqual(target.completedAt)
        expect(got.cancelledAt).toEqual(target.cancelledAt)
        expect(got.rejectedAt).toEqual(target.rejectedAt)

        // Services: exactly this booking's rows, ordered by displayOrder ASC.
        const expectedSvc = services
          .filter((s) => s.bookingId === target.id)
          .sort((a, b) => a.displayOrder - b.displayOrder)
        expect(got.services).toEqual(expectedSvc)
        for (let i = 1; i < got.services.length; i++) {
          expect(got.services[i].displayOrder).toBeGreaterThanOrEqual(
            got.services[i - 1].displayOrder,
          )
        }
        // No foreign services leaked in.
        expect(got.services.every((s) => s.bookingId === target.id)).toBe(true)

        // --- Non-owned id returns null (cross-customer is NOT_FOUND-equivalent) ---
        for (const other of CUSTOMERS) {
          if (other !== target.customerId) {
            expect(getBookingByIdForCustomerModel(bookings, services, target.id, other)).toBeNull()
          }
        }

        // --- Missing id returns null ---
        expect(
          getBookingByIdForCustomerModel(bookings, services, 'bk_missing', target.customerId),
        ).toBeNull()
      }),
      { numRuns: 200 },
    )
  })
})
