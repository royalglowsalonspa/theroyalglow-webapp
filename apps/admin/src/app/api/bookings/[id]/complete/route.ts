/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/bookings/[id]/complete
 * Scope        : API — Admin Booking
 *
 * Description  : Marks a confirmed/in-progress booking as completed, generates
 *                a GST invoice, awards loyalty gems, and applies optional offers.
 *                Persists the completion atomically via completeBookingWithInvoice.
 *
 * Responsibilities :
 * - Validate booking is in completable state (confirmed/in_progress)
 * - Generate GST-compliant invoice with line items
 * - Award loyalty gems based on final amount
 * - Apply and validate optional offer discount
 *
 * Features / Functionality :
 * - Full invoice generation (GST split, payment method, staff snapshots)
 * - Loyalty gems earning (1 gem per ₹100, 365-day expiry)
 * - Offer application with conflict checks (1/customer/day, no gems+offer)
 * - Post-service follow-up job enqueue (+24h)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @/lib/jobs/enqueue,
 *                @rgss/business, @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        :
 * - All prices are GST-inclusive in paise (integer math only).
 * - Offers cannot be combined with gems redemption on the same booking.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { enqueueJob } from '@/lib/jobs/enqueue'
import { sendEmail } from '@/lib/notifications/providers/email'
import {
  assertOfferActive,
  assertOfferSalonOnly,
  buildInvoiceEmailHtml,
  calculateGemsEarned,
  computeOfferDiscount,
  generateInvoiceNumber,
  splitGST,
} from '@rgss/business'
import {
  completeBookingWithInvoice,
  getBookingForAdmin,
  getBranchByIdAdmin,
  getOfferById,
  getOfferRedemptionForCustomerOnDate,
  getStaffNamesByIds,
  recordOfferRedemption,
} from '@rgss/db/queries'
import { ERROR_CODES, badRequest, conflict, notFound } from '@rgss/errors'
import { completeBookingSchema } from '@rgss/types'

const COMPLETABLE_STATUSES = new Set(['confirmed', 'in_progress'])

export const POST = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole('receptionist')
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
      typeof extras.offerId === 'string' && extras.offerId.length > 0 ? extras.offerId : null
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
      const priorRedemption = await getOfferRedemptionForCustomerOnDate(existing.customerId, today)
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

    // Pre-compute the monetary values in the business/route layer (the db layer
    // must not import @rgss/business). Prices are GST-inclusive paise.
    //  - subtotal: the original (pre-discount) base value
    //  - taxable value + GST: split from the discounted total so they
    //    reconstruct `finalPaise` exactly (Req 12.2)
    //  - gems: floor of rupees on the discounted total, but exactly 0 for a
    //    membership session (Req 12.3, 12.4)
    const { basePaise: subtotalPaise } = splitGST(existing.totalAmountPaise)
    const { basePaise: taxableValuePaise, gstPaise } = splitGST(finalPaise)
    const gemsEarned = calculateGemsEarned(finalPaise, existing.isMembershipSession)

    // Snapshot staff names onto each invoice item.
    const staffIds = [
      ...new Set(
        existing.services.map((s) => s.staffId).filter((sid): sid is string => Boolean(sid)),
      ),
    ]
    const staffNames = await getStaffNamesByIds(staffIds)
    const staffNameById = new Map(staffNames.map((s) => [s.id, s.name]))

    const invoiceNumber = generateInvoiceNumber(branch.number, now)

    // Persist atomically (Req 12.1): booking → completed + service invoice (with
    // the pre-computed GST split) + invoice items + gems credit + status log in a
    // single db.batch(). The query layer only persists the values supplied here.
    const result = await completeBookingWithInvoice({
      bookingId: id,
      changedById: session.user.id,
      invoice: {
        invoiceNumber,
        branchId: existing.branchId,
        customerId: existing.customerId,
        subtotalPaise,
        discountAmountPaise: discountPaise,
        taxableValuePaise,
        gstAmountPaise: gstPaise,
        totalAmountPaise: finalPaise,
        invoiceType: 'service',
        paymentMethod,
        gemsEarned,
      },
      items: existing.services.map((s, index) => ({
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
    })

    if (!result) {
      // Booking vanished between the read and the write — surface as not-found.
      throw notFound('Booking not found.')
    }

    // Record the offer redemption (one-per-customer-per-day, DB-enforced). Kept
    // outside the completion batch as it belongs to the offers feature.
    if (appliedOfferId) {
      await recordOfferRedemption(appliedOfferId, existing.customerId, existing.id, today)
    }

    // Best-effort: email the customer a GST invoice / booking confirmation.
    // sendEmail no-ops without RESEND_API_KEY and never throws, so this can
    // never break completion or change its response. Skipped if no email.
    if (existing.customerEmail) {
      const { subject, html } = buildInvoiceEmailHtml({
        customerName: existing.customerName ?? 'Guest',
        invoiceNumber,
        bookingNumber: existing.bookingNumber,
        items: existing.services.map((s) => ({
          name: s.serviceNameSnapshot,
          staff: s.staffId ? (staffNameById.get(s.staffId) ?? null) : null,
          pricePaise: s.priceAtBookingPaise,
        })),
        subtotalPaise,
        discountPaise,
        gstPaise,
        totalPaise: finalPaise,
        gemsEarned,
        paymentMethod,
        issuedAt: now,
      })
      await sendEmail({ to: existing.customerEmail, subject, html })
    }

    // Best-effort: schedule the post-service follow-up to run +24h. enqueueJob
    // never throws and no-ops without QSTASH_TOKEN, so this can never break the
    // completion flow or change its response.
    await enqueueJob('/api/jobs/post-service-followup', { bookingId: id }, 24 * 60 * 60)

    return apiSuccess({
      booking: result.booking,
      invoice: {
        invoiceNumber,
        totalPaise: finalPaise,
        gstPaise,
      },
      gemsEarned,
      discountPaise,
    })
  },
)
