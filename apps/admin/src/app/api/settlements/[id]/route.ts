/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : GET /api/settlements/[id]
 * Scope        : API — cross-branch settlement (multi-branch R10)
 *
 * Description  : One closed statement and its entries, as JSON for the
 *                Settlements screen or as CSV for the accountant
 *                (?format=csv). The CSV matches the statement's totals.
 *
 * Responsibilities :
 * - GET → { statement, entries, canReverse }
 * - GET ?format=csv → text/csv attachment
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/settlement-access, @/lib/api/error-handler,
 *                @rgss/business, @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        : The two branches' Owners and the Developer only; anyone
 *                else, and a statement outside the viewer's branches, is 404.
 ************************************************************/

import { canReverseSettlementEntries, settlementStatementCsv } from '@rgss/business'
import { getSettlementStatement, getSettlementStatementEntries } from '@rgss/db/queries'
import { notFound } from '@rgss/errors'
import type { SettlementDetailView } from '@rgss/types'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireSettlementViewer, statementView } from '@/lib/api/settlement-access'

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'branch'
  )
}

export const GET = withErrorHandler(
  async (req: Request, route: { params: Promise<{ id: string }> }) => {
    const { viewer, scope } = await requireSettlementViewer()
    const { id } = await route.params

    const record = await getSettlementStatement(id, scope)
    if (!record) {
      throw notFound('Statement not found.')
    }
    const statement = statementView(record, viewer)
    const entries = await getSettlementStatementEntries(record)

    if (new URL(req.url).searchParams.get('format') === 'csv') {
      const filename = `settlement-${statement.month}-${slug(statement.branchA.name)}-${slug(statement.branchB.name)}.csv`
      return new Response(settlementStatementCsv(statement, entries), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    const view: SettlementDetailView = {
      statement,
      entries,
      canReverse: canReverseSettlementEntries(viewer),
    }
    return apiSuccess(view)
  },
)
