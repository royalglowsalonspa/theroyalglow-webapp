/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 30-10-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : booking/policy
 * Scope        : Business Logic — a branch's booking policy (multi-branch R6.3)
 *
 * Description  : The one resolver every booking action uses: a branch's
 *                weekly business hours and booking rules at a revision decide
 *                whether a slot can be booked, whether a customer is at the
 *                branch's booking limit, whether a cancellation is late and
 *                whether a reschedule is still allowed. Pure: the caller reads
 *                the branch's settings and passes them in.
 *
 * Responsibilities :
 * - dayRefusal: whether the branch takes bookings on a date at all (past,
 *   beyond the booking window for customers, a closed weekday)
 * - slotRefusal / assertSlotBookable: date, opening hours, the 30-minute grid,
 *   and for customers the lead time and the booking window
 * - assertBookingCap: upcoming bookings per customer at the branch
 * - cancellationTerms: late within the cancellation cut-off (never charged)
 * - rescheduleTerms / assertReschedulable: status, reschedules per booking and
 *   the reschedule cut-off before the appointment
 * - bookingTerms: both, for the customer's booking page
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : @rgss/errors, @rgss/types, ./reschedule, ../jobs/time
 *
 * Notes        :
 * - Appointment times are IST wall-clock times on IST calendar dates.
 * - Staff at the counter (walk-ins) are held to the branch's hours and the
 *   grid, not to the customer lead time or booking window.
 * - Every decision names the revision it used; callers store it with the
 *   booking or its status-log entry, so a later edit never rewrites it.
 ************************************************************/

import { conflict, ERROR_CODES } from '@rgss/errors'
import { type BookingRules, type BusinessHours, DAY_LABELS, type DayKey } from '@rgss/types'
import { istToday } from '../jobs/time'
import { checkReschedulable, SLOT_DURATION_MINUTES } from './reschedule'

/** A branch's booking settings at one revision. */
export type BranchPolicy = {
  revision: number
  businessHours: BusinessHours
  bookingRules: BookingRules
}

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

// Date.getUTCDay() order (0 = Sunday).
const WEEKDAYS: readonly DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** "HH:MM" (or "HH:MM:SS") → minutes since midnight; NaN when malformed. */
function minutesOf(time: string): number {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time)
  if (!match) {
    return Number.NaN
  }
  const h = Number(match[1])
  const m = Number(match[2])
  return h < 24 && m < 60 ? h * 60 + m : Number.NaN
}

/** Minutes since midnight → "HH:MM". */
function timeOf(minutes: number): string {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`
}

/** True for a real calendar date written "YYYY-MM-DD". */
function isCalendarDate(date: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) {
    return false
  }
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  const probe = new Date(Date.UTC(y, m - 1, d))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
}

/** The weekday of a calendar date "YYYY-MM-DD". */
export function weekdayOf(date: string): DayKey {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number)
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? 'mon'
}

/** The day's opening window in minutes since midnight, or null when closed. */
export function openWindowOn(
  hours: BusinessHours,
  date: string,
): { openMinutes: number; closeMinutes: number } | null {
  const day = hours[weekdayOf(date)]
  if (day.closed || day.open === null || day.close === null) {
    return null
  }
  const openMinutes = minutesOf(day.open)
  const closeMinutes = minutesOf(day.close)
  if (Number.isNaN(openMinutes) || Number.isNaN(closeMinutes) || closeMinutes <= openMinutes) {
    return null
  }
  return { openMinutes, closeMinutes }
}

/** The instant an appointment starts: its date and time on the IST clock. */
export function appointmentStartsAt(date: string, startTime: string): Date {
  return new Date(`${date}T${startTime.slice(0, 5)}:00+05:30`)
}

/** The last date a customer can book: today in IST plus the branch's window. */
export function lastBookableDate(rules: BookingRules, now: Date): string {
  const today = istToday(now)
  const [y = 0, m = 1, d = 1] = today.split('-').map(Number)
  const last = new Date(Date.UTC(y, m - 1, d) + rules.maxAdvanceBookingDays * DAY_MS)
  return `${last.getUTCFullYear()}-${pad2(last.getUTCMonth() + 1)}-${pad2(last.getUTCDate())}`
}

/** 60 → "1 hour", 90 → "90 minutes", 120 → "2 hours", 1440 → "1 day". */
export function durationText(minutes: number): string {
  if (minutes > 0 && minutes % 1440 === 0) {
    const days = minutes / 1440
    return `${days} ${days === 1 ? 'day' : 'days'}`
  }
  if (minutes > 0 && minutes % 60 === 0) {
    const hours = minutes / 60
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  }
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
}

/** A slot someone wants to book at a branch. */
export type SlotRequest = {
  /** IST calendar date, "YYYY-MM-DD". */
  date: string
  /** IST start time, "HH:MM". */
  startTime: string
  durationMinutes: number
  now: Date
  /**
   * A customer books within the lead time and the booking window; staff at
   * the counter (walk-ins) only within the branch's hours.
   */
  actor: 'customer' | 'staff'
  branchName: string
}

/** The date someone wants to book at a branch, before a time is chosen. */
export type DayRequest = Pick<SlotRequest, 'date' | 'now' | 'actor' | 'branchName'>

/**
 * Why the branch takes no bookings on the date at all, or null when it may:
 * a past date, for customers a date beyond the booking window, or a weekday
 * the branch is closed. Holidays and closures are separate (assertBranchOpenOn).
 */
export function dayRefusal(policy: BranchPolicy, request: DayRequest): string | null {
  const { date, now, actor, branchName } = request
  if (!isCalendarDate(date)) {
    return 'Choose a valid date and time.'
  }
  if (date < istToday(now)) {
    return 'That date has passed. Choose today or a later date.'
  }
  const rules = policy.bookingRules
  if (actor === 'customer' && date > lastBookableDate(rules, now)) {
    return `${branchName} takes bookings up to ${durationText(rules.maxAdvanceBookingDays * 1440)} ahead.`
  }
  if (!openWindowOn(policy.businessHours, date)) {
    return `${branchName} is closed on ${DAY_LABELS[weekdayOf(date)]}s.`
  }
  return null
}

/** Why the branch's settings refuse the slot, or null when it can be booked. */
export function slotRefusal(policy: BranchPolicy, request: SlotRequest): string | null {
  const { date, startTime, durationMinutes, now, actor, branchName } = request
  const start = minutesOf(startTime)
  if (
    !isCalendarDate(date) ||
    Number.isNaN(start) ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return 'Choose a valid date and time.'
  }

  const dayReason = dayRefusal(policy, request)
  if (dayReason !== null) {
    return dayReason
  }
  const rules = policy.bookingRules
  const weekday = DAY_LABELS[weekdayOf(date)]
  const window = openWindowOn(policy.businessHours, date)
  // dayRefusal has already refused a closed weekday; this narrows the type.
  if (!window) {
    return `${branchName} is closed on ${weekday}s.`
  }
  if (start % SLOT_DURATION_MINUTES !== 0) {
    return 'Choose a time on the hour or the half hour.'
  }
  if (start < window.openMinutes || start + durationMinutes > window.closeMinutes) {
    return `${branchName} is open ${timeOf(window.openMinutes)}–${timeOf(window.closeMinutes)} on ${weekday}s, and the booking must finish by ${timeOf(window.closeMinutes)}.`
  }

  if (actor === 'customer') {
    const lead = rules.minAdvanceLeadTimeMinutes
    const startsAt = appointmentStartsAt(date, startTime).getTime()
    if (startsAt <= now.getTime()) {
      return 'That time has passed. Choose a later time.'
    }
    if (startsAt < now.getTime() + lead * MINUTE_MS) {
      return `Book at least ${durationText(lead)} ahead.`
    }
  }
  return null
}

/** Throws 409 BOOKING_SLOT_UNAVAILABLE, saying why, when the slot can't be booked. */
export function assertSlotBookable(policy: BranchPolicy, request: SlotRequest): void {
  const refusal = slotRefusal(policy, request)
  if (refusal !== null) {
    throw conflict(ERROR_CODES.BOOKING_SLOT_UNAVAILABLE, refusal)
  }
}

/**
 * Throws 409 BOOKING_LIMIT_REACHED when the customer already has as many
 * upcoming bookings at the branch as it allows. The limit is per branch
 * (tax-settings.md §3): bookings at other branches don't count.
 */
export function assertBookingCap(params: {
  rules: BookingRules
  upcomingAtBranch: number
  branchName: string
}): void {
  const limit = params.rules.maxActiveBookingsPerCustomer
  if (params.upcomingAtBranch >= limit) {
    throw conflict(
      ERROR_CODES.BOOKING_LIMIT_REACHED,
      `You already have ${params.upcomingAtBranch} upcoming ${params.upcomingAtBranch === 1 ? 'booking' : 'bookings'} at ${params.branchName}, the most it takes at once. Cancel one, or book again after your visit.`,
    )
  }
}

/** A customer can cancel a booking that hasn't started, ended or been refused. */
export function isCustomerCancellable(status: string): boolean {
  return status === 'pending' || status === 'confirmed'
}

/** What cancelling now means under the branch's rules. */
export type CancellationTerms = {
  /** Within the cut-off: still allowed and never charged, but recorded. */
  late: boolean
  cutoffHours: number
}

export function cancellationTerms(params: {
  rules: BookingRules
  startsAt: Date
  now: Date
}): CancellationTerms {
  const cutoffHours = params.rules.cancellationCutoffHours
  const late = params.startsAt.getTime() - params.now.getTime() < cutoffHours * HOUR_MS
  return { late, cutoffHours }
}

/** Whether the customer can reschedule now, and why not. */
export type RescheduleTerms =
  | { allowed: true; remaining: number; cutoffHours: number }
  | {
      allowed: false
      code: 'NOT_RESCHEDULABLE' | 'MAX_RESCHEDULES' | 'WINDOW_PASSED'
      message: string
    }

export function rescheduleTerms(params: {
  rules: BookingRules
  status: string
  rescheduleCount: number
  startsAt: Date
  now: Date
}): RescheduleTerms {
  const { rules } = params
  const check = checkReschedulable({
    status: params.status,
    rescheduleCount: params.rescheduleCount,
    maxReschedules: rules.maxReschedulesPerBooking,
  })
  if (!check.ok) {
    return { allowed: false, code: check.code, message: check.message }
  }
  const cutoffHours = rules.rescheduleCutoffHours
  if (params.startsAt.getTime() - params.now.getTime() < cutoffHours * HOUR_MS) {
    return {
      allowed: false,
      code: 'WINDOW_PASSED',
      message:
        cutoffHours > 0
          ? `Reschedule at least ${durationText(cutoffHours * 60)} before the appointment. You can still cancel it.`
          : 'This appointment has started, so it can’t be rescheduled.',
    }
  }
  return {
    allowed: true,
    remaining: rules.maxReschedulesPerBooking - params.rescheduleCount,
    cutoffHours,
  }
}

/** What the customer may do with a booking now, under its branch's rules. */
export type BookingTerms = {
  /** Null when the booking can't be cancelled. */
  cancel: CancellationTerms | null
  reschedule: RescheduleTerms
}

export function bookingTerms(params: Parameters<typeof rescheduleTerms>[0]): BookingTerms {
  return {
    cancel: isCustomerCancellable(params.status) ? cancellationTerms(params) : null,
    reschedule: rescheduleTerms(params),
  }
}

/** Throws the matching 409 when the booking can't be rescheduled now. */
export function assertReschedulable(params: Parameters<typeof rescheduleTerms>[0]): void {
  const terms = rescheduleTerms(params)
  if (terms.allowed) {
    return
  }
  const code = {
    NOT_RESCHEDULABLE: ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
    MAX_RESCHEDULES: ERROR_CODES.BOOKING_MAX_RESCHEDULES,
    WINDOW_PASSED: ERROR_CODES.BOOKING_RESCHEDULE_WINDOW_PASSED,
  }[terms.code]
  throw conflict(code, terms.message)
}
