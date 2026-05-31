import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { assertLeadTransition } from '@rgss/business'
import { getLeadById, getLeadNotes, updateLead } from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { updateLeadStatusSchema } from '@rgss/types'

export const GET = withErrorHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole('receptionist')
    const { id } = await ctx.params

    const lead = await getLeadById(id)
    if (!lead) {
      throw notFound('Lead not found.')
    }

    const notes = await getLeadNotes(id)

    return apiSuccess({ lead, notes })
  },
)

export const PATCH = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole('receptionist')
    const { id } = await ctx.params

    const body = await req.json().catch(() => null)
    const parsed = updateLeadStatusSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }

    const existing = await getLeadById(id)
    if (!existing) {
      throw notFound('Lead not found.')
    }

    assertLeadTransition(existing.status, parsed.data.status, parsed.data.reason)

    const patch: { status: typeof parsed.data.status; lastContactedAt?: Date } = {
      status: parsed.data.status,
    }
    if (parsed.data.status === 'contacted') {
      patch.lastContactedAt = new Date()
    }

    const updated = await updateLead(id, patch)

    return apiSuccess({ lead: updated })
  },
)
