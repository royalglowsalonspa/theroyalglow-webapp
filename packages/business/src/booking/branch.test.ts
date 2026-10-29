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
  matchBranchParam,
  resolveDefaultBranch,
  resolveLeadBranch,
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

describe('resolveLeadBranch (R7.3)', () => {
  it('uses the branch the ad link named, even before it opens', () => {
    expect(resolveLeadBranch([RAYASANDRA, MARATHAHALLI], 'branch_marathahalli')).toBe(MARATHAHALLI)
  })

  it('falls back to the default booking branch for a missing or unknown branch', () => {
    expect(resolveLeadBranch([MARATHAHALLI, RAYASANDRA], undefined)).toBe(RAYASANDRA)
    expect(resolveLeadBranch([MARATHAHALLI, RAYASANDRA], 'branch_nowhere')).toBe(RAYASANDRA)
  })

  it('never files a lead under a shut-down branch', () => {
    const closed = branch({ id: 'branch_closed', status: 'shutdown' })
    expect(resolveLeadBranch([closed, RAYASANDRA], 'branch_closed')).toBe(RAYASANDRA)
  })

  it('still finds a pipeline when no branch is taking bookings', () => {
    const closedPrimary = branch({ id: 'branch_a', status: 'temporarily_closed', isPrimary: true })
    expect(resolveLeadBranch([MARATHAHALLI, closedPrimary], undefined)).toBe(closedPrimary)
    expect(resolveLeadBranch([MARATHAHALLI], undefined)).toBe(MARATHAHALLI)
  })

  it('has nowhere to file a lead only when every branch is shut down or none exist', () => {
    expect(resolveLeadBranch([branch({ id: 'gone', status: 'shutdown' })], undefined)).toBeNull()
    expect(resolveLeadBranch([], 'branch_rayasandra')).toBeNull()
  })
})

describe('matchBranchParam', () => {
  const branches = [
    { id: 'branch_rayasandra', code: 'RS' },
    { id: 'branch_marathahalli', code: 'MH' },
  ]

  it('matches a branch by id or by code, ignoring case', () => {
    expect(matchBranchParam(branches, 'MH')?.id).toBe('branch_marathahalli')
    expect(matchBranchParam(branches, ' rs ')?.id).toBe('branch_rayasandra')
    expect(matchBranchParam(branches, 'BRANCH_MARATHAHALLI')?.id).toBe('branch_marathahalli')
  })

  it('matches nothing for a missing or unknown value', () => {
    expect(matchBranchParam(branches, undefined)).toBeNull()
    expect(matchBranchParam(branches, '  ')).toBeNull()
    expect(matchBranchParam(branches, 'XX')).toBeNull()
  })
})
