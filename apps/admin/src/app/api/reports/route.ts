/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/reports
 * Scope        : API — Admin Reports / Analytics
 *
 * Description  : Single-response analytics endpoint for the admin Reports
 *                dashboard. Resolves a date range (named or explicit) and
 *                returns revenue KPIs, the daily revenue trend, bookings by
 *                status, and the top services — all aggregated in SQL.
 *
 * Responsibilities :
 * - Validate the range query (from/to ISO dates or a named range)
 * - Resolve to a concrete [from, to] IST range and fan out the four queries
 * - Return the combined payload in one standard envelope
 *
 * Features / Functionality :
 * - Accepts ?range=7d|30d|90d|mtd or ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * - 400 on invalid / mismatched dates; defaults to the last 30 days
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        : Requires min role: manager. Read-only.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import {
  getBookingsByStatus,
  getRevenueSummary,
  getRevenueTrend,
  getTopServices,
} from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { reportsQuerySchema, resolveReportRange } from '@rgss/types'

// GET /api/reports — combined analytics payload for the admin dashboard.
// Manager+. Returns { range, summary, revenueTrend, bookingsByStatus, topServices }.
export const GET = withErrorHandler(async (req: Request) => {
  await requireRole('manager')

  const params = Object.fromEntries(new URL(req.url).searchParams)
  const parsed = reportsQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw badRequest('Invalid report range', parsed.error.flatten().fieldErrors)
  }

  const range = resolveReportRange(parsed.data)

  const [summary, revenueTrend, bookingsByStatus, topServices] = await Promise.all([
    getRevenueSummary(range),
    getRevenueTrend(range),
    getBookingsByStatus(range),
    getTopServices(range),
  ])

  return apiSuccess({ range, summary, revenueTrend, bookingsByStatus, topServices })
})
