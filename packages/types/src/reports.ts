/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : reports (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schemas + view-model types for the admin Reports analytics
 *                module. Validates the date-range query and resolves it to a
 *                concrete [from, to] IST calendar range.
 *
 * Responsibilities :
 * - Validate the reports query (from / to ISO dates, or a named range)
 * - Resolve a query into a concrete { from, to } IST date range
 * - Define view-model types for each report panel (summary, trend, status, top)
 *
 * Features / Functionality :
 * - reportsQuerySchema — from?, to?, range? ('7d' | '30d' | '90d' | 'mtd')
 * - resolveReportRange — defaults to the last 30 days (IST)
 * - IST date helpers (istTodayISO, addDaysISO) shared with the query layer
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        : Dates are IST (UTC+5:30) calendar dates as 'YYYY-MM-DD'. Money
 *                is paise (integer) everywhere; formatting happens at display.
 ************************************************************/
import { z } from 'zod'

// Named relative ranges supported by the Reports dashboard selector.
export const REPORT_RANGES = ['7d', '30d', '90d', 'mtd'] as const
export type ReportRange = (typeof REPORT_RANGES)[number]

export const DEFAULT_REPORT_RANGE: ReportRange = '30d'

// Reports query. Either supply an explicit `from`+`to` (both required together)
// or a named `range`. When nothing is supplied we default to the last 30 days.
// `from`/`to` are validated as 'YYYY-MM-DD' calendar dates.
export const reportsQuerySchema = z
  .object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    range: z.enum(REPORT_RANGES).optional(),
  })
  .refine((d) => (d.from === undefined) === (d.to === undefined), {
    message: 'from and to must be provided together',
    path: ['from'],
  })
  .refine((d) => d.from === undefined || d.to === undefined || d.from <= d.to, {
    message: 'from must be on or before to',
    path: ['to'],
  })
export type ReportsQuery = z.infer<typeof reportsQuerySchema>

// A concrete, inclusive IST calendar date range backing every report query.
export interface ResolvedReportRange {
  from: string
  to: string
}

// Today's date in IST as 'YYYY-MM-DD'. en-CA yields ISO ordering.
export function istTodayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
}

// Add (or subtract) whole days to a 'YYYY-MM-DD' date, returning 'YYYY-MM-DD'.
// Uses UTC math at the date boundary; India observes no DST so this is exact.
export function addDaysISO(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

// Resolve a validated query into a concrete inclusive IST range. Explicit
// from+to win; otherwise the named range resolves relative to IST today; the
// fallback is the last 30 days.
export function resolveReportRange(query: ReportsQuery): ResolvedReportRange {
  if (query.from !== undefined && query.to !== undefined) {
    return { from: query.from, to: query.to }
  }

  const today = istTodayISO()
  const range = query.range ?? DEFAULT_REPORT_RANGE

  switch (range) {
    case '7d':
      return { from: addDaysISO(today, -6), to: today }
    case '90d':
      return { from: addDaysISO(today, -89), to: today }
    case 'mtd':
      return { from: `${today.slice(0, 7)}-01`, to: today }
    default:
      return { from: addDaysISO(today, -29), to: today }
  }
}

// ── View-model types (one per panel) ────────────────────────────────────────

// KPI block for the resolved range plus today + month-to-date paid revenue.
export interface RevenueSummary {
  rangeRevenuePaise: number
  invoiceCount: number
  bookingCount: number
  avgTicketPaise: number
  todayRevenuePaise: number
  mtdRevenuePaise: number
}

// One point on the revenue trend line (zero-filled across the range).
export interface RevenueTrendPoint {
  date: string
  revenuePaise: number
}

// Booking count grouped by lifecycle status.
export interface BookingsByStatusPoint {
  status: string
  count: number
}

// A single row in the Top Services table.
export interface TopServiceRow {
  name: string
  bookings: number
  revenuePaise: number
}

// The combined Reports API payload returned in one response.
export interface ReportsResponse {
  range: ResolvedReportRange
  summary: RevenueSummary
  revenueTrend: RevenueTrendPoint[]
  bookingsByStatus: BookingsByStatusPoint[]
  topServices: TopServiceRow[]
}
