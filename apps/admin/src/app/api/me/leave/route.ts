/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : GET|POST /api/me/leave
 * Scope        : API — Staff Self-Service Leave
 *
 * Description  : Staff leave self-service endpoints. GET returns the caller's
 *                own leave history; POST submits a new leave request. Relocated
 *                from apps/web/api/staff/leave during the admin-web-separation
 *                feature.
 *
 * Responsibilities :
 * - Return the authenticated staff member's leave history
 * - Validate and submit new leave requests (single date)
 * - Prevent duplicate leave requests for the same date
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Requires min role: staff (RBAC `/me` namespace, level 1).
 * - Leave requests start as pending, approved/rejected by admin at /leave.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import {
  getLeaveForStaff,
  getLeaveForStaffOnDate,
  getStaffProfileByUserId,
  submitLeave,
} from '@rgss/db/queries'
import { ERROR_CODES, badRequest, conflict, notFound } from '@rgss/errors'
import { submitLeaveSchema } from '@rgss/types'

// GET /api/me/leave — the caller's own leave history. Strictly scoped to the
// authenticated staff member's staff_profile (resolved from session.user.id);
// never exposes another staff member's leave.
export const GET = withErrorHandler(async () => {
  const session = await requireRole('staff')

  const staff = await getStaffProfileByUserId(session.user.id)
  if (!staff) {
    throw notFound('No staff profile for this account.')
  }

  const leave = await getLeaveForStaff(staff.id)
  return apiSuccess({ leave })
})

// POST /api/me/leave — submit a leave request for a single date (status pending).
// Pre-checks the unique (staff, date) constraint to return a friendly 409 rather
// than a raw unique violation.
export const POST = withErrorHandler(async (req: Request) => {
  const session = await requireRole('staff')

  const staff = await getStaffProfileByUserId(session.user.id)
  if (!staff) {
    throw notFound('No staff profile for this account.')
  }

  const body = await req.json()
  const parsed = submitLeaveSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }

  const existing = await getLeaveForStaffOnDate(staff.id, parsed.data.date)
  if (existing) {
    throw conflict(ERROR_CODES.CONFLICT, 'You already have a leave request for this date.')
  }

  const leave = await submitLeave(staff.id, parsed.data)
  return apiSuccess({ leave }, undefined, 201)
})
