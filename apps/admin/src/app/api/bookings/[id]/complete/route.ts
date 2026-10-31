/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/bookings/[id]/complete
 * Scope        : API — Admin Booking
 *
 * Description  : Marks a confirmed/in-progress booking as completed, issues
 *                its GST invoice, awards loyalty gems, and applies optional
 *                offers. Persists the completion atomically via
 *                completeBookingWithInvoice.
 *
 * Responsibilities :
 * - Validate booking is in completable state (confirmed/in_progress)
 * - Issue the invoice from the booking's branch: its next number, its rates
 *   in force for each line's SAC code, its issuer (multi-branch R6)
 * - Award loyalty gems based on the amount paid
 * - Apply and validate optional offer discount
 *
 * Features / Functionality :
 * - Per-line tax from the branch's tax versions; no fallback rate
 * - Loyalty gems earning (1 gem per ₹100, 365-day expiry)
 * - Offer application with conflict checks (1/customer/IST day, no gems+offer)
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

import {
  assertOfferActive,
  assertOfferApplies,
  assertOfferSalonOnly,
  assertRedeemable,
  calculateGemsEarned,
  istToday,
} from '@rgss/business'
import {
  completeBookingWithInvoice,
  completeMembershipSession,
  getBookingForAdmin,
  getBranchByIdAdmin,
  getLoyaltySummary,
  getOfferById,
  getOfferRedemptionForCustomerOnDate,
  getRedeemableServiceById,
  getSettlementSetting,
  getStaffNamesByIds,
} from '@rgss/db/queries'
import { badRequest, conflict, ERROR_CODES, notFound } from '@rgss/errors'
import { completeBookingSchema } from '@rgss/types'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { invoiceTaxFor, serviceSacCodes } from '@/lib/api/invoice-tax'
import { enqueueJob } from '@/lib/jobs/enqueue'
import { publishBookingEvent } from '@/lib/realtime/publish'

const COMPLETABLE_STATUSES = new Set(['confirmed', 'in_progress'])

type AdminBooking = NonNullable<Awaited<ReturnType<typeof getBookingForAdmin>>>
type CheckoutOfferRow = NonNullable<Awaited<ReturnType<typeof getOfferById>>>

/** The rule's value the invoice keeps: the percentage, or paise for a flat or combo price. */
function offerValueOf(offer: CheckoutOfferRow): number {
  const value =
    offer.offerType === 'percentage'
      ? offer.discountPercentage
      : offer.offerType === 'flat'
        ? offer.discountAmountPaise
        : offer.comboPricePaise
  if (value === null || value <= 0) {
    // A rule without its value can't have given a discount (the mirror's check
    // refuses one); refuse rather than invoice an empty snapshot.
    throw conflict(ERROR_CODES.OFFER_NOT_APPLICABLE, 'This offer has no discount set.')
  }
  return value
}

/**
 * Complete a membership session (membership-scheduling.md): only once it has
 * started, consuming its held minutes, with a ₹0 session invoice from the
 * delivering branch at its rates in force (TX-07) and the settlement entry
 * for the selling branch (R10). One transaction in the query layer.
 */
async function completeSession(existing: AdminBooking, actorId: string): Promise<Response> {
  if (existing.status !== 'in_progress') {
    throw conflict(
      ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
      existing.status === 'confirmed'
        ? 'Start this session before you complete it.'
        : `Only a session in progress can be completed (current status: "${existing.status}").`,
    )
  }
  if (existing.services.some((s) => s.staffId === null)) {
    throw conflict(
      ERROR_CODES.CONFLICT,
      'Nobody is assigned to this session. Assign who is doing it, then complete it.',
    )
  }
  const branch = await getBranchByIdAdmin(existing.branchId)
  if (!branch) {
    throw notFound('Branch not found for this booking.')
  }

  // The share the delivering branch receives, stored on the settlement entry.
  // Unreadable settings are a 409, never a guess.
  const settlement = await getSettlementSetting()
  const now = new Date()
  const sacCodes = await serviceSacCodes(
    existing.services.map((s) => ({ serviceId: s.serviceId, name: s.serviceNameSnapshot })),
  )
  const tax = await invoiceTaxFor({
    branch,
    taxPoint: now,
    lines: existing.services.map((s) => ({
      grossPaise: 0,
      sacCode: sacCodes.get(s.serviceId) ?? '',
    })),
  })
  const staffIds = [
    ...new Set(existing.services.map((s) => s.staffId).filter((s): s is string => Boolean(s))),
  ]
  const staffNameById = new Map((await getStaffNamesByIds(staffIds)).map((s) => [s.id, s.name]))

  const result = await completeMembershipSession({
    bookingId: existing.id,
    branchId: existing.branchId,
    changedById: actorId,
    invoice: {
      taxPointAt: tax.taxPointAt,
      financialYear: tax.financialYear,
      taxReviewStatus: tax.taxReviewStatus,
      lineTax: tax.lines.map((line) => ({
        sacCode: line.sacCode,
        taxVersionId: line.taxVersionId,
        rateBps: line.rateBps,
      })),
    },
    lines: existing.services.map((s) => ({
      serviceId: s.serviceId,
      serviceNameSnapshot: s.serviceNameSnapshot,
      staffNameSnapshot: s.staffId ? (staffNameById.get(s.staffId) ?? null) : null,
    })),
    settlement,
  })
  if (!result.ok) {
    throw conflict(
      ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
      'This session was completed or changed meanwhile. Reload it to see where it stands.',
    )
  }

  await publishBookingEvent({
    bookingId: existing.id,
    branchId: existing.branchId,
    customerId: existing.customerId,
    event: 'completed',
    data: { status: 'completed' },
  })

  return apiSuccess({
    booking: result.booking,
    invoice: {
      invoiceNumber: result.invoice.invoiceNumber,
      totalPaise: 0,
      gstPaise: 0,
      taxReviewStatus: tax.taxReviewStatus,
    },
    gemsEarned: 0,
    discountPaise: 0,
    gemsRedeemed: 0,
    gemsRedeemedServiceId: null,
    remainingMinutes: result.remainingMinutes,
  })
}

export const POST = withErrorHandler(
  async (req: Request, route: { params: Promise<{ id: string }> }) => {
    const ctx = await requireBranchRole('receptionist')
    const session = ctx.session
    const { id } = await route.params

    const body = await req.json().catch(() => null)
    const parsed = completeBookingSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }
    assertRenderedBranch(ctx, parsed.data.branchId)
    const {
      paymentMethod,
      offerId: offerIdRaw,
      gemsRedeemedServiceId: gemsServiceIdRaw,
      redeemGems,
    } = parsed.data

    // Optional, mutually-exclusive checkout adjustments. Normalise the parsed
    // values to nulls. A redemption is requested when a service id is supplied
    // (or the legacy `redeemGems` flag is truthy). The gem amount is NEVER taken
    // from the client — the server computes it from live catalogue + balance.
    const offerId = offerIdRaw && offerIdRaw.length > 0 ? offerIdRaw : null
    const gemsRedeemedServiceId =
      gemsServiceIdRaw && gemsServiceIdRaw.length > 0 ? gemsServiceIdRaw : null
    const requestsGemsRedemption = Boolean(gemsRedeemedServiceId) || Boolean(redeemGems)

    // A booking at another branch is not found; the invoice is issued by the
    // booking's own (the active) branch.
    const existing = await getBookingForAdmin(id, ctx.branch.id)
    if (!existing) {
      throw notFound('Booking not found.')
    }
    // A membership session is paid for with its minutes: completing it
    // consumes them and issues the ₹0 session invoice.
    if (existing.isMembershipSession) {
      if (offerId || requestsGemsRedemption) {
        throw badRequest('A membership session takes no offer or gems.')
      }
      return completeSession(existing, session.user.id)
    }
    if (!paymentMethod) {
      throw badRequest('Invalid request data', { paymentMethod: ['Choose how the customer paid.'] })
    }
    if (!COMPLETABLE_STATUSES.has(existing.status)) {
      throw conflict(
        ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
        `Only confirmed or in-progress bookings can be completed (current status: "${existing.status}").`,
      )
    }
    // A booking whose assignee was taken off it waits for someone else; the
    // invoice names who did the work (R1.7).
    if (existing.services.some((s) => s.staffId === null)) {
      throw conflict(
        ERROR_CODES.CONFLICT,
        'Nobody is assigned to this booking. Assign who is doing it, then complete it.',
      )
    }

    const branch = await getBranchByIdAdmin(existing.branchId)
    if (!branch) {
      // Programmer/data error — booking references a non-existent branch.
      throw notFound('Branch not found for this booking.')
    }

    const now = new Date()
    // One offer per customer per IST day (not the UTC date).
    const today = istToday(now)

    // Offer application (optional, multi-branch offers.md). When an offer is
    // supplied, validate it is live today (IST), the booking is a salon one
    // taking no gems, and the customer hasn't used an offer today; then its
    // rule gives the discount on the lines it covers. The completion batch
    // revalidates the offer and the one-a-day rule as it writes. With no offer
    // the discount is 0.
    let appliedOffer: NonNullable<Awaited<ReturnType<typeof getOfferById>>> | null = null
    let discountPaise = 0
    let discountableLines: boolean[] | undefined

    if (offerId) {
      const offer = await getOfferById(offerId)
      if (!offer) {
        throw notFound('Offer not found.')
      }

      // Active + within its dates, today in IST (throws OFFER_EXPIRED 409).
      assertOfferActive(offer, now)
      // Salon-only — the booking is a single service type (throws
      // OFFER_NOT_APPLICABLE 409 for spa bookings).
      assertOfferSalonOnly([existing.serviceType])
      // Offers cannot be combined with gems on the same booking: redeemed at
      // this checkout, or when the customer booked it with gems.
      if (requestsGemsRedemption || existing.isGemsRedemption) {
        throw conflict(
          ERROR_CODES.OFFER_NOT_APPLICABLE,
          'An offer cannot be combined with gems on the same booking.',
        )
      }
      // One offer per customer per IST day, at any branch — a friendly
      // pre-check; the unique (customer, day) decides it in the write.
      const priorRedemption = await getOfferRedemptionForCustomerOnDate(existing.customerId, today)
      if (priorRedemption) {
        throw conflict(
          ERROR_CODES.OFFER_NOT_APPLICABLE,
          'This customer has already used an offer today.',
        )
      }

      // The rule's discount on the lines it covers (409 when it covers or
      // saves nothing, or a combo is incomplete).
      const outcome = assertOfferApplies(
        offer,
        existing.services.map((s) => ({
          serviceId: s.serviceId,
          grossPaise: s.priceAtBookingPaise,
        })),
        new Map(offer.services.map((s) => [s.id, s.name])),
      )
      discountPaise = outcome.discountPaise
      discountableLines = outcome.coveredLines
      appliedOffer = offer
    }

    // Gems redemption (optional, salon or spa). When a service id is supplied the
    // receptionist is redeeming gems for ONE service that is part of THIS booking:
    // that service is covered by gems and removed from the payable money total,
    // while the customer still earns gems on the remaining paid portion (this is
    // NOT an offer). The gem cost is read server-side from live catalogue + the
    // customer's CURRENT balance — any client-supplied amount is ignored.
    let gemsRedemption: { serviceId: string; gemsRequired: number } | null = null

    if (gemsRedeemedServiceId) {
      // Offers cannot be combined with a gems redemption on the same booking.
      // (Also caught in the offer branch above; repeated here for the
      // gems-without-offer entry path so the rule holds either way.)
      if (appliedOffer) {
        throw conflict(
          ERROR_CODES.OFFER_NOT_APPLICABLE,
          'An offer cannot be combined with gems on the same booking.',
        )
      }

      // The redeemed service must be one of THIS booking's services. Its frozen
      // snapshot price is what gets excluded from the money total.
      const bookedService = existing.services.find((s) => s.serviceId === gemsRedeemedServiceId)
      if (!bookedService) {
        throw badRequest('The selected service is not part of this booking.')
      }

      // Live re-read as a redeemable catalogue service + gate against the
      // customer's CURRENT balance. assertRedeemable throws
      // GEMS_SERVICE_NOT_REDEEMABLE (400) when not redeemable and
      // GEMS_INSUFFICIENT_BALANCE (409) when the balance is short, and returns
      // the server-side gem cost.
      const service = await getRedeemableServiceById(gemsRedeemedServiceId)
      if (!service) {
        throw badRequest('The selected service is not part of this booking.')
      }
      const summary = await getLoyaltySummary(existing.customerId)
      const balance = summary?.balance ?? 0
      const gemsRequired = assertRedeemable(service, balance)

      // The redeemed service's line is billed at 0 below.
      gemsRedemption = { serviceId: gemsRedeemedServiceId, gemsRequired }
    }

    // The invoice's tax (multi-branch R6.4): each line at the rate in force for
    // its SAC code at this branch now, the offer discount shared across the
    // lines, totals summed from the lines. The gems-covered service stays on
    // the invoice for the record but is billed at 0. No fallback rate: a
    // missing rate or SAC code is a 409 before anything is written.
    const sacCodes = await serviceSacCodes(
      existing.services.map((s) => ({ serviceId: s.serviceId, name: s.serviceNameSnapshot })),
    )
    const tax = await invoiceTaxFor({
      branch,
      taxPoint: now,
      lines: existing.services.map((s) => ({
        grossPaise: gemsRedemption?.serviceId === s.serviceId ? 0 : s.priceAtBookingPaise,
        sacCode: sacCodes.get(s.serviceId) ?? '',
      })),
      discountPaise,
      // The offer's discount is shared across the lines it covers only.
      ...(discountableLines ? { discountableLines } : {}),
    })
    const totals = tax.totals
    // Gems EARNED: floor of rupees on what was paid, 0 for a membership
    // session (Req 12.3, 12.4).
    const gemsEarned = calculateGemsEarned(totals.netPaise, existing.isMembershipSession)

    // Snapshot staff names onto each invoice item.
    const staffIds = [
      ...new Set(
        existing.services.map((s) => s.staffId).filter((sid): sid is string => Boolean(sid)),
      ),
    ]
    const staffNames = await getStaffNamesByIds(staffIds)
    const staffNameById = new Map(staffNames.map((s) => [s.id, s.name]))

    // The share and value per gem stored on the settlement entries for gems
    // spent on this booking that another branch issued (R10). Unreadable
    // settings are a 409, never a guess.
    const settlement = await getSettlementSetting()

    // Persist atomically (Req 12.1): booking → completed + the next invoice
    // number + the invoice with its issuer and tax facts + gems + status log in
    // a single db.batch(). The query layer only persists the values given here.
    const result = await completeBookingWithInvoice({
      bookingId: id,
      changedById: session.user.id,
      settlement,
      invoice: {
        branchId: existing.branchId,
        customerId: existing.customerId,
        invoiceType: 'service',
        paymentMethod,
        subtotalPaise: totals.grossPaise,
        discountAmountPaise: totals.discountPaise,
        taxableValuePaise: totals.taxablePaise,
        gstAmountPaise: totals.taxPaise,
        cgstPaise: totals.cgstPaise,
        sgstPaise: totals.sgstPaise,
        totalAmountPaise: totals.netPaise,
        gemsEarned,
        gemsRedemption,
        taxPointAt: tax.taxPointAt,
        financialYear: tax.financialYear,
        taxReviewStatus: tax.taxReviewStatus,
        // The offer and its rule as applied, kept on the invoice (R6.1), and
        // the IST day it uses up for the customer.
        offer: appliedOffer
          ? {
              id: appliedOffer.id,
              name: appliedOffer.name,
              type: appliedOffer.offerType,
              value: offerValueOf(appliedOffer),
              redeemedOn: today,
            }
          : null,
      },
      items: existing.services.map((s, index) => {
        const line = tax.lines[index]
        if (!line) {
          throw new Error('invoice line tax missing')
        }
        return {
          serviceId: s.serviceId,
          serviceNameSnapshot: s.serviceNameSnapshot,
          staffNameSnapshot: s.staffId
            ? (staffNameById.get(s.staffId) ?? 'Unassigned')
            : 'Unassigned',
          quantity: 1,
          unitPricePaise: s.priceAtBookingPaise,
          totalPricePaise: line.grossPaise,
          displayOrder: index,
          sacCode: line.sacCode,
          taxVersionId: line.taxVersionId,
          rateBps: line.rateBps,
          discountPaise: line.discountPaise,
          taxableValuePaise: line.taxablePaise,
          taxPaise: line.taxPaise,
          cgstPaise: line.cgstPaise,
          sgstPaise: line.sgstPaise,
        }
      }),
    })

    if (!result) {
      // Booking vanished between the read and the write — surface as not-found.
      throw notFound('Booking not found.')
    }

    // Best-effort: durably enqueue the invoice-pdf job (runs on apps/web). It
    // renders the GST invoice PDF via the Cloud Run service and emails the
    // customer their invoice WITH the PDF attached — so the invoice email now
    // originates from the job, not inline here. enqueueJob never throws and
    // no-ops without QSTASH_TOKEN, so this can never break completion or change
    // its response (same contract as the post-service-followup enqueue below).
    if (result.invoice) {
      await enqueueJob('/api/jobs/invoice-pdf', { invoiceId: result.invoice.id }, 0)
    }

    // Best-effort: schedule the post-service follow-up to run +24h. enqueueJob
    // never throws and no-ops without QSTASH_TOKEN, so this can never break the
    // completion flow or change its response.
    await enqueueJob('/api/jobs/post-service-followup', { bookingId: id }, 24 * 60 * 60)

    // Best-effort realtime publish: announce completion on the booking channel +
    // per-branch admin feed. publishBookingEvent no-ops without ABLY_PRIVATE_KEY
    // and never throws, so it can never break completion or change its response
    // (same contract as the sendEmail / enqueueJob best-effort calls above).
    await publishBookingEvent({
      bookingId: id,
      branchId: existing.branchId,
      customerId: existing.customerId,
      event: 'completed',
      data: { status: 'completed' },
    })

    return apiSuccess({
      booking: result.booking,
      invoice: {
        invoiceNumber: result.invoice?.invoiceNumber ?? null,
        totalPaise: totals.netPaise,
        gstPaise: totals.taxPaise,
        taxReviewStatus: tax.taxReviewStatus,
      },
      gemsEarned,
      discountPaise,
      gemsRedeemed: gemsRedemption?.gemsRequired ?? 0,
      gemsRedeemedServiceId: gemsRedemption?.serviceId ?? null,
    })
  },
)
