import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { addLeadNote } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { addLeadNoteSchema } from '@rgss/types'

export const POST = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole('receptionist')
    const { id } = await ctx.params

    const body = await req.json().catch(() => null)
    const parsed = addLeadNoteSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid note data', parsed.error.flatten().fieldErrors)
    }

    const note = await addLeadNote(id, session.user.id, parsed.data.content)

    return apiSuccess({ note }, undefined, 201)
  },
)
