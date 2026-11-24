/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-11-2026 & Updated - 21-11-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : offer-rule (lib)
 * Scope        : CMS Collections — an Offer's checkout rule
 *                (multi-branch offers.md, R4.8)
 *
 * Description  : The checkout rule's types and validation: what a rule needs,
 *                the checks on its linked services, and the website card's
 *                image. Pure: the hook reads the services and passes them in.
 *
 * Responsibilities :
 * - OFFER_RULE_TYPES / ruleTypeOf / linkedServiceIds
 * - mergeOfferData(data, originalDoc) — an update's fields over the saved
 *   document, the rule group merged field by field
 * - offerRuleErrors(offer) — field errors for the card and the rule's shape
 * - linkedServiceErrors(ids, rows) — field errors for the linked services
 * - istDate(value) — a Payload date as its IST calendar day
 *
 * Tech Stack   : TypeScript
 * Layer        : CMS (Collections — pure)
 *
 * Dependencies : none
 *
 * Notes        :
 * - Amounts are whole paise, as service prices are in the CMS.
 * - The card's dates bound the rule; both are needed for a rule, read as IST
 *   calendar days, inclusive.
 ************************************************************/

export const OFFER_RULE_TYPES = ['none', 'percentage', 'flat', 'combo_price'] as const
export type OfferRuleType = (typeof OFFER_RULE_TYPES)[number]
export type OfferRuleKind = Exclude<OfferRuleType, 'none'>

/** A Payload `relationship` value: a bare id at depth 0, or a populated doc. */
type Relationship = string | { id: string } | null | undefined

/** The `rule` group as Payload holds it. */
export type OfferRuleData = {
  type?: string | null
  percentage?: number | null
  amountPaise?: number | null
  comboPricePaise?: number | null
  services?: readonly Relationship[] | null
  terms?: string | null
}

/** The fields of an Offer the rule's validation reads. */
export type OfferData = {
  showOnWebsite?: boolean | null
  image?: unknown
  validFrom?: string | Date | null
  validUntil?: string | Date | null
  rule?: OfferRuleData | null
}

export type FieldError = { path: string; message: string }

const IST_OFFSET_MS = 330 * 60 * 1000

/** The rule's type; anything unknown or missing is no rule. */
export function ruleTypeOf(rule: OfferRuleData | null | undefined): OfferRuleType {
  const type = rule?.type ?? 'none'
  return (OFFER_RULE_TYPES as readonly string[]).includes(type) ? (type as OfferRuleType) : 'none'
}

/** The linked services' ids, unique and sorted. */
export function linkedServiceIds(rule: OfferRuleData | null | undefined): string[] {
  const ids = (rule?.services ?? [])
    .map((value) => (typeof value === 'object' && value !== null ? value.id : value))
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    .map((id) => id.trim())
  return [...new Set(ids)].sort()
}

/**
 * The offer as it will be saved: on an update Payload passes only the changed
 * fields, so they go over the saved document, the rule group field by field.
 */
export function mergeOfferData(data: unknown, originalDoc: unknown): OfferData {
  const saved = (originalDoc ?? {}) as OfferData
  const changed = (data ?? {}) as OfferData
  return { ...saved, ...changed, rule: { ...(saved.rule ?? {}), ...(changed.rule ?? {}) } }
}

/** A Payload date (an instant) as its IST calendar day, 'YYYY-MM-DD'. */
export function istDate(value: string | Date): string {
  return new Date(new Date(value).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

/** "A", "A and B", "A, B and C". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? ''
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * The card's and the rule's field errors, before any database read: the card
 * shown on the website needs its image; a rule needs its type's value, at
 * least one linked service (a combo two), and both dates in order.
 */
export function offerRuleErrors(offer: OfferData): FieldError[] {
  const errors: FieldError[] = []
  if (offer.showOnWebsite !== false && !offer.image) {
    errors.push({
      path: 'image',
      message: 'Add an image for the website card, or untick Show on website.',
    })
  }

  const rule = offer.rule ?? {}
  const type = ruleTypeOf(rule)
  if (type === 'none') {
    return errors
  }

  if (
    type === 'percentage' &&
    !(isWholeNumber(rule.percentage) && rule.percentage >= 1 && rule.percentage <= 100)
  ) {
    errors.push({ path: 'rule.percentage', message: 'Enter a whole percentage from 1 to 100.' })
  }
  if (type === 'flat' && !(isWholeNumber(rule.amountPaise) && rule.amountPaise > 0)) {
    errors.push({
      path: 'rule.amountPaise',
      message: 'Enter the amount off in whole paise, above 0 (₹500.00 is 50000).',
    })
  }
  if (
    type === 'combo_price' &&
    !(isWholeNumber(rule.comboPricePaise) && rule.comboPricePaise > 0)
  ) {
    errors.push({
      path: 'rule.comboPricePaise',
      message: 'Enter the combo price in whole paise, above 0 (₹2,999.00 is 299900).',
    })
  }

  const ids = linkedServiceIds(rule)
  if (ids.length === 0) {
    errors.push({ path: 'rule.services', message: 'Choose the services the rule applies to.' })
  } else if (type === 'combo_price' && ids.length < 2) {
    errors.push({ path: 'rule.services', message: 'A combo needs at least two services.' })
  }

  if (!offer.validFrom) {
    errors.push({ path: 'validFrom', message: 'A checkout rule needs a start date.' })
  }
  if (!offer.validUntil) {
    errors.push({ path: 'validUntil', message: 'A checkout rule needs an end date.' })
  }
  if (offer.validFrom && offer.validUntil && istDate(offer.validUntil) < istDate(offer.validFrom)) {
    errors.push({ path: 'validUntil', message: 'The end date is before the start date.' })
  }
  return errors
}

/** A linked service as the app's catalogue has it. */
export type LinkedServiceRow = {
  id: string
  name: string
  isActive: boolean
  serviceType: string
  categoryActive: boolean
}

/**
 * The linked services must be in the app's catalogue, active (with an active
 * category) and salon services: offers apply to salon services only.
 */
export function linkedServiceErrors(
  ids: readonly string[],
  rows: readonly LinkedServiceRow[],
): FieldError[] {
  const known = new Map(rows.map((row) => [row.id, row]))
  const problems: string[] = []

  const unknown = ids.filter((id) => !known.has(id))
  if (unknown.length > 0) {
    problems.push(`No service has the id ${unknown.join(', ')}.`)
  }
  const linked = ids.flatMap((id) => {
    const row = known.get(id)
    return row ? [row] : []
  })
  const spa = linked.filter((row) => row.serviceType !== 'salon').map((row) => row.name)
  if (spa.length > 0) {
    problems.push(
      `Offers apply to salon services only: ${joinNames(spa)} ${spa.length === 1 ? 'is a SPA service' : 'are SPA services'}.`,
    )
  }
  const retired = linked
    .filter((row) => row.serviceType === 'salon' && !(row.isActive && row.categoryActive))
    .map((row) => row.name)
  if (retired.length > 0) {
    problems.push(`${joinNames(retired)} ${retired.length === 1 ? "isn't" : "aren't"} active.`)
  }

  return problems.length > 0
    ? [{ path: 'rule.services', message: `${problems.join(' ')} Choose the services again.` }]
    : []
}
