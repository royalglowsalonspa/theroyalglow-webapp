import { financialYearIST, formatInvoiceNumber, istMonthBounds } from '@rgss/business'

const modernNumber = /^([A-Z][A-Z0-9]{0,3})\/(\d{4})\/(\d{6,})$/
const legacyNumber = /^INV-\d+-(\d{4})-\d{5}$/

export type InvoiceNumberingReview = {
  financialYear: string
  recognizedCount: number
  legacyCount: number
  unrecognizedCount: number
  financialYearMismatchCount: number
  prefixes: string[]
  mixedPrefixes: boolean
  duplicates: { sequence: number; count: number }[]
  gaps: { first: number; last: number; count: number }[]
}

export function reviewInvoiceNumbering(
  month: string,
  invoices: readonly { invoiceNumber: string; financialYear: string }[],
): InvoiceNumberingReview {
  if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new RangeError('Invalid invoice numbering review month')
  }
  const [start] = istMonthBounds(month)
  const financialYear = financialYearIST(start)
  const review: InvoiceNumberingReview = {
    financialYear,
    recognizedCount: 0,
    legacyCount: 0,
    unrecognizedCount: 0,
    financialYearMismatchCount: 0,
    prefixes: [],
    mixedPrefixes: false,
    duplicates: [],
    gaps: [],
  }
  const prefixes = new Set<string>()
  const sequences = new Map<number, number>()
  for (const invoice of invoices) {
    const { invoiceNumber, financialYear: storedYear } = invoice
    const [, prefix, printedYear, digits] = modernNumber.exec(invoiceNumber) ?? []
    const legacyYear = legacyNumber.exec(invoiceNumber)?.[1]
    const sequence = Number(digits)
    const isModern =
      prefix &&
      printedYear &&
      Number.isSafeInteger(sequence) &&
      sequence > 0 &&
      invoiceNumber.length <= 16 &&
      formatInvoiceNumber(prefix, printedYear, sequence) === invoiceNumber
    if (
      (storedYear.trim() && storedYear !== financialYear) ||
      (legacyYear && legacyYear !== financialYear) ||
      (isModern && printedYear !== financialYear)
    ) {
      review.financialYearMismatchCount++
    } else if (isModern) {
      review.recognizedCount++
      prefixes.add(prefix)
      sequences.set(sequence, (sequences.get(sequence) ?? 0) + 1)
    } else if (legacyYear) {
      review.legacyCount++
    } else {
      review.unrecognizedCount++
    }
  }

  review.prefixes = [...prefixes].sort()
  review.mixedPrefixes = review.prefixes.length > 1
  let previous: number | undefined
  for (const [sequence, count] of [...sequences.entries()].sort(([a], [b]) => a - b)) {
    if (count > 1) review.duplicates.push({ sequence, count })
    // A draft can only identify intervals inside one unambiguous observed series.
    if (!review.mixedPrefixes && previous !== undefined && sequence > previous + 1) {
      review.gaps.push({ first: previous + 1, last: sequence - 1, count: sequence - previous - 1 })
    }
    previous = sequence
  }
  return review
}
