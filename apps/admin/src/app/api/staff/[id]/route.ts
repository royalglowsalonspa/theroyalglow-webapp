/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : GET|PATCH /api/staff/[id]
 * Scope        : API — Admin Staff management
 *
 * Description  : GET returns one staff member (profile + user identity +
 *                assigned serviceIds). PATCH updates the editable staff_profile
 *                fields. Both Manager+.
 *
 * Responsibilities :
 * - GET: fetch a staff profile by id (404 if missing)
 * - PATCH: Zod-validate + patch the profile (404 if missing)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        : Staff are deactivated (isActive=false), never hard-deleted, so
 *                historical bookings/invoices keep their staff snapshots intact.
 ************************************************************/

import { audit } from '@/lib/api/audit'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getStaffProfileById, updateStaffProfile } from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { staffProfileUpdateSchema } from '@rgss/types'

// GET /api/staff/[id] — one staff member with assigned serviceIds. Manager+.
export const GET = withErrorHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole('manager')
    const { id } = await ctx.params

    const staff = await getStaffProfileById(id)
    if (!staff) {
      throw notFound('Staff member not found.')
    }

    return apiSuccess({ staff })
  },
)

// PATCH /api/staff/[id] — update editable profile fields. Manager+.
export const PATCH = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole('manager')
    const { id } = await ctx.params

    const body = await req.json().catch(() => null)
    const parsed = staffProfileUpdateSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }

    const existing = await getStaffProfileById(id)
    if (!existing) {
      throw notFound('Staff member not found.')
    }

    const updated = await updateStaffProfile(id, parsed.data)
    await audit(req, session, {
      action: 'update',
      entityType: 'staff_profile',
      entityId: id,
      newValues: parsed.data,
    })
    return apiSuccess({ staff: updated })
  },
)
