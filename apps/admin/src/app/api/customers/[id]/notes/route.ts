/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/customers/[id]/notes
 * Scope        : API — Admin CRM
 *
 * Description  : Adds a free-text note to a customer record, optionally linked
 *                to a booking. Persists author and timestamp.
 *
 * Responsibilities :
 * - Validate note content and optional booking link
 * - Persist note with author (session user) attribution
 * - Return created note data
 *
 * Features / Functionality :
 * - Free-text customer note creation
 * - Optional booking association
 * - Author tracking (who wrote the note)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Requires min role: receptionist.
 * - Notes are append-only; no edit or delete in current phase.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { addCustomerNote } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { addCustomerNoteSchema } from '@rgss/types'

// POST /api/customers/[id]/notes — add a free-text note to a customer,
// optionally linked to a booking. Receptionist+. Persists author + timestamp.
export const POST = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole('receptionist')
    const { id } = await ctx.params

    const body = await req.json().catch(() => null)
    const parsed = addCustomerNoteSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }

    const note = await addCustomerNote(
      id,
      session.user.id,
      parsed.data.content,
      parsed.data.bookingId,
    )

    return apiSuccess({ note }, undefined, 201)
  },
)
