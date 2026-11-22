import { recordMembershipCorrection } from '@rgss/db/queries'
import { badRequest, conflict, ERROR_CODES, forbidden, notFound } from '@rgss/errors'
import { membershipCorrectionSchema } from '@rgss/types'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

export const POST = withErrorHandler(async (req: Request) => {
  const context = await requireBranchRole('developer')
  const parsed = membershipCorrectionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    throw badRequest('Invalid membership correction', parsed.error.flatten().fieldErrors)
  }
  assertRenderedBranch(context, parsed.data.branchId)
  const result = await recordMembershipCorrection({
    ...parsed.data,
    performedBy: context.session.user.id,
  })
  if (!result.ok) {
    switch (result.reason) {
      case 'actor':
        throw forbidden('Only a Developer can record this correction.')
      case 'target':
        throw notFound('No eligible membership session invoice was found at this branch.')
      case 'balance':
        throw conflict(
          ERROR_CODES.CONFLICT,
          'The adjustment exceeds the unreserved balance or the session’s minutes.',
        )
      case 'settlement':
        throw conflict(
          ERROR_CODES.CONFLICT,
          'The original cross-branch settlement must be available to post this correction.',
        )
      case 'duplicate_key':
        throw conflict(ERROR_CODES.CONFLICT, 'This request key belongs to a different correction.')
    }
  }
  const { correction, remainingMinutes, duplicate } = result
  return apiSuccess({ correction, remainingMinutes, duplicate }, undefined, duplicate ? 200 : 201)
})
