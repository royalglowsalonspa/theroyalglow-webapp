/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : GET /api/staff/all
 * Scope        : API — Admin Staff management
 *
 * Description  : Returns the full staff roster (every staff_profile joined to
 *                its user identity) with each member's assigned-service count —
 *                the data behind the Staff management screen. Manager+.
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries
 *
 * Notes        : Distinct from GET /api/staff (active-only, lean, Receptionist+
 *                assignment picker) so existing consumers keep their lean list.
 ************************************************************/

import { getStaffForAdmin } from '@rgss/db/queries'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'

// GET /api/staff/all — full roster with service counts. Manager+.
export const GET = withErrorHandler(async () => {
  await requireRole('manager')
  const staff = await getStaffForAdmin()
  return apiSuccess({ staff })
})
