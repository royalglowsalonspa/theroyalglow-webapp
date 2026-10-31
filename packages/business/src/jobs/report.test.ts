import { describe, expect, it } from 'vitest'
import {
  type DailyReportData,
  emptyReportFigures,
  formatDailyReport,
  formatDailySummary,
  formatWeeklyReport,
  formatWeeklySummary,
  type ReportFigures,
  reportSubject,
  weekOverWeekDelta,
} from './report'

const DATE = new Date('2026-10-25T00:00:00.000Z')

function figures(totalPaise: number, completed = 0): ReportFigures {
  const f = emptyReportFigures()
  f.revenue = { salonPaise: totalPaise, spaPaise: 0, membershipPaise: 0, totalPaise }
  f.bookings.completed = completed
  return f
}

describe('formatDailyReport', () => {
  it('names the branch in the title when given', () => {
    const data: DailyReportData = { date: DATE, ...figures(150_000, 3) }
    const text = formatDailyReport(data, 'Rayasandra')
    expect(text.split('\n')[0]).toBe('📊 Royal Glow Rayasandra — Daily Sales Report')
    expect(text).toContain('Date: 25/10/2026')
    expect(text).toContain('₹1,500.00')
  })

  it('keeps the plain title without a branch', () => {
    const text = formatDailyReport({ date: DATE, ...emptyReportFigures() })
    expect(text.split('\n')[0]).toBe('📊 Royal Glow — Daily Sales Report')
    expect(text).toContain('(none)')
  })
})

describe('formatWeeklyReport', () => {
  it('compares the branch’s week with its previous week', () => {
    const data = {
      date: DATE,
      periodStart: new Date('2026-10-19T00:00:00.000Z'),
      periodEnd: DATE,
      ...figures(200_000),
    }
    const text = formatWeeklyReport(data, figures(100_000), 'Marathahalli')
    expect(text.split('\n')[0]).toBe('📊 Royal Glow Marathahalli — Weekly Sales Report')
    expect(text).toContain('Week: 19/10/2026 – 25/10/2026')
    expect(text).toContain('📈 Week-over-week: +₹1,000.00 (+100%)')
  })
})

describe('formatDailySummary', () => {
  it('shows every branch and the total across them', () => {
    const text = formatDailySummary(DATE, [
      { branchName: 'Rayasandra', figures: figures(100_000, 2) },
      { branchName: 'Marathahalli', figures: figures(50_000, 1) },
    ])
    expect(text.split('\n')[0]).toBe('📊 Royal Glow — Daily Summary, All Branches')
    expect(text).toContain('Rayasandra\n   Total collected:      ₹1,000.00')
    expect(text).toContain('Marathahalli\n   Total collected:      ₹500.00')
    expect(text).toContain(
      'All branches\n   Total collected:      ₹1,500.00\n   Completed:            3',
    )
    expect(text).not.toContain('Week-over-week')
  })

  it('says so when no branch is reported', () => {
    expect(formatDailySummary(DATE, [])).toContain('(no branches to report)')
  })
})

describe('formatWeeklySummary', () => {
  it('adds each branch’s and the total’s week-over-week change', () => {
    const text = formatWeeklySummary(new Date('2026-10-19T00:00:00.000Z'), DATE, [
      { branchName: 'Rayasandra', figures: figures(150_000), previous: figures(100_000) },
      { branchName: 'Marathahalli', figures: figures(0), previous: figures(50_000) },
    ])
    expect(text).toContain('Week-over-week:       +₹500.00 (+50%)')
    expect(text).toContain('Week-over-week:       -₹500.00 (-100%)')
    // 1,500 against 1,500: no change overall.
    expect(text).toContain('All branches')
    expect(text.trimEnd().endsWith('Week-over-week:       +₹0.00 (+0%)')).toBe(true)
  })
})

describe('reportSubject', () => {
  it('names one branch, or lists several', () => {
    expect(reportSubject('Daily', ['Rayasandra'])).toBe(
      'Royal Glow Rayasandra — Daily Sales Report',
    )
    expect(reportSubject('Weekly', ['Rayasandra', 'Marathahalli'])).toBe(
      'Royal Glow — Weekly Sales Reports: Rayasandra, Marathahalli',
    )
  })
})

describe('weekOverWeekDelta', () => {
  it('treats growth from zero as +100%', () => {
    expect(weekOverWeekDelta(5000, 0)).toEqual({ deltaPaise: 5000, pct: 100 })
    expect(weekOverWeekDelta(0, 0)).toEqual({ deltaPaise: 0, pct: 0 })
  })
})
