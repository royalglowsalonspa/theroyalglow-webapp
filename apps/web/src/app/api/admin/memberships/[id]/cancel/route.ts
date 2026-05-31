import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { cancelMembership, getMembershipById } from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { cancelMembershipSchema } from '@rgss/types'

export const POST = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole('manager')
    const { id } = await ctx.params

    const body = await req.json().catch(() => null)
    const parsed = cancelMembershipSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }

    const existing = await getMembershipById(id)
    if (!existing) {
      throw notFound('Membership not found.')
    }

    const updated = await cancelMembership(id, parsed.data.reason)
    return apiSuccess(updated)
  },
)
