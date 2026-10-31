/************************************************************
 * Module Name  : settlement-access (admin)
 * Scope        : API Infrastructure — who reads settlement statements (R10)
 *
 * Description  : Statements between branches are for the Owners of the two
 *                branches and the Developer only (settlement.md), so these
 *                routes don't use the active branch: every call re-reads the
 *                person's role and the branches they own from the database.
 *                Anyone else gets 404, so a statement's existence isn't
 *                disclosed.
 *
 * Responsibilities :
 * - requireSettlementViewer() → { session, viewer, scope }
 * - settlementViewerForPage(): the same for a server page, as a result
 * - statementView(record, viewer): a statement with what the viewer may do
 ************************************************************/

import {
  canMarkSettlementPaid,
  type SettlementViewer,
  type SettlementViewerScope,
  settlementScopeOf,
  settlementViewerOf,
} from '@rgss/business'
import type { SettlementStatementRecord } from '@rgss/db/queries'
import { AppError, notFound } from '@rgss/errors'
import type { SettlementStatementView } from '@rgss/types'
import { loadBranchAccess } from './branch-context'
import { requireSession } from './session'

/** What the Settlements page tells someone who can't see statements. */
export const SETTLEMENTS_REFUSAL =
  'Statements between branches are for the Owners of the two branches and the Developer.'

/**
 * Authenticate and settle what the person may read: every pair for the
 * Developer, pairs with a branch they own for an Owner. 404 for anyone else.
 */
export async function requireSettlementViewer(): Promise<{
  session: Awaited<ReturnType<typeof requireSession>>
  viewer: SettlementViewer
  scope: SettlementViewerScope
}> {
  const session = await requireSession()
  const access = await loadBranchAccess(session.user.id)
  const viewer = settlementViewerOf(access)
  if (!viewer) {
    throw notFound('Not found.')
  }
  return { session, viewer, scope: settlementScopeOf(viewer) }
}

/** A statement as the viewer sees it: whether they may mark it paid. */
export function statementView(
  record: SettlementStatementRecord,
  viewer: SettlementViewer,
): SettlementStatementView {
  const { payingBranchId, ...statement } = record
  return {
    ...statement,
    canMarkPaid: canMarkSettlementPaid(viewer, { ...record, payingBranchId }),
  }
}

/**
 * The page counterpart of requireSettlementViewer: who is looking, or why
 * they can't open the page. Only refusals become a result; anything else
 * still throws into the error boundary.
 */
export async function settlementViewerForPage(): Promise<
  { ok: true; viewer: SettlementViewer } | { ok: false; message: string }
> {
  try {
    const { viewer } = await requireSettlementViewer()
    return { ok: true, viewer }
  } catch (error: unknown) {
    if (error instanceof AppError && [401, 403, 404].includes(error.statusCode)) {
      return { ok: false, message: SETTLEMENTS_REFUSAL }
    }
    throw error
  }
}
