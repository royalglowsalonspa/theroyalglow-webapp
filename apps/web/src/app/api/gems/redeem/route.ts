/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/gems/redeem
 * Scope        : API — Customer Loyalty (Gems Redemption)
 *
 * Description  : Executes an online gems redemption. Spends the authenticated
 *                customer's gems to create a ₹0 booking for exactly one
 *                redeemable service at a chosen date + slot.
 *
 * Responsibilities :
 * - Authenticate the caller and resolve their loyalty account from the session
 * - Validate the request body (Zod) and re-validate the service against live data
 * - Short-circuit an idempotency replay BEFORE the affordability gate
 * - Enforce eligibility + affordability via the pure business gate
 * - Delegate the guarded, atomic, idempotent write to the data-access layer
 *
 * Features / Functionality :
 * - Server-side gemsRequired (client gems amount is never accepted/trusted)
 * - The branch's hours, lead time, booking window and per-customer booking
 *   limit decide the slot, as for any booking; the booking records the
 *   settings revision (R6.3)
 * - Idempotency replay returns the original booking (200, deducted once), even
 *   once the remaining balance no longer covers the cost
 *
 * Ordering (load-bearing) :
 *   requireSession → Zod → customer-scoped replay lookup → assertRedeemable
 * The replay lookup sits after auth + validation so no unauthenticated or
 * malformed request reaches the database, and before the balance gate so a retry
 * of an already-successful redemption is never answered with 409.
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/business,
 *                @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        :
 * - The account is resolved from the session, never from client-supplied ids.
 * - The SERVER-side gemsRequired is passed to the write; any client value is ignored.
 ************************************************************/

import {
  addMinutesToTime,
  assertBookingCap,
  assertBranchOpenOn,
  assertRedeemable,
  assertServicesOfferedAt,
  assertSlotBookable,
  generateBookingNumber,
  istToday,
} from '@rgss/business'
import {
  countUpcomingBookingsAtBranch,
  findBookingByRedemptionKey,
  getBranchById,
  getBranchPolicy,
  getClosureOn,
  getDefaultStaffForService,
  getLoyaltySummary,
  getOrCreateLoyaltyAccount,
  getRedeemableServiceById,
  redeemServiceWithGems,
} from '@rgss/db/queries'
import { AppError, badRequest, ERROR_CODES, notFound } from '@rgss/errors'
import { type RedeemGemsInput, redeemGemsSchema } from '@rgss/types'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireOnboardedCustomer } from '@/lib/api/session'

// An idempotency replay returns the booking the first attempt created, with no
// further deduction (200). One shape for both replay paths: the pre-gate lookup
// and a `{ duplicate: true }` result from the guarded write.
function duplicateResponse(bookingNumber: string) {
  return apiSuccess(
    {
      bookingNumber,
      reference: bookingNumber,
      duplicate: true,
    },
    undefined,
    200,
  )
}

// POST /api/gems/redeem — spend gems to create a ₹0 booking for one redeemable
// service. Strictly scoped to the authenticated customer; the charged amount is
// the server-read gemsRequired, never a client value.
export const POST = withErrorHandler(async (req: Request) => {
  // Redemption inserts a real ₹0 booking, so it carries the SAME profile
  // requirement as POST /api/bookings — see requireOnboardedCustomer.
  const session = await requireOnboardedCustomer()

  const body = await req.json()
  const parsed = redeemGemsSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }

  const customerId = session.user.id
  const { idempotencyKey } = parsed.data
  // Replay after auth and validation, before any mutable booking preconditions.
  const replayed = await findBookingByRedemptionKey(idempotencyKey, customerId)
  if (replayed) {
    return duplicateResponse(replayed.bookingNumber)
  }

  try {
    return await redeemNewService(parsed.data, customerId)
  } catch (error) {
    // A concurrent request can commit between the replay lookup and either
    // gate that the new booking itself changes (balance or upcoming count).
    if (
      error instanceof AppError &&
      (error.code === ERROR_CODES.GEMS_INSUFFICIENT_BALANCE ||
        error.code === ERROR_CODES.BOOKING_LIMIT_REACHED)
    ) {
      const committed = await findBookingByRedemptionKey(idempotencyKey, customerId)
      if (committed) return duplicateResponse(committed.bookingNumber)
    }
    throw error
  }
})

async function redeemNewService(input: RedeemGemsInput, customerId: string) {
  const { serviceId, branchId, bookingDate, startTime, idempotencyKey } = input

  // Resolve the loyalty account from the SESSION (never client ids). A brand-new
  // customer is created with a zero balance.
  const account = await getOrCreateLoyaltyAccount(customerId)
  const summary = await getLoyaltySummary(customerId)
  const balance = summary?.balance ?? 0

  // Branch must exist and be operational.
  const branch = await getBranchById(branchId)
  if (!branch) {
    throw badRequest('Branch not found.')
  }
  if (branch.status !== 'operational') {
    throw badRequest('Selected branch is not accepting bookings.')
  }
  // ...and open that day (R1.8). Its own hours and booking rules decide the
  // slot (R6.3).
  const [closure, policy] = await Promise.all([
    getClosureOn(branch.id, bookingDate),
    getBranchPolicy(branch.id),
  ])
  assertBranchOpenOn(closure, branch.name, bookingDate)
  if (!policy) {
    throw badRequest('Branch not found.')
  }

  // Live re-read of the service for execution-time re-validation (Req 7).
  const service = await getRedeemableServiceById(serviceId)
  if (!service) {
    throw notFound('Service not found.')
  }

  // Eligibility + affordability gate. Returns the SERVER-side gemsRequired and
  // throws GEMS_SERVICE_NOT_REDEEMABLE (400) / GEMS_INSUFFICIENT_BALANCE (409).
  const gemsRequired = assertRedeemable(service, balance)
  // ...and offered at the chosen branch (R4.3); the database refuses the same.
  assertServicesOfferedAt([service], branch)

  // The branch's settings decide the slot: its opening hours that weekday,
  // the 30-minute grid, its lead time and booking window (409 saying why), and
  // a redemption is an upcoming booking like any other for its limit.
  const endTime = addMinutesToTime(startTime, service.durationMinutes)
  const now = new Date()
  assertSlotBookable(policy, {
    date: bookingDate,
    startTime,
    durationMinutes: service.durationMinutes,
    now,
    actor: 'customer',
    branchName: branch.name,
  })
  assertBookingCap({
    rules: policy.bookingRules,
    upcomingAtBranch: await countUpcomingBookingsAtBranch(customerId, branch.id, istToday(now)),
    branchName: branch.name,
  })

  // A redemption booking is pending: its tentative assignee is replaced on
  // approval. Preferably someone not on approved leave that day.
  const staffId =
    (await getDefaultStaffForService(serviceId, branch.id, bookingDate)) ??
    (await getDefaultStaffForService(serviceId, branch.id))
  if (!staffId) {
    throw badRequest('No staff available to perform the selected service.')
  }

  const bookingNumber = generateBookingNumber(
    branch.code,
    service.serviceType,
    new Date(`${bookingDate}T00:00:00.000Z`),
  )

  // Guarded, atomic, idempotent write. Charges the SERVER-side gemsRequired.
  const result = await redeemServiceWithGems({
    accountId: account.id,
    customerId,
    branchId,
    bookingNumber,
    serviceType: service.serviceType,
    bookingDate: new Date(`${bookingDate}T00:00:00.000Z`),
    startTime,
    endTime,
    durationMinutes: service.durationMinutes,
    gemsRequired,
    serviceId,
    serviceName: service.name,
    staffId,
    idempotencyKey,
    description: `Redeemed: ${service.name}`,
    settingsRevision: policy.revision,
  })

  // A concurrent winner can commit after the initial replay lookup. The data
  // layer resolves the replay if the guarded write is refused.
  if ('duplicate' in result) {
    return duplicateResponse(result.bookingNumber)
  }

  return apiSuccess(
    {
      bookingNumber: result.bookingNumber,
      reference: result.bookingNumber,
      gemsSpent: result.gemsSpent,
      newBalance: result.newBalance,
    },
    undefined,
    201,
  )
}
