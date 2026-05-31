import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { removeTag } from '@rgss/db/queries'

// DELETE /api/admin/customers/[id]/tags/[tagId] — remove a tag assignment from
// a customer. Receptionist+. No-op if the assignment does not exist.
export const DELETE = withErrorHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string; tagId: string }> }) => {
    await requireRole('receptionist')
    const { id, tagId } = await ctx.params

    await removeTag(id, tagId)

    return apiSuccess({ ok: true })
  },
)
