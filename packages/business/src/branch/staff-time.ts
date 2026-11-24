/************************************************************
 * Module Name  : branch/staff-time
 * Scope        : Business Logic — Leave and weekly schedules per branch
 *                (multi-branch R5.10)
 *
 * Description  : Who may decide a leave request at a branch, and which
 *                weekdays of a person's weekly schedule belong to which
 *                branch. Pure: callers read the rows, these decide.
 *
 * Rules :
 * - Nobody decides their own leave.
 * - A Manager's leave is decided by an Owner of one of their branches or the
 *   Developer; the route only lists leave of people at the active branch, so
 *   "Owner here" is that Owner.
 * - Ordinary staff leave: the route's minimum role (Receptionist or above).
 * - One schedule row per weekday. A working row belongs to the branch it
 *   names; a day off belongs to nobody. A Manager shared between branches is
 *   therefore at one branch per day, and one branch can't take a day another
 *   branch holds.
 *
 * Layer        : Business Logic (pure, no I/O)
 ************************************************************/

import { type BranchRole, branchRoleLevel } from './access'
import type { PerformingRole } from './roles'

export type LeaveDecider = { userId: string; role: BranchRole }
/** The person whose leave it is, with the role their staff profile grants. */
export type LeaveSubject = { userId: string; roleWitness: PerformingRole | null }

export type LeaveDecisionRefusal = {
  code: 'own_leave' | 'manager_leave'
  reason: string
}

/** Why `actor` may not decide `subject`'s leave, or null when they may. */
export function leaveDecisionRefusal(
  actor: LeaveDecider,
  subject: LeaveSubject,
): LeaveDecisionRefusal | null {
  if (actor.userId === subject.userId) {
    return { code: 'own_leave', reason: "You can't decide your own leave." }
  }
  if (subject.roleWitness === 'manager' && branchRoleLevel(actor.role) < branchRoleLevel('owner')) {
    return {
      code: 'manager_leave',
      reason: "A Manager's leave is decided by the branch's Owner or the Developer.",
    }
  }
  return null
}

/** The schedule columns these rules read. */
export type ScheduleDay = { isWorking: boolean; branchId: string | null }

/**
 * True when the weekday is a working day at another branch: this branch can
 * neither see its hours nor claim it.
 */
export function isDayHeldElsewhere(day: ScheduleDay, branchId: string): boolean {
  return day.isWorking && day.branchId !== null && day.branchId !== branchId
}

/** A weekday as one branch sees it: its own hours, or "at another branch". */
export type BranchScheduleDay<
  T extends ScheduleDay & { startTime: string | null; endTime: string | null },
> =
  | (Omit<T, 'branchId'> & { elsewhere: false })
  | (Omit<T, 'branchId'> & { isWorking: false; startTime: null; endTime: null; elsewhere: true })

/**
 * One branch's view of a schedule row. A day held by another branch keeps its
 * weekday but loses its hours, and never says which branch holds it.
 */
export function scheduleDayForBranch<
  T extends ScheduleDay & { startTime: string | null; endTime: string | null },
>(day: T, branchId: string): BranchScheduleDay<T> {
  const { branchId: _held, ...rest } = day
  if (isDayHeldElsewhere(day, branchId)) {
    return { ...rest, isWorking: false, startTime: null, endTime: null, elsewhere: true }
  }
  return { ...rest, elsewhere: false }
}
