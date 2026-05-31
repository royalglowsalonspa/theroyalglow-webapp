import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { getActiveOffers } from '@rgss/db/queries'

// GET /api/offers — public list of active offers for the customer offers page.
// No auth: returns only offers whose active flag is true and whose date range
// includes today, each with its applicable service names.
export const GET = withErrorHandler(async () => {
  const offers = await getActiveOffers()
  return apiSuccess({ offers })
})
