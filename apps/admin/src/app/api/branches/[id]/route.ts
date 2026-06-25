/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : PATCH /api/branches/[id]
 * Scope        : API — Admin branch management
 *
 * Description  : Updates a branch (edit fields or change operational status).
 *                Owner+. Returns 404 when the branch does not exist.
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        : Branches are never hard-deleted — set status to shutdown /
 *                temporarily_closed instead. `code`/`number` are immutable.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getBranchById, updateBranch } from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { branchUpdateSchema } from '@rgss/types'

export const PATCH = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole('owner')
    const { id } = await ctx.params

    const body = await req.json().catch(() => null)
    const parsed = branchUpdateSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }

    const existing = await getBranchById(id)
    if (!existing) {
      throw notFound('Branch not found.')
    }

    const updated = await updateBranch(id, parsed.data)
    return apiSuccess({ branch: updated })
  },
)
