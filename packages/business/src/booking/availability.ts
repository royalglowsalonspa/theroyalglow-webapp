/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-06-2026 & Updated - 25-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : availability
 * Scope        : Business Logic — Booking
 *
 * Description  : Pure availability slot generation for a date + branch.
 *                Produces a fixed 30-minute grid within branch business
 *                hours and flags each slot's availability against business
 *                hours, recorded holidays, and (for today, IST) the current
 *                IST wall-clock time. Rejects past dates before generating.
 *
 * Responsibilities :
 * - Reject past dates (earlier than today in IST) with VALIDATION_ERROR (400)
 * - Generate slots on a fixed 30-min grid (open 10:00, last start 20:30, close 21:00)
 * - Flag slots unavailable when outside business hours, on a holiday, or
 *   (today, IST) earlier than the current IST time
 *
 * Features / Functionality :
 * - generateAvailability({ date, now?, holidays?, businessHours? }) → Slot[]
 * - Each slot: { startTime, endTime, available }, endTime = start + 30 min
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : @rgss/errors, ./reschedule (slot constants)
 *
 * Notes        :
 * - Pure and deterministic — accepts `now`, `holidays`, and `businessHours`
 *   as parameters (no I/O, no DB, no framework). IST = UTC+5:30.
 * - Reuses SLOT_OPEN_MINUTES / SLOT_CLOSE_MINUTES / SLOT_DURATION_MINUTES so
 *   the grid stays consistent with the reschedule slot rules.
 ************************************************************/
import { badRequest } from '@rgss/errors'
import { SLOT_CLOSE_MINUTES, SLOT_DURATION_MINUTES, SLOT_OPEN_MINUTES } from './reschedule'

/** IST is UTC+5:30. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

/** A single availability slot. Times are 24h "HH:MM" strings. */
export type AvailabilitySlot = {
  startTime: string
  endTime: string
  available: boolean
}

/** The day's actual open window, in minutes since midnight. */
export type BusinessHours = {
  openMinutes: number
  closeMinutes: number
}

export type GenerateAvailabilityInput = {
  /** Requested date as an IST calendar day, "YYYY-MM-DD". */
  date: string
  /** Current instant. Defaults to now. Used for IST "today" + current-time checks. */
  now?: Date
  /** Recorded holiday dates as "YYYY-MM-DD". */
  holidays?: readonly string[]
  /** The day's actual business hours. Defaults to the standard 10:00–21:00 window. */
  businessHours?: BusinessHours
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Minutes since midnight → "HH:MM". */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${pad2(h)}:${pad2(m)}`
}

/** Shift a UTC instant into IST wall-clock time (read via UTC accessors). */
function istWall(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MS)
}

/** "YYYY-MM-DD" of an instant in IST. */
function istDateString(date: Date): string {
  const wall = istWall(date)
  return `${wall.getUTCFullYear()}-${pad2(wall.getUTCMonth() + 1)}-${pad2(wall.getUTCDate())}`
}

/** Minutes since IST midnight for an instant. */
function istMinutesOfDay(date: Date): number {
  const wall = istWall(date)
  return wall.getUTCHours() * 60 + wall.getUTCMinutes()
}

/**
 * Validate a "YYYY-MM-DD" string and confirm it denotes a real calendar date.
 * Returns the normalized parts, or null when the string is malformed/unreal.
 */
function parseISODate(date: string): { y: number; m: number; d: number } | null {
  if (typeof date !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  // Round-trip through Date to reject impossible dates (e.g. 2026-02-30).
  const probe = new Date(Date.UTC(y, m - 1, d))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null
  }
  return { y, m, d }
}

/**
 * Generate the availability grid for a date and branch.
 *
 * Throws a VALIDATION_ERROR (400) when the date is malformed or earlier than
 * today in IST — before any slots are generated. Otherwise returns a fixed
 * 30-minute grid within the business-hours window, each slot flagged
 * unavailable when it falls outside the day's business hours, the date is a
 * recorded holiday, or (when the date is today in IST) its start is earlier
 * than the current IST time.
 */
export function generateAvailability({
  date,
  now = new Date(),
  holidays = [],
  businessHours = { openMinutes: SLOT_OPEN_MINUTES, closeMinutes: SLOT_CLOSE_MINUTES },
}: GenerateAvailabilityInput): AvailabilitySlot[] {
  const parsed = parseISODate(date)
  if (parsed === null) {
    throw badRequest('A valid date in YYYY-MM-DD format is required', {
      date: ['Invalid date'],
    })
  }

  const today = istDateString(now)
  // Lexicographic comparison is correct for zero-padded YYYY-MM-DD strings.
  if (date < today) {
    throw badRequest('Cannot request availability for a past date', {
      date: ['Date must not be in the past'],
    })
  }

  const isToday = date === today
  const isHoliday = holidays.includes(date)
  const currentMinutes = istMinutesOfDay(now)

  const slots: AvailabilitySlot[] = []
  // Fixed 30-min grid across the standard operating window: open .. (close - duration).
  for (
    let start = SLOT_OPEN_MINUTES;
    start + SLOT_DURATION_MINUTES <= SLOT_CLOSE_MINUTES;
    start += SLOT_DURATION_MINUTES
  ) {
    const end = start + SLOT_DURATION_MINUTES
    const withinBusinessHours =
      start >= businessHours.openMinutes && end <= businessHours.closeMinutes
    const inPastToday = isToday && start < currentMinutes

    const available = withinBusinessHours && !isHoliday && !inPastToday

    slots.push({
      startTime: minutesToTime(start),
      endTime: minutesToTime(end),
      available,
    })
  }

  return slots
}
