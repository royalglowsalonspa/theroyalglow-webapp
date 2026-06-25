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
 * - Deduct session hours from membership balance
 * - Generate ₹0 session invoice for audit trail
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
 * - No gems earned on membership sessions.
 * - Booking is created directly as completed (skip pending/confirmed).
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import {
  addMinutesToTime,
  assertSessionRecordable,
  generateBookingNumber,
  generateInvoiceNumber,
} from '@rgss/business'
import {
  getBranchByIdAdmin,
  getMembershipById,
  getServicesByIds,
  getStaffNamesByIds,
  recordMembershipSession,
} from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { recordSessionSchema } from '@rgss/types'

const PRIMARY_BRANCH_ID = 'branch_rayasandra'
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

export const POST = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole('receptionist')
    const { id } = await ctx.params

    const body = await req.json().catch(() => null)
    const parsed = recordSessionSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }
    const { services: sessionServices, bookingDate } = parsed.data

    const membership = await getMembershipById(id)
    if (!membership) {
      throw notFound('Membership not found.')
    }

    // Total minutes requested across all service lines. Guard the membership
    // state and remaining hours before any writes (throws 409 MEMBERSHIP_EXPIRED
    // / MEMBERSHIP_INSUFFICIENT_HOURS).
    const totalMinutes = sessionServices.reduce((sum, s) => sum + s.durationMinutes, 0)
    assertSessionRecordable(membership, totalMinutes)

    // Resolve and validate the requested services, then snapshot their names.
    const uniqueServiceIds = [...new Set(sessionServices.map((s) => s.serviceId))]
    const services = await getServicesByIds(uniqueServiceIds)
    if (services.length !== uniqueServiceIds.length) {
      throw badRequest('One or more selected services do not exist.')
    }
    const serviceById = new Map(services.map((s) => [s.id, s]))

    // Snapshot staff names where a staff member is assigned to a line.
    const staffIds = [
      ...new Set(
        sessionServices.map((s) => s.staffId).filter((sid): sid is string => Boolean(sid)),
      ),
    ]
    const staffNames = await getStaffNamesByIds(staffIds)
    const staffNameById = new Map(staffNames.map((s) => [s.id, s.name]))

    const branch = await getBranchByIdAdmin(PRIMARY_BRANCH_ID)
    if (!branch) {
      throw notFound('Primary branch not found.')
    }

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
      totalHoursMinutes: membership.totalHoursMinutes,
      usedHoursMinutes: membership.usedHoursMinutes,
    })

    return apiSuccess(result, undefined, 201)
  },
)
