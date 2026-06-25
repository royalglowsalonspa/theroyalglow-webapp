/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : reports
 * Scope        : Data Access — Reports / Analytics (admin)
 *
 * Description  : SQL-side aggregation queries backing the admin Reports module:
 *                revenue KPIs, daily revenue trend, bookings-by-status, and the
 *                top services by revenue. Every aggregation is performed in
 *                PostgreSQL (SUM / COUNT / GROUP BY / date_trunc) — rows are
 *                never pulled into JS to be aggregated.
 *
 * Responsibilities :
 * - getRevenueSummary  — range KPIs + today + month-to-date paid revenue
 * - getRevenueTrend    — paid revenue per IST day (zero-filled in JS)
 * - getBookingsByStatus — booking counts grouped by status
 * - getTopServices     — top services by paid revenue + line-item count
 *
 * Features / Functionality :
 * - IST (UTC+5:30) calendar-day bucketing via `AT TIME ZONE 'Asia/Kolkata'`
 * - Index-friendly paid-revenue filters (payment_status='paid' + paid_at range)
 * - Parameterised date boundaries — no string concatenation in SQL
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, @rgss/types, ../index, ../schema/booking,
 *                ../schema/invoice
 *
 * Notes        : Money is paise (integer). Uses the partial index
 *                invoice_paid_at_idx (WHERE payment_status='paid').
 ************************************************************/

import type {
  BookingsByStatusPoint,
  ResolvedReportRange,
  RevenueSummary,
  RevenueTrendPoint,
  TopServiceRow,
} from '@rgss/types'
import { addDaysISO, istTodayISO } from '@rgss/types'
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { db } from '../index'
import { booking } from '../schema/booking'
import { invoice, invoiceItem } from '../schema/invoice'

// IST midnight (00:00:00 +05:30) for a 'YYYY-MM-DD' date, as the exact UTC
// instant. Used to build index-friendly `paid_at` range bounds.
function istDayStartUtc(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000+05:30`)
}

// Inclusive IST date range → half-open UTC instant bounds [from, toExclusive).
function paidAtBounds(range: ResolvedReportRange): { fromTs: Date; toExclusiveTs: Date } {
  return {
    fromTs: istDayStartUtc(range.from),
    toExclusiveTs: istDayStartUtc(addDaysISO(range.to, 1)),
  }
}

// KPIs for the range plus today + month-to-date paid revenue. Each figure is a
// single grouped/aggregated SQL query — no rows are materialised in JS.
export async function getRevenueSummary(range: ResolvedReportRange): Promise<RevenueSummary> {
  const { fromTs, toExclusiveTs } = paidAtBounds(range)

  const today = istTodayISO()
  const todayStart = istDayStartUtc(today)
  const tomorrowStart = istDayStartUtc(addDaysISO(today, 1))
  const monthStart = istDayStartUtc(`${today.slice(0, 7)}-01`)

  const [rangeRevenue] = await db
    .select({
      revenue: sql<number>`coalesce(sum(${invoice.totalAmountPaise}), 0)::int`,
      invoiceCount: sql<number>`count(*)::int`,
    })
    .from(invoice)
    .where(
      and(
        eq(invoice.paymentStatus, 'paid'),
        gte(invoice.paidAt, fromTs),
        lt(invoice.paidAt, toExclusiveTs),
      ),
    )

  const [bookingCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(booking)
    .where(
      and(sql`${booking.bookingDate} >= ${range.from}`, sql`${booking.bookingDate} <= ${range.to}`),
    )

  const [todayRevenue] = await db
    .select({ revenue: sql<number>`coalesce(sum(${invoice.totalAmountPaise}), 0)::int` })
    .from(invoice)
    .where(
      and(
        eq(invoice.paymentStatus, 'paid'),
        gte(invoice.paidAt, todayStart),
        lt(invoice.paidAt, tomorrowStart),
      ),
    )

  const [mtdRevenue] = await db
    .select({ revenue: sql<number>`coalesce(sum(${invoice.totalAmountPaise}), 0)::int` })
    .from(invoice)
    .where(
      and(
        eq(invoice.paymentStatus, 'paid'),
        gte(invoice.paidAt, monthStart),
        lt(invoice.paidAt, tomorrowStart),
      ),
    )

  const rangeRevenuePaise = rangeRevenue?.revenue ?? 0
  const invoiceCount = rangeRevenue?.invoiceCount ?? 0
  const bookingCount = bookingCountRow?.count ?? 0

  return {
    rangeRevenuePaise,
    invoiceCount,
    bookingCount,
    avgTicketPaise: invoiceCount > 0 ? Math.round(rangeRevenuePaise / invoiceCount) : 0,
    todayRevenuePaise: todayRevenue?.revenue ?? 0,
    mtdRevenuePaise: mtdRevenue?.revenue ?? 0,
  }
}

// Paid revenue per IST calendar day across the range. Grouping happens in SQL
// (date_trunc on the IST-localised paid_at); gaps are zero-filled in JS AFTER
// the grouped query so the chart shows a continuous series.
export async function getRevenueTrend(range: ResolvedReportRange): Promise<RevenueTrendPoint[]> {
  const { fromTs, toExclusiveTs } = paidAtBounds(range)

  const dayExpr = sql<string>`to_char(date_trunc('day', ${invoice.paidAt} AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD')`

  const rows = await db
    .select({
      day: dayExpr,
      revenue: sql<number>`coalesce(sum(${invoice.totalAmountPaise}), 0)::int`,
    })
    .from(invoice)
    .where(
      and(
        eq(invoice.paymentStatus, 'paid'),
        gte(invoice.paidAt, fromTs),
        lt(invoice.paidAt, toExclusiveTs),
      ),
    )
    .groupBy(dayExpr)
    .orderBy(dayExpr)

  const byDay = new Map<string, number>()
  for (const row of rows) {
    byDay.set(row.day, row.revenue)
  }

  // Zero-fill every day in [from, to] so the series has no gaps.
  const points: RevenueTrendPoint[] = []
  let cursor = range.from
  // Guard against pathological ranges; calendar ranges are small in practice.
  for (let i = 0; i < 4000 && cursor <= range.to; i++) {
    points.push({ date: cursor, revenuePaise: byDay.get(cursor) ?? 0 })
    cursor = addDaysISO(cursor, 1)
  }
  return points
}

// Booking counts grouped by lifecycle status for bookings within the range
// (by booking_date). Aggregation is done in SQL via GROUP BY.
export async function getBookingsByStatus(
  range: ResolvedReportRange,
): Promise<BookingsByStatusPoint[]> {
  const rows = await db
    .select({
      status: sql<string>`${booking.status}`,
      count: sql<number>`count(*)::int`,
    })
    .from(booking)
    .where(
      and(sql`${booking.bookingDate} >= ${range.from}`, sql`${booking.bookingDate} <= ${range.to}`),
    )
    .groupBy(booking.status)
    .orderBy(sql`count(*) desc`)

  return rows.map((row) => ({ status: row.status, count: row.count }))
}

// Top services by paid revenue within the range, joined from invoice_item to
// the parent (paid) invoice and grouped by the service-name snapshot. Revenue
// and counts are summed in SQL; only the top `limit` rows are returned.
export async function getTopServices(
  range: ResolvedReportRange,
  limit = 10,
): Promise<TopServiceRow[]> {
  const { fromTs, toExclusiveTs } = paidAtBounds(range)

  const rows = await db
    .select({
      name: invoiceItem.serviceNameSnapshot,
      bookings: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${invoiceItem.totalPricePaise}), 0)::int`,
    })
    .from(invoiceItem)
    .innerJoin(invoice, eq(invoiceItem.invoiceId, invoice.id))
    .where(
      and(
        eq(invoice.paymentStatus, 'paid'),
        gte(invoice.paidAt, fromTs),
        lt(invoice.paidAt, toExclusiveTs),
      ),
    )
    .groupBy(invoiceItem.serviceNameSnapshot)
    .orderBy(sql`coalesce(sum(${invoiceItem.totalPricePaise}), 0) desc`)
    .limit(limit)

  return rows.map((row) => ({
    name: row.name,
    bookings: row.bookings,
    revenuePaise: row.revenue,
  }))
}
