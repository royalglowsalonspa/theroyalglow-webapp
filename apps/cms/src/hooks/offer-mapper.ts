/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-11-2026 & Updated - 21-11-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : offer-mapper (hooks)
 * Scope        : CMS Integration — Payload Offer → the app's offer mirror
 *                (multi-branch offers.md)
 *
 * Description  : Pure translation of a Payload `offer` document's checkout
 *                rule into the `public.offer` row and its linked services.
 *
 * Responsibilities :
 * - publicOfferId(cmsId) — the mirror's stable id, `cms_offer_<id>`
 * - mapPayloadToPublicOffer(doc) → { row, serviceIds }, or null without a rule
 *
 * Tech Stack   : TypeScript
 * Layer        : CMS (Hooks — pure mapping)
 *
 * Dependencies : ../lib/offer-rule
 *
 * Notes        :
 * - Only the rule's type's value is set; the others are null (the mirror's
 *   `offer_cms_rule_check` refuses anything else).
 * - The card's dates become IST calendar days, inclusive, for the date-mode
 *   columns (a Date at UTC midnight of that day).
 * - `updatedAt` is the hook's; `createdAt` is Payload's.
 ************************************************************/

import {
  istDate,
  linkedServiceIds,
  type OfferRuleData,
  type OfferRuleKind,
  ruleTypeOf,
} from '../lib/offer-rule'

/** Narrow view of a Payload `offer` document: only the fields mapped. */
export type PayloadOfferDoc = {
  id: number
  title: string
  description?: string | null
  active?: boolean | null
  showOnWebsite?: boolean | null
  validFrom?: string | Date | null
  validUntil?: string | Date | null
  order?: number | null
  rule?: OfferRuleData | null
  createdAt: Date | string
}

/** Row shape written to `public.offer` (no `updatedAt`: the hook owns it). */
export type PublicOfferRow = {
  id: string
  name: string
  slug: string
  description: string | null
  offerType: OfferRuleKind
  discountPercentage: number | null
  discountAmountPaise: number | null
  comboPricePaise: number | null
  startDate: Date
  endDate: Date
  isActive: boolean
  terms: string | null
  imageUrl: string | null
  displayOrder: number
  cmsId: number
  showOnWebsite: boolean
  createdAt: Date | string
}

/** The mirror's id: stable across title changes. */
export function publicOfferId(cmsId: number | string): string {
  return `cms_offer_${cmsId}`
}

function calendarDay(value: string | Date | null | undefined, field: string): Date {
  if (!value) {
    // Validation requires both dates for a rule; a document without them
    // fails loudly rather than mirroring a rule with no dates.
    throw new Error(`offer rule without ${field}`)
  }
  return new Date(`${istDate(value)}T00:00:00.000Z`)
}

/**
 * The mirror of an offer's checkout rule, or null when it has none. Pure: no
 * I/O, no clock reads.
 */
export function mapPayloadToPublicOffer(
  doc: PayloadOfferDoc,
): { row: PublicOfferRow; serviceIds: string[] } | null {
  const rule = doc.rule ?? {}
  const type = ruleTypeOf(rule)
  if (type === 'none') {
    return null
  }
  const row: PublicOfferRow = {
    id: publicOfferId(doc.id),
    name: doc.title,
    slug: `cms-offer-${doc.id}`,
    description: doc.description ?? null,
    offerType: type,
    discountPercentage: type === 'percentage' ? (rule.percentage ?? null) : null,
    discountAmountPaise: type === 'flat' ? (rule.amountPaise ?? null) : null,
    comboPricePaise: type === 'combo_price' ? (rule.comboPricePaise ?? null) : null,
    startDate: calendarDay(doc.validFrom, 'validFrom'),
    endDate: calendarDay(doc.validUntil, 'validUntil'),
    isActive: doc.active ?? true,
    terms: rule.terms?.trim() ? rule.terms.trim() : null,
    imageUrl: null,
    displayOrder: Math.round(doc.order ?? 0),
    cmsId: doc.id,
    showOnWebsite: doc.showOnWebsite !== false,
    createdAt: doc.createdAt,
  }
  return { row, serviceIds: linkedServiceIds(rule) }
}
