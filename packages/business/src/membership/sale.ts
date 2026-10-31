/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : membership/sale
 * Scope        : Business Logic — selling a SPA membership (multi-branch R9)
 *
 * Description  : The rules of a sale at the counter: the hours counter, what a
 *                tier prefills, the validity from the picked dates, and the
 *                customer-facing invoice line. Pure: no I/O.
 *
 * Rules (user decisions v6.1; engineering defaults marked "default"):
 * - What is sold is a pool of whole SPA hours, at least 1 (default: 1-hour
 *   steps, at most 500 hours).
 * - The agreed price is typed separately; changing hours never changes it.
 * - The start date defaults to today in IST. Default: it can't be in the past
 *   or more than 60 days ahead.
 * - The expiry date must be after the start date. Default: at most 1095 days
 *   after it.
 * - Validity runs from 00:00 IST on the start date to 23:59:59.999 IST on the
 *   expiry date (validity.ts).
 * - Customers never see the tier (R9.1): the invoice line names the hours and
 *   the expiry date.
 ************************************************************/

import { badRequest } from '@rgss/errors'
import { addDaysISO, MEMBERSHIP_SALE_LIMITS } from '@rgss/types'
import { endOfDayIST, startOfDayIST } from './validity'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Whole days from `from` to `to`, both 'YYYY-MM-DD'. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY)
}

/** The hours counter after − (delta -1) or + (delta +1): whole hours within the limits. */
export function stepSaleHours(hours: number, delta: number): number {
  const whole = Number.isFinite(hours) ? Math.round(hours) : MEMBERSHIP_SALE_LIMITS.minHours
  return Math.min(
    MEMBERSHIP_SALE_LIMITS.maxHours,
    Math.max(MEMBERSHIP_SALE_LIMITS.minHours, whole + delta),
  )
}

/** A tier's usual values, as stored. */
export type SaleTier = {
  defaultHoursMinutes: number
  defaultPricePaise: number
  defaultValidityDays: number
}

/**
 * What choosing a tier fills in (R9.3): its usual whole hours (at least 1),
 * its usual price, and the expiry its usual validity gives from `startDate`.
 * Every value stays editable.
 */
export function tierSalePrefill(
  tier: SaleTier,
  startDate: string,
): { hours: number; pricePaise: number; expiresOn: string } {
  return {
    hours: stepSaleHours(Math.floor(tier.defaultHoursMinutes / 60), 0),
    pricePaise: tier.defaultPricePaise,
    expiresOn: addDaysISO(startDate, tier.defaultValidityDays),
  }
}

export type SaleValidity = {
  /** 'YYYY-MM-DD', the IST business date the membership starts. */
  startDate: string
  startsAt: Date
  expiresAt: Date
}

/**
 * The membership's validity from the picked IST dates, which must already be
 * real dates. Throws 400 for a start in the past or too far ahead, and for an
 * expiry on or before the start or too long after it (MS-16).
 */
export function saleValidity(params: {
  startDate?: string | undefined
  expiresOn: string
  /** Today in IST, 'YYYY-MM-DD'. */
  today: string
}): SaleValidity {
  const startDate = params.startDate ?? params.today
  if (startDate < params.today) {
    throw badRequest('A membership cannot start in the past.', {
      startDate: ['Choose today or later'],
    })
  }
  if (daysBetween(params.today, startDate) > MEMBERSHIP_SALE_LIMITS.maxStartDaysAhead) {
    throw badRequest(
      `A membership can start at most ${MEMBERSHIP_SALE_LIMITS.maxStartDaysAhead} days ahead.`,
      { startDate: ['Choose an earlier date'] },
    )
  }
  if (params.expiresOn <= startDate) {
    throw badRequest('The expiry date must be after the start date.', {
      expiresOn: ['Choose a later date'],
    })
  }
  if (daysBetween(startDate, params.expiresOn) > MEMBERSHIP_SALE_LIMITS.maxValidityDays) {
    throw badRequest(
      `A membership can last at most ${MEMBERSHIP_SALE_LIMITS.maxValidityDays} days.`,
      { expiresOn: ['Choose an earlier date'] },
    )
  }
  return {
    startDate,
    startsAt: startOfDayIST(startDate),
    expiresAt: endOfDayIST(params.expiresOn),
  }
}

/** "1 hour", "8 hours". */
export function hoursLabel(hours: number): string {
  return hours === 1 ? '1 hour' : `${hours} hours`
}

/** The purchase invoice's line: the hours and the expiry, never the tier (R9.1). */
export function membershipInvoiceLine(params: { hours: number; expiresOn: string }): string {
  const [year, month, day] = params.expiresOn.split('-')
  return `SPA membership: ${hoursLabel(params.hours)}, valid until ${day}/${month}/${year}`
}
