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
 * - Slot validation reused from the booking flow (isBookableSlotStart)
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
  assertRedeemable,
  generateBookingNumber,
  isBookableSlotStart,
} from '@rgss/business'
import {
  findBookingByRedemptionKey,
  getBranchById,
  getDefaultStaffForService,
  getLoyaltySummary,
  getOrCreateLoyaltyAccount,
  getRedeemableServiceById,
  redeemServiceWithGems,
} from '@rgss/db/queries'
import { badRequest, conflict, notFound } from '@rgss/errors'
import { redeemGemsSchema } from '@rgss/types'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireSession } from '@/lib/api/session'

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
  const session = await requireSession()

  const body = await req.json()
  const parsed = redeemGemsSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }

  const { serviceId, branchId, bookingDate, startTime, idempotencyKey } = parsed.data

  // Idempotency replay, resolved BEFORE the balance gate below (Req 6.1).
  //
  // A customer who spends their whole balance and then retries the same request
  // (network blip, double tap, client retry) no longer satisfies
  // `balance >= gemsRequired`, so `assertRedeemable` would reject the retry with
  // 409 GEMS_INSUFFICIENT_BALANCE and the already-created booking would never be
  // returned. The replay is a fact about a key we have already honoured, not a
  // new spend, so it must not be gated on affordability at all.
  //
  // Deliberately placed AFTER `requireSession` and AFTER Zod validation — an
  // unauthenticated or malformed request must never reach a DB lookup — and
  // scoped to the authenticated customer, so a guessed key cannot resolve
  // someone else's booking. It also runs ahead of the branch/service re-reads:
  // a booking that already exists stays retrievable even if its service was
  // deactivated afterwards.
  const replayed = await findBookingByRedemptionKey(idempotencyKey, session.user.id)
  if (replayed) {
    return duplicateResponse(replayed.bookingNumber)
  }

  // Resolve the loyalty account from the SESSION (never client ids). A brand-new
  // customer is created with a zero balance.
  const account = await getOrCreateLoyaltyAccount(session.user.id)
  const summary = await getLoyaltySummary(session.user.id)
  const balance = summary?.balance ?? 0

  // Branch must exist and be operational.
  const branch = await getBranchById(branchId)
  if (!branch) {
    throw badRequest('Branch not found.')
  }
  if (branch.status !== 'operational') {
    throw badRequest('Selected branch is not accepting bookings.')
  }

  // Live re-read of the service for execution-time re-validation (Req 7).
  const service = await getRedeemableServiceById(serviceId)
  if (!service) {
    throw notFound('Service not found.')
  }

  // Eligibility + affordability gate. Returns the SERVER-side gemsRequired and
  // throws GEMS_SERVICE_NOT_REDEEMABLE (400) / GEMS_INSUFFICIENT_BALANCE (409).
  const gemsRequired = assertRedeemable(service, balance)

  // The requested start must sit on the 30-min grid within open hours and the
  // full duration must finish before close, else the slot is unavailable (409).
  const endTime = addMinutesToTime(startTime, service.durationMinutes)
  if (!isBookableSlotStart(startTime, service.durationMinutes)) {
    throw conflict('BOOKING_SLOT_UNAVAILABLE', 'The requested time slot is not available.')
  }

  // booking_service.staff_id is NOT NULL; redemption bookings get an auto-assigned
  // active staff member that the admin reassigns on approval.
  const staffId = await getDefaultStaffForService(serviceId)
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
    customerId: session.user.id,
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
  })

  // Still reachable when two concurrent FIRST attempts share a key: the pre-gate
  // lookup above saw no booking, and the partial unique index rejected the loser.
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
})
