/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/customers/[id]/notes
 * Scope        : API — Admin CRM
 *
 * Description  : Adds a free-text note to a customer record, optionally linked
 *                to one of the active branch's bookings. The writer chooses
 *                whether every Royal Glow branch may read it or only theirs.
 *
 * Responsibilities :
 * - Validate note content, visibility and optional booking link
 * - Persist note with author (session user) and branch attribution
 * - Return created note data
 *
 * Features / Functionality :
 * - Shared or branch-private notes (multi-branch R3.1)
 * - Optional booking association, at the active branch only
 * - Author tracking (who wrote the note)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/branch-context, @/lib/api/error-handler,
 *                @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Requires min role at the active branch: receptionist. The body names the
 *   branch the page was rendered for (R2.4).
 * - Notes are append-only; no edit or delete in current phase.
 ************************************************************/

import { addCustomerNote, getCustomerProfile, isCustomerBookingAtBranch } from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { addCustomerNoteSchema } from '@rgss/types'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

// POST /api/customers/[id]/notes — add a note to a customer. Receptionist+.
export const POST = withErrorHandler(
  async (req: Request, route: { params: Promise<{ id: string }> }) => {
    const ctx = await requireBranchRole('receptionist')
    const { id } = await route.params

    const body = await req.json().catch(() => null)
    const parsed = addCustomerNoteSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }
    assertRenderedBranch(ctx, parsed.data.branchId)
    const { content, visibility, bookingId } = parsed.data

    if (!(await getCustomerProfile(id))) {
      throw notFound('Customer not found.')
    }
    // A note may point only at this customer's booking at this branch.
    if (bookingId && !(await isCustomerBookingAtBranch(bookingId, id, ctx.branch.id))) {
      throw notFound('Booking not found.')
    }

    const note = await addCustomerNote({
      customerId: id,
      authorId: ctx.session.user.id,
      branchId: ctx.branch.id,
      content,
      visibility,
      bookingId,
    })

    return apiSuccess(
      {
        note: {
          id: note.id,
          content: note.content,
          visibility: note.visibility,
          branchName: ctx.branch.name,
          createdAt: note.createdAt.toISOString(),
        },
      },
      undefined,
      201,
    )
  },
)
