/************************************************************
 * Module Name  : branch/staff-time.test
 * Scope        : Business Logic — leave decisions and branch schedules (R5.10)
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { BRANCH_ROLES, type BranchRole } from './access'
import { isDayHeldElsewhere, leaveDecisionRefusal, scheduleDayForBranch } from './staff-time'

describe('leaveDecisionRefusal', () => {
  it('refuses anyone deciding their own leave, whatever their role', () => {
    for (const role of BRANCH_ROLES) {
      expect(
        leaveDecisionRefusal({ userId: 'u1', role }, { userId: 'u1', roleWitness: 'staff' })?.code,
      ).toBe('own_leave')
    }
  })

  it('leaves a Manager’s leave to the Owner or the Developer', () => {
    const manager = { userId: 'mgr', roleWitness: 'manager' } as const
    const decide = (role: BranchRole) => leaveDecisionRefusal({ userId: 'other', role }, manager)

    expect(decide('receptionist')?.code).toBe('manager_leave')
    expect(decide('manager')?.code).toBe('manager_leave')
    expect(decide('owner')).toBeNull()
    expect(decide('developer')).toBeNull()
  })

  it('lets anyone else decide ordinary staff and Receptionist leave', () => {
    for (const roleWitness of ['staff', 'receptionist', null] as const) {
      expect(
        leaveDecisionRefusal(
          { userId: 'rec', role: 'receptionist' },
          { userId: 'sty', roleWitness },
        ),
      ).toBeNull()
    }
  })
})

describe('isDayHeldElsewhere', () => {
  it('is true only for a working day at another branch', () => {
    expect(isDayHeldElsewhere({ isWorking: true, branchId: 'mh' }, 'rs')).toBe(true)
    expect(isDayHeldElsewhere({ isWorking: true, branchId: 'rs' }, 'rs')).toBe(false)
    expect(isDayHeldElsewhere({ isWorking: false, branchId: 'mh' }, 'rs')).toBe(false)
    expect(isDayHeldElsewhere({ isWorking: true, branchId: null }, 'rs')).toBe(false)
  })
})

describe('scheduleDayForBranch', () => {
  const day = (overrides: Partial<{ isWorking: boolean; branchId: string | null }> = {}) => ({
    id: 's1',
    dayOfWeek: 2,
    isWorking: true,
    startTime: '10:00:00',
    endTime: '18:00:00',
    branchId: 'rs',
    ...overrides,
  })

  it('shows a branch its own day, without the branch id', () => {
    expect(scheduleDayForBranch(day(), 'rs')).toEqual({
      id: 's1',
      dayOfWeek: 2,
      isWorking: true,
      startTime: '10:00:00',
      endTime: '18:00:00',
      elsewhere: false,
    })
  })

  it('hides the hours and the branch of a day held elsewhere', () => {
    const seen = scheduleDayForBranch(day({ branchId: 'mh' }), 'rs')
    expect(seen).toEqual({
      id: 's1',
      dayOfWeek: 2,
      isWorking: false,
      startTime: null,
      endTime: null,
      elsewhere: true,
    })
    expect(JSON.stringify(seen)).not.toContain('mh')
  })

  it('never reveals another branch, for any row', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.option(fc.constantFrom('rs', 'mh', 'kr'), { nil: null }),
        (isWorking, branchId) => {
          const seen = scheduleDayForBranch(day({ isWorking, branchId }), 'rs')
          expect(seen).not.toHaveProperty('branchId')
          expect(seen.elsewhere).toBe(isWorking && branchId !== null && branchId !== 'rs')
          if (seen.elsewhere) {
            expect(seen.startTime).toBeNull()
          }
        },
      ),
    )
  })
})
