/************************************************************
 * Module Name  : DELETE /api/closures/[id]
 * Scope        : API — Admin branch closures (multi-branch R1.8)
 *
 * Description  : Reopens a closed day: removes one closure of the active
 *                branch, or (Developer only) one that closes every branch.
 *
 * Responsibilities :
 * - 404 for a closure of another branch, or one already removed
 * - 403 when the viewer may not remove this kind of closure
 * - Compare-and-delete, then audit with the branch
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/audit, @/lib/api/branch-context,
 *                @/lib/api/error-handler, @rgss/business, @rgss/db/queries,
 *                @rgss/errors
 *
 * Notes        : Manager or above at the active branch. The branch the page
 *                was rendered for comes as `?branchId=` (409 after a switch).
 ************************************************************/

import { assertCanManageClosure } from '@rgss/business'
import { deleteClosure, getClosureById } from '@rgss/db/queries'
import { notFound } from '@rgss/errors'
import { audit } from '@/lib/api/audit'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

export const DELETE = withErrorHandler(
  async (req: Request, routeCtx: { params: Promise<{ id: string }> }) => {
    const ctx = await requireBranchRole('manager')
    assertRenderedBranch(ctx, new URL(req.url).searchParams.get('branchId'))
    const { id } = await routeCtx.params

    const closure = await getClosureById(id)
    // Another branch's closure reads as not found (R2.3).
    if (!closure || (closure.branchId !== null && closure.branchId !== ctx.branch.id)) {
      throw notFound('Closure not found.')
    }
    assertCanManageClosure(ctx.branch.role, closure.branchId === null)

    const deleted = await deleteClosure({ id, branchId: closure.branchId })
    if (!deleted) {
      throw notFound('Closure not found.')
    }

    await audit(req, ctx.session, {
      action: 'delete',
      entityType: 'closure',
      entityId: id,
      branchId: closure.branchId,
      oldValues: deleted,
    })
    return apiSuccess({ ok: true })
  },
)
