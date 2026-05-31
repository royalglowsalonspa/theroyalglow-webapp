import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { assignTag } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { assignTagSchema } from '@rgss/types'

// POST /api/admin/customers/[id]/tags — assign an existing tag to a customer.
// Receptionist+. Idempotent: re-assigning a present tag is a no-op (no error).
export const POST = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole('receptionist')
    const { id } = await ctx.params

    const body = await req.json().catch(() => null)
    const parsed = assignTagSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }

    await assignTag(id, parsed.data.tagId, session.user.id)

    return apiSuccess({ ok: true }, undefined, 201)
  },
)
