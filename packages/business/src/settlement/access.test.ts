/************************************************************
 * Module Name  : settlement/access.test
 * Scope        : Business Logic — who sees and settles statements (R10)
 *
 * Description  : Only the two branches' Owners and the Developer see a
 *                statement; the paying branch's Owner or the Developer marks
 *                it paid; corrections are the Developer's; Managers see hours
 *                and gems without money (settlement.md, MS-25).
 ************************************************************/

import type { BranchSettlementReport } from '@rgss/types'
import { describe, expect, it } from 'vitest'
import type { AccessibleBranch, BranchAccess } from '../branch/access'
import {
  canMarkSettlementPaid,
  canReverseSettlementEntries,
  settlementReportFor,
  settlementScopeOf,
  settlementViewerOf,
} from './access'

function branch(id: string, role: AccessibleBranch['role']): AccessibleBranch {
  return { id, name: id, code: id, status: 'operational', isPrimary: false, role }
}

function access(role: string | null, branches: AccessibleBranch[]): BranchAccess {
  return { userId: 'usr_1', role, branches }
}

const OWED = { payingBranchId: 'br_rs', paid: null, net: { amountPaise: 95_239 } }

describe('settlementViewerOf', () => {
  it('lets the Developer see every pair', () => {
    const viewer = settlementViewerOf(access('developer', [branch('br_rs', 'developer')]))
    expect(viewer).toEqual({ kind: 'developer', userId: 'usr_1' })
    expect(viewer && settlementScopeOf(viewer)).toEqual({ all: true })
  })

  it('lets an Owner see pairs with a branch they own', () => {
    const viewer = settlementViewerOf(
      access('owner', [branch('br_rs', 'owner'), branch('br_mh', 'owner')]),
    )
    expect(viewer).toEqual({ kind: 'owner', userId: 'usr_1', branchIds: ['br_rs', 'br_mh'] })
    expect(viewer && settlementScopeOf(viewer)).toEqual({
      all: false,
      branchIds: ['br_rs', 'br_mh'],
    })
  })

  it.each([
    ['a Manager', access('manager', [branch('br_rs', 'manager')])],
    ['a Receptionist', access('receptionist', [branch('br_rs', 'receptionist')])],
    ['Staff', access('staff', [branch('br_rs', 'staff')])],
    ['a customer', access('customer', [])],
    ['an Owner without a branch', access('owner', [])],
    ['an unknown role', access(null, [])],
  ])('refuses %s', (_label, who) => {
    expect(settlementViewerOf(who)).toBeNull()
  })
})

describe('canMarkSettlementPaid', () => {
  const owner = { kind: 'owner' as const, userId: 'usr_1', branchIds: ['br_rs'] }
  const otherOwner = { kind: 'owner' as const, userId: 'usr_2', branchIds: ['br_mh'] }
  const developer = { kind: 'developer' as const, userId: 'usr_3' }

  it('is for the paying branch’s Owner or the Developer', () => {
    expect(canMarkSettlementPaid(owner, OWED)).toBe(true)
    expect(canMarkSettlementPaid(developer, OWED)).toBe(true)
    expect(canMarkSettlementPaid(otherOwner, OWED)).toBe(false)
  })

  it('is never offered once paid, or when nothing is owed', () => {
    expect(canMarkSettlementPaid(developer, { ...OWED, paid: { paidOn: '2026-11-02' } })).toBe(
      false,
    )
    expect(
      canMarkSettlementPaid(developer, {
        payingBranchId: null,
        paid: null,
        net: { amountPaise: 0 },
      }),
    ).toBe(false)
  })
})

describe('canReverseSettlementEntries', () => {
  it('is the Developer’s alone', () => {
    expect(canReverseSettlementEntries({ kind: 'developer', userId: 'usr_3' })).toBe(true)
    expect(
      canReverseSettlementEntries({ kind: 'owner', userId: 'usr_1', branchIds: ['br_rs'] }),
    ).toBe(false)
  })
})

describe('settlementReportFor', () => {
  const report: BranchSettlementReport = {
    memberships: {
      deliveredMinutes: 120,
      deliveredValuePaise: 200_000,
      ownMembersMinutes: 60,
      ownMembersValuePaise: 100_000,
      toReceivePaise: 95_239,
      toPayPaise: 47_620,
    },
    gems: { issued: 40, redeemed: 500, toReceivePaise: 50_000, toPayPaise: 0 },
  }

  it('shows Owners and the Developer the money', () => {
    expect(settlementReportFor(report, 'owner')).toEqual(report)
    expect(settlementReportFor(report, 'developer')).toEqual(report)
  })

  it('shows a Manager hours and gems only', () => {
    expect(settlementReportFor(report, 'manager')).toEqual({
      memberships: {
        deliveredMinutes: 120,
        deliveredValuePaise: null,
        ownMembersMinutes: 60,
        ownMembersValuePaise: null,
        toReceivePaise: null,
        toPayPaise: null,
      },
      gems: { issued: 40, redeemed: 500, toReceivePaise: null, toPayPaise: null },
    })
  })
})
