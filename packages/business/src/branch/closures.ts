/************************************************************
 * Module Name  : branch/closures
 * Scope        : Business Logic — branch closures (multi-branch R1.8)
 *
 * Description  : Pure rules for the days a branch is closed. The caller reads
 *                the closures; these functions decide.
 *
 * Rules :
 * - A branch's Owner and Manager (and the Developer) add and remove that
 *   branch's closures. Only the Developer adds or removes one for every
 *   branch.
 * - A request closes one date or an inclusive range of up to 31 days, never
 *   in the past (IST).
 * - A closed date takes no new booking: online booking, reschedule, gems
 *   redemption, walk-in and approval all refuse it. Recording a membership
 *   session that took place is not blocked.
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic (pure, no I/O)
 ************************************************************/

import { AppError, badRequest, ERROR_CODES, forbidden } from '@rgss/errors'
import { CLOSURE_MAX_DAYS } from '@rgss/types'
import type { BranchRole } from './access'

/** A closure that applies to a branch on one date. */
export type BranchClosure = {
  name: string
  /** Closes every branch. */
  allBranches: boolean
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * The dates a request closes: `date`, or `date` to `endDate` inclusive.
 * Throws 400 for a range that ends before it starts, starts before `today`,
 * or exceeds CLOSURE_MAX_DAYS. Dates are 'YYYY-MM-DD' (already validated).
 */
export function closureDates(params: { date: string; endDate?: string; today: string }): string[] {
  const end = params.endDate ?? params.date
  if (params.date < params.today) {
    throw badRequest('A closure cannot start in the past.', { date: ['Choose today or later'] })
  }
  if (end < params.date) {
    throw badRequest('The closure ends before it starts.', {
      endDate: ['Choose a date on or after the first day'],
    })
  }
  const dates: string[] = []
  for (let day = params.date; day <= end; day = addDays(day, 1)) {
    if (dates.length === CLOSURE_MAX_DAYS) {
      throw badRequest(`Close at most ${CLOSURE_MAX_DAYS} days at a time.`, {
        endDate: [`At most ${CLOSURE_MAX_DAYS} days`],
      })
    }
    dates.push(day)
  }
  return dates
}

/** Who may add or remove a closure: Manager and up at the branch; all branches: the Developer. */
export function canManageClosure(role: BranchRole, allBranches: boolean): boolean {
  if (allBranches) {
    return role === 'developer'
  }
  return role === 'manager' || role === 'owner' || role === 'developer'
}

/** 403 unless the role may manage this kind of closure. */
export function assertCanManageClosure(role: BranchRole, allBranches: boolean): void {
  if (!canManageClosure(role, allBranches)) {
    throw forbidden(
      allBranches
        ? 'Only the Developer can close every branch.'
        : "Only the branch's Manager or Owner can change its closures.",
    )
  }
}

/** What staff refused by a closure can do about it. */
export function staffClosureHint(role: BranchRole): string {
  return canManageClosure(role, false)
    ? 'Remove the closure on the Schedule page if the branch is open.'
    : 'Ask the branch Manager to remove the closure if the branch is open.'
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY'. */
function displayDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** Why a booking can't be on this date, or null when the branch is open. */
export function closedDayMessage(
  closure: BranchClosure | null,
  branchName: string,
  dateISO: string,
): string | null {
  if (!closure) {
    return null
  }
  return `${branchName} is closed on ${displayDate(dateISO)} (${closure.name}).`
}

/**
 * 409 BOOKING_SLOT_UNAVAILABLE when the branch is closed that day. `hint`
 * tells staff what to do (for example, ask the Manager to remove the closure).
 */
export function assertBranchOpenOn(
  closure: BranchClosure | null,
  branchName: string,
  dateISO: string,
  hint?: string,
): void {
  const message = closedDayMessage(closure, branchName, dateISO)
  if (message) {
    throw new AppError({
      code: ERROR_CODES.BOOKING_SLOT_UNAVAILABLE,
      message: hint ? `${message} ${hint}` : message,
      statusCode: 409,
    })
  }
}
