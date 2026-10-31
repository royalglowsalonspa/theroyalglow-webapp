/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/reports
 * Scope        : API — Admin Reports / Analytics
 *
 * Description  : Single-response analytics endpoint for the admin Reports
 *                dashboard. Resolves a date range (named or explicit) and
 *                returns revenue KPIs, the daily revenue trend, bookings by
 *                status, the top services and the branch's cross-branch
 *                settlement figures — all aggregated in SQL.
 *
 * Responsibilities :
 * - Validate the range query (from/to ISO dates or a named range)
 * - Resolve to a concrete [from, to] IST range and fan out the queries
 * - Return the combined payload in one standard envelope
 *
 * Features / Functionality :
 * - Accepts ?range=7d|30d|90d|mtd or ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * - 400 on invalid / mismatched dates; defaults to the last 30 days
 * - Settlement: membership minutes delivered and used, gems issued and
 *   redeemed, and the amounts to receive and to pay (multi-branch R10)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/branch-context,
 *                @rgss/business, @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        : Requires min role at the active branch: manager. Read-only.
 *                Every figure is the active branch's alone (multi-branch R2.3).
 *                Settlement money is for the branch's Owner and the Developer:
 *                a Manager sees minutes and gems only (settlement.md).
 ************************************************************/

import { settlementReportFor } from '@rgss/business'
import {
  getBookingsByStatus,
  getBranchSettlementReport,
  getRevenueSummary,
  getRevenueTrend,
  getTopServices,
} from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { reportsQuerySchema, resolveReportRange } from '@rgss/types'
import { requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

// GET /api/reports — the active branch's analytics payload for the admin
// dashboard. Manager or above there. Returns { branchId, range, summary,
// revenueTrend, bookingsByStatus, topServices, settlement }.
export const GET = withErrorHandler(async (req: Request) => {
  const ctx = await requireBranchRole('manager')
  const branchId = ctx.branch.id

  const params = Object.fromEntries(new URL(req.url).searchParams)
  const parsed = reportsQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw badRequest('Invalid report range', parsed.error.flatten().fieldErrors)
  }

  const range = resolveReportRange(parsed.data)

  const [summary, revenueTrend, bookingsByStatus, topServices, settlement] = await Promise.all([
    getRevenueSummary(branchId, range),
    getRevenueTrend(branchId, range),
    getBookingsByStatus(branchId, range),
    getTopServices(branchId, range),
    getBranchSettlementReport(branchId, range),
  ])

  return apiSuccess({
    branchId,
    range,
    summary,
    revenueTrend,
    bookingsByStatus,
    topServices,
    settlement: settlementReportFor(settlement, ctx.branch.role),
  })
})
