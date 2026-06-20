/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/bookings
 * Scope        : API — Admin Booking
 *
 * Description  : Admin endpoint for listing all bookings with optional filters
 *                (status, service type, date). Receptionist+ access.
 *
 * Responsibilities :
 * - Enforce receptionist+ RBAC access
 * - Parse optional filter query parameters
 * - Return filtered booking list for admin dashboard
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
 * - Requires min role: receptionist.
 * - Used by the admin bookings list page and dashboard widgets.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getAllBookings } from '@rgss/db/queries'

export const GET = withErrorHandler(async (req: Request) => {
  await requireRole('receptionist')

  const { searchParams } = new URL(req.url)
  const filters: { status?: string; serviceType?: string; date?: string } = {}
  const status = searchParams.get('status')
  const serviceType = searchParams.get('serviceType')
  const date = searchParams.get('date')
  if (status) {
    filters.status = status
  }
  if (serviceType) {
    filters.serviceType = serviceType
  }
  if (date) {
    filters.date = date
  }

  const bookings = await getAllBookings(filters)
  return apiSuccess({ bookings })
})
