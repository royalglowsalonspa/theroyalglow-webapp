/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|POST /api/staff
 * Scope        : API — Admin Staff
 *
 * Description  : GET returns active staff members for admin dropdowns (booking
 *                approval, staff assignment, schedule management) — Receptionist+.
 *                POST creates a staff_profile by linking an existing user account
 *                (by email) — Manager+.
 *
 * Responsibilities :
 * - GET: retrieve active staff profiles (id, name, designation) — Receptionist+
 * - POST: Zod-validate the create payload, link the existing account by email,
 *   and create the staff_profile (404 when no account exists) — Manager+
 *
 * Features / Functionality :
 * - Active staff list for assignment pickers (lean response)
 * - Create staff by email with a clear 404 ("ask them to sign in first")
 * - 409 when the account is already a staff member
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        :
 * - GET requires min role: receptionist; POST requires min role: manager.
 * - GET returns only active staff (inactive/terminated are excluded).
 * - Staff are deactivated (isActive=false), never hard-deleted.
 ************************************************************/

import { createStaffProfile, getActiveStaff } from '@rgss/db/queries'
import { badRequest, conflict, ERROR_CODES, notFound } from '@rgss/errors'
import { staffCreateSchema } from '@rgss/types'
import { audit } from '@/lib/api/audit'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'

// Active staff members for the assignment picker (approve / reassign flows).
export const GET = withErrorHandler(async () => {
  await requireRole('receptionist')

  const rows = await getActiveStaff()
  const staff = rows.map((s) => ({
    id: s.id,
    name: s.name,
    designation: s.designation,
  }))

  return apiSuccess({ staff })
})

// POST /api/staff — create a staff profile by linking an existing user account
// (matched by email). The user must already have signed in at least once:
// when no account matches we return a 404 telling the admin to ask them to sign
// in first. A 409 is returned when the account is already a staff member. On
// success the account is promoted to 'staff' if its role ranks lower. Manager+.
export const POST = withErrorHandler(async (req: Request) => {
  const session = await requireRole('manager')

  const body = await req.json().catch(() => null)
  const parsed = staffCreateSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }

  const result = await createStaffProfile(parsed.data)
  if (!result.ok) {
    if (result.reason === 'user_not_found') {
      throw notFound(
        'No account found for that email. Ask them to sign in first, then add them here.',
      )
    }
    throw conflict(ERROR_CODES.CONFLICT, 'This account is already a staff member.')
  }

  await audit(req, session, {
    action: 'create',
    entityType: 'staff_profile',
    entityId: result.staff.id,
    newValues: { email: parsed.data.email, designation: parsed.data.designation },
  })

  return apiSuccess({ staff: result.staff }, undefined, 201)
})
