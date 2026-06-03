/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/admin/customers/[id]/tags
 * Scope        : API — Admin CRM
 *
 * Description  : Assigns an existing tag to a customer. Idempotent — re-assigning
 *                an already-present tag is a no-op (no error).
 *
 * Responsibilities :
 * - Validate tag assignment payload
 * - Assign tag to customer with actor attribution
 * - Handle idempotent re-assignment gracefully
 *
 * Features / Functionality :
 * - Tag assignment with assignee tracking
 * - Idempotent operation (no error on duplicate)
 * - Receptionist+ access control
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Requires min role: receptionist.
 * - Tags must exist before assignment (created via /api/admin/tags).
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { assignTag } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { assignTagSchema } from '@rgss/types'

// POST /api/admin/customers/[id]/tags — assign an existing tag to a customer.
// Receptionist+. Idempotent: re-assigning a present tag is a no-op (no error).
export const POST = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole('receptionist')
    const { id } = await ctx.params

    const body = await req.json().catch(() => null)
    const parsed = assignTagSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }

    await assignTag(id, parsed.data.tagId, session.user.id)

    return apiSuccess({ ok: true }, undefined, 201)
  },
)
