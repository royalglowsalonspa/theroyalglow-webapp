/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : settlement/access
 * Scope        : Business Logic — who sees and settles statements (R10)
 *
 * Description  : Statements between branches are visible only to the Owners
 *                of the two branches and the Developer (settlement.md, a
 *                deliberate exception to R3.2: a statement reveals the
 *                selling branch's membership rates). Marking one paid is for
 *                the paying branch's Owner or the Developer; corrections are
 *                the Developer's. Managers see hours and gems in reports,
 *                never the money.
 *
 * Responsibilities :
 * - settlementViewerOf: the Developer (every pair), an Owner (pairs with a
 *   branch they own), or nobody
 * - settlementScopeOf: the branches a viewer's queries may read
 * - canMarkSettlementPaid / canReverseSettlementEntries
 * - settlementReportFor: a branch report's settlement figures, without money
 *   for viewers below Owner
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : @rgss/types, ../branch/access
 *
 * Notes        : Callers answer 404 when settlementViewerOf is null, so a
 *                statement's existence isn't disclosed.
 ************************************************************/

import type { BranchSettlementReport } from '@rgss/types'
import type { BranchAccess, BranchRole } from '../branch/access'

export type SettlementViewer =
  | { kind: 'developer'; userId: string }
  | { kind: 'owner'; userId: string; branchIds: readonly string[] }

/** The branches a viewer's settlement queries may read. */
export type SettlementViewerScope = { all: true } | { all: false; branchIds: readonly string[] }

/** Who may read statements, from the person's current branch access; null for anyone else. */
export function settlementViewerOf(access: BranchAccess): SettlementViewer | null {
  if (access.role === 'developer') {
    return { kind: 'developer', userId: access.userId }
  }
  if (access.role === 'owner') {
    const branchIds = access.branches.filter((b) => b.role === 'owner').map((b) => b.id)
    return branchIds.length > 0 ? { kind: 'owner', userId: access.userId, branchIds } : null
  }
  return null
}

export function settlementScopeOf(viewer: SettlementViewer): SettlementViewerScope {
  return viewer.kind === 'developer' ? { all: true } : { all: false, branchIds: viewer.branchIds }
}

/**
 * The paying branch's Owner or the Developer may record the payment of a
 * statement that is owed and not yet paid (MS-25).
 */
export function canMarkSettlementPaid(
  viewer: SettlementViewer,
  statement: {
    payingBranchId: string | null
    paid: unknown
    net: { amountPaise: number }
  },
): boolean {
  if (statement.paid !== null || statement.payingBranchId === null) {
    return false
  }
  if (statement.net.amountPaise <= 0) {
    return false
  }
  return viewer.kind === 'developer' || viewer.branchIds.includes(statement.payingBranchId)
}

/** Only the Developer records corrections (reversing entries). */
export function canReverseSettlementEntries(viewer: SettlementViewer): boolean {
  return viewer.kind === 'developer'
}

/** Owners and the Developer see a branch report's settlement money. */
export function seesSettlementMoney(role: BranchRole): boolean {
  return role === 'owner' || role === 'developer'
}

/**
 * A branch report's settlement figures for someone with `role` at the branch:
 * everything for its Owner and the Developer; minutes and gems only for a
 * Manager, since the value of another branch's membership reveals its rate.
 */
export function settlementReportFor(
  report: BranchSettlementReport,
  role: BranchRole,
): BranchSettlementReport {
  if (seesSettlementMoney(role)) {
    return report
  }
  return {
    memberships: {
      deliveredMinutes: report.memberships.deliveredMinutes,
      deliveredValuePaise: null,
      ownMembersMinutes: report.memberships.ownMembersMinutes,
      ownMembersValuePaise: null,
      toReceivePaise: null,
      toPayPaise: null,
    },
    gems: {
      issued: report.gems.issued,
      redeemed: report.gems.redeemed,
      toReceivePaise: null,
      toPayPaise: null,
    },
  }
}
