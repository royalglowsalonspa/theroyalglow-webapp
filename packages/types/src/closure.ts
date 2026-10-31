/************************************************************
 * Module Name  : closure
 * Scope        : Shared Types — branch closures (multi-branch R1.8)
 *
 * Description  : Contracts for the days a branch is closed: holidays and
 *                one-off closures. A branch's Owner and Manager maintain their
 *                branch's closures; only the Developer adds one for every
 *                branch.
 *
 * Notes        : Dates are IST calendar dates, 'YYYY-MM-DD'. A request adds
 *                one date or an inclusive range of up to CLOSURE_MAX_DAYS.
 ************************************************************/

import { z } from 'zod'
import { renderedBranchIdSchema } from './branch'

/** The longest range one request may close. */
export const CLOSURE_MAX_DAYS = 31

/** The longest closure name. */
export const CLOSURE_NAME_MAX_LENGTH = 80

/** True for a real calendar date written 'YYYY-MM-DD' (rejects 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return false
  }
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const probe = new Date(Date.UTC(y, m - 1, d))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
}

export const calendarDateSchema = z
  .string()
  .refine(isCalendarDate, 'Date must be a real date in YYYY-MM-DD format')

export const closureCreateSchema = z.object({
  // The branch the form was rendered for (R2.4).
  branchId: renderedBranchIdSchema,
  date: calendarDateSchema,
  // Inclusive; omit to close one day.
  endDate: calendarDateSchema.optional(),
  name: z.string().trim().min(1, 'Give the closure a name.').max(CLOSURE_NAME_MAX_LENGTH),
  // Close every branch. Developer only.
  allBranches: z.boolean().optional(),
})
export type ClosureCreateInput = z.infer<typeof closureCreateSchema>

export const closureListQuerySchema = z.object({
  from: calendarDateSchema.optional(),
  to: calendarDateSchema.optional(),
})
export type ClosureListQuery = z.infer<typeof closureListQuerySchema>

/** A closure as the admin screens show it. */
export type ClosureView = {
  id: string
  date: string
  name: string
  /** Closes every branch, not just this one. */
  allBranches: boolean
  /** The viewer may remove it. */
  canRemove: boolean
}

/** A booking on a newly closed date that still needs moving. */
export type ClosureAffectedBooking = {
  id: string
  bookingNumber: string
  branchName: string
  date: string
  startTime: string
  status: string
  customerName: string
}
