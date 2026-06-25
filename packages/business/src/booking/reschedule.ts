/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-06-2026 & Updated - 25-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : reschedule
 * Scope        : Business Logic — Booking
 *
 * Description  : Pure decision logic for customer-initiated booking reschedules.
 *                Decides whether a booking may be moved to a new slot and whether
 *                a requested start time is a valid, bookable slot for the day.
 *
 * Responsibilities :
 * - Gate reschedule eligibility by status and reschedule count
 * - Validate that a requested start time aligns to a bookable slot window
 *
 * Features / Functionality :
 * - MAX_RESCHEDULES policy (2 per booking — 3rd attempt must cancel + re-book)
 * - RESCHEDULABLE_STATUSES (only pending/confirmed bookings can move)
 * - checkReschedulable(...) → discriminated result (no throwing — caller maps to errors)
 * - isBookableSlotStart(...) → slot must align to 30-min grid within open hours
 *   and the full service duration must finish before close
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : None (pure — no I/O, no framework, no db)
 *
 * Notes        :
 * - Slot window mirrors GET /api/availability (10:00 open, 30-min slots,
 *   last slot starts 20:30, close 21:00). Kept here so the rule is unit-testable.
 ************************************************************/

/** Max reschedules allowed per booking. The 3rd attempt is blocked — the customer
 *  must cancel and book fresh. Matches the backend-api spec (reschedule twice). */
export const MAX_RESCHEDULES = 2

/** Only active, not-yet-started bookings may be rescheduled. */
export const RESCHEDULABLE_STATUSES = ['pending', 'confirmed'] as const
export type ReschedulableStatus = (typeof RESCHEDULABLE_STATUSES)[number]

/** Slot grid — mirrors GET /api/availability. */
export const SLOT_OPEN_MINUTES = 10 * 60 // 10:00
export const SLOT_CLOSE_MINUTES = 21 * 60 // 21:00 (last slot ends here)
export const SLOT_DURATION_MINUTES = 30

export type RescheduleCheckInput = {
  status: string
  rescheduleCount: number
}

export type RescheduleCheck =
  | { ok: true }
  | { ok: false; code: 'NOT_RESCHEDULABLE' | 'MAX_RESCHEDULES'; message: string }

/**
 * Decide whether a booking is eligible to be rescheduled, based purely on its
 * current status and how many times it has already been moved. Returns a
 * discriminated result; the calling API route maps the failure code to the
 * appropriate AppError (409). This keeps the rule free of framework/error deps
 * and trivially unit-testable.
 */
export function checkReschedulable({
  status,
  rescheduleCount,
}: RescheduleCheckInput): RescheduleCheck {
  if (!(RESCHEDULABLE_STATUSES as readonly string[]).includes(status)) {
    return {
      ok: false,
      code: 'NOT_RESCHEDULABLE',
      message: `A booking in status "${status}" cannot be rescheduled.`,
    }
  }
  if (rescheduleCount >= MAX_RESCHEDULES) {
    return {
      ok: false,
      code: 'MAX_RESCHEDULES',
      message: `This booking has already been rescheduled ${MAX_RESCHEDULES} times. Please cancel and book again.`,
    }
  }
  return { ok: true }
}

/** Convert "HH:MM" (24h) to minutes since midnight. Returns NaN on malformed input. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) {
    return Number.NaN
  }
  return h * 60 + m
}

/**
 * A requested start time is bookable when it sits on the 30-minute grid within
 * opening hours AND the full service duration finishes by closing time.
 */
export function isBookableSlotStart(startTime: string, durationMinutes: number): boolean {
  const start = timeToMinutes(startTime)
  if (Number.isNaN(start) || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return false
  }
  if (start < SLOT_OPEN_MINUTES) return false
  if ((start - SLOT_OPEN_MINUTES) % SLOT_DURATION_MINUTES !== 0) return false
  if (start + durationMinutes > SLOT_CLOSE_MINUTES) return false
  return true
}
