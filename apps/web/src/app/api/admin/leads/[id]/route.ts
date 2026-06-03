/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|PATCH /api/admin/leads/[id]
 * Scope        : API — Admin Leads
 *
 * Description  : Admin lead detail and status update. GET returns lead with
 *                notes; PATCH transitions lead through the pipeline.
 *
 * Responsibilities :
 * - Return full lead detail with associated notes (GET)
 * - Validate and execute lead status transitions (PATCH)
 * - Enforce lead state machine rules
 *
 * Features / Functionality :
 * - Lead detail with notes history
 * - Status transition with business rule validation
 * - Auto-stamp lastContactedAt on "contacted" transition
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/business,
 *                @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Requires min role: receptionist.
 * - Lead status transitions enforced by assertLeadTransition business rule.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { assertLeadTransition } from '@rgss/business'
import { getLeadById, getLeadNotes, updateLead } from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { updateLeadStatusSchema } from '@rgss/types'

export const GET = withErrorHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole('receptionist')
    const { id } = await ctx.params

    const lead = await getLeadById(id)
    if (!lead) {
      throw notFound('Lead not found.')
    }

    const notes = await getLeadNotes(id)

    return apiSuccess({ lead, notes })
  },
)

export const PATCH = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole('receptionist')
    const { id } = await ctx.params

    const body = await req.json().catch(() => null)
    const parsed = updateLeadStatusSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }

    const existing = await getLeadById(id)
    if (!existing) {
      throw notFound('Lead not found.')
    }

    assertLeadTransition(existing.status, parsed.data.status, parsed.data.reason)

    const patch: { status: typeof parsed.data.status; lastContactedAt?: Date } = {
      status: parsed.data.status,
    }
    if (parsed.data.status === 'contacted') {
      patch.lastContactedAt = new Date()
    }

    const updated = await updateLead(id, patch)

    return apiSuccess({ lead: updated })
  },
)
