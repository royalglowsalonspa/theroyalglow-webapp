import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireSession } from '@/lib/api/session'
import {
  createBookingWithServices,
  getBookingsByCustomer,
  getBranchById,
  getDefaultStaffForService,
  getServicesByIds,
} from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import {
  addMinutesToTime,
  calculateBookingTotal,
  generateBookingNumber,
} from '@rgss/business'
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

  const { branchId, serviceType, bookingDate, startTime, serviceIds, notes } =
    parsed.data

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
  const orderedServices = uniqueServiceIds.map(
    (id) => services.find((s) => s.id === id)!,
  )
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
