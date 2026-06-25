/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : PUT /api/staff/[id]/services
 * Scope        : API — Admin Staff management
 *
 * Description  : Replaces a staff member's service capabilities wholesale (the
 *                staff_service mapping that drives booking availability) with
 *                the provided { serviceIds }. Manager+.
 *
 * Responsibilities :
 * - Zod-validate the { serviceIds } payload
 * - Ensure the staff member exists (404) and every serviceId exists (400)
 * - Replace the staff_service rows atomically
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        : Referential safety is enforced here (staff + service existence)
 *                before the atomic db.batch replacement runs in the query layer.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getServicesByIds, getStaffProfileById, setStaffServices } from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { staffServiceAssignmentSchema } from '@rgss/types'

// PUT /api/staff/[id]/services — replace service capabilities. Manager+.
export const PUT = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole('manager')
    const { id } = await ctx.params

    const body = await req.json().catch(() => null)
    const parsed = staffServiceAssignmentSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }

    const staff = await getStaffProfileById(id)
    if (!staff) {
      throw notFound('Staff member not found.')
    }

    // Referential safety: every requested serviceId must exist. De-duplicate
    // first so the existence count compares apples to apples.
    const uniqueIds = [...new Set(parsed.data.serviceIds)]
    if (uniqueIds.length > 0) {
      const found = await getServicesByIds(uniqueIds)
      if (found.length !== uniqueIds.length) {
        throw badRequest('One or more selected services do not exist.')
      }
    }

    const serviceIds = await setStaffServices(id, parsed.data.serviceIds)
    return apiSuccess({ staffId: id, serviceIds })
  },
)
