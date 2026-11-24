/************************************************************
 * Module Name  : GET /api/branches/[id]/shutdown-check
 * Scope        : API — Branch management (multi-branch R1.10)
 *
 * Description  : What still has to be resolved before the branch can shut
 *                down: its Manager, the people working there, bookings still
 *                to happen, unpaid invoices and open waitlist entries. The
 *                branch editor shows this before the Developer confirms.
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/branch-context, @/lib/api/error-handler,
 *                @rgss/business, @rgss/db/queries, @rgss/errors
 *
 * Notes        : Developer only. Advisory: the shutdown itself is refused by
 *                the database while anything is open.
 ************************************************************/

import { shutdownBlockerLines } from '@rgss/business'
import { getBranchShutdownBlockers, shutdownIsClear } from '@rgss/db/queries'
import { notFound } from '@rgss/errors'
import { requireCurrentRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

export const GET = withErrorHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireCurrentRole('developer')
    const { id } = await ctx.params

    const blockers = await getBranchShutdownBlockers(id)
    if (!blockers) {
      throw notFound('Branch not found.')
    }
    return apiSuccess({
      branchId: id,
      clear: shutdownIsClear(blockers),
      lines: shutdownBlockerLines(blockers),
      blockers,
    })
  },
)
