/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/staff
 * Scope        : API — Admin Staff
 *
 * Description  : Returns active staff members for admin dropdowns (booking
 *                approval, staff assignment, schedule management).
 *
 * Responsibilities :
 * - Retrieve all active staff profiles
 * - Return minimal staff data (id, name, designation)
 * - Enforce RBAC (receptionist+)
 *
 * Features / Functionality :
 * - Active staff list for assignment pickers
 * - Lightweight response (id, name, designation only)
 * - Used across booking approve, reassign, and schedule flows
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries
 *
 * Notes        :
 * - Requires min role: receptionist.
 * - Returns only active staff (inactive/terminated are excluded).
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getActiveStaff } from '@rgss/db/queries'

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
