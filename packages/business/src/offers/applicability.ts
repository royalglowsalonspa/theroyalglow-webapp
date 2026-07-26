/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : applicability
 * Scope        : Business Logic — Offers
 *
 * Description  : Guard functions for offer applicability checks
 *                at checkout time.
 *
 * Responsibilities :
 * - Validate offer is active and within date range
 * - Enforce salon-only restriction for offers
 *
 * Features / Functionality :
 * - assertOfferActive(offer, now) — throws OFFER_EXPIRED if invalid
 * - assertOfferSalonOnly(serviceTypes) — throws OFFER_NOT_APPLICABLE for spa
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : @rgss/errors
 *
 * Notes        :
 * - Date comparison is by IST calendar day (YYYY-MM-DD), inclusive
 ************************************************************/
import { conflict, ERROR_CODES } from '@rgss/errors'

// Offer ranges are compared by calendar date, inclusive, so the time-of-day is
// irrelevant — only the day matters. String inputs are already date-shaped
// (the offer's startDate/endDate are stored as YYYY-MM-DD text); Dates are
// sliced via toISOString to a stable YYYY-MM-DD form.
function toCalendarDate(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10)
  }
  return value.toISOString().slice(0, 10)
}

// Guard before applying an offer at checkout. Throws OFFER_EXPIRED (409) unless
// the offer is active AND today falls within [startDate, endDate] inclusive,
// compared by calendar date.
export function assertOfferActive(
  offer: { isActive: boolean; startDate: Date | string; endDate: Date | string },
  now: Date = new Date(),
): void {
  const today = toCalendarDate(now)
  const start = toCalendarDate(offer.startDate)
  const end = toCalendarDate(offer.endDate)

  if (!offer.isActive || today < start || today > end) {
    throw conflict(ERROR_CODES.OFFER_EXPIRED, 'This offer is not currently active')
  }
}

// Offers apply to salon services only — never to spa bookings. Throws
// OFFER_NOT_APPLICABLE (409) if any service in the booking is a spa service.
export function assertOfferSalonOnly(serviceTypes: string[]): void {
  if (serviceTypes.some((type) => type === 'spa')) {
    throw conflict(ERROR_CODES.OFFER_NOT_APPLICABLE, 'Offers apply to salon services only')
  }
}
