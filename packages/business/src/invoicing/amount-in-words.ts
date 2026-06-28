/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 28-06-2026 & Updated - 28-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : amount-in-words
 * Scope        : Business Logic — Invoicing
 *
 * Description  : Converts an integer paise amount into its Indian-English
 *                words form for printing on GST invoices (e.g.
 *                "Rupees Two Thousand Five Hundred and Fifty Paise Only").
 *
 * Responsibilities :
 * - Convert rupees to words using the Indian numbering system
 *   (thousand / lakh / crore), not the Western million/billion system
 * - Append the paise remainder in words
 *
 * Features / Functionality :
 * - amountInWordsINR(paise) → "Rupees … Only" / "… and … Paise Only"
 * - Pure, deterministic, integer paise only (no floating point)
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : None
 *
 * Notes        :
 * - Indian invoices conventionally print the amount in words. Input is ALWAYS
 *   integer paise (₹1 = 100 paise). Handles 0 and large (crore+) values.
 ************************************************************/

const ONES = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
]

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

// Words for a 0–99 chunk.
function twoDigits(n: number): string {
  if (n < 20) {
    return ONES[n] as string
  }
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return ones === 0 ? (TENS[tens] as string) : `${TENS[tens]} ${ONES[ones]}`
}

// Words for a 0–999 chunk.
function threeDigits(n: number): string {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  if (hundreds === 0) {
    return twoDigits(rest)
  }
  const head = `${ONES[hundreds]} Hundred`
  return rest === 0 ? head : `${head} ${twoDigits(rest)}`
}

// Convert a whole rupee amount to words using the Indian numbering system:
// crore (10,000,000) · lakh (100,000) · thousand (1,000) · hundred.
function rupeesToWords(rupees: number): string {
  if (rupees === 0) {
    return 'Zero'
  }

  const crore = Math.floor(rupees / 10_000_000)
  const lakh = Math.floor((rupees % 10_000_000) / 100_000)
  const thousand = Math.floor((rupees % 100_000) / 1_000)
  const hundredAndBelow = rupees % 1_000

  const parts: string[] = []
  if (crore > 0) {
    // A crore count can itself exceed 99 (e.g. 100+ crore), so recurse.
    parts.push(`${rupeesToWords(crore)} Crore`)
  }
  if (lakh > 0) {
    parts.push(`${twoDigits(lakh)} Lakh`)
  }
  if (thousand > 0) {
    parts.push(`${twoDigits(thousand)} Thousand`)
  }
  if (hundredAndBelow > 0) {
    parts.push(threeDigits(hundredAndBelow))
  }

  return parts.join(' ')
}

// Convert integer paise to its Indian-English words form for an invoice.
// Examples:
//   250000 → "Rupees Two Thousand Five Hundred Only"
//   250050 → "Rupees Two Thousand Five Hundred and Fifty Paise Only"
//        0 → "Rupees Zero Only"
export function amountInWordsINR(paise: number): string {
  // Defensive: clamp to a non-negative integer (invoices are never negative).
  const safe = Math.max(0, Math.round(paise))
  const rupees = Math.floor(safe / 100)
  const paiseRemainder = safe % 100

  const rupeeWords = `Rupees ${rupeesToWords(rupees)}`
  if (paiseRemainder === 0) {
    return `${rupeeWords} Only`
  }
  return `${rupeeWords} and ${twoDigits(paiseRemainder)} Paise Only`
}
