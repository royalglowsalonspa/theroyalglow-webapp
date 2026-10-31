/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|POST /api/staff
 * Scope        : API — Staff at the active branch (multi-branch R1.11)
 *
 * Description  : GET returns the active branch's staff for assignment pickers
 *                (booking approval, staff assignment, schedules, Record now),
 *                each saying why they can't take the slot asked about, if
 *                they can't. POST adds a person, chosen with the people
 *                search, as a Stylist or Therapist at the active branch:
 *                role, profile, branch and audit entry in one transaction.
 *
 * Responsibilities :
 * - GET: the active branch's working staff (id, name, designation) — Receptionist+
 * - GET with a slot: each person's busy reason (membership-scheduling.md
 *   slice 2b): on leave, booked then, or still with another customer
 * - POST: Add staff through the shared role-change path — Manager of the
 *   branch, its Owner or the Developer
 *
 * Features / Functionality :
 * - GET  → { branchId, staff: [{ id, name, designation }] }
 * - GET ?booking=<id> → that booking's own slot; ?minutes=<n>&kind=<salon|spa>
 *   → a slot starting now (IST), or at &date=<YYYY-MM-DD>&start=<HH:MM> for
 *   a session booked ahead: staff rows add `busy`
 * - POST { branchId, userId, designation, specialization? } → 201 { changed }
 * - Re-adding a removed person reactivates their earlier profile
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/branch-context, @/lib/api/branch-roles,
 *                @/lib/api/error-handler, @rgss/business, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        : `branchId` in POST is the branch the page was rendered for
 *                (409 BRANCH_CONTEXT_CHANGED after a switch). Managers add
 *                only Stylists and Therapists; the Receptionist and Manager
 *                are chosen in Users & Roles. A busy reason explains; the
 *                database still decides when the booking is written. A
 *                booking at another branch is not found (R2.3).
 ************************************************************/

import { addMinutesToTime } from '@rgss/business'
import {
  type AvailabilitySlot,
  getActiveStaffAtBranch,
  getBookingForAdmin,
  getStaffAvailability,
} from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { staffAddSchema, staffAvailabilityQuerySchema } from '@rgss/types'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { changeBranchRole } from '@/lib/api/branch-roles'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

// A slot starting now (IST) for `minutes`, of `kind`.
function slotFromNow(minutes: number, kind: 'salon' | 'spa'): AvailabilitySlot {
  const istNow = new Date(Date.now() + IST_OFFSET_MS)
  const startTime = `${String(istNow.getUTCHours()).padStart(2, '0')}:${String(
    istNow.getUTCMinutes(),
  ).padStart(2, '0')}`
  return {
    dateISO: istNow.toISOString().slice(0, 10),
    startTime,
    endTime: addMinutesToTime(startTime, minutes),
    kind,
  }
}

// The active branch's staff for the assignment pickers. Receptionist+.
export const GET = withErrorHandler(async (req: Request) => {
  const ctx = await requireBranchRole('receptionist')
  const branchId = ctx.branch.id

  const parsed = staffAvailabilityQuerySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  )
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }
  const query = parsed.data

  let slot: AvailabilitySlot | null = null
  if (query.booking !== undefined) {
    const found = await getBookingForAdmin(query.booking, branchId)
    if (!found) {
      throw notFound('Booking not found.')
    }
    slot = {
      dateISO: found.bookingDate.toISOString().slice(0, 10),
      startTime: found.startTime,
      endTime: found.endTime,
      kind: found.serviceType,
      excludeBookingId: found.id,
    }
  } else if (query.minutes !== undefined && query.kind !== undefined) {
    // A session booked ahead asks about its own date and start (IST).
    slot =
      query.date !== undefined && query.start !== undefined
        ? {
            dateISO: query.date,
            startTime: query.start,
            endTime: addMinutesToTime(query.start, query.minutes),
            kind: query.kind,
          }
        : slotFromNow(query.minutes, query.kind)
  }

  if (!slot) {
    const rows = await getActiveStaffAtBranch(branchId)
    const staff = rows.map((s) => ({ id: s.id, name: s.name, designation: s.designation }))
    return apiSuccess({ branchId, staff })
  }

  const people = await getStaffAvailability({ branchId, slot })
  const staff = people.map((p) => ({
    id: p.id,
    name: p.name,
    designation: p.designation,
    busy: p.busy,
  }))
  return apiSuccess({ branchId, staff })
})

// POST /api/staff — add a Stylist or Therapist at the active branch.
export const POST = withErrorHandler(async (req: Request) => {
  const ctx = await requireBranchRole('manager')

  const body = await req.json().catch(() => null)
  const parsed = staffAddSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }
  assertRenderedBranch(ctx, parsed.data.branchId)

  const { branchId, userId, designation, specialization } = parsed.data
  const result = await changeBranchRole(ctx.session.user.id, {
    kind: 'add_staff',
    branchId,
    userId,
    designation,
    ...(specialization === undefined ? {} : { specialization }),
  })
  return apiSuccess({ changed: result.changed, liveUpdates: result.liveUpdates }, undefined, 201)
})
