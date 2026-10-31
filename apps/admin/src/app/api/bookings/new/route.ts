/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/bookings/new
 * Scope        : API — Admin Booking
 *
 * Description  : Admin endpoint that creates a WALK-IN booking on a customer's
 *                behalf. A walk-in is a customer who arrives in person, so the
 *                receptionist records the booking directly and it is created as
 *                'confirmed' — it skips the 'pending' approval queue (Req 5.9,
 *                features/database steering). Mirrors the customer POST business
 *                flow in apps/web (validate branch + services → price/duration →
 *                slot check → booking number → auto-assign staff → persist), but
 *                forces is_walkin=true / status='confirmed' and takes the
 *                customer id from the validated payload instead of the session.
 *
 * Responsibilities :
 * - Enforce receptionist+ RBAC access
 * - Validate the walk-in payload (branch, customer, services, date, time)
 * - Verify the branch is operational and the customer exists
 * - Verify the services exist, are active, and match the service type
 * - Compute GST-inclusive totals + duration and validate the slot
 * - Generate the booking number, auto-assign staff, and persist atomically
 *
 * Features / Functionality :
 * - Walk-in skips pending → created directly as 'confirmed' with is_walkin=true
 * - Multi-service booking with price/name snapshots (price frozen at booking)
 * - Booking number generation (BK-{branch}-{YYMM}-{H|S}-{random})
 * - Auto staff assignment per service (booking_service.staff_id is NOT NULL on
 *   the persisted row, so a default active staff member is always assigned)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/business,
 *                @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Requires min role: receptionist.
 * - The branch's opening hours decide the slot; the booking records the
 *   settings revision that accepted it (R6.3). The customer lead time,
 *   booking window and booking limit don't apply at the counter.
 * - All prices are GST-inclusive in paise (integer math only).
 * - No background jobs are enqueued: a walk-in is confirmed in person, so the
 *   stale-pending alert (pending-only) does not apply and the customer is
 *   physically present, so the +15min no-show check is unnecessary.
 * - Brand-new walk-in customers without an account are NOT supported here — the
 *   booking.customer_id NOT NULL FK to user requires an existing customer. The
 *   UI links one via the customer lookup. (TODO: a future enhancement could
 *   provision a lightweight walk-in customer account before creating the
 *   booking; that needs a schema/auth change and is intentionally out of scope.)
 ************************************************************/

import {
  addMinutesToTime,
  assertBranchOpenOn,
  assertServicesOfferedAt,
  assertSlotBookable,
  calculateBookingTotal,
  generateBookingNumber,
  staffClosureHint,
} from '@rgss/business'
import {
  createBookingWithServices,
  getBranchPolicy,
  getClosureOn,
  getCustomerProfile,
  getDefaultStaffForBooking,
  getServicesByIds,
} from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { adminCreateWalkinSchema } from '@rgss/types'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { publishBookingEvent } from '@/lib/realtime/publish'

export const POST = withErrorHandler(async (req: Request) => {
  // Receptionist or above at the active branch may create walk-ins there.
  const ctx = await requireBranchRole('receptionist')

  const body = await req.json().catch(() => null)
  const parsed = adminCreateWalkinSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }
  // The form names the branch it was rendered for: a tab left open across a
  // switch gets 409 instead of booking into the newly selected branch (R2.4).
  assertRenderedBranch(ctx, parsed.data.branchId)

  const { customerId, serviceType, bookingDate, startTime, serviceIds, notes } = parsed.data
  const branch = ctx.branch
  const branchId = branch.id

  // A walk-in needs an operational branch (mirrors the customer POST checks).
  if (branch.status !== 'operational') {
    throw badRequest(`${branch.name} is not accepting bookings.`)
  }
  // ...that is open that day (R1.8). Its own hours decide the slot (R6.3).
  const [closure, policy] = await Promise.all([
    getClosureOn(branchId, bookingDate),
    getBranchPolicy(branchId),
  ])
  assertBranchOpenOn(closure, branch.name, bookingDate, staffClosureHint(branch.role))
  if (!policy) {
    throw notFound('Branch not found.')
  }

  // The linked customer must be an existing customer (user with a customer
  // profile). getCustomerProfile returns null for unknown ids or non-customers,
  // giving a friendly error before the NOT NULL FK would otherwise fire.
  const customer = await getCustomerProfile(customerId)
  if (!customer) {
    throw badRequest('Selected customer was not found.')
  }

  // Fetch services and validate them. De-duplicate ids before lookup.
  const uniqueServiceIds = [...new Set(serviceIds)]
  const services = await getServicesByIds(uniqueServiceIds)

  if (services.length !== uniqueServiceIds.length) {
    throw badRequest('One or more selected services do not exist.')
  }
  if (services.some((s) => !s.isActive)) {
    throw badRequest('One or more selected services are not available.')
  }
  if (services.some((s) => s.serviceType !== serviceType)) {
    throw badRequest('All services must match the selected service type.')
  }
  // ...and offered at this branch (R4.3); the database refuses the same.
  assertServicesOfferedAt(services, branch)

  // Pricing + duration (GST-inclusive paise, integer math only).
  const { totalAmountPaise, totalDurationMinutes } = calculateBookingTotal(
    services.map((s) => ({
      pricePaise: s.pricePaise,
      durationMinutes: s.durationMinutes,
    })),
  )
  const endTime = addMinutesToTime(startTime, totalDurationMinutes)

  // The walk-in must fit the branch's opening hours that weekday on the
  // 30-minute grid, on today or a later date (409 saying why). Staff at the
  // counter aren't held to the customer lead time or booking window.
  assertSlotBookable(policy, {
    date: bookingDate,
    startTime,
    durationMinutes: totalDurationMinutes,
    now: new Date(),
    actor: 'staff',
    branchName: branch.name,
  })

  // Preserve the requested service order for snapshots. One person does the
  // whole booking (0028): the default is someone who works at the branch,
  // isn't on approved leave that day and has no clashing booking then, as the
  // database checks on a confirmed booking. The receptionist can reassign
  // later from the booking detail page.
  const orderedServices = uniqueServiceIds.map((id) => {
    const svc = services.find((s) => s.id === id)
    if (!svc) {
      throw badRequest(`Service ${id} not found.`)
    }
    return svc
  })
  const staffId = await getDefaultStaffForBooking({
    serviceIds: orderedServices.map((s) => s.id),
    branchId,
    dateISO: bookingDate,
    slot: { startTime, endTime, kind: serviceType },
  })
  if (!staffId) {
    throw badRequest(`No staff at ${branch.name} are free for the selected services then.`)
  }
  const serviceRows = orderedServices.map((svc, index) => ({
    serviceId: svc.id,
    staffId,
    serviceNameSnapshot: svc.name,
    priceAtBookingPaise: svc.pricePaise,
    durationMinutes: svc.durationMinutes,
    displayOrder: index,
  }))

  const bookingNumber = generateBookingNumber(
    branch.code,
    serviceType,
    new Date(`${bookingDate}T00:00:00.000Z`),
  )

  // Walk-ins skip the pending queue and are confirmed immediately (Req 5.9).
  const created = await createBookingWithServices(
    {
      bookingNumber,
      branchId,
      customerId,
      status: 'confirmed',
      serviceType,
      bookingDate: new Date(`${bookingDate}T00:00:00.000Z`),
      startTime,
      endTime,
      totalAmountPaise,
      totalDurationMinutes,
      isWalkin: true,
      // A confirmed booking carries its confirmation instant for the status
      // timeline; the receptionist creating it is the confirming actor.
      confirmedAt: new Date(),
      notes: notes ?? null,
      // The settings revision that accepted it: later edits never rewrite it.
      settingsRevision: policy.revision,
    },
    serviceRows,
  )

  // Best-effort realtime publish: announce the walk-in (created confirmed) on the
  // booking channel + per-branch admin feed so the admin dashboard updates live.
  // publishBookingEvent no-ops without ABLY_PRIVATE_KEY and never throws, so it
  // can never break walk-in creation or change its response.
  await publishBookingEvent({
    bookingId: created.id,
    branchId,
    customerId,
    event: 'created',
    data: { status: created.status },
  })

  return apiSuccess(
    {
      id: created.id,
      bookingNumber: created.bookingNumber,
      status: created.status,
    },
    undefined,
    201,
  )
})
