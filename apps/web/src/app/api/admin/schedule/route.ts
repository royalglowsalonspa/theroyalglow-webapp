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

// GET /api/admin/schedule?weekStart=YYYY-MM-DD — the weekly staff availability grid.
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

// PUT /api/admin/schedule — upsert a staff member's 7-day weekly schedule. Each
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
