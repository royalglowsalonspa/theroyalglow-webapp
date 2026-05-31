import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getMembershipTiers } from '@rgss/db/queries'

export const GET = withErrorHandler(async () => {
  await requireRole('receptionist')

  const tiers = await getMembershipTiers()
  return apiSuccess(tiers)
})
