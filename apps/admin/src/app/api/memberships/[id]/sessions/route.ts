/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/memberships/[id]/sessions
 * Scope        : API — Admin Membership
 *
 * Description  : Starts a SPA membership session now ("Record now"), or books
 *                one ahead, at the active branch. Record now writes an
 *                in-progress booking started now; booking ahead writes a
 *                confirmed booking for its date and start time, which reception
 *                starts from the booking when the member arrives. Either way
 *                the database holds its minutes from the membership until it
 *                is completed (POST /api/bookings/[id]/complete), which consumes
 *                them and issues the ₹0 session invoice, or cancelled, which
 *                gives them back (membership-scheduling.md).
 *
 * Responsibilities :
 * - Validate membership state and enough free minutes (advisory; the write
 *   re-checks): now for Record now, at the planned start for a booking ahead
 * - A booking ahead: the branch open that day, the time within its hours on
 *   the half-hour grid and still to come, as the counter books
 * - Create the booking with its -M suffix number; the database holds its
 *   minutes in the same transaction
 * - Replay a retried request (same idempotency key) instead of writing twice
 *
 * Features / Functionality :
 * - Session guard (active, valid then, enough free minutes)
 * - Multi-service sessions, all done by one person, who is required and
 *   must be free then: not booked then, not still with another customer now,
 *   not on leave, and for a booking ahead scheduled then (0028, 0032)
 * - Booking number with -M membership suffix
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/branch-context,
 *                @rgss/business, @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Receptionist or above at the active branch, which performs the session
 *   (multi-branch R9); the body names the branch the form was rendered for.
 *   The hours are shared, so any branch may use them; assigned staff must work
 *   at the active branch.
 * - Without `startTime` the session starts now and takes today's date; a past
 *   session waits for the audited correction workflow (MS-11).
 * - No gems are earned on membership sessions.
 ************************************************************/

import {
  addMinutesToTime,
  appointmentStartsAt,
  assertBranchOpenOn,
  assertServicesOfferedAt,
  assertSessionBookable,
  assertSessionRecordable,
  assertSlotBookable,
  generateBookingNumber,
  isSameSessionRequest,
  type SessionLine,
  sessionAssignee,
  staffClosureHint,
} from '@rgss/business'
import {
  assigneeRefusalMessage,
  getBranchByIdAdmin,
  getBranchPolicy,
  getClosureOn,
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
// started on this membership. Null when the key hasn't started one. A key
// reused for a different session is a conflict, never a second hold.
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
    const { bookingDate, idempotencyKey } = parsed.data
    // With a start time the session is booked ahead; without one it starts now.
    const plannedTime = parsed.data.startTime
    const ahead = plannedTime !== undefined
    // One person does the whole session, so they're needed up front (0028):
    // every line is theirs.
    const staffId = sessionAssignee(parsed.data.staffId, parsed.data.services)
    const sessionServices = parsed.data.services.map((s) => ({ ...s, staffId }))

    const membership = await getMembershipById(id)
    if (!membership) {
      throw notFound('Membership not found.')
    }

    // A retry of a session already written gets that session back, before the
    // balance check: the first attempt may have held the last hours.
    if (idempotencyKey) {
      const replayed = await replaySession(id, idempotencyKey, sessionServices)
      if (replayed) {
        return apiSuccess(replayed)
      }
    }

    // Record now takes today's date (IST). Recording a past session waits for
    // the audited correction workflow (MS-11).
    const now = new Date()
    const istNow = new Date(now.getTime() + IST_OFFSET_MS)
    const today = istNow.toISOString().slice(0, 10)
    if (!ahead && bookingDate !== undefined && bookingDate !== today) {
      throw badRequest(
        "A session recorded now takes today's date. To book one ahead, choose its start time.",
      )
    }
    // The schema requires a booking ahead's date.
    const sessionDay = ahead ? (bookingDate ?? today) : today
    const plannedStart = ahead ? appointmentStartsAt(sessionDay, plannedTime) : null
    if (plannedStart && Number.isNaN(plannedStart.getTime())) {
      throw badRequest('Choose a valid date and time.')
    }

    // Total minutes requested across all service lines. Check the membership
    // state and free minutes up front for specific errors (409
    // MEMBERSHIP_EXPIRED / MEMBERSHIP_NOT_STARTED / MEMBERSHIP_INSUFFICIENT_HOURS):
    // now, or at the planned start of a booking ahead. This read can be stale;
    // the database re-checks when it holds the minutes.
    const totalMinutes = sessionServices.reduce((sum, s) => sum + s.durationMinutes, 0)
    if (plannedStart) {
      assertSessionBookable(membership, totalMinutes, plannedStart)
    } else {
      assertSessionRecordable(membership, totalMinutes)
    }

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
    // Every service must be offered at the branch (R4.3); the database
    // refuses the same.
    assertServicesOfferedAt(services, branch)

    // A booking ahead is at a time the branch takes bookings, as the counter
    // books (R1.8, R6.3): open that day, within its hours on the half-hour
    // grid, and still to come. The revision that accepted it is recorded.
    let settingsRevision: number | null = null
    if (ahead && plannedStart) {
      const [closure, policy] = await Promise.all([
        getClosureOn(branch.id, sessionDay),
        getBranchPolicy(branch.id),
      ])
      assertBranchOpenOn(closure, branch.name, sessionDay, staffClosureHint(ctx.branch.role))
      if (!policy) {
        throw notFound('Branch not found.')
      }
      assertSlotBookable(policy, {
        date: sessionDay,
        startTime: plannedTime,
        durationMinutes: totalMinutes,
        now,
        actor: 'staff',
        branchName: branch.name,
      })
      if (plannedStart.getTime() <= now.getTime()) {
        throw conflict(
          ERROR_CODES.BOOKING_SLOT_UNAVAILABLE,
          'That time has passed. Choose a later time, or record the session now.',
        )
      }
      settingsRevision = policy.revision
    }

    // The person must work at this branch (R2.3); then snapshot their name.
    if (!(await isStaffAtBranch(staffId, branch.id))) {
      throw badRequest(`Choose staff who work at ${branch.name}.`)
    }
    const staffNames = await getStaffNamesByIds([staffId])
    const staffName = staffNames.find((s) => s.id === staffId)?.name ?? null

    // Record now runs from now (IST) for the requested minutes; a booking
    // ahead from its planned start.
    const startTime =
      plannedTime ??
      `${String(istNow.getUTCHours()).padStart(2, '0')}:${String(istNow.getUTCMinutes()).padStart(
        2,
        '0',
      )}`
    const endTime = addMinutesToTime(startTime, totalMinutes)
    const sessionDate = new Date(`${sessionDay}T00:00:00.000Z`)

    // Membership-session booking number: SPA, with the -M membership suffix.
    const bookingNumber = generateBookingNumber(branch.code, 'spa', sessionDate, true)

    const result = await recordMembershipSession({
      membershipId: id,
      bookingNumber,
      branchId: branch.id,
      customerId: membership.customerId,
      bookingDate: sessionDate,
      startTime,
      endTime,
      services: sessionServices.map((s) => ({
        serviceId: s.serviceId,
        staffId,
        serviceNameSnapshot: serviceById.get(s.serviceId)?.name ?? 'Service',
        staffNameSnapshot: staffName,
        durationMinutes: s.durationMinutes,
      })),
      idempotencyKey: idempotencyKey ?? null,
      recordedById: ctx.session.user.id,
      when: ahead ? 'ahead' : 'now',
      settingsRevision,
    })

    if (!result.ok && result.reason === 'staff') {
      // The database refused the person: booked then, still with another
      // customer, on leave, not scheduled then or no longer at the branch.
      // Nothing was written.
      throw conflict(
        result.refusal === 'booked' || result.refusal === 'working'
          ? ERROR_CODES.STAFF_BUSY
          : ERROR_CODES.CONFLICT,
        assigneeRefusalMessage(result.refusal),
      )
    }
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
      // The database refused the hold: the membership changed after it was
      // read. Re-read it so the error says why; nothing was written.
      const current = await getMembershipById(id)
      if (!current) {
        throw notFound('Membership not found.')
      }
      if (plannedStart) {
        assertSessionBookable(current, totalMinutes, plannedStart)
      } else {
        assertSessionRecordable(current, totalMinutes)
      }
      throw conflict(
        ERROR_CODES.MEMBERSHIP_INSUFFICIENT_HOURS,
        'The membership changed while this session was being recorded. Refresh and try again.',
      )
    }

    return apiSuccess(
      {
        booking: result.booking,
        invoice: null,
        remainingMinutes: result.remainingMinutes,
        duplicate: false,
      },
      undefined,
      201,
    )
  },
)
