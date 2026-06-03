/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|POST /api/staff/leave
 * Scope        : API — Staff Leave
 *
 * Description  : Staff leave self-service endpoints. GET returns the caller's
 *                own leave history; POST submits a new leave request.
 *
 * Responsibilities :
 * - Return the authenticated staff member's leave history
 * - Validate and submit new leave requests (single date)
 * - Prevent duplicate leave requests for the same date
 *
 * Features / Functionality :
 * - Staff-scoped leave history (GET)
 * - Leave request submission with date conflict check (POST)
 * - Friendly 409 on duplicate date (not raw DB violation)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Requires min role: staff.
 * - Leave requests start as pending, approved/rejected by admin.
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

// GET /api/staff/leave — the caller's own leave history. Strictly scoped to the
// authenticated staff member's staff_profile (resolved from session.user.id); never
// exposes another staff member's leave.
export const GET = withErrorHandler(async () => {
  const session = await requireRole('staff')

  const staff = await getStaffProfileByUserId(session.user.id)
  if (!staff) {
    throw notFound('No staff profile for this account.')
  }

  const leave = await getLeaveForStaff(staff.id)
  return apiSuccess({ leave })
})

// POST /api/staff/leave — submit a leave request for a single date (status pending).
// Pre-checks the unique (staff, date) constraint to return a friendly 409 rather than
// a raw unique violation.
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
