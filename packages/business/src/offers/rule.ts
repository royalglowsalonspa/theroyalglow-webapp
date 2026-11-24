/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : rule
 * Scope        : Business Logic — Offers
 *
 * Description  : An offer's checkout rule against a booking's lines
 *                (multi-branch offers.md): which lines it covers, the
 *                discount it gives, and the offers a booking can take.
 *
 * Responsibilities :
 * - evaluateOfferRule(rule, lines, names) → the discount and covered lines,
 *   or why the rule doesn't apply
 * - assertOfferApplies — the same, throwing 409 OFFER_NOT_APPLICABLE
 * - checkoutOfferChoices — the live offers a salon booking can take, with
 *   their savings, best first
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic (pure)
 *
 * Dependencies : @rgss/errors, @rgss/types, ./discount, ./applicability
 *
 * Notes        :
 * - A rule covers the lines whose service it links; a legacy admin offer
 *   with no linked services covers every line.
 * - percentage: floor(covered × % / 100); flat: min(amount, covered);
 *   combo: every linked service must be on the booking, and the discount is
 *   max(0, covered − combo price).
 * - A rule that covers nothing, or saves nothing, doesn't apply: a customer
 *   gets one offer a day, so a zero saving would only use it up.
 ************************************************************/
import { conflict, ERROR_CODES } from '@rgss/errors'
import type { OfferType } from '@rgss/types'
import { isOfferLive } from './applicability'
import { computeOfferDiscount } from './discount'

/** An offer's checkout rule. */
export type OfferRule = {
  offerType: OfferType
  discountPercentage?: number | null
  discountAmountPaise?: number | null
  comboPricePaise?: number | null
  /** The linked services; empty covers every line (legacy admin offers). */
  serviceIds: readonly string[]
}

/** One booking line: its service and tax-inclusive amount. */
export type OfferLine = { serviceId: string; grossPaise: number }

export type OfferOutcome =
  | {
      applies: true
      discountPaise: number
      /** Per line, in order: whether the rule covers it and shares the discount. */
      coveredLines: boolean[]
    }
  | { applies: false; reason: string }

/** "A", "A and B", "A, B and C". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? ''
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * The rule against the booking's lines. `serviceNames` names the services a
 * combo still needs; an unnamed one is left out of the message.
 */
export function evaluateOfferRule(
  rule: OfferRule,
  lines: readonly OfferLine[],
  serviceNames: ReadonlyMap<string, string> = new Map(),
): OfferOutcome {
  const linked = new Set(rule.serviceIds)
  const coversAll = linked.size === 0
  const coveredLines = lines.map((line) => coversAll || linked.has(line.serviceId))

  if (rule.offerType === 'combo_price' && !coversAll) {
    const onBooking = new Set(lines.map((line) => line.serviceId))
    const missing = rule.serviceIds.filter((id) => !onBooking.has(id))
    if (missing.length > 0) {
      const names = [...new Set(missing.map((id) => serviceNames.get(id)).filter(Boolean))]
      return {
        applies: false,
        reason:
          names.length > 0
            ? `This combo also needs ${joinNames(names as string[])} on the booking.`
            : 'This combo needs every service it includes on the booking.',
      }
    }
  }

  if (!coveredLines.some(Boolean)) {
    return { applies: false, reason: "This offer doesn't cover any service on this booking." }
  }

  const coveredPaise = lines.reduce(
    (sum, line, index) => (coveredLines[index] ? sum + line.grossPaise : sum),
    0,
  )
  const { discountPaise } = computeOfferDiscount(rule, coveredPaise)
  if (discountPaise <= 0) {
    return { applies: false, reason: 'This offer saves nothing on this booking.' }
  }
  return { applies: true, discountPaise, coveredLines }
}

/** evaluateOfferRule, throwing 409 OFFER_NOT_APPLICABLE when it doesn't apply. */
export function assertOfferApplies(
  rule: OfferRule,
  lines: readonly OfferLine[],
  serviceNames?: ReadonlyMap<string, string>,
): { discountPaise: number; coveredLines: boolean[] } {
  const outcome = evaluateOfferRule(rule, lines, serviceNames)
  if (!outcome.applies) {
    throw conflict(ERROR_CODES.OFFER_NOT_APPLICABLE, outcome.reason)
  }
  return { discountPaise: outcome.discountPaise, coveredLines: outcome.coveredLines }
}

/** An offer as checkout reads it. */
export type CheckoutOffer = OfferRule & {
  id: string
  name: string
  terms: string | null
  isActive: boolean
  startDate: Date | string
  endDate: Date | string
}

export type CheckoutOfferChoice = {
  id: string
  name: string
  terms: string | null
  offerType: OfferType
  discountPaise: number
}

/**
 * The offers a salon booking can take now: live (active, today in IST within
 * its dates) and saving something on its lines. Best saving first, then by
 * name. A spa booking takes none (offers are salon-only).
 */
export function checkoutOfferChoices(params: {
  offers: readonly CheckoutOffer[]
  lines: readonly OfferLine[]
  serviceType: 'salon' | 'spa'
  now?: Date
}): CheckoutOfferChoice[] {
  if (params.serviceType !== 'salon') {
    return []
  }
  const now = params.now ?? new Date()
  const choices: CheckoutOfferChoice[] = []
  for (const offer of params.offers) {
    if (!isOfferLive(offer, now)) {
      continue
    }
    const outcome = evaluateOfferRule(offer, params.lines)
    if (outcome.applies) {
      choices.push({
        id: offer.id,
        name: offer.name,
        terms: offer.terms,
        offerType: offer.offerType,
        discountPaise: outcome.discountPaise,
      })
    }
  }
  return choices.sort((a, b) => b.discountPaise - a.discountPaise || a.name.localeCompare(b.name))
}
