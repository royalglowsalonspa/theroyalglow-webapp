/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : GET /api/settlements
 * Scope        : API — cross-branch settlement (multi-branch R10)
 *
 * Description  : The monthly statements between branches the viewer may see,
 *                newest month first, and what each pair owes the other so far
 *                in the months not closed yet.
 *
 * Responsibilities :
 * - GET ?month=YYYY-MM → { statements, open, scope }
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/settlement-access, @/lib/api/error-handler,
 *                @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        : The Developer sees every pair; an Owner sees pairs with a
 *                branch they own; anyone else gets 404 (settlement.md). Not
 *                tied to the active branch: one Owner's statements span all
 *                their branches.
 ************************************************************/

import { getOpenSettlementMonths, listSettlementStatements } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { type SettlementListView, settlementListQuerySchema } from '@rgss/types'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireSettlementViewer, statementView } from '@/lib/api/settlement-access'

export const GET = withErrorHandler(async (req: Request) => {
  const { viewer, scope } = await requireSettlementViewer()

  const parsed = settlementListQuerySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  )
  if (!parsed.success) {
    throw badRequest('Invalid month', parsed.error.flatten().fieldErrors)
  }

  const [records, open] = await Promise.all([
    listSettlementStatements(scope, { month: parsed.data.month }),
    getOpenSettlementMonths(scope),
  ])
  const view: SettlementListView = {
    statements: records.map((record) => statementView(record, viewer)),
    open,
    scope: viewer.kind === 'developer' ? 'all' : 'owner',
  }
  return apiSuccess(view)
})
