/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 28-10-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : GET /api/staff/all
 * Scope        : API — Staff at the active branch (multi-branch R1.5, R1.11)
 *
 * Description  : The people who work at the active branch (its Manager,
 *                Receptionist, Stylists and Therapists), each with their
 *                assigned-service count and what the signed-in person may do
 *                with them. The data behind the Staff page.
 *
 * Features / Functionality :
 * - GET → { branch, staff: [{ ...profile, serviceCount, canEdit, canRemove }] }
 * - canEdit: Managers edit Stylists and Therapists; the Owner and Developer
 *   edit everyone here
 * - canRemove: Stylists and Therapists (the Receptionist and Manager are
 *   removed in Users & Roles)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Notes        : Manager of the branch, its Owner, or the Developer. Distinct
 *                from GET /api/staff (lean picker, Receptionist+).
 ************************************************************/

import { editableStaffRoles } from '@rgss/business'
import { getBranchStaff } from '@rgss/db/queries'
import { requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

export const GET = withErrorHandler(async () => {
  const ctx = await requireBranchRole('manager')

  const editable: readonly string[] = editableStaffRoles(ctx.branch.role)
  const rows = await getBranchStaff(ctx.branch.id)
  return apiSuccess({
    branch: { id: ctx.branch.id, name: ctx.branch.name, code: ctx.branch.code },
    staff: rows.map((row) => ({
      ...row,
      canEdit: row.roleWitness !== null && editable.includes(row.roleWitness),
      canRemove: row.roleWitness === 'staff' && editable.includes('staff'),
    })),
  })
})
