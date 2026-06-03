/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : report
 * Scope        : Business Logic — Background Jobs
 *
 * Description  : Plain-text report formatting for daily and weekly
 *                sales summary jobs (jobs 13 & 14).
 *
 * Responsibilities :
 * - Format daily sales report body with services, revenue, bookings
 * - Format weekly report with week-over-week delta
 * - Compute percentage change for comparison
 *
 * Features / Functionality :
 * - formatDailyReport(data) → plain-text daily summary
 * - formatWeeklyReport(data, previous) → weekly + WoW comparison
 * - weekOverWeekDelta(current, previous) → { deltaPaise, pct }
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : ../utils/currency, ../utils/date
 *
 * Notes        :
 * - All figures arrive as integer paise
 * - Output is deterministic for a given input (sorted, stable)
 ************************************************************/
import { formatINR } from '../utils/currency'
import { formatDateIN } from '../utils/date'

// Plain-text report bodies for the daily/weekly sales jobs (jobs 13 & 14).
// Mirrors the Job 13 format in background-jobs.md. Pure formatting only — all
// figures arrive as integer paise and are rendered with formatINR at this
// boundary. The query layer supplies the aggregates.

export type ReportService = {
  name: string
  qty: number
  revenuePaise: number
}

export type RevenueSplit = {
  salonPaise: number
  spaPaise: number
  membershipPaise: number
  totalPaise: number
}

export type BookingCounts = {
  completed: number
  noShows: number
  cancelled: number
  walkIns: number
}

export type CustomerCounts = {
  newCount: number
  returning: number
}

export type DailyReportData = {
  date: Date
  services: ReportService[]
  revenue: RevenueSplit
  bookings: BookingCounts
  customers: CustomerCounts
  membershipSessions: number
}

export type WeeklyReportData = DailyReportData & {
  periodStart: Date
  periodEnd: Date
}

const DIVIDER = '─────────────────────────────────────'
const LABEL_WIDTH = 22

const WEEKDAY = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  timeZone: 'Asia/Kolkata',
})

function labelLine(label: string, value: string): string {
  return `   ${label.padEnd(LABEL_WIDTH)}${value}`
}

// Services breakdown, sorted by revenue descending (highest first). Ties keep a
// stable order so the output is deterministic for a given input.
function formatServices(services: ReportService[]): string {
  if (services.length === 0) {
    return '🛎️ Services Performed\n   (none)'
  }

  const sorted = [...services].sort((a, b) => b.revenuePaise - a.revenuePaise)
  const lines = sorted.map((s) => labelLine(`${s.qty}x ${s.name}`, formatINR(s.revenuePaise)))
  return ['🛎️ Services Performed', ...lines].join('\n')
}

function formatRevenue(revenue: RevenueSplit): string {
  return [
    '💰 Revenue',
    labelLine('Salon services:', formatINR(revenue.salonPaise)),
    labelLine('SPA services:', formatINR(revenue.spaPaise)),
    labelLine('Membership purchases:', formatINR(revenue.membershipPaise)),
    labelLine('Total collected:', formatINR(revenue.totalPaise)),
  ].join('\n')
}

function formatBookings(bookings: BookingCounts): string {
  return [
    '📅 Bookings',
    labelLine('Completed:', String(bookings.completed)),
    labelLine('No-shows:', String(bookings.noShows)),
    labelLine('Cancelled:', String(bookings.cancelled)),
    labelLine('Walk-ins:', String(bookings.walkIns)),
  ].join('\n')
}

function formatCustomers(customers: CustomerCounts): string {
  return [
    '👥 Customers',
    labelLine('New today:', String(customers.newCount)),
    labelLine('Returning:', String(customers.returning)),
  ].join('\n')
}

function formatBody(data: DailyReportData): string {
  return [
    formatServices(data.services),
    '',
    formatRevenue(data.revenue),
    '',
    formatBookings(data.bookings),
    '',
    formatCustomers(data.customers),
    '',
    `💳 SPA Membership sessions: ${data.membershipSessions}`,
  ].join('\n')
}

// Daily sales report body (job 13).
export function formatDailyReport(data: DailyReportData): string {
  const header = [
    '📊 Royal Glow — Daily Sales Report',
    `Date: ${formatDateIN(data.date)} (${WEEKDAY.format(data.date)})`,
    DIVIDER,
    '',
  ].join('\n')
  return header + formatBody(data)
}

// Week-over-week delta on a paise figure. `pct` is the percentage change of
// `current` against `previous`, rounded to one decimal place. When the previous
// period is zero, pct is 0 if current is also zero, otherwise 100 (treated as a
// full increase from a zero baseline).
export function weekOverWeekDelta(
  current: number,
  previous: number,
): { deltaPaise: number; pct: number } {
  const deltaPaise = current - previous
  let pct: number
  if (previous === 0) {
    pct = current === 0 ? 0 : 100
  } else {
    pct = (deltaPaise / previous) * 100
  }
  return { deltaPaise, pct: Math.round(pct * 10) / 10 }
}

function formatSigned(paise: number): string {
  const sign = paise >= 0 ? '+' : '-'
  return `${sign}${formatINR(Math.abs(paise))}`
}

// Weekly report body (job 14): the daily format over a 7-day period plus a
// week-over-week comparison line against the previous week's totals.
export function formatWeeklyReport(data: WeeklyReportData, previous: WeeklyReportData): string {
  const header = [
    '📊 Royal Glow — Weekly Sales Report',
    `Week: ${formatDateIN(data.periodStart)} – ${formatDateIN(data.periodEnd)}`,
    DIVIDER,
    '',
  ].join('\n')

  const { deltaPaise, pct } = weekOverWeekDelta(
    data.revenue.totalPaise,
    previous.revenue.totalPaise,
  )
  const sign = pct >= 0 ? '+' : ''
  const wow = ['', DIVIDER, `📈 Week-over-week: ${formatSigned(deltaPaise)} (${sign}${pct}%)`].join(
    '\n',
  )

  return header + formatBody(data) + wow
}
