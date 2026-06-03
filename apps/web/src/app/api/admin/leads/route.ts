/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|POST /api/admin/leads
 * Scope        : API — Admin Leads
 *
 * Description  : Admin lead pipeline endpoint. GET returns all leads with stale
 *                indicators; POST creates a manual lead (receptionist entry).
 *
 * Responsibilities :
 * - Return lead pipeline with staleness and days-since metrics (GET)
 * - Create manual leads with phone normalisation (POST)
 * - Support status filtering for pipeline views
 *
 * Features / Functionality :
 * - Lead list with computed staleness and age
 * - Optional status filter for kanban views
 * - Manual lead creation by receptionist (source: manual)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/business,
 *                @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Requires min role: receptionist.
 * - Staleness is computed from business rules (not stored).
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { hoursSince, isLeadStale, normaliseIndianPhone } from '@rgss/business'
import { createLead, getLeadsForPipeline } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { manualLeadSchema } from '@rgss/types'

const HOURS_PER_DAY = 24

export const GET = withErrorHandler(async (req: Request) => {
  await requireRole('receptionist')

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const rows = await getLeadsForPipeline(status ? { status } : {})

  const leads = rows.map((row) => ({
    ...row,
    daysSinceCapture: Math.floor(hoursSince(row.createdAt) / HOURS_PER_DAY),
    isStale: isLeadStale(row.status, row.createdAt),
  }))

  return apiSuccess({ leads })
})

export const POST = withErrorHandler(async (req: Request) => {
  await requireRole('receptionist')

  const body = await req.json().catch(() => null)
  const parsed = manualLeadSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid lead data', parsed.error.flatten().fieldErrors)
  }

  const phone = normaliseIndianPhone(parsed.data.phone)
  const lead = await createLead({ ...parsed.data, phone, source: 'manual' })

  return apiSuccess({ leadId: lead.id }, undefined, 201)
})
