import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { addCustomerNote } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { addCustomerNoteSchema } from '@rgss/types'

// POST /api/admin/customers/[id]/notes — add a free-text note to a customer,
// optionally linked to a booking. Receptionist+. Persists author + timestamp.
export const POST = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole('receptionist')
    const { id } = await ctx.params

    const body = await req.json().catch(() => null)
    const parsed = addCustomerNoteSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }

    const note = await addCustomerNote(
      id,
      session.user.id,
      parsed.data.content,
      parsed.data.bookingId,
    )

    return apiSuccess({ note }, undefined, 201)
  },
)
