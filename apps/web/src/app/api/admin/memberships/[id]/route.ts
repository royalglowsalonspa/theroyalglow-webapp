import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getMembershipById, getMembershipSessions } from '@rgss/db/queries'
import { notFound } from '@rgss/errors'

export const GET = withErrorHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole('receptionist')
    const { id } = await ctx.params

    const membership = await getMembershipById(id)
    if (!membership) {
      throw notFound('Membership not found.')
    }

    const sessions = await getMembershipSessions(id)
    return apiSuccess({ ...membership, sessions })
  },
)
