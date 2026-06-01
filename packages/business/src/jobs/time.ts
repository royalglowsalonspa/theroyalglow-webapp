// IST (Asia/Kolkata, UTC+5:30) window helpers for the background jobs layer.
// All functions are pure and deterministic: they accept an optional `now` so
// callers (and tests) can pin the clock. The salon operates on IST calendar
// boundaries, so "today", "expiring in N days", reminder windows and the GST
// month key are all computed against IST wall-clock days.

export const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_HOUR = 60 * 60 * 1000
// The appointment-reminder job runs every 15 minutes, so a booking matches a
// window if its start falls inside the next 15-minute slot at the +24h or +1h mark.
const SLOT_MS = 15 * 60 * 1000

export type ReminderWindow = '24h' | '1h'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// Shift a UTC instant into IST wall-clock time. Reading the UTC accessors on the
// shifted Date then yields the IST calendar fields.
function istWall(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MS)
}

function formatYMD(wall: Date): string {
  return `${wall.getUTCFullYear()}-${pad2(wall.getUTCMonth() + 1)}-${pad2(wall.getUTCDate())}`
}

// Start-of-day (IST midnight) of the given instant, expressed as a UTC ms value
// of the IST calendar date. Used for whole-day differences.
function istCalendarMs(date: Date): number {
  const wall = istWall(date)
  return Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate())
}

// 'YYYY-MM-DD' of `now` in IST.
export function istToday(now: Date = new Date()): string {
  return formatYMD(istWall(now))
}

// 'YYYY-MM-DD' for the IST calendar day `n` days from `now` (n may be negative).
export function istDateInDays(now: Date, n: number): string {
  const wall = istWall(now)
  wall.setUTCDate(wall.getUTCDate() + n)
  return formatYMD(wall)
}

// True iff `a` and `b` fall on the same IST calendar day.
export function isSameISTDay(a: Date, b: Date): boolean {
  return istToday(a) === istToday(b)
}

// Classify a booking start against the reminder windows. Returns '24h' when the
// start falls in [now+24h, now+24h+15min), '1h' when in [now+1h, now+1h+15min),
// else null. The two windows are far apart, so at most one matches.
export function reminderWindowMatch(startsAt: Date, now: Date = new Date()): ReminderWindow | null {
  const diff = startsAt.getTime() - now.getTime()
  if (diff >= MS_PER_HOUR && diff < MS_PER_HOUR + SLOT_MS) {
    return '1h'
  }
  if (diff >= 24 * MS_PER_HOUR && diff < 24 * MS_PER_HOUR + SLOT_MS) {
    return '24h'
  }
  return null
}

// 'YYYY-MM' for the previous month in IST — the period the monthly GST summary
// aggregates when it runs on the 1st.
export function monthKeyIST(now: Date = new Date()): string {
  const wall = istWall(now)
  wall.setUTCDate(1)
  wall.setUTCMonth(wall.getUTCMonth() - 1)
  return `${wall.getUTCFullYear()}-${pad2(wall.getUTCMonth() + 1)}`
}

// Whole IST calendar days from `now` to `target` (positive when target is in the
// future). Both instants are reduced to their IST midnight before differencing,
// so the result is a calendar-day count, not a 24-hour-bucket count.
export function daysUntilIST(target: Date, now: Date = new Date()): number {
  return Math.round((istCalendarMs(target) - istCalendarMs(now)) / MS_PER_DAY)
}
