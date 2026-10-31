/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 28-10-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : PUT /api/staff/[id]/services
 * Scope        : API — Staff at the active branch (multi-branch R1.5, R2.3)
 *
 * Description  : Replaces the services a staff member of the active branch
 *                performs (the staff_service mapping that drives booking
 *                availability) with the provided { serviceIds }.
 *
 * Responsibilities :
 * - Zod-validate { branchId, serviceIds } and check the rendered branch
 * - The staff member must work here (404) and be someone the actor edits (403)
 * - Every serviceId must exist (400); replace the rows atomically
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/audit, @/lib/api/branch-context,
 *                @/lib/api/error-handler, @rgss/business, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        : Managers edit Stylists and Therapists; the Owner and the
 *                Developer edit everyone here.
 ************************************************************/

import { editableStaffRoles } from '@rgss/business'
import { getServicesByIds, getStaffMemberAtBranch, setStaffServices } from '@rgss/db/queries'
import { badRequest, forbidden, notFound } from '@rgss/errors'
import { staffServiceAssignmentSchema } from '@rgss/types'
import { audit } from '@/lib/api/audit'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

type Params = { params: Promise<{ id: string }> }

// PUT /api/staff/[id]/services — replace service capabilities.
export const PUT = withErrorHandler(async (req: Request, { params }: Params) => {
  const ctx = await requireBranchRole('manager')
  const { id } = await params

  const body = await req.json().catch(() => null)
  const parsed = staffServiceAssignmentSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }
  assertRenderedBranch(ctx, parsed.data.branchId)

  const staff = await getStaffMemberAtBranch(id, ctx.branch.id)
  if (!staff) {
    throw notFound('Staff member not found.')
  }
  const editable: readonly string[] = editableStaffRoles(ctx.branch.role)
  if (staff.roleWitness === null || !editable.includes(staff.roleWitness)) {
    throw forbidden('Managers edit Stylists and Therapists only.')
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
  await audit(req, ctx.session, {
    action: 'update',
    entityType: 'staff_services',
    entityId: id,
    branchId: ctx.branch.id,
    newValues: { serviceIds },
  })
  return apiSuccess({ staffId: id, serviceIds })
})
