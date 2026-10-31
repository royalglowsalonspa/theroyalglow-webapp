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
 * - Date comparison is by IST calendar day (YYYY-MM-DD), inclusive. `now` is
 *   an instant, read on the IST calendar (31-10-2026: it used the UTC date,
 *   a day early from 00:00 to 05:30 IST).
 ************************************************************/
import { conflict, ERROR_CODES } from '@rgss/errors'
import { istToday } from '../jobs/time'

// An offer's startDate/endDate are calendar dates: 'YYYY-MM-DD' text, or a
// date-mode column's Date at UTC midnight, sliced to the same form.
function toCalendarDate(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10)
  }
  return value.toISOString().slice(0, 10)
}

/**
 * Whether the offer is active and today (IST) is within its dates, inclusive.
 */
export function isOfferLive(
  offer: { isActive: boolean; startDate: Date | string; endDate: Date | string },
  now: Date = new Date(),
): boolean {
  const today = istToday(now)
  return (
    offer.isActive &&
    today >= toCalendarDate(offer.startDate) &&
    today <= toCalendarDate(offer.endDate)
  )
}

// Guard before applying an offer at checkout. Throws OFFER_EXPIRED (409) unless
// the offer is active AND today (IST) falls within [startDate, endDate]
// inclusive.
export function assertOfferActive(
  offer: { isActive: boolean; startDate: Date | string; endDate: Date | string },
  now: Date = new Date(),
): void {
  if (!isOfferLive(offer, now)) {
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
