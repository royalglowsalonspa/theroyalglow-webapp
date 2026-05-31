import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getStaffProfileByUserId, getStaffSchedule } from '@rgss/db/queries'
import { notFound } from '@rgss/errors'

// GET /api/staff/schedule — the caller's own weekly schedule (read-only).
// Resolves the staff_profile from the session user; strictly scoped to that
// staff member and never exposes another staff member's schedule. Staff are
// not permitted on the admin schedule endpoint, so this is their own surface.
export const GET = withErrorHandler(async () => {
  const session = await requireRole('staff')

  const staff = await getStaffProfileByUserId(session.user.id)
  if (!staff) {
    throw notFound('No staff profile for this account.')
  }

  const schedule = await getStaffSchedule(staff.id)
  return apiSuccess({ schedule })
})
