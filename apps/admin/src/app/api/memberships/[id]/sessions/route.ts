/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/memberships/[id]/sessions
 * Scope        : API — Admin Membership
 *
 * Description  : Records a SPA membership session, deducting hours from the
 *                membership and creating a ₹0 booking + session invoice.
 *
 * Responsibilities :
 * - Validate membership state and sufficient remaining hours
 * - Create completed booking with -M suffix number
 * - Deduct session hours from membership balance (guarded in the write)
 * - Generate ₹0 session invoice for audit trail
 * - Replay a retried request (same idempotency key) instead of recording twice
 *
 * Features / Functionality :
 * - Session recordability guard (active, not expired, enough hours)
 * - Multi-service session recording with staff assignment
 * - ₹0 membership_session invoice generation
 * - Booking number with -M membership suffix
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/business,
 *                @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Receptionist or above at the active branch, which performs the session
 *   (multi-branch R9); the body names the branch the form was rendered for.
 *   The hours are shared, so any branch may use them; assigned staff must work
 *   at the active branch.
 * - No gems earned on membership sessions.
 * - Booking is created directly as completed (skip pending/confirmed).
 ************************************************************/

import {
  addMinutesToTime,
  assertSessionRecordable,
  generateBookingNumber,
  generateInvoiceNumber,
  isSameSessionRequest,
  type SessionLine,
} from '@rgss/business'
import {
  getBranchByIdAdmin,
  getMembershipById,
  getMembershipSessionByKey,
  getServicesByIds,
  getStaffNamesByIds,
  isStaffAtBranch,
  recordMembershipSession,
} from '@rgss/db/queries'
import { badRequest, conflict, ERROR_CODES, notFound } from '@rgss/errors'
import { recordSessionSchema } from '@rgss/types'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

// Answer a retried request with the session its idempotency key already
// recorded on this membership. Null when the key hasn't recorded one. A key
// reused for a different session is a conflict, never a second deduction.
async function replaySession(
  membershipId: string,
  idempotencyKey: string,
  requested: readonly SessionLine[],
) {
  const recorded = await getMembershipSessionByKey(membershipId, idempotencyKey)
  if (!recorded) {
    return null
  }
  if (!isSameSessionRequest(requested, recorded.services)) {
    throw conflict(
      ERROR_CODES.CONFLICT,
      'This request was already used to record a different session. Close the form, open it again and retry.',
    )
  }
  return {
    booking: recorded.booking,
    invoice: recorded.invoice,
    remainingMinutes: recorded.remainingMinutes,
    duplicate: true,
  }
}

export const POST = withErrorHandler(
  async (req: Request, route: { params: Promise<{ id: string }> }) => {
    const ctx = await requireBranchRole('receptionist')
    const { id } = await route.params

    const body = await req.json().catch(() => null)
    const parsed = recordSessionSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }
    assertRenderedBranch(ctx, parsed.data.branchId)
    const { services: sessionServices, bookingDate, idempotencyKey } = parsed.data

    const membership = await getMembershipById(id)
    if (!membership) {
      throw notFound('Membership not found.')
    }

    // A retry of a session that already went through gets that session back,
    // before the balance check: the first attempt may have spent the last hours.
    if (idempotencyKey) {
      const replayed = await replaySession(id, idempotencyKey, sessionServices)
      if (replayed) {
        return apiSuccess(replayed)
      }
    }

    // Total minutes requested across all service lines. Check the membership
    // state and remaining hours up front for specific errors (409
    // MEMBERSHIP_EXPIRED / MEMBERSHIP_INSUFFICIENT_HOURS). This read can be
    // stale; the guarded write re-checks all three when it runs.
    const totalMinutes = sessionServices.reduce((sum, s) => sum + s.durationMinutes, 0)
    assertSessionRecordable(membership, totalMinutes)

    // Resolve and validate the requested services, then snapshot their names.
    const uniqueServiceIds = [...new Set(sessionServices.map((s) => s.serviceId))]
    const services = await getServicesByIds(uniqueServiceIds)
    if (services.length !== uniqueServiceIds.length) {
      throw badRequest('One or more selected services do not exist.')
    }
    const serviceById = new Map(services.map((s) => [s.id, s]))

    // The active branch performs the session; one that isn't operational takes
    // no new sessions (R1.10).
    const branch = await getBranchByIdAdmin(ctx.branch.id)
    if (!branch) {
      throw notFound('Branch not found.')
    }
    if (branch.status !== 'operational') {
      throw badRequest(`${branch.name} is not taking sessions right now.`)
    }

    // Assigned staff must work at this branch (R2.3); then snapshot their names.
    const staffIds = [
      ...new Set(
        sessionServices.map((s) => s.staffId).filter((sid): sid is string => Boolean(sid)),
      ),
    ]
    const atBranch = await Promise.all(staffIds.map((sid) => isStaffAtBranch(sid, branch.id)))
    if (atBranch.includes(false)) {
      throw badRequest(`Choose staff who work at ${branch.name}.`)
    }
    const staffNames = await getStaffNamesByIds(staffIds)
    const staffNameById = new Map(staffNames.map((s) => [s.id, s.name]))

    const now = new Date()
    // Default booking date to today (IST) when not supplied.
    const istNow = new Date(now.getTime() + IST_OFFSET_MS)
    const bookingDateStr = bookingDate ?? istNow.toISOString().slice(0, 10)
    const startTime = `${String(istNow.getUTCHours()).padStart(2, '0')}:${String(
      istNow.getUTCMinutes(),
    ).padStart(2, '0')}`
    const endTime = addMinutesToTime(startTime, totalMinutes)

    // Membership-session booking number: SPA, with the -M membership suffix.
    const bookingNumber = generateBookingNumber(
      branch.code,
      'spa',
      new Date(`${bookingDateStr}T00:00:00.000Z`),
      true,
    )

    const result = await recordMembershipSession({
      membershipId: id,
      bookingNumber,
      branchId: branch.id,
      customerId: membership.customerId,
      bookingDate: new Date(`${bookingDateStr}T00:00:00.000Z`),
      startTime,
      endTime,
      invoiceNumber: generateInvoiceNumber(branch.number, now),
      services: sessionServices.map((s) => ({
        serviceId: s.serviceId,
        staffId: s.staffId ?? null,
        serviceNameSnapshot: serviceById.get(s.serviceId)?.name ?? 'Service',
        staffNameSnapshot: s.staffId ? (staffNameById.get(s.staffId) ?? null) : null,
        durationMinutes: s.durationMinutes,
      })),
      idempotencyKey: idempotencyKey ?? null,
    })

    if (!result.ok) {
      if (result.reason === 'duplicate_key') {
        // A concurrent request with the same key committed first.
        const replayed = idempotencyKey
          ? await replaySession(id, idempotencyKey, sessionServices)
          : null
        if (replayed) {
          return apiSuccess(replayed)
        }
        throw conflict(
          ERROR_CODES.CONFLICT,
          'This request was already used. Close the form, open it again and retry.',
        )
      }
      // The guard matched no row: the membership changed after it was read.
      // Re-read it so the error says why; nothing was written.
      const current = await getMembershipById(id)
      if (!current) {
        throw notFound('Membership not found.')
      }
      assertSessionRecordable(current, totalMinutes)
      throw conflict(
        ERROR_CODES.MEMBERSHIP_INSUFFICIENT_HOURS,
        'The membership changed while this session was being recorded. Refresh and try again.',
      )
    }

    return apiSuccess(
      {
        booking: result.booking,
        invoice: result.invoice,
        remainingMinutes: result.remainingMinutes,
        duplicate: false,
      },
      undefined,
      201,
    )
  },
)
