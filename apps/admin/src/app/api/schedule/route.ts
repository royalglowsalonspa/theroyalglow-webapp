/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 29-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|PUT /api/schedule
 * Scope        : API — Admin Schedule at the active branch (multi-branch R5.10)
 *
 * Description  : The active branch's weekly staff schedule. GET returns the
 *                weekly grid; PUT sets a staff member's 7-day week there.
 *
 * Responsibilities :
 * - Return the branch's weekly grid with leave and booking indicators (GET)
 * - Validate and save a staff member's week at the branch (PUT)
 * - Enforce schedule entry business rules (start < end)
 *
 * Features / Functionality :
 * - The branch's own business hours for the editor's time picker (R6.3)
 * - Grid of everyone who works at the branch; a day another branch holds
 *   shows as "elsewhere" with no hours and no branch name
 * - Booking counts are this branch's bookings only
 * - A Manager shared between branches works at one branch per day: a day
 *   another branch holds can't be claimed here (409 SCHEDULE_DAY_ELSEWHERE)
 * - Saving a week takes the person off their bookings still to come that it
 *   no longer covers, at every branch, in the same transaction; PUT answers
 *   how many confirmed ones now need someone else (MS-09)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/branch-context, @/lib/api/error-handler,
 *                @rgss/business, @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Requires min role at the active branch: manager.
 * - Defaults to current week (Sunday start) when weekStart param is absent.
 * - PUT names the branch the page was rendered for (409 after a switch).
 ************************************************************/

import {
  assertValidScheduleEntry,
  dayOfWeekLabel,
  isDayHeldElsewhere,
  scheduleDayForBranch,
} from '@rgss/business'
import {
  getBranchClosures,
  getBranchSettingsForAdmin,
  getScheduleDays,
  getWeeklyScheduleGrid,
  isStaffAtBranch,
  upsertStaffSchedule,
} from '@rgss/db/queries'
import { AppError, badRequest, ERROR_CODES, notFound } from '@rgss/errors'
import { upsertScheduleSchema } from '@rgss/types'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

// The Sunday (week start) of the week containing the given UTC Date, as 'YYYY-MM-DD'.
// dayOfWeek 0=Sun matches the schedule schema, so the grid's 7 dates line up with
// the stored day-of-week rows.
function startOfWeek(date: Date): string {
  const start = new Date(date)
  start.setUTCHours(0, 0, 0, 0)
  start.setUTCDate(start.getUTCDate() - start.getUTCDay())
  return start.toISOString().slice(0, 10)
}

function scheduleConflict(message: string): AppError {
  return new AppError({ code: ERROR_CODES.SCHEDULE_DAY_ELSEWHERE, message, statusCode: 409 })
}

// GET /api/schedule?weekStart=YYYY-MM-DD — the active branch's weekly grid.
// Defaults to the Sunday of the current week when no (valid) weekStart is supplied.
export const GET = withErrorHandler(async (req: Request) => {
  const ctx = await requireBranchRole('manager')
  const branchId = ctx.branch.id

  const { searchParams } = new URL(req.url)
  const weekStartParam = searchParams.get('weekStart')
  const weekStart =
    weekStartParam && /^\d{4}-\d{2}-\d{2}$/.test(weekStartParam)
      ? weekStartParam
      : startOfWeek(new Date())

  // The branch's own opening hours, which the editor's time picker stays
  // within (null when they can't be read). Settings are Developer-only, so the
  // grid gets them here. The week's closures mark the days the branch is shut
  // (R1.8).
  const [grid, settings] = await Promise.all([
    getWeeklyScheduleGrid(branchId, weekStart),
    getBranchSettingsForAdmin(branchId, 1),
  ])
  const firstDay = grid.dates[0]
  const lastDay = grid.dates[grid.dates.length - 1]
  const closures = firstDay && lastDay ? await getBranchClosures(branchId, firstDay, lastDay) : []

  return apiSuccess({
    branchId,
    businessHours: settings?.current.businessHours ?? null,
    closures: closures.map((c) => ({
      date: c.date,
      name: c.name,
      allBranches: c.branchId === null,
    })),
    dates: grid.dates,
    staff: grid.staff.map((row) => ({
      ...row,
      schedule: row.schedule.map((day) => scheduleDayForBranch(day, branchId)),
    })),
  })
})

// PUT /api/schedule — set a staff member's 7-day week at the active branch.
// Each working-day entry is validated (start + end present and start < end)
// before any write; invalid entries fail the whole request with a 400.
export const PUT = withErrorHandler(async (req: Request) => {
  const ctx = await requireBranchRole('manager')

  const body = await req.json().catch(() => null)
  const parsed = upsertScheduleSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }
  assertRenderedBranch(ctx, parsed.data.branchId)
  const branchId = ctx.branch.id
  const { staffId, entries } = parsed.data

  for (const entry of entries) {
    assertValidScheduleEntry(entry)
  }

  // Only someone who works here can be scheduled here (R2.3).
  if (!(await isStaffAtBranch(staffId, branchId))) {
    throw notFound('Staff member not found.')
  }

  // Say which days another branch holds, before trying (R5.10).
  const held = await getScheduleDays(staffId)
  const taken = entries.filter(
    (entry) =>
      entry.isWorking &&
      held.some((day) => day.dayOfWeek === entry.dayOfWeek && isDayHeldElsewhere(day, branchId)),
  )
  if (taken.length > 0) {
    const days = taken.map((entry) => dayOfWeekLabel(entry.dayOfWeek)).join(', ')
    throw scheduleConflict(
      `They already work at another branch on ${days}. Change it there first, or leave the day off here.`,
    )
  }

  const result = await upsertStaffSchedule(staffId, branchId, entries, ctx.session.user.id)
  if (!result.ok) {
    // Another branch took a day, or they stopped working here, meanwhile.
    throw scheduleConflict('Their schedule changed while you were editing. Reload and try again.')
  }

  // Their bookings the new week no longer covers lost them, at every branch,
  // and wait on the dashboard for someone else (MS-09).
  return apiSuccess({ ok: true, reassignments: result.reassignedBookingIds.length })
})
