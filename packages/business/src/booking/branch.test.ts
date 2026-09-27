/************************************************************
 * Module Name  : branch.test (booking)
 * Scope        : Business Logic — Booking
 *
 * Description  : Pins which branches take bookings and which one a booking
 *                defaults to. The booking dialog preselects this branch, and
 *                GET /api/availability falls back to it when no branch is named.
 ************************************************************/

import { describe, expect, it } from 'vitest'
import {
  type BranchSummary,
  buildPublicBranchList,
  isBranchBookable,
  resolveDefaultBranch,
} from './branch'

function branch(overrides: Partial<BranchSummary> & Pick<BranchSummary, 'id'>): BranchSummary {
  return {
    name: overrides.id,
    city: 'Bengaluru',
    status: 'operational',
    isPrimary: false,
    ...overrides,
  }
}

const RAYASANDRA = branch({ id: 'branch_rayasandra', name: 'Rayasandra', isPrimary: true })
const MARATHAHALLI = branch({
  id: 'branch_marathahalli',
  name: 'Marathahalli',
  status: 'opens_soon',
})

describe('isBranchBookable', () => {
  it('is true only for an operational branch', () => {
    expect(isBranchBookable('operational')).toBe(true)
    expect(isBranchBookable('opens_soon')).toBe(false)
    expect(isBranchBookable('temporarily_closed')).toBe(false)
    expect(isBranchBookable('shutdown')).toBe(false)
  })
})

describe('resolveDefaultBranch', () => {
  it('picks the primary branch when it is taking bookings', () => {
    const second = branch({ id: 'branch_b' })
    expect(resolveDefaultBranch([second, RAYASANDRA])).toBe(RAYASANDRA)
  })

  it('falls back to the first bookable branch when the primary is not taking bookings', () => {
    const closedPrimary = branch({ id: 'branch_a', status: 'temporarily_closed', isPrimary: true })
    const open = branch({ id: 'branch_b' })
    const alsoOpen = branch({ id: 'branch_c' })
    expect(resolveDefaultBranch([closedPrimary, open, alsoOpen])).toBe(open)
  })

  it('never picks a branch that is not taking bookings', () => {
    expect(resolveDefaultBranch([MARATHAHALLI])).toBeNull()
    expect(resolveDefaultBranch([])).toBeNull()
  })
})

describe('buildPublicBranchList', () => {
  it('lists every branch with whether it takes bookings, and the default', () => {
    expect(buildPublicBranchList([RAYASANDRA, MARATHAHALLI])).toEqual({
      branches: [
        {
          id: 'branch_rayasandra',
          name: 'Rayasandra',
          city: 'Bengaluru',
          status: 'operational',
          acceptingBookings: true,
        },
        {
          id: 'branch_marathahalli',
          name: 'Marathahalli',
          city: 'Bengaluru',
          status: 'opens_soon',
          acceptingBookings: false,
        },
      ],
      defaultBranchId: 'branch_rayasandra',
    })
  })

  it('keeps the given display order and does not expose the primary flag', () => {
    const list = buildPublicBranchList([MARATHAHALLI, RAYASANDRA])
    expect(list.branches.map((b) => b.id)).toEqual(['branch_marathahalli', 'branch_rayasandra'])
    for (const b of list.branches) {
      expect(b).not.toHaveProperty('isPrimary')
    }
  })

  it('reports no default when no branch is taking bookings', () => {
    expect(buildPublicBranchList([MARATHAHALLI]).defaultBranchId).toBeNull()
    expect(buildPublicBranchList([])).toEqual({ branches: [], defaultBranchId: null })
  })
})
