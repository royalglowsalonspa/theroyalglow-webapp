/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : invoicing/tax
 * Scope        : Business Logic — GST on issued invoices (multi-branch R6)
 *
 * Description  : The tax arithmetic of an invoice, from rates resolved per
 *                branch and SAC code (tax-settings.md §2). Pure: the caller
 *                resolves the branch's tax versions and passes them in; nothing
 *                here reads settings, and there is no default rate.
 *
 * Rules (documented, tested):
 * - Prices include GST. A line's taxable value is its tax-inclusive amount
 *   × 10,000 / (10,000 + rate in basis points), rounded half up to the paisa;
 *   its tax is the rest, so taxable + tax = the amount exactly.
 * - Tax is worked out per line, on the line's amount after its share of any
 *   discount. Invoice totals are the sums of the lines; they are never
 *   recalculated from the header, so different rates on one invoice stay
 *   correct.
 * - A discount is shared across lines in proportion to their amounts by the
 *   largest-remainder method (ties to the earlier line); the shares add up to
 *   the discount and no share exceeds its line.
 * - Intra-state (Karnataka) split: CGST = floor(tax / 2), SGST = tax − CGST,
 *   so an odd paisa goes to SGST.
 * - A tax version applies from its effective instant (00:00 IST on its date)
 *   until the next version for the same branch and SAC code. The version in
 *   force at the tax point is used; a later one never applies early.
 *
 * Notes        : Amounts are integer paise and stay within Number's safe
 *                integer range (checked).
 ************************************************************/

import { AppError, badRequest, ERROR_CODES } from '@rgss/errors'
import { MAX_TAX_RATE_BPS } from '@rgss/types'
import { financialYearIST } from './invoice-number'

export const BPS_PER_UNIT = 10_000

function assertPaise(value: number, what: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw badRequest(`${what} must be a whole number of paise, not negative.`)
  }
}

function assertRate(rateBps: number): void {
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > MAX_TAX_RATE_BPS) {
    throw badRequest(`A tax rate must be whole basis points from 0 to ${MAX_TAX_RATE_BPS}.`)
  }
}

/**
 * The taxable value and tax inside a tax-inclusive amount at `rateBps`
 * (500 = 5%). Integer arithmetic: taxable = round half up of
 * amount × 10,000 / (10,000 + rate).
 */
export function splitInclusive(
  inclusivePaise: number,
  rateBps: number,
): { taxablePaise: number; taxPaise: number } {
  assertPaise(inclusivePaise, 'An amount')
  assertRate(rateBps)
  const divisor = BPS_PER_UNIT + rateBps
  const doubled = inclusivePaise * BPS_PER_UNIT * 2
  if (!Number.isSafeInteger(doubled + divisor)) {
    throw badRequest('That amount is too large to invoice.')
  }
  const taxablePaise = Math.floor((doubled + divisor) / (2 * divisor))
  return { taxablePaise, taxPaise: inclusivePaise - taxablePaise }
}

/** CGST and SGST halves of an intra-state tax; an odd paisa goes to SGST. */
export function splitIntraState(taxPaise: number): { cgstPaise: number; sgstPaise: number } {
  assertPaise(taxPaise, 'A tax amount')
  const cgstPaise = Math.floor(taxPaise / 2)
  return { cgstPaise, sgstPaise: taxPaise - cgstPaise }
}

/**
 * Share `discountPaise` across `amounts` in proportion to them (largest
 * remainder, ties to the earlier line). The shares add up to the discount and
 * none exceeds its amount.
 */
export function allocateDiscount(amounts: readonly number[], discountPaise: number): number[] {
  for (const amount of amounts) {
    assertPaise(amount, 'A line amount')
  }
  assertPaise(discountPaise, 'A discount')
  const total = amounts.reduce((sum, amount) => sum + amount, 0)
  if (discountPaise > total) {
    throw badRequest('The discount is larger than the amount it applies to.')
  }
  if (discountPaise === 0 || total === 0) {
    return amounts.map(() => 0)
  }
  if (!Number.isSafeInteger(total * discountPaise)) {
    // Fall back to exact BigInt arithmetic for very large invoices.
    return allocateDiscountBig(amounts, discountPaise, total)
  }
  const shares = amounts.map((amount) => Math.floor((amount * discountPaise) / total))
  const remainders = amounts.map((amount, index) => ({
    index,
    rest: (amount * discountPaise) % total,
  }))
  let left = discountPaise - shares.reduce((sum, share) => sum + share, 0)
  remainders.sort((a, b) => b.rest - a.rest || a.index - b.index)
  for (const { index } of remainders) {
    if (left === 0) {
      break
    }
    shares[index] = (shares[index] ?? 0) + 1
    left -= 1
  }
  return shares
}

function allocateDiscountBig(
  amounts: readonly number[],
  discountPaise: number,
  total: number,
): number[] {
  const bigTotal = BigInt(total)
  const bigDiscount = BigInt(discountPaise)
  const shares = amounts.map((amount) => (BigInt(amount) * bigDiscount) / bigTotal)
  const remainders = amounts.map((amount, index) => ({
    index,
    rest: (BigInt(amount) * bigDiscount) % bigTotal,
  }))
  let left = bigDiscount - shares.reduce((sum, share) => sum + share, 0n)
  remainders.sort((a, b) => (b.rest > a.rest ? 1 : b.rest < a.rest ? -1 : a.index - b.index))
  for (const { index } of remainders) {
    if (left === 0n) {
      break
    }
    shares[index] = (shares[index] ?? 0n) + 1n
    left -= 1n
  }
  return shares.map((share) => Number(share))
}

/** One invoice line before tax: its tax-inclusive amount and its rate. */
export type TaxLineInput = {
  /** The line's tax-inclusive amount before any discount (0 for a gems-covered line). */
  grossPaise: number
  rateBps: number
}

/** One invoice line with its tax worked out. */
export type TaxedLine = {
  grossPaise: number
  discountPaise: number
  /** grossPaise − discountPaise: what the customer pays for the line. */
  netPaise: number
  taxablePaise: number
  taxPaise: number
  cgstPaise: number
  sgstPaise: number
  rateBps: number
}

export type InvoiceTaxTotals = {
  grossPaise: number
  discountPaise: number
  netPaise: number
  taxablePaise: number
  taxPaise: number
  cgstPaise: number
  sgstPaise: number
}

/**
 * Tax for every line of an invoice and the invoice totals, which are the sums
 * of the lines. `discountPaise` is shared across the lines first, or only
 * across those `discountable` marks (an offer covering some services,
 * offers.md); unmarked lines keep their full amount.
 */
export function computeInvoiceTax(
  lines: readonly TaxLineInput[],
  discountPaise = 0,
  discountable?: readonly boolean[],
): { lines: TaxedLine[]; totals: InvoiceTaxTotals } {
  const shares = allocateDiscount(
    lines.map((line, index) => (discountable && !discountable[index] ? 0 : line.grossPaise)),
    discountPaise,
  )
  const taxed = lines.map((line, index): TaxedLine => {
    const share = shares[index] ?? 0
    const netPaise = line.grossPaise - share
    const { taxablePaise, taxPaise } = splitInclusive(netPaise, line.rateBps)
    const { cgstPaise, sgstPaise } = splitIntraState(taxPaise)
    return {
      grossPaise: line.grossPaise,
      discountPaise: share,
      netPaise,
      taxablePaise,
      taxPaise,
      cgstPaise,
      sgstPaise,
      rateBps: line.rateBps,
    }
  })
  const sum = (pick: (line: TaxedLine) => number) =>
    taxed.reduce((total, line) => total + pick(line), 0)
  return {
    lines: taxed,
    totals: {
      grossPaise: sum((l) => l.grossPaise),
      discountPaise: sum((l) => l.discountPaise),
      netPaise: sum((l) => l.netPaise),
      taxablePaise: sum((l) => l.taxablePaise),
      taxPaise: sum((l) => l.taxPaise),
      cgstPaise: sum((l) => l.cgstPaise),
      sgstPaise: sum((l) => l.sgstPaise),
    },
  }
}

/** A branch's tax version for one SAC code, as stored. */
export type TaxVersion = {
  id: string
  branchId: string
  sacCode: string
  rateBps: number
  pricesIncludeTax: boolean
  effectiveFrom: Date
  reviewStatus: 'provisional' | 'reviewed'
}

/** The version in force at `at` for the branch and SAC code, or null. */
export function versionInForce<
  V extends Pick<TaxVersion, 'id' | 'branchId' | 'sacCode' | 'effectiveFrom'>,
>(versions: readonly V[], branchId: string, sacCode: string, at: Date): V | null {
  let found: V | null = null
  for (const version of versions) {
    if (
      version.branchId === branchId &&
      version.sacCode === sacCode &&
      version.effectiveFrom.getTime() <= at.getTime() &&
      (found === null || version.effectiveFrom.getTime() > found.effectiveFrom.getTime())
    ) {
      found = version
    }
  }
  return found
}

export const TAX_CONFIGURATION_HELP =
  'The Developer sets tax rates under Settings → Tax for each branch.'

/**
 * The version in force at the tax point for each SAC code. Throws an
 * actionable 409 when a code has no version, or a version that doesn't
 * include tax in its prices: there is never a fallback rate.
 */
export function resolveTaxVersions<V extends TaxVersion>(params: {
  versions: readonly V[]
  branchId: string
  branchName: string
  sacCodes: readonly string[]
  taxPoint: Date
}): Map<string, V> {
  const resolved = new Map<string, V>()
  const missing: string[] = []
  for (const sacCode of new Set(params.sacCodes)) {
    const version = versionInForce(params.versions, params.branchId, sacCode, params.taxPoint)
    if (version === null || !version.pricesIncludeTax) {
      missing.push(sacCode)
    } else {
      resolved.set(sacCode, version)
    }
  }
  if (missing.length > 0) {
    throw new AppError({
      code: ERROR_CODES.TAX_CONFIGURATION_INCOMPLETE,
      message: `${params.branchName} has no tax rate in force for SAC ${missing.join(', ')}. ${TAX_CONFIGURATION_HELP}`,
      statusCode: 409,
      details: { sacCodes: missing },
    })
  }
  return resolved
}

/**
 * Check a new version's start (00:00 IST on its date, see startOfDayIST). A
 * branch's first version for a SAC code may start on any date. A later one
 * must start in the future, so it never changes a rate an issued invoice
 * already used, and two versions never start at the same instant.
 */
export function assertNewTaxVersion(params: {
  effectiveFrom: Date
  now: Date
  existing: readonly Pick<TaxVersion, 'effectiveFrom'>[]
}): void {
  const at = params.effectiveFrom.getTime()
  if (params.existing.some((version) => version.effectiveFrom.getTime() === at)) {
    throw new AppError({
      code: ERROR_CODES.CONFLICT,
      message: 'A rate for this SAC code already starts on that date.',
      statusCode: 409,
    })
  }
  if (params.existing.length > 0 && at <= params.now.getTime()) {
    throw badRequest('A change of rate starts on a future date.', {
      effectiveFrom: ['Choose tomorrow or later'],
    })
  }
}

/** One line to invoice: its tax-inclusive amount and its SAC code. */
export type InvoiceLineInput = {
  grossPaise: number
  sacCode: string
}

/** A line's tax facts as an issued invoice stores them. */
export type IssuedLineTax = TaxedLine & {
  sacCode: string
  taxVersionId: string
}

/** The issue facts of an invoice, ready for the invoice and its items. */
export type PreparedInvoiceTax = {
  lines: IssuedLineTax[]
  totals: InvoiceTaxTotals
  taxPointAt: Date
  financialYear: string
  taxReviewStatus: TaxReviewStatus
}

/**
 * Everything an invoice needs from the tax configuration: each line's rate,
 * discount share, taxable value and tax (at the version in force for its SAC
 * code at the tax point), the totals, the financial year and the review status
 * the invoice records. Throws an actionable 409 when the branch can't invoice.
 */
export function prepareInvoiceTax<V extends TaxVersion>(params: {
  versions: readonly V[]
  branch: { id: string; name: string; legalName: string | null; gstin: string | null }
  liveInvoicing: boolean
  taxPoint: Date
  lines: readonly InvoiceLineInput[]
  discountPaise?: number
  /** The lines that share the discount; every line when absent. */
  discountableLines?: readonly boolean[]
}): PreparedInvoiceTax {
  const resolved = resolveTaxVersions({
    versions: params.versions,
    branchId: params.branch.id,
    branchName: params.branch.name,
    sacCodes: params.lines.map((line) => line.sacCode),
    taxPoint: params.taxPoint,
  })
  const taxReviewStatus = assertInvoiceIssuable({
    liveInvoicing: params.liveInvoicing,
    branch: params.branch,
    versions: [...resolved.values()],
  })
  const versionFor = (sacCode: string): V => {
    const version = resolved.get(sacCode)
    if (!version) {
      throw new Error(`no tax version resolved for SAC ${sacCode}`)
    }
    return version
  }
  const { lines, totals } = computeInvoiceTax(
    params.lines.map((line) => ({
      grossPaise: line.grossPaise,
      rateBps: versionFor(line.sacCode).rateBps,
    })),
    params.discountPaise ?? 0,
    params.discountableLines,
  )
  return {
    lines: lines.map((line, index) => {
      const sacCode = params.lines[index]?.sacCode ?? ''
      return { ...line, sacCode, taxVersionId: versionFor(sacCode).id }
    }),
    totals,
    taxPointAt: params.taxPoint,
    financialYear: financialYearIST(params.taxPoint),
    taxReviewStatus,
  }
}

/** Where a version stands at `now`: in force, scheduled, or replaced by a later one. */
export type TaxVersionState = 'in_force' | 'scheduled' | 'replaced'

/** Each version's state at `now`, per branch and SAC code. */
export function taxVersionStates<
  V extends Pick<TaxVersion, 'id' | 'branchId' | 'sacCode' | 'effectiveFrom'>,
>(versions: readonly V[], now: Date): Map<string, TaxVersionState> {
  const states = new Map<string, TaxVersionState>()
  for (const version of versions) {
    if (version.effectiveFrom.getTime() > now.getTime()) {
      states.set(version.id, 'scheduled')
      continue
    }
    const current = versionInForce(versions, version.branchId, version.sacCode, now)
    states.set(version.id, current?.id === version.id ? 'in_force' : 'replaced')
  }
  return states
}

/** What an invoice records about the configuration it was issued with. */
export type TaxReviewStatus = 'provisional' | 'reviewed'

/**
 * Whether the invoice can be issued, and the review status it records. In
 * live invoicing (after the launch tax review), the branch needs its legal
 * name and GSTIN and every rate used must be reviewed (TX-08). Before that,
 * provisional rates are allowed and the invoice says so (TX-10).
 */
export function assertInvoiceIssuable(params: {
  liveInvoicing: boolean
  branch: { name: string; legalName: string | null; gstin: string | null }
  versions: readonly Pick<TaxVersion, 'reviewStatus'>[]
}): TaxReviewStatus {
  const reviewed = params.versions.every((version) => version.reviewStatus === 'reviewed')
  if (!params.liveInvoicing) {
    return reviewed ? 'reviewed' : 'provisional'
  }
  const problems: string[] = []
  if (!params.branch.legalName?.trim()) {
    problems.push('its legal name')
  }
  if (!params.branch.gstin?.trim()) {
    problems.push('its GSTIN')
  }
  if (!reviewed) {
    problems.push('reviewed tax rates')
  }
  if (problems.length > 0) {
    throw new AppError({
      code: ERROR_CODES.TAX_CONFIGURATION_INCOMPLETE,
      message: `${params.branch.name} can't issue invoices yet: it needs ${problems.join(', ')}.`,
      statusCode: 409,
    })
  }
  return 'reviewed'
}
