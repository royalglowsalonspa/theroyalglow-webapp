/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 28-10-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : GET|PATCH /api/staff/[id]
 * Scope        : API — Staff at the active branch (multi-branch R1.5, R1.11, R2.3)
 *
 * Description  : GET returns one staff member of the active branch (profile,
 *                identity, assigned serviceIds and how many upcoming bookings
 *                name them). PATCH edits their title, phone, bio,
 *                specialization or hire date.
 *
 * Responsibilities :
 * - GET: one staff member here, 404 for anyone who doesn't work here
 * - PATCH: Zod-validate, check the rendered branch and who may edit whom,
 *   then patch with a scoped compare-and-set
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/audit, @/lib/api/branch-context,
 *                @/lib/api/error-handler, @rgss/business, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        : Managers edit Stylists and Therapists; the Owner and the
 *                Developer edit everyone here. Only a Stylist or Therapist
 *                changes title, between those two. There is no active toggle:
 *                Remove staff replaces it (POST /api/staff/[id]/remove).
 ************************************************************/

import { editableStaffRoles } from '@rgss/business'
import {
  countUpcomingAssignments,
  getStaffMemberAtBranch,
  updateStaffMemberAtBranch,
} from '@rgss/db/queries'
import { badRequest, conflict, ERROR_CODES, forbidden, notFound } from '@rgss/errors'
import { staffProfileUpdateSchema } from '@rgss/types'
import { audit } from '@/lib/api/audit'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

type Params = { params: Promise<{ id: string }> }

// GET /api/staff/[id] — one staff member of the active branch.
export const GET = withErrorHandler(async (_req: Request, { params }: Params) => {
  const ctx = await requireBranchRole('manager')
  const { id } = await params

  const staff = await getStaffMemberAtBranch(id, ctx.branch.id)
  if (!staff) {
    throw notFound('Staff member not found.')
  }
  const upcomingAssignments = await countUpcomingAssignments(id, ctx.branch.id)
  return apiSuccess({ staff: { ...staff, upcomingAssignments } })
})

// PATCH /api/staff/[id] — edit a staff member of the active branch.
export const PATCH = withErrorHandler(async (req: Request, { params }: Params) => {
  const ctx = await requireBranchRole('manager')
  const { id } = await params

  const body = await req.json().catch(() => null)
  const parsed = staffProfileUpdateSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }
  const { branchId, ...patch } = parsed.data
  assertRenderedBranch(ctx, branchId)

  const existing = await getStaffMemberAtBranch(id, ctx.branch.id)
  if (!existing) {
    throw notFound('Staff member not found.')
  }
  const roles = editableStaffRoles(ctx.branch.role)
  if (
    existing.roleWitness === null ||
    !(roles as readonly string[]).includes(existing.roleWitness)
  ) {
    throw forbidden('Managers edit Stylists and Therapists only.')
  }
  if (patch.designation !== undefined && existing.roleWitness !== 'staff') {
    throw badRequest('Only a Stylist or Therapist changes title. The others follow their role.')
  }

  const updated = await updateStaffMemberAtBranch({ id, branchId: ctx.branch.id, roles, patch })
  if (!updated) {
    throw conflict(
      ERROR_CODES.CONFLICT,
      'This staff member changed while you were editing. Reload and try again.',
    )
  }

  await audit(req, ctx.session, {
    action: 'update',
    entityType: 'staff_profile',
    entityId: id,
    branchId: ctx.branch.id,
    oldValues: {
      designation: existing.designation,
      phone: existing.phone,
      bio: existing.bio,
      specialization: existing.specialization,
      hireDate: existing.hireDate,
    },
    newValues: patch,
  })
  return apiSuccess({ staff: updated })
})
