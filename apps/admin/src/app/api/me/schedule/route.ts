/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : GET /api/me/schedule
 * Scope        : API — Staff Self-Service Schedule
 *
 * Description  : Returns the authenticated staff member's own weekly schedule
 *                (read-only). Relocated from apps/web/api/staff/schedule during
 *                the admin-web-separation feature so all admin-portal surfaces
 *                live on admin.theroyalglow.in. Staff cannot view other
 *                members' schedules here.
 *
 * Responsibilities :
 * - Resolve staff_profile from the authenticated session
 * - Return the weekly schedule for the staff member
 * - Deny access if no staff profile exists
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries, @rgss/errors
 *
 * Notes        :
 * - Requires min role: staff (RBAC `/me` namespace, level 1).
 * - Self-service only; the manager-level schedule lives at /api/schedule.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getStaffProfileByUserId, getStaffSchedule } from '@rgss/db/queries'
import { notFound } from '@rgss/errors'

// GET /api/me/schedule — the caller's own weekly schedule (read-only).
// Resolves the staff_profile from the session user; strictly scoped to that
// staff member and never exposes another staff member's schedule.
export const GET = withErrorHandler(async () => {
  const session = await requireRole('staff')

  const staff = await getStaffProfileByUserId(session.user.id)
  if (!staff) {
    throw notFound('No staff profile for this account.')
  }

  const schedule = await getStaffSchedule(staff.id)
  return apiSuccess({ schedule })
})
