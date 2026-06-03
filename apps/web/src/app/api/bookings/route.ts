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
import { addMinutesToTime, calculateBookingTotal, generateBookingNumber } from '@rgss/business'
import {
  createBookingWithServices,
  getBookingsByCustomer,
  getBranchById,
  getDefaultStaffForService,
  getServicesByIds,
} from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { createBookingSchema } from '@rgss/types'

export const GET = withErrorHandler(async () => {
  const session = await requireSession()
  const bookings = await getBookingsByCustomer(session.user.id)
  return apiSuccess({ bookings })
})

export const POST = withErrorHandler(async (req: Request) => {
  const session = await requireSession()

  const body = await req.json()
  const parsed = createBookingSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }

  const { branchId, serviceType, bookingDate, startTime, serviceIds, notes } = parsed.data

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

  const created = await createBookingWithServices(
    {
      bookingNumber,
      branchId,
      customerId: session.user.id,
      status: 'pending',
      serviceType,
      bookingDate: new Date(`${bookingDate}T00:00:00.000Z`),
      startTime,
      endTime,
      totalAmountPaise,
      totalDurationMinutes,
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
