/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/staff/schedule
 * Scope        : API — Staff Schedule
 *
 * Description  : Returns the authenticated staff member's own weekly schedule
 *                (read-only). Staff cannot view other members' schedules here.
 *
 * Responsibilities :
 * - Resolve staff_profile from the authenticated session
 * - Return the weekly schedule for the staff member
 * - Deny access if no staff profile exists
 *
 * Features / Functionality :
 * - Read-only weekly schedule view (own schedule only)
 * - Staff-scoped (never exposes other members' data)
 * - Role-gated (minimum: staff)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries, @rgss/errors
 *
 * Notes        :
 * - Staff access their own schedule here; admin schedule is at /api/admin/schedule.
 * - Requires min role: staff.
 ************************************************************/

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
