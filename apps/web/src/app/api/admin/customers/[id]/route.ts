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
