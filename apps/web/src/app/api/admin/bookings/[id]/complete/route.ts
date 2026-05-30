import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import {
  addGemsTransaction,
  createInvoiceWithItems,
  getBookingForAdmin,
  getBranchByIdAdmin,
  getOrCreateLoyaltyAccount,
  getStaffNamesByIds,
  updateBookingStatus,
} from '@rgss/db/queries'
import {
  calculateGemsEarned,
  generateInvoiceNumber,
  splitGST,
} from '@rgss/business'
import { badRequest, conflict, ERROR_CODES, notFound } from '@rgss/errors'
import { completeBookingSchema } from '@rgss/types'

const COMPLETABLE_STATUSES = new Set(['confirmed', 'in_progress'])
const GEMS_EXPIRY_DAYS = 365

export const POST = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole('receptionist')
    const { id } = await ctx.params

    const body = await req.json().catch(() => null)
    const parsed = completeBookingSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }
    const { paymentMethod } = parsed.data

    const existing = await getBookingForAdmin(id)
    if (!existing) {
      throw notFound('Booking not found.')
    }
    if (!COMPLETABLE_STATUSES.has(existing.status)) {
      throw conflict(
        ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
        `Only confirmed or in-progress bookings can be completed (current status: "${existing.status}").`,
      )
    }

    const branch = await getBranchByIdAdmin(existing.branchId)
    if (!branch) {
      // Programmer/data error — booking references a non-existent branch.
      throw notFound('Branch not found for this booking.')
    }

    const now = new Date()

    // 1. Mark the booking completed.
    const completed = await updateBookingStatus(id, 'completed', {
      completedAt: now,
    })

    // 2. Build the invoice. Prices are GST-inclusive paise; split out the base
    //    and GST for the invoice totals.
    const totalPaise = existing.totalAmountPaise
    const { basePaise, gstPaise } = splitGST(totalPaise)

    // 3. Gems are earned on service invoices only.
    const gemsEarned = calculateGemsEarned(totalPaise)

    // Snapshot staff names onto each invoice item.
    const staffIds = [
      ...new Set(
        existing.services
          .map((s) => s.staffId)
          .filter((sid): sid is string => Boolean(sid)),
      ),
    ]
    const staffNames = await getStaffNamesByIds(staffIds)
    const staffNameById = new Map(staffNames.map((s) => [s.id, s.name]))

    const invoiceNumber = generateInvoiceNumber(branch.number, now)

    const invoice = await createInvoiceWithItems(
      {
        invoiceNumber,
        branchId: existing.branchId,
        bookingId: existing.id,
        customerId: existing.customerId,
        subtotalPaise: basePaise,
        taxableValuePaise: basePaise,
        gstAmountPaise: gstPaise,
        totalAmountPaise: totalPaise,
        invoiceType: 'service',
        paymentMethod,
        paymentStatus: 'paid',
        gemsEarned,
        paidAt: now,
      },
      existing.services.map((s, index) => ({
        serviceId: s.serviceId,
        serviceNameSnapshot: s.serviceNameSnapshot,
        staffNameSnapshot: s.staffId
          ? (staffNameById.get(s.staffId) ?? 'Unassigned')
          : 'Unassigned',
        quantity: 1,
        unitPricePaise: s.priceAtBookingPaise,
        totalPricePaise: s.priceAtBookingPaise,
        displayOrder: index,
      })),
    )

    // 4. Award gems (only when any were earned).
    if (gemsEarned > 0) {
      const account = await getOrCreateLoyaltyAccount(existing.customerId)
      const expiresAt = new Date(
        now.getTime() + GEMS_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
      )
      await addGemsTransaction(
        account.id,
        gemsEarned,
        invoice.id,
        `Earned on invoice ${invoiceNumber}`,
        expiresAt,
      )
    }

    return apiSuccess({
      booking: completed,
      invoice: {
        invoiceNumber: invoice.invoiceNumber,
        totalPaise,
        gstPaise,
      },
      gemsEarned,
    })
  },
)
