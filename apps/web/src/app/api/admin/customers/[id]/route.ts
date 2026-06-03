/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|PATCH /api/admin/customers/[id]
 * Scope        : API — Admin CRM
 *
 * Description  : Admin single customer profile. GET returns full profile with
 *                KPIs; PATCH allows manager+ to override no-show gates.
 *
 * Responsibilities :
 * - Return full customer profile with KPIs, tags, gems (GET)
 * - Allow manager+ to override no-show count and approval flag (PATCH)
 * - Validate and persist profile gate overrides
 *
 * Features / Functionality :
 * - Comprehensive customer profile view (GET, receptionist+)
 * - No-show count reset (PATCH, manager+)
 * - Booking approval requirement toggle (PATCH, manager+)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, zod
 *
 * Notes        :
 * - GET requires min role: receptionist; PATCH requires min role: manager.
 * - PATCH with empty body is a no-op returning current profile.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getCustomerProfile, updateCustomerProfile } from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { z } from 'zod'

// GET /api/admin/customers/[id] — single customer profile (KPIs, tags, gems,
// contact details). Receptionist+.
export const GET = withErrorHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole('receptionist')
    const { id } = await ctx.params

    const profile = await getCustomerProfile(id)
    if (!profile) {
      throw notFound('Customer not found.')
    }

    return apiSuccess({ customer: profile })
  },
)

// Owner/manager overrides on a customer profile. Both fields optional; an empty
// body is a no-op that returns the current profile.
const updateCustomerProfileSchema = z.object({
  noshowCount: z.number().int().min(0).optional(),
  bookingRequiresApproval: z.boolean().optional(),
})

// PATCH /api/admin/customers/[id] — manager+ override of profile gates (e.g.
// reset the no-show count or toggle the booking-approval requirement).
export const PATCH = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole('manager')
    const { id } = await ctx.params

    const body = await req.json().catch(() => null)
    const parsed = updateCustomerProfileSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }

    const updated = await updateCustomerProfile(id, parsed.data)
    if (!updated) {
      throw notFound('Customer not found.')
    }

    return apiSuccess({ customer: updated })
  },
)
