/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|PUT /api/schedule
 * Scope        : API — Admin Schedule
 *
 * Description  : Admin staff schedule management. GET returns the weekly grid;
 *                PUT upserts a staff member's 7-day schedule.
 *
 * Responsibilities :
 * - Return weekly staff availability grid with conflicts (GET)
 * - Validate and upsert staff schedule entries (PUT)
 * - Enforce schedule entry business rules (start < end)
 *
 * Features / Functionality :
 * - Weekly schedule grid (7 days, all active staff)
 * - Approved leave and booking conflict indicators
 * - Full schedule upsert for a staff member (7 day entries)
 * - Schedule entry validation (working hours logic)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/business,
 *                @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Requires min role: manager.
 * - Defaults to current week (Sunday start) when weekStart param is absent.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { assertValidScheduleEntry } from '@rgss/business'
import { getWeeklyScheduleGrid, upsertStaffSchedule } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { upsertScheduleSchema } from '@rgss/types'

// The Sunday (week start) of the week containing the given UTC Date, as 'YYYY-MM-DD'.
// dayOfWeek 0=Sun matches the schedule schema, so the grid's 7 dates line up with
// the stored day-of-week rows.
function startOfWeek(date: Date): string {
  const start = new Date(date)
  start.setUTCHours(0, 0, 0, 0)
  start.setUTCDate(start.getUTCDate() - start.getUTCDay())
  return start.toISOString().slice(0, 10)
}

// GET /api/schedule?weekStart=YYYY-MM-DD — the weekly staff availability grid.
// Defaults to the Sunday of the current week when no (valid) weekStart is supplied.
// getWeeklyScheduleGrid computes and returns the 7 consecutive dates (`dates`) plus
// each active staff member's schedule, approved leave, and confirmed booking counts.
export const GET = withErrorHandler(async (req: Request) => {
  await requireRole('manager')

  const { searchParams } = new URL(req.url)
  const weekStartParam = searchParams.get('weekStart')
  const weekStart =
    weekStartParam && /^\d{4}-\d{2}-\d{2}$/.test(weekStartParam)
      ? weekStartParam
      : startOfWeek(new Date())

  const grid = await getWeeklyScheduleGrid(weekStart)

  return apiSuccess(grid)
})

// PUT /api/schedule — upsert a staff member's 7-day weekly schedule. Each
// working-day entry is validated (start + end present and start < end) before any
// write; invalid entries fail the whole request with a 400.
export const PUT = withErrorHandler(async (req: Request) => {
  await requireRole('manager')

  const body = await req.json().catch(() => null)
  const parsed = upsertScheduleSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }

  for (const entry of parsed.data.entries) {
    assertValidScheduleEntry(entry)
  }

  await upsertStaffSchedule(parsed.data.staffId, parsed.data.entries)

  return apiSuccess({ ok: true })
})
