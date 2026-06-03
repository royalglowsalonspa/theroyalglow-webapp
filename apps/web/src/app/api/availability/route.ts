/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/availability
 * Scope        : API — Public
 *
 * Description  : Returns available time slots for a given date. Generates
 *                30-minute slots from 10:00–20:30 IST with availability flags.
 *
 * Responsibilities :
 * - Validate the requested date parameter (format, past-date rejection)
 * - Generate static 30-minute time slots for the business hours
 * - Return slot availability for the booking dialog
 *
 * Features / Functionality :
 * - 30-minute slot generation (10:00–21:00 window)
 * - IST-aware past-date validation
 * - YYYY-MM-DD format enforcement
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @rgss/errors
 *
 * Notes        :
 * - Currently returns all slots as available (static schedule).
 * - Will integrate with booking + staff_schedule tables for real availability.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { badRequest } from '@rgss/errors'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// Static schedule: 30-min slots from 10:00 to 20:30 (last slot ends 21:00).
const OPEN_MINUTES = 10 * 60 // 10:00
const LAST_SLOT_START_MINUTES = 20 * 60 + 30 // 20:30
const SLOT_DURATION_MINUTES = 30

function toTimeString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

// Current calendar date in IST (UTC+5:30), as YYYY-MM-DD.
function todayInIST(): string {
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  return istNow.toISOString().slice(0, 10)
}

export const GET = withErrorHandler(async (req: Request) => {
  const date = new URL(req.url).searchParams.get('date')

  if (!date) {
    throw badRequest('Query parameter "date" is required (YYYY-MM-DD).')
  }
  if (!DATE_PATTERN.test(date)) {
    throw badRequest('Query parameter "date" must be in YYYY-MM-DD format.')
  }

  // Validate it is a real calendar date.
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw badRequest('Query parameter "date" is not a valid date.')
  }

  // Reject dates in the past (compared against today in IST).
  if (date < todayInIST()) {
    throw badRequest('Cannot fetch availability for a past date.')
  }

  const slots: { startTime: string; endTime: string; available: boolean }[] = []
  for (let start = OPEN_MINUTES; start <= LAST_SLOT_START_MINUTES; start += SLOT_DURATION_MINUTES) {
    slots.push({
      startTime: toTimeString(start),
      endTime: toTimeString(start + SLOT_DURATION_MINUTES),
      available: true,
    })
  }

  return apiSuccess({ slots })
})
