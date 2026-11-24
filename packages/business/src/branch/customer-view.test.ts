/************************************************************
 * Module Name  : branch/customer-view.test
 * Scope        : Business Logic — one branch's view of a shared customer (R3.2)
 ************************************************************/

import type { CustomerHistoryEntry } from '@rgss/types'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { branchAverageSpendPaise, mergeCustomerHistory } from './customer-view'

function own(bookingDate: string, startTime: string, id = `${bookingDate}${startTime}`) {
  return {
    scope: 'this_branch',
    bookingId: id,
    bookingNumber: `BK-${id}`,
    bookingDate,
    startTime,
    serviceType: 'salon',
    status: 'completed',
    isMembershipSession: false,
    totalAmountPaise: 50_000,
    services: ['Haircut'],
  } satisfies CustomerHistoryEntry
}

function elsewhere(bookingDate: string, startTime: string) {
  return {
    scope: 'other_branch',
    branchName: 'Marathahalli',
    bookingDate,
    startTime,
    serviceType: 'spa',
    services: ['Swedish massage'],
  } satisfies CustomerHistoryEntry
}

const instant = (e: CustomerHistoryEntry) => `${e.bookingDate}T${e.startTime}`
const newestFirst = (a: CustomerHistoryEntry, b: CustomerHistoryEntry) =>
  instant(b).localeCompare(instant(a))

describe('branchAverageSpendPaise', () => {
  it('divides the branch total by the visits there, to the paise', () => {
    expect(branchAverageSpendPaise(100_000, 3)).toBe(33_333)
    expect(branchAverageSpendPaise(100_001, 2)).toBe(50_001)
  })

  it('has no average before the first visit at the branch', () => {
    expect(branchAverageSpendPaise(0, 0)).toBeNull()
    // A membership bought here without a visit yet still has no average.
    expect(branchAverageSpendPaise(1_000_000, 0)).toBeNull()
  })
})

describe('mergeCustomerHistory', () => {
  it('interleaves both lists newest first', () => {
    const merged = mergeCustomerHistory(
      [own('2026-10-20', '10:00:00'), own('2026-10-01', '16:00:00')],
      [elsewhere('2026-10-10', '11:00:00'), elsewhere('2026-09-01', '09:00:00')],
      10,
    )

    expect(merged.map((e) => `${e.scope}@${e.bookingDate}`)).toEqual([
      'this_branch@2026-10-20',
      'other_branch@2026-10-10',
      'this_branch@2026-10-01',
      'other_branch@2026-09-01',
    ])
  })

  it('orders visits on the same day by start time', () => {
    const merged = mergeCustomerHistory(
      [own('2026-10-20', '09:00:00')],
      [elsewhere('2026-10-20', '18:30:00')],
      10,
    )
    expect(merged.map((e) => e.scope)).toEqual(['other_branch', 'this_branch'])
  })

  it('puts the branch’s own booking first on an exact tie', () => {
    const merged = mergeCustomerHistory(
      [own('2026-10-20', '10:00:00')],
      [elsewhere('2026-10-20', '10:00:00')],
      10,
    )
    expect(merged.map((e) => e.scope)).toEqual(['this_branch', 'other_branch'])
  })

  it('stops at the limit', () => {
    expect(
      mergeCustomerHistory(
        [own('2026-10-20', '10:00:00')],
        [elsewhere('2026-10-21', '10:00:00')],
        1,
      ),
    ).toEqual([elsewhere('2026-10-21', '10:00:00')])
    expect(mergeCustomerHistory([own('2026-10-20', '10:00:00')], [], 0)).toEqual([])
  })

  it('passes other branches’ visits through without adding money or ids', () => {
    const [entry] = mergeCustomerHistory([], [elsewhere('2026-10-21', '10:00:00')], 5)
    expect(entry).toEqual(elsewhere('2026-10-21', '10:00:00'))
    expect(entry).not.toHaveProperty('totalAmountPaise')
    expect(entry).not.toHaveProperty('bookingId')
  })

  it('equals sorting both lists together and keeping the newest `limit`', () => {
    const date = fc
      .tuple(
        fc.integer({ min: 2024, max: 2027 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
      )
      .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    const time = fc
      .tuple(fc.integer({ min: 8, max: 21 }), fc.constantFrom(0, 15, 30, 45))
      .map(([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`)
    const visit = fc.tuple(date, time)

    fc.assert(
      fc.property(
        fc.array(visit, { maxLength: 15 }),
        fc.array(visit, { maxLength: 15 }),
        fc.integer({ min: 0, max: 40 }),
        (ownVisits, otherVisits, limit) => {
          const thisBranch = ownVisits.map(([d, t], k) => own(d, t, `o${k}`)).sort(newestFirst)
          const otherBranches = otherVisits.map(([d, t]) => elsewhere(d, t)).sort(newestFirst)

          const merged = mergeCustomerHistory(thisBranch, otherBranches, limit)

          expect(merged).toHaveLength(Math.min(limit, thisBranch.length + otherBranches.length))
          for (let k = 1; k < merged.length; k += 1) {
            const previous = merged[k - 1]
            const current = merged[k]
            if (previous && current) {
              expect(instant(previous) >= instant(current)).toBe(true)
            }
          }
          // Nothing is invented: every entry came from one of the inputs.
          const all = [...thisBranch, ...otherBranches]
          for (const entry of merged) {
            expect(all).toContain(entry)
          }
          // And nothing left out is newer than the oldest entry kept.
          const oldestKept = merged.at(-1)
          if (oldestKept) {
            for (const entry of all.filter((e) => !merged.includes(e))) {
              expect(instant(entry) <= instant(oldestKept)).toBe(true)
            }
          }
        },
      ),
    )
  })
})
