/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-06-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : availability
 * Scope        : Business Logic — Booking
 *
 * Description  : Pure availability slot generation for a date at a branch.
 *                Produces a 30-minute grid across the branch's opening hours
 *                that day and flags each slot unavailable on a holiday or
 *                closure, or when it starts sooner than the branch's lead time
 *                allows. Rejects past dates before generating.
 *
 * Responsibilities :
 * - Reject past dates (earlier than today in IST) with VALIDATION_ERROR (400)
 * - Generate slots on the half hour from opening until the last slot that
 *   ends by closing; no slots on a day the branch is closed
 * - Flag slots unavailable on a holiday or closure, when they start sooner
 *   than now plus the lead time, or when a booking of the given length would
 *   run past closing from them
 *
 * Features / Functionality :
 * - generateAvailability({ date, now?, holidays?, businessHours?,
 *   leadTimeMinutes?, durationMinutes? }) → Slot[]
 * - Each slot: { startTime, endTime, available }, endTime = start + 30 min
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : @rgss/errors, ./reschedule (slot constants)
 *
 * Notes        :
 * - Pure and deterministic — accepts `now`, `holidays`, `businessHours` and
 *   `leadTimeMinutes` as parameters (no I/O, no DB, no framework). IST =
 *   UTC+5:30.
 * - The slots are a request grid, not a promise of free staff (R7.1): the
 *   receptionist confirms who does it.
 ************************************************************/
import { badRequest } from '@rgss/errors'
import { SLOT_CLOSE_MINUTES, SLOT_DURATION_MINUTES, SLOT_OPEN_MINUTES } from './reschedule'

/** IST is UTC+5:30. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
const MINUTE_MS = 60 * 1000

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
  /** Current instant. Defaults to now. Used for IST "today" and the lead time. */
  now?: Date
  /** Recorded holiday and closure dates as "YYYY-MM-DD". */
  holidays?: readonly string[]
  /**
   * The day's opening window: the grid spans it. Null when the branch is
   * closed that day, which gives no slots. Defaults to 10:00–21:00.
   */
  businessHours?: BusinessHours | null
  /** Slots starting sooner than this many minutes from now are unavailable. */
  leadTimeMinutes?: number
  /**
   * How long the booking runs. A slot it would run past closing from is
   * unavailable. Defaults to one slot (30 minutes).
   */
  durationMinutes?: number
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

/** "YYYY-MM-DD" of an instant in IST. */
function istDateString(date: Date): string {
  const wall = new Date(date.getTime() + IST_OFFSET_MS)
  return `${wall.getUTCFullYear()}-${pad2(wall.getUTCMonth() + 1)}-${pad2(wall.getUTCDate())}`
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
 * Generate the availability grid for a date at a branch.
 *
 * Throws a VALIDATION_ERROR (400) when the date is malformed or earlier than
 * today in IST — before any slots are generated. Otherwise returns the
 * half-hour slots from opening until the last one that ends by closing, each
 * flagged unavailable when the date is a holiday or closure, or when the slot
 * starts sooner than now plus the lead time.
 */
export function generateAvailability({
  date,
  now = new Date(),
  holidays = [],
  businessHours = { openMinutes: SLOT_OPEN_MINUTES, closeMinutes: SLOT_CLOSE_MINUTES },
  leadTimeMinutes = 0,
  durationMinutes = SLOT_DURATION_MINUTES,
}: GenerateAvailabilityInput): AvailabilitySlot[] {
  const parsed = parseISODate(date)
  if (parsed === null) {
    throw badRequest('A valid date in YYYY-MM-DD format is required', {
      date: ['Invalid date'],
    })
  }

  // Lexicographic comparison is correct for zero-padded YYYY-MM-DD strings.
  if (date < istDateString(now)) {
    throw badRequest('Cannot request availability for a past date', {
      date: ['Date must not be in the past'],
    })
  }

  if (businessHours === null) {
    return []
  }

  const isHoliday = holidays.includes(date)
  // 00:00 IST on the date, as an instant.
  const dayStart = Date.UTC(parsed.y, parsed.m - 1, parsed.d) - IST_OFFSET_MS
  const earliest = now.getTime() + Math.max(0, leadTimeMinutes) * MINUTE_MS
  const first = Math.ceil(businessHours.openMinutes / SLOT_DURATION_MINUTES) * SLOT_DURATION_MINUTES
  const runs = Math.max(SLOT_DURATION_MINUTES, durationMinutes)

  const slots: AvailabilitySlot[] = []
  for (
    let start = first;
    start + SLOT_DURATION_MINUTES <= businessHours.closeMinutes;
    start += SLOT_DURATION_MINUTES
  ) {
    const startsAt = dayStart + start * MINUTE_MS
    slots.push({
      startTime: minutesToTime(start),
      endTime: minutesToTime(start + SLOT_DURATION_MINUTES),
      available: !isHoliday && startsAt >= earliest && start + runs <= businessHours.closeMinutes,
    })
  }

  return slots
}
