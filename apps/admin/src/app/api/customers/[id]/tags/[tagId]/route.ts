/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : DELETE /api/customers/[id]/tags/[tagId]
 * Scope        : API — Admin CRM
 *
 * Description  : Removes a tag assignment from a customer. Idempotent — removing
 *                an already-absent tag is a no-op (no error).
 *
 * Responsibilities :
 * - Remove the tag-to-customer assignment
 * - Handle non-existent assignments gracefully
 * - Enforce RBAC (receptionist+)
 *
 * Features / Functionality :
 * - Tag unassignment from customer
 * - Idempotent deletion (no error if already removed)
 * - Receptionist+ access control
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries
 *
 * Notes        :
 * - Requires min role: receptionist.
 * - Does not delete the tag itself, only the customer↔tag assignment.
 ************************************************************/

import { removeTag } from '@rgss/db/queries'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'

// DELETE /api/customers/[id]/tags/[tagId] — remove a tag assignment from
// a customer. Receptionist+. No-op if the assignment does not exist.
export const DELETE = withErrorHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string; tagId: string }> }) => {
    await requireRole('receptionist')
    const { id, tagId } = await ctx.params

    await removeTag(id, tagId)

    return apiSuccess({ ok: true })
  },
)
