import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireSession } from '@/lib/api/session'
import { getCustomerMembership, getMembershipSessions } from '@rgss/db/queries'

// GET /api/membership — the caller's own SPA membership(s): the single active
// membership (if any) with its session history, plus past (expired/cancelled)
// memberships. Strictly scoped to the authenticated customer (session.user.id);
// never exposes another customer's membership data.
export const GET = withErrorHandler(async () => {
  const session = await requireSession()
  const customerId = session.user.id

  const { active, past } = await getCustomerMembership(customerId)

  // Session history only applies to the active membership; an absent active
  // membership yields an empty list rather than an error.
  const sessions = active ? await getMembershipSessions(active.id) : []

  return apiSuccess({ active, past, sessions })
})
