import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { enqueueJob } from '@/lib/jobs/enqueue'
import {
  addGemsTransaction,
  createInvoiceWithItems,
  getBookingForAdmin,
  getBranchByIdAdmin,
  getOfferById,
  getOfferRedemptionForCustomerOnDate,
  getOrCreateLoyaltyAccount,
  getStaffNamesByIds,
  recordOfferRedemption,
  updateBookingStatus,
} from '@rgss/db/queries'
import {
  assertOfferActive,
  assertOfferSalonOnly,
  calculateGemsEarned,
  computeOfferDiscount,
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

    // Optional offer application rides alongside the existing completion payload.
    // Read these defensively from the raw body so the established
    // completeBookingSchema parse is never widened or broken.
    const extras = (body ?? {}) as {
      offerId?: unknown
      gemsRedeemedServiceId?: unknown
      redeemGems?: unknown
    }
    const offerId =
      typeof extras.offerId === 'string' && extras.offerId.length > 0
        ? extras.offerId
        : null
    const requestsGemsRedemption =
      Boolean(extras.gemsRedeemedServiceId) || Boolean(extras.redeemGems)

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
    const today = now.toISOString().slice(0, 10)

    // Offer application (optional). When an offer is supplied, validate it is
    // active, salon-only, not combined with gems, and not a second redemption
    // for this customer today; then compute the discounted total. With no offer
    // the totals are unchanged (discount 0, final = original) — no regression.
    let appliedOfferId: string | null = null
    let discountPaise = 0
    let finalPaise = existing.totalAmountPaise

    if (offerId) {
      const offer = await getOfferById(offerId)
      if (!offer) {
        throw notFound('Offer not found.')
      }

      // Active + within date range (throws OFFER_EXPIRED 409).
      assertOfferActive(offer)
      // Salon-only — the booking is a single service type (throws
      // OFFER_NOT_APPLICABLE 409 for spa bookings).
      assertOfferSalonOnly([existing.serviceType])
      // Offers cannot be combined with a gems redemption on the same booking.
      if (requestsGemsRedemption) {
        throw conflict(
          ERROR_CODES.OFFER_NOT_APPLICABLE,
          'An offer cannot be combined with gems on the same booking.',
        )
      }
      // One offer per customer per day — friendly pre-check before the DB
      // unique constraint would fire.
      const priorRedemption = await getOfferRedemptionForCustomerOnDate(
        existing.customerId,
        today,
      )
      if (priorRedemption) {
        throw conflict(
          ERROR_CODES.OFFER_NOT_APPLICABLE,
          'This customer has already redeemed an offer today.',
        )
      }

      const computed = computeOfferDiscount(offer, existing.totalAmountPaise)
      discountPaise = computed.discountPaise
      finalPaise = computed.finalPaise
      appliedOfferId = offer.id
    }

    // 1. Mark the booking completed.
    const completed = await updateBookingStatus(id, 'completed', {
      completedAt: now,
    })

    // 2. Build the invoice. Prices are GST-inclusive paise. The subtotal is the
    //    original (pre-discount) base; the taxable value + GST are split from the
    //    discounted total so they reconstruct `finalPaise` exactly.
    const { basePaise: subtotalPaise } = splitGST(existing.totalAmountPaise)
    const { basePaise: taxableValuePaise, gstPaise } = splitGST(finalPaise)

    // 3. Gems are earned on service invoices only, on the discounted total.
    const gemsEarned = calculateGemsEarned(finalPaise)

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
        subtotalPaise,
        discountAmountPaise: discountPaise,
        taxableValuePaise,
        gstAmountPaise: gstPaise,
        totalAmountPaise: finalPaise,
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

    // 5. Record the offer redemption (one-per-customer-per-day, DB-enforced).
    if (appliedOfferId) {
      await recordOfferRedemption(
        appliedOfferId,
        existing.customerId,
        existing.id,
        today,
      )
    }

    // Best-effort: schedule the post-service follow-up to run +24h. enqueueJob
    // never throws and no-ops without QSTASH_TOKEN, so this can never break the
    // completion flow or change its response.
    await enqueueJob(
      '/api/jobs/post-service-followup',
      { bookingId: id },
      24 * 60 * 60,
    )

    return apiSuccess({
      booking: completed,
      invoice: {
        invoiceNumber: invoice.invoiceNumber,
        totalPaise: finalPaise,
        gstPaise,
      },
      gemsEarned,
      discountPaise,
    })
  },
)
