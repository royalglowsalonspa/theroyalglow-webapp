/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-06-2026 & Updated - 25-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : bookings.test
 * Scope        : Property-based test — Customer booking listing
 *
 * Validates    : Requirements 6.2, 6.3
 *
 * Description  : fast-check + Vitest property test for `getBookingsByCustomer`
 *                (packages/db/src/queries/bookings.ts). Over a dataset of
 *                bookings spread across multiple customers and an optional
 *                status filter, the listing must return ONLY bookings owned by
 *                the requesting customer, and — when a status filter is supplied
 *                — ONLY those whose status matches it (soundness). It must also
 *                return EVERY such booking (completeness), so an always-empty
 *                result cannot trivially satisfy the "only" clause.
 *
 * Approach     : The REAL exported `getBookingsByCustomer` runs against an
 *                in-memory fake of the `db` module. The Drizzle query operators
 *                (`eq`/`and`/`inArray`) are mocked to emit inspectable predicate
 *                descriptors that carry the real schema column objects; the fake
 *                `db` evaluates those descriptors against seeded rows by column
 *                reference identity. No real database is touched, yet the actual
 *                ownership + status predicate the query builds is exercised.
 *
 * Tech Stack   : Vitest + fast-check
 * Layer        : Test
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

// Shared, hoisted seed state the fake `db` reads on each query. `run` is wired
// up below (after the schema import) to filter seeds by predicate descriptor.
const mockState = vi.hoisted(() => ({
  bookings: [] as Record<string, unknown>[],
  services: [] as Record<string, unknown>[],
  run: (_table: unknown, _pred: unknown): Record<string, unknown>[] => [],
}))

// Fake the db client so the real query function runs with zero I/O. The builder
// only needs the from → where → orderBy chain that `getBookingsByCustomer` uses;
// orderBy is the terminal that resolves to the (predicate-filtered) seed rows.
vi.mock('../index', () => ({
  db: {
    select: () => {
      let table: unknown
      let pred: unknown
      const builder = {
        from(t: unknown) {
          table = t
          return builder
        },
        where(p: unknown) {
          pred = p
          return builder
        },
        orderBy() {
          return Promise.resolve(mockState.run(table, pred))
        },
      }
      return builder
    },
  },
}))

// Replace only the comparison operators with descriptor factories; everything
// else (notably `sql`, used by the schema index definitions) stays real.
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    eq: (col: unknown, val: unknown) => ({ kind: 'eq', col, val }),
    and: (...preds: unknown[]) => ({ kind: 'and', preds }),
    inArray: (col: unknown, vals: unknown[]) => ({ kind: 'inArray', col, vals }),
    desc: (col: unknown) => ({ kind: 'desc', col }),
    asc: (col: unknown) => ({ kind: 'asc', col }),
  }
})

import { booking, bookingService } from '../schema/booking'
import { getBookingsByCustomer } from './bookings'

// Map real schema column objects → the camelCase row keys the function reads.
const COLUMN_KEY = new Map<unknown, string>([
  [booking.id, 'id'],
  [booking.customerId, 'customerId'],
  [booking.status, 'status'],
  [bookingService.bookingId, 'bookingId'],
])

type Predicate =
  | { kind: 'and'; preds: Predicate[] }
  | { kind: 'eq'; col: unknown; val: unknown }
  | { kind: 'inArray'; col: unknown; vals: unknown[] }
  | undefined

function matches(pred: Predicate, row: Record<string, unknown>): boolean {
  if (!pred) {
    return true
  }
  if (pred.kind === 'and') {
    return pred.preds.every((p) => matches(p, row))
  }
  if (pred.kind === 'eq') {
    return row[COLUMN_KEY.get(pred.col) as string] === pred.val
  }
  if (pred.kind === 'inArray') {
    return pred.vals.includes(row[COLUMN_KEY.get(pred.col) as string])
  }
  return true
}

// Resolve a query against the seeded dataset selected by table identity.
mockState.run = (table: unknown, pred: unknown) => {
  if (table === booking) {
    return mockState.bookings.filter((r) => matches(pred as Predicate, r))
  }
  if (table === bookingService) {
    return mockState.services.filter((r) => matches(pred as Predicate, r))
  }
  return []
}

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

// A small pool of customers so ownership overlap is the common case, plus a
// requester ('cust-none') that owns nothing to exercise the empty result path.
const CUSTOMER_IDS = ['cust-1', 'cust-2', 'cust-3', 'cust-4'] as const

// Feature: backend-api, Property 14: Customer listing respects ownership and status filter
describe('Property 14: Customer listing respects ownership and status filter', () => {
  const seedArb = fc.record({
    customerId: fc.constantFrom(...CUSTOMER_IDS),
    status: fc.constantFrom(...BOOKING_STATUSES),
    serviceCount: fc.integer({ min: 0, max: 3 }),
  })
  const datasetArb = fc.array(seedArb, { maxLength: 30 })
  const requesterArb = fc.constantFrom(...CUSTOMER_IDS, 'cust-none')
  const statusFilterArb = fc.option(fc.constantFrom(...BOOKING_STATUSES), { nil: undefined })

  it('returns exactly the requester-owned bookings matching the optional status filter', async () => {
    await fc.assert(
      fc.asyncProperty(
        datasetArb,
        requesterArb,
        statusFilterArb,
        async (seeds, requester, statusFilter) => {
          // Seed bookings with unique ids; attach 0..3 services per booking so the
          // join path is exercised and service ownership can be checked.
          const bookings = seeds.map((s, i) => ({
            id: `bk-${i}`,
            bookingNumber: `BK-${i}`,
            customerId: s.customerId,
            status: s.status,
            bookingDate: new Date(2026, 0, 1),
            createdAt: new Date(2026, 0, 1, 0, 0, i % 60),
          }))
          const services: Record<string, unknown>[] = []
          seeds.forEach((s, i) => {
            for (let j = 0; j < s.serviceCount; j++) {
              services.push({ id: `bs-${i}-${j}`, bookingId: `bk-${i}`, displayOrder: j })
            }
          })
          mockState.bookings = bookings
          mockState.services = services

          const result = await getBookingsByCustomer(requester, statusFilter)

          // Soundness: every returned row is owned by the requester, matches the
          // filter when supplied, and carries only its own service rows.
          for (const row of result) {
            expect(row.customerId).toBe(requester)
            if (statusFilter) {
              expect(row.status).toBe(statusFilter)
            }
            for (const svc of row.services) {
              expect(svc.bookingId).toBe(row.id)
            }
          }

          // Completeness: the result is precisely the owned + filtered set.
          const expectedIds = bookings
            .filter(
              (b) => b.customerId === requester && (!statusFilter || b.status === statusFilter),
            )
            .map((b) => b.id)
            .sort()
          expect(result.map((r) => r.id).sort()).toEqual(expectedIds)
        },
      ),
      { numRuns: 200 },
    )
  })
})
