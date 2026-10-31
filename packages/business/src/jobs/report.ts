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

/** One branch's figures for a period, without the period itself. */
export type ReportFigures = Omit<DailyReportData, 'date'>

/** The figures of a branch with no activity in the period. */
export function emptyReportFigures(): ReportFigures {
  return {
    services: [],
    revenue: { salonPaise: 0, spaPaise: 0, membershipPaise: 0, totalPaise: 0 },
    bookings: { completed: 0, noShows: 0, cancelled: 0, walkIns: 0 },
    customers: { newCount: 0, returning: 0 },
    membershipSessions: 0,
  }
}

/** One branch's line in the summary across branches. */
export type BranchSummaryLine = {
  branchName: string
  figures: ReportFigures
  /** The previous period's figures, for the weekly comparison. */
  previous?: ReportFigures
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

function formatBody(data: ReportFigures): string {
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

// "Royal Glow Rayasandra" for one branch's report, "Royal Glow" otherwise.
function reportPlace(branchName: string | undefined): string {
  return branchName ? `Royal Glow ${branchName}` : 'Royal Glow'
}

function dayLine(date: Date): string {
  return `Date: ${formatDateIN(date)} (${WEEKDAY.format(date)})`
}

// Daily sales report body (job 13), for one branch when `branchName` is given.
export function formatDailyReport(data: DailyReportData, branchName?: string): string {
  const header = [
    `📊 ${reportPlace(branchName)} — Daily Sales Report`,
    dayLine(data.date),
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

function weekLine(periodStart: Date, periodEnd: Date): string {
  return `Week: ${formatDateIN(periodStart)} – ${formatDateIN(periodEnd)}`
}

// "+₹1,000.00 (+5%)" against the previous period's total.
function formatComparison(currentPaise: number, previousPaise: number): string {
  const { deltaPaise, pct } = weekOverWeekDelta(currentPaise, previousPaise)
  const sign = pct >= 0 ? '+' : ''
  return `${formatSigned(deltaPaise)} (${sign}${pct}%)`
}

// Weekly report body (job 14): the daily format over a 7-day period plus a
// week-over-week comparison line against the previous week's totals. For one
// branch when `branchName` is given; `previous` is then that branch's week.
export function formatWeeklyReport(
  data: WeeklyReportData,
  previous: ReportFigures,
  branchName?: string,
): string {
  const header = [
    `📊 ${reportPlace(branchName)} — Weekly Sales Report`,
    weekLine(data.periodStart, data.periodEnd),
    DIVIDER,
    '',
  ].join('\n')

  const comparison = formatComparison(data.revenue.totalPaise, previous.revenue.totalPaise)
  const wow = ['', DIVIDER, `📈 Week-over-week: ${comparison}`].join('\n')

  return header + formatBody(data) + wow
}

// The email subject for one person's reports: one branch, or several.
export function reportSubject(kind: 'Daily' | 'Weekly', branchNames: readonly string[]): string {
  const [only] = branchNames
  if (branchNames.length === 1 && only) {
    return `${reportPlace(only)} — ${kind} Sales Report`
  }
  return `Royal Glow — ${kind} Sales Reports: ${branchNames.join(', ')}`
}

// ── Summary across branches (the Developer only, R7.4) ──────────────────────

function sumFigures(lines: readonly ReportFigures[]): ReportFigures {
  const total = emptyReportFigures()
  for (const f of lines) {
    total.revenue.salonPaise += f.revenue.salonPaise
    total.revenue.spaPaise += f.revenue.spaPaise
    total.revenue.membershipPaise += f.revenue.membershipPaise
    total.revenue.totalPaise += f.revenue.totalPaise
    total.bookings.completed += f.bookings.completed
    total.bookings.noShows += f.bookings.noShows
    total.bookings.cancelled += f.bookings.cancelled
    total.bookings.walkIns += f.bookings.walkIns
    total.customers.newCount += f.customers.newCount
    total.customers.returning += f.customers.returning
    total.membershipSessions += f.membershipSessions
  }
  return total
}

function summaryBlock(title: string, figures: ReportFigures, previous?: ReportFigures): string {
  const lines = [
    title,
    labelLine('Total collected:', formatINR(figures.revenue.totalPaise)),
    labelLine('Completed:', String(figures.bookings.completed)),
    labelLine('No-shows:', String(figures.bookings.noShows)),
    labelLine('Cancelled:', String(figures.bookings.cancelled)),
    labelLine('New customers:', String(figures.customers.newCount)),
  ]
  if (previous) {
    lines.push(
      labelLine(
        'Week-over-week:',
        formatComparison(figures.revenue.totalPaise, previous.revenue.totalPaise),
      ),
    )
  }
  return lines.join('\n')
}

function formatSummaryBody(lines: readonly BranchSummaryLine[], weekly: boolean): string {
  if (lines.length === 0) {
    return '(no branches to report)'
  }
  const blocks = lines.map((line) =>
    summaryBlock(line.branchName, line.figures, weekly ? line.previous : undefined),
  )
  const total = sumFigures(lines.map((l) => l.figures))
  const previousTotal = weekly
    ? sumFigures(lines.map((l) => l.previous ?? emptyReportFigures()))
    : undefined
  return [...blocks, DIVIDER, summaryBlock('All branches', total, previousTotal)].join('\n\n')
}

// The day across every branch, one block per branch plus the total.
export function formatDailySummary(date: Date, lines: readonly BranchSummaryLine[]): string {
  const header = ['📊 Royal Glow — Daily Summary, All Branches', dayLine(date), DIVIDER, ''].join(
    '\n',
  )
  return header + formatSummaryBody(lines, false)
}

// The week across every branch, with each branch's week-over-week change.
export function formatWeeklySummary(
  periodStart: Date,
  periodEnd: Date,
  lines: readonly BranchSummaryLine[],
): string {
  const header = [
    '📊 Royal Glow — Weekly Summary, All Branches',
    weekLine(periodStart, periodEnd),
    DIVIDER,
    '',
  ].join('\n')
  return header + formatSummaryBody(lines, true)
}
