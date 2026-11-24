/************************************************************
 * Module Name  : role-access.test
 * Scope        : Admin Portal — Users & Roles presentation helper
 *
 * Description  : The role-change summary must match the RBAC config: each
 *                role sees the pages its level allows, and a change reports
 *                exactly the pages gained or lost, never both at once.
 ************************************************************/

import { ASSIGNABLE_ROLES } from '@rgss/types'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { adminPagesForRole, roleAccessChange } from './role-access'

describe('adminPagesForRole', () => {
  it('gives a customer (or an unknown role) no admin pages', () => {
    expect(adminPagesForRole('customer')).toEqual([])
    expect(adminPagesForRole(null)).toEqual([])
    expect(adminPagesForRole('toString')).toEqual([])
  })

  it('gives staff only their self-service pages', () => {
    expect(adminPagesForRole('staff')).toEqual(['My Schedule', 'My Leave'])
  })

  it('matches each level of the hierarchy', () => {
    const receptionist = adminPagesForRole('receptionist')
    expect(receptionist).toContain('Bookings')
    expect(receptionist).not.toContain('Staff')

    expect(adminPagesForRole('manager')).toContain('Staff')
    expect(adminPagesForRole('manager')).not.toContain('Users')
    expect(adminPagesForRole('owner')).toContain('Users')
    expect(adminPagesForRole('developer')).toContain('Logs')
    // Settings are Developer-only.
    expect(adminPagesForRole('owner')).not.toContain('Settings')
    expect(adminPagesForRole('developer')).toContain('Settings')
  })
})

describe('roleAccessChange', () => {
  it('reports what a manager adds over a receptionist, in sidebar order', () => {
    expect(roleAccessChange('receptionist', 'manager')).toEqual({
      direction: 'raise',
      gained: ['Staff', 'Schedule', 'Offers', 'Reports'],
      lost: [],
      after: adminPagesForRole('manager'),
    })
  })

  it('reports every page lost on demotion to customer', () => {
    const change = roleAccessChange('manager', 'customer')
    expect(change.direction).toBe('lower')
    expect(change.gained).toEqual([])
    expect(change.lost).toEqual(adminPagesForRole('manager'))
    expect(change.after).toEqual([])
  })

  it('reports no change for the same level', () => {
    expect(roleAccessChange('receptionist', 'receptionist')).toEqual({
      direction: 'same',
      gained: [],
      lost: [],
      after: adminPagesForRole('receptionist'),
    })
    expect(roleAccessChange(null, 'customer').direction).toBe('same')
  })

  it('gains only when raising, loses only when lowering, and never both', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ASSIGNABLE_ROLES),
        fc.constantFrom(...ASSIGNABLE_ROLES),
        (from, to) => {
          const { direction, gained, lost, after } = roleAccessChange(from, to)
          const overlap = gained.filter((page) => lost.includes(page))
          return (
            overlap.length === 0 &&
            (gained.length === 0 || direction === 'raise') &&
            (lost.length === 0 || direction === 'lower') &&
            gained.every((page) => after.includes(page)) &&
            lost.every((page) => !after.includes(page))
          )
        },
      ),
    )
  })
})
