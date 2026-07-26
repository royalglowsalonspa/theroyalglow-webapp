/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/leads/[id]/notes
 * Scope        : API — Admin Leads
 *
 * Description  : Adds a free-text note to a lead record. Persists author
 *                attribution and timestamp for CRM audit trail.
 *
 * Responsibilities :
 * - Validate note content
 * - Persist note with author (session user) attribution
 * - Return created note data
 *
 * Features / Functionality :
 * - Free-text lead note creation
 * - Author tracking (receptionist who wrote the note)
 * - Append-only notes history
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

import { addLeadNote } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { addLeadNoteSchema } from '@rgss/types'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'

export const POST = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole('receptionist')
    const { id } = await ctx.params

    const body = await req.json().catch(() => null)
    const parsed = addLeadNoteSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid note data', parsed.error.flatten().fieldErrors)
    }

    const note = await addLeadNote(id, session.user.id, parsed.data.content)

    return apiSuccess({ note }, undefined, 201)
  },
)
