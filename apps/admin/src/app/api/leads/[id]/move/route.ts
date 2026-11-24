import { moveLead } from '@rgss/db/queries'
import { badRequest, conflict, ERROR_CODES, notFound } from '@rgss/errors'
import { moveLeadSchema } from '@rgss/types'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

export const POST = withErrorHandler(
  async (req: Request, route: { params: Promise<{ id: string }> }) => {
    const ctx = await requireBranchRole('receptionist')
    const { id } = await route.params

    const parsed = moveLeadSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      throw badRequest('Invalid lead move data', parsed.error.flatten().fieldErrors)
    }
    assertRenderedBranch(ctx, parsed.data.branchId)

    const result = await moveLead({
      id,
      branchId: ctx.branch.id,
      toBranchId: parsed.data.toBranchId,
      actorId: ctx.session.user.id,
    })
    if (result.ok) {
      return apiSuccess({ destination: result.destination })
    }
    if (result.reason === 'not_found') {
      throw notFound('Lead not found.')
    }
    if (result.reason === 'destination_unavailable') {
      throw badRequest('Choose another branch that is accepting leads.')
    }
    throw conflict(
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      'Only open leads can move to another branch.',
    )
  },
)
