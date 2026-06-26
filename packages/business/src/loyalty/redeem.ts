/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : redeem
 * Scope        : Business Logic — Loyalty
 *
 * Description  : Pure helpers for online gems redemption. Computes
 *                per-service affordability and gates a redemption
 *                against live catalogue + balance data.
 *
 * Responsibilities :
 * - Flag each catalogue service as affordable (all-or-nothing)
 * - Assert a service is redeemable and charge the server-side cost
 *
 * Features / Functionality :
 * - computeAffordability(balance, services) → services + affordable flag
 * - assertRedeemable(service, balance) → server-side gemsRequired
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : @rgss/errors
 *
 * Notes        :
 * - Pure functions — no I/O. Throw AppError on rule breaks.
 * - Affordable iff gemsRequired != null && > 0 && balance >= gemsRequired
 * - Returned charge is always the server-read gemsRequired (never client value)
 ************************************************************/
import { AppError, ERROR_CODES } from '@rgss/errors'

// Req 2: per-service affordability under the all-or-nothing rule. A service is
// affordable only when it has a positive integer gem cost the balance covers in
// full. Generic over T so callers keep their existing catalogue item shape.
export function computeAffordability<T extends { gemsRequired: number | null }>(
  balance: number,
  services: T[],
): (T & { affordable: boolean })[] {
  return services.map((s) => ({
    ...s,
    affordable: s.gemsRequired != null && s.gemsRequired > 0 && balance >= s.gemsRequired,
  }))
}

export type AssertableService = {
  isActive: boolean
  gemsRedeemable: boolean
  gemsRequired: number | null
}

// Req 3 + Req 7: gate a redemption against live service data and the balance.
// Throws GEMS_SERVICE_NOT_REDEEMABLE (400) when the service is inactive, not
// redeemable, or has a null/non-positive gem cost; throws
// GEMS_INSUFFICIENT_BALANCE (409) when eligible but the balance is short.
// Returns the server-side gemsRequired (the charge) — any client value is ignored.
export function assertRedeemable(service: AssertableService, balance: number): number {
  if (
    !service.isActive ||
    !service.gemsRedeemable ||
    service.gemsRequired == null ||
    service.gemsRequired <= 0
  ) {
    throw new AppError({
      code: ERROR_CODES.GEMS_SERVICE_NOT_REDEEMABLE,
      message: 'This service cannot be redeemed with gems.',
      statusCode: 400,
    })
  }

  if (balance < service.gemsRequired) {
    throw new AppError({
      code: ERROR_CODES.GEMS_INSUFFICIENT_BALANCE,
      message: 'You do not have enough gems to redeem this service.',
      statusCode: 409,
    })
  }

  return service.gemsRequired
}
