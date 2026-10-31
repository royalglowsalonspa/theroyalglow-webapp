/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/bookings
 * Scope        : API — Admin Booking
 *
 * Description  : Admin endpoint listing the active branch's bookings with
 *                optional filters (status, service type, date). Receptionist
 *                or above at that branch.
 *
 * Responsibilities :
 * - Authorize at the active branch (fresh role and branch access)
 * - Parse optional filter query parameters
 * - Return the branch's filtered booking list for the bookings page and
 *   dashboard
 *
 * Features / Functionality :
 * - Status filter (pending, confirmed, completed, etc.)
 * - Service type filter (salon/spa)
 * - Date filter for specific day view
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries
 *
 * Notes        :
 * - Requires min role at the active branch: receptionist.
 * - Used by the admin bookings list page and dashboard widgets.
 * - Each booking_service row carries its assigned staff member's name.
 ************************************************************/

import { listBookings } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { adminBookingListQuerySchema } from '@rgss/types'
import { requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

export const GET = withErrorHandler(async (req: Request) => {
  const ctx = await requireBranchRole('receptionist')

  const { searchParams } = new URL(req.url)
  const parsed = adminBookingListQuerySchema.safeParse({
    status: searchParams.get('status') ?? undefined,
    serviceType: searchParams.get('serviceType') ?? undefined,
    date: searchParams.get('date') ?? undefined,
  })
  if (!parsed.success) {
    throw badRequest('Invalid filter parameters', parsed.error.flatten().fieldErrors)
  }

  // Build the filter object with only the supplied keys so an absent filter
  // widens the result (exactOptionalPropertyTypes forbids explicit undefined).
  const filters: { status?: string; serviceType?: string; date?: string } = {}
  if (parsed.data.status) {
    filters.status = parsed.data.status
  }
  if (parsed.data.serviceType) {
    filters.serviceType = parsed.data.serviceType
  }
  if (parsed.data.date) {
    filters.date = parsed.data.date
  }

  const bookings = await listBookings(ctx.branch.id, filters)
  return apiSuccess({ branchId: ctx.branch.id, bookings })
})
