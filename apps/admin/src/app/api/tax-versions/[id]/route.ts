/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : PATCH /api/tax-versions/[id]
 * Scope        : API — Branch tax rates (multi-branch TX-10)
 *
 * Description  : Records the launch tax review of a provisional rate at the
 *                active branch. Developer only. Nothing else about a version
 *                changes: a different rate is a new version.
 *
 * Responsibilities :
 * - PATCH { branchId, reviewed: true } → { version }
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/audit, @/lib/api/branch-context,
 *                @/lib/api/error-handler, @rgss/db/queries, @rgss/errors,
 *                @rgss/types
 *
 * Notes        : 404 for a version at another branch; 409 when it was
 *                already reviewed.
 ************************************************************/

import { getBranchTaxVersions, markTaxVersionReviewed } from '@rgss/db/queries'
import { badRequest, conflict, ERROR_CODES, notFound } from '@rgss/errors'
import { taxVersionReviewSchema } from '@rgss/types'
import { audit } from '@/lib/api/audit'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

type RouteContext = { params: Promise<{ id: string }> }

export const PATCH = withErrorHandler(async (req: Request, route: RouteContext) => {
  const ctx = await requireBranchRole('developer')
  const { id } = await route.params

  const body = await req.json().catch(() => null)
  const parsed = taxVersionReviewSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }
  assertRenderedBranch(ctx, parsed.data.branchId)

  const reviewed = await markTaxVersionReviewed(id, ctx.branch.id, ctx.session.user.id)
  if (!reviewed) {
    const version = (await getBranchTaxVersions(ctx.branch.id)).find((v) => v.id === id)
    if (!version) {
      throw notFound('Tax rate not found.')
    }
    throw conflict(ERROR_CODES.CONFLICT, 'This rate is already reviewed.')
  }

  await audit(req, ctx.session, {
    action: 'update',
    entityType: 'branch_tax_version',
    entityId: id,
    branchId: ctx.branch.id,
    newValues: { reviewStatus: 'reviewed' },
  })
  return apiSuccess({ version: reviewed })
})
