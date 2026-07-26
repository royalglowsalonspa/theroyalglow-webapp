/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 25-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/availability
 * Scope        : API — Public
 *
 * Description  : Returns available time slots for a given date and branch.
 *                Thin orchestrator: parse → Zod validate → call the pure
 *                generateAvailability business function → standard envelope.
 *
 * Responsibilities :
 * - Validate the `date` (YYYY-MM-DD) and `branchId` query params with Zod
 * - Delegate slot generation + past-date rejection to @rgss/business
 * - Return slot availability for the booking dialog
 *
 * Features / Functionality :
 * - 30-minute slot grid within branch business hours (10:00–21:00)
 * - IST-aware past-date validation (VALIDATION_ERROR 400)
 * - Availability flags for outside-hours, holidays, and past-today slots
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @rgss/business, @rgss/errors,
 *                @rgss/types
 *
 * Notes        :
 * - Public endpoint (no auth).
 * - generateAvailability is pure and throws AppError(400) for past/malformed
 *   dates. Business hours are sourced from the system settings query layer
 *   (per weekday); a closed day flags every slot unavailable. No per-branch
 *   holiday query exists yet, so holidays are not sourced here.
 ************************************************************/

import { generateAvailability } from '@rgss/business'
import { getSettings } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { availabilityQuerySchema, type DayHours } from '@rgss/types'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

// Weekday index (Date.getUTCDay: 0=Sun … 6=Sat) → the DayKey used by the
// business-hours settings object.
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

// "HH:MM" → minutes since midnight.
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':')
  return Number(h) * 60 + Number(m)
}

// Resolve the open/close window (in minutes since midnight) for a "YYYY-MM-DD"
// calendar date from the configured weekday hours. A closed day (or a day
// missing open/close) collapses to an empty window so every slot is flagged
// unavailable.
function resolveBusinessHours(
  date: string,
  hoursByDay: Record<(typeof DAY_KEYS)[number], DayHours>,
): { openMinutes: number; closeMinutes: number } {
  const [yPart, moPart, dPart] = date.split('-')
  const weekday = new Date(Date.UTC(Number(yPart), Number(moPart) - 1, Number(dPart))).getUTCDay()
  const dayKey = DAY_KEYS[weekday] ?? 'mon'
  const day = hoursByDay[dayKey]

  if (day.closed || day.open === null || day.close === null) {
    return { openMinutes: 0, closeMinutes: 0 }
  }

  return { openMinutes: timeToMinutes(day.open), closeMinutes: timeToMinutes(day.close) }
}

export const GET = withErrorHandler(async (req: Request) => {
  const { searchParams } = new URL(req.url)
  const parsed = availabilityQuerySchema.safeParse({
    date: searchParams.get('date') ?? undefined,
    branchId: searchParams.get('branchId') ?? undefined,
  })

  if (!parsed.success) {
    throw badRequest('Invalid availability query', parsed.error.flatten().fieldErrors)
  }

  // Load the configured business hours from the settings query layer and map
  // the requested weekday's open/close window for slot flagging.
  const { businessHours } = await getSettings()
  const dayHours = resolveBusinessHours(parsed.data.date, businessHours)

  // Pure business function: rejects past/malformed dates (400) before
  // generating the 30-minute slot grid with availability flags.
  const slots = generateAvailability({
    date: parsed.data.date,
    businessHours: dayHours,
  })

  return apiSuccess({ slots })
})
