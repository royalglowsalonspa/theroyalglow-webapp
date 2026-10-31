/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/availability
 * Scope        : API — Public
 *
 * Description  : Returns the time slots a customer can request on a date at a
 *                branch. Thin orchestrator: parse → Zod validate → check the
 *                branch → read its booking settings → call the pure
 *                generateAvailability business function → standard envelope.
 *
 * Responsibilities :
 * - Validate the `date` (YYYY-MM-DD) and optional `branchId` and
 *   `durationMinutes` query params (with a duration, slots it would run past
 *   closing from are unavailable)
 * - Confirm the branch is taking bookings (the default branch when none is named)
 * - Use the branch's own opening hours, lead time and booking window (R6.3)
 * - Say why a day has no slots: a holiday or closure, a weekday the branch is
 *   closed, or a date beyond its booking window
 *
 * Features / Functionality :
 * - 30-minute slot grid across the branch's opening hours that day
 * - IST-aware past-date validation (VALIDATION_ERROR 400)
 * - Slots starting sooner than the branch's lead time are unavailable
 * - Response: { slots, closure: { name } | null, notice: string | null }
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @rgss/business, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Public endpoint (no auth).
 * - `branchId` is optional. Without it the slots are for the default bookable
 *   branch (the `defaultBranchId` of GET /api/branches), so a client that
 *   predates the booking dialog's branch picker still works. Requiring it
 *   made every request from the old dialog fail with 400, blocking all online
 *   bookings. A named branch must exist ("Branch not found.") and be
 *   operational ("Selected branch is not accepting bookings."), the same
 *   checks and messages as POST /api/bookings.
 * - A branch without readable booking settings answers 409
 *   BRANCH_SETTINGS_INCOMPLETE; nothing falls back to defaults.
 * - The slots are a request grid, not a promise of free staff (R7.1).
 ************************************************************/

import {
  dayRefusal,
  generateAvailability,
  isBranchBookable,
  openWindowOn,
  resolveDefaultBranch,
} from '@rgss/business'
import { getBranchById, getBranchPolicy, getClosureOn, getPublicBranches } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { availabilityQuerySchema } from '@rgss/types'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

// The branch to offer slots for, or a 400 when there is none. A request that
// names no branch is answered for the default bookable branch.
async function assertBookableBranch(branchId: string | undefined): Promise<string> {
  if (branchId === undefined) {
    const fallback = resolveDefaultBranch(await getPublicBranches())
    if (!fallback) {
      throw badRequest('No branch is taking bookings right now.')
    }
    return fallback.id
  }

  const branch = await getBranchById(branchId)
  if (!branch) {
    throw badRequest('Branch not found.')
  }
  if (!isBranchBookable(branch.status)) {
    throw badRequest('Selected branch is not accepting bookings.')
  }
  return branch.id
}

export const GET = withErrorHandler(async (req: Request) => {
  const { searchParams } = new URL(req.url)
  const parsed = availabilityQuerySchema.safeParse({
    date: searchParams.get('date') ?? undefined,
    branchId: searchParams.get('branchId') ?? undefined,
    durationMinutes: searchParams.get('durationMinutes') ?? undefined,
  })

  if (!parsed.success) {
    throw badRequest('Invalid availability query', parsed.error.flatten().fieldErrors)
  }
  const { date, durationMinutes } = parsed.data

  const branchId = await assertBookableBranch(parsed.data.branchId)
  // The branch's own hours and booking rules, and a holiday or one-off
  // closure that shuts it that day (R1.8): independent reads.
  const [policy, closure] = await Promise.all([
    getBranchPolicy(branchId),
    getClosureOn(branchId, date),
  ])
  if (!policy) {
    throw badRequest('Branch not found.')
  }

  // A weekday the branch is closed, or a date beyond its booking window, has
  // no slots; the notice says why. A past or malformed date is still a 400
  // from generateAvailability.
  const now = new Date()
  const notice = dayRefusal(policy, {
    date,
    now,
    actor: 'customer',
    branchName: policy.branchName,
  })
  const slots = generateAvailability({
    date,
    now,
    holidays: closure ? [date] : [],
    businessHours: notice === null ? openWindowOn(policy.businessHours, date) : null,
    leadTimeMinutes: policy.bookingRules.minAdvanceLeadTimeMinutes,
    ...(durationMinutes === undefined ? {} : { durationMinutes }),
  })

  return apiSuccess({
    slots,
    closure: closure ? { name: closure.name } : null,
    notice,
  })
})
