/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|POST /api/bookings
 * Scope        : API — Customer Booking
 *
 * Description  : Customer booking endpoints. GET returns the authenticated user's
 *                bookings; POST creates a new booking with full validation.
 *
 * Responsibilities :
 * - List authenticated customer's bookings (GET)
 * - Validate and create new bookings with service snapshots (POST)
 * - Enqueue triggered jobs (stale-pending alert, no-show check)
 *
 * Features / Functionality :
 * - Multi-service booking with duration and pricing calculation
 * - Booking number generation (BK-{branch}-{YYMM}-{type}-{random})
 * - Auto staff assignment for pending bookings
 * - Triggered job enqueue (stale-booking-alert, noshow-check)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @/lib/jobs/enqueue,
 *                @rgss/business, @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        :
 * - POST enqueues background jobs best-effort; failures never break booking creation.
 * - All prices are GST-inclusive in paise (integer math only).
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireSession } from '@/lib/api/session'
import { enqueueJob } from '@/lib/jobs/enqueue'
import { publishBookingEvent } from '@/lib/realtime/publish'
import {
  addMinutesToTime,
  calculateBookingTotal,
  generateBookingNumber,
  isBookableSlotStart,
} from '@rgss/business'
import {
  createBookingWithServices,
  getBookingsByCustomer,
  getBranchById,
  getDefaultStaffForService,
  getServicesByIds,
} from '@rgss/db/queries'
import { badRequest, conflict } from '@rgss/errors'
import { bookingStatusSchema, createBookingSchema } from '@rgss/types'

export const GET = withErrorHandler(async (req: Request) => {
  const session = await requireSession()

  // Optional ?status filter — validate against the lifecycle enum before use.
  const statusParam = new URL(req.url).searchParams.get('status')
  let statusFilter: ReturnType<typeof bookingStatusSchema.parse> | undefined
  if (statusParam !== null) {
    const parsedStatus = bookingStatusSchema.safeParse(statusParam)
    if (!parsedStatus.success) {
      throw badRequest('Invalid status filter.', parsedStatus.error.flatten().formErrors)
    }
    statusFilter = parsedStatus.data
  }

  const bookings = await getBookingsByCustomer(session.user.id, statusFilter)
  return apiSuccess({ bookings })
})

export const POST = withErrorHandler(async (req: Request) => {
  const session = await requireSession()

  const body = await req.json()
  const parsed = createBookingSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }

  const { branchId, serviceType, bookingDate, startTime, serviceIds, notes, isWalkin } = parsed.data

  // Branch must exist and be operational.
  const branch = await getBranchById(branchId)
  if (!branch) {
    throw badRequest('Branch not found.')
  }
  if (branch.status !== 'operational') {
    throw badRequest('Selected branch is not accepting bookings.')
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

  // Pricing + duration (GST-inclusive paise, integer math only).
  const { totalAmountPaise, totalDurationMinutes } = calculateBookingTotal(
    services.map((s) => ({
      pricePaise: s.pricePaise,
      durationMinutes: s.durationMinutes,
    })),
  )
  const endTime = addMinutesToTime(startTime, totalDurationMinutes)

  // The requested start must sit on the 30-min grid within open hours and the
  // full duration must finish before close, else the slot is unavailable (409).
  if (!isBookableSlotStart(startTime, totalDurationMinutes)) {
    throw conflict('BOOKING_SLOT_UNAVAILABLE', 'The requested time slot is not available.')
  }

  // Preserve the requested service order for snapshots + staff assignment.
  // booking_service.staff_id is NOT NULL; pending bookings get an auto-assigned
  // active staff member that the admin reassigns on approval.
  const orderedServices = uniqueServiceIds.map((id) => {
    const svc = services.find((s) => s.id === id)
    if (!svc) throw badRequest(`Service ${id} not found.`)
    return svc
  })
  const serviceRows = await Promise.all(
    orderedServices.map(async (svc, index) => {
      const staffId = await getDefaultStaffForService(svc.id)
      if (!staffId) {
        throw badRequest('No staff available to perform the selected services.')
      }
      return {
        serviceId: svc.id,
        staffId,
        serviceNameSnapshot: svc.name,
        priceAtBookingPaise: svc.pricePaise,
        durationMinutes: svc.durationMinutes,
        displayOrder: index,
      }
    }),
  )

  const bookingNumber = generateBookingNumber(
    branch.code,
    serviceType,
    new Date(`${bookingDate}T00:00:00.000Z`),
  )

  // Walk-ins skip the pending queue and are confirmed immediately (Req 5.9).
  const status = isWalkin ? 'confirmed' : 'pending'

  const created = await createBookingWithServices(
    {
      bookingNumber,
      branchId,
      customerId: session.user.id,
      status,
      serviceType,
      bookingDate: new Date(`${bookingDate}T00:00:00.000Z`),
      startTime,
      endTime,
      totalAmountPaise,
      totalDurationMinutes,
      isWalkin: isWalkin ?? false,
      notes: notes ?? null,
    },
    serviceRows,
  )

  // Best-effort triggered-job enqueues. enqueueJob never throws and no-ops
  // without QSTASH_TOKEN, so these can never break booking creation or change
  // its response.
  // 1. Stale-pending alert at +2h.
  await enqueueJob('/api/jobs/stale-booking-alert', { bookingId: created.id }, 2 * 60 * 60)
  // 2. No-show check 15 minutes after the appointment's end. The end instant is
  //    the IST wall-clock (the salon's timezone) of bookingDate + endTime; only
  //    enqueue when that instant is still in the future.
  const endInstantMs = new Date(`${bookingDate}T${endTime}:00+05:30`).getTime()
  const noShowDelaySeconds = Math.floor((endInstantMs + 15 * 60 * 1000 - Date.now()) / 1000)
  if (Number.isFinite(noShowDelaySeconds) && noShowDelaySeconds > 0) {
    await enqueueJob('/api/jobs/noshow-check', { bookingId: created.id }, noShowDelaySeconds)
  }

  // Best-effort realtime publish: announce the new booking on the booking's own
  // channel and the per-branch admin feed. publishBookingEvent no-ops without
  // ABLY_PRIVATE_KEY and never throws, so it can never break booking creation or
  // change its response (same contract as the enqueueJob calls above).
  await publishBookingEvent({
    bookingId: created.id,
    branchId,
    customerId: session.user.id,
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
