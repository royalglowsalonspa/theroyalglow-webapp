/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-06-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : reschedule
 * Scope        : Business Logic — Booking
 *
 * Description  : Pure decision logic for customer-initiated booking reschedules:
 *                whether a booking may move, by its status and how many times
 *                it has moved against the branch's limit, and the slot grid.
 *
 * Responsibilities :
 * - Gate reschedule eligibility by status and reschedule count
 *
 * Features / Functionality :
 * - MAX_RESCHEDULES (2 per booking, the documented default; each branch sets
 *   its own in its booking rules)
 * - RESCHEDULABLE_STATUSES (only pending/confirmed bookings can move)
 * - checkReschedulable(...) → discriminated result (no throwing — caller maps to errors)
 * - The 30-minute slot grid constants
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : None (pure — no I/O, no framework, no db)
 *
 * Notes        :
 * - Whether a slot can be booked at a branch, and the reschedule cut-off, are
 *   decided by ./policy from the branch's settings (R6.3).
 * - SLOT_OPEN_MINUTES / SLOT_CLOSE_MINUTES are only generateAvailability's
 *   default window; no booking decision uses them.
 ************************************************************/

/** Max reschedules allowed per booking. The 3rd attempt is blocked — the customer
 *  must cancel and book fresh. Matches the backend-api spec (reschedule twice). */
export const MAX_RESCHEDULES = 2

/** Only active, not-yet-started bookings may be rescheduled. */
export const RESCHEDULABLE_STATUSES = ['pending', 'confirmed'] as const
export type ReschedulableStatus = (typeof RESCHEDULABLE_STATUSES)[number]

/** The default availability window (10:00–21:00) and the 30-minute slot grid. */
export const SLOT_OPEN_MINUTES = 10 * 60 // 10:00
export const SLOT_CLOSE_MINUTES = 21 * 60 // 21:00 (last slot ends here)
export const SLOT_DURATION_MINUTES = 30

export type RescheduleCheckInput = {
  status: string
  rescheduleCount: number
  /** The branch's limit (booking rules); MAX_RESCHEDULES when not given. */
  maxReschedules?: number
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
  maxReschedules = MAX_RESCHEDULES,
}: RescheduleCheckInput): RescheduleCheck {
  if (!(RESCHEDULABLE_STATUSES as readonly string[]).includes(status)) {
    return {
      ok: false,
      code: 'NOT_RESCHEDULABLE',
      message: `A booking in status "${status}" cannot be rescheduled.`,
    }
  }
  if (rescheduleCount >= maxReschedules) {
    return {
      ok: false,
      code: 'MAX_RESCHEDULES',
      message:
        maxReschedules === 0
          ? 'Bookings at this branch can’t be rescheduled online. Please cancel and book again.'
          : `This booking has already been rescheduled ${maxReschedules} ${maxReschedules === 1 ? 'time' : 'times'}. Please cancel and book again.`,
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
