/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : invoice-number
 * Scope        : Business Logic — Invoicing
 *
 * Description  : The Indian financial year of an invoice and the shape of its
 *                number. Numbers are allocated by the database, one counter
 *                per branch and financial year, in the same transaction that
 *                issues the invoice (multi-branch R6.2); this module only
 *                describes the format.
 *
 * Responsibilities :
 * - financialYearIST(at) → "2627" for 1 April 2026 to 31 March 2027, in IST
 * - formatInvoiceNumber(prefix, fy, sequence) → "RS/2627/000123"
 * - invoiceFileStem(number) → "RS-2627-000123", safe for file names and keys
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : None
 *
 * Notes        :
 * - Indian FY: April (current year) → March (next year), on the IST calendar,
 *   whatever the host timezone.
 * - A branch prefix is 1–4 characters, so a number fits GST's 16-character
 *   limit up to 999,999 invoices per branch per year.
 * - Invoices issued before per-branch numbering keep their old numbers
 *   (INV-{branch}-{FY}-{random}).
 ************************************************************/

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

/** The sequence is shown with at least this many digits. */
export const INVOICE_SEQUENCE_DIGITS = 6

// The Indian financial year (April–March) of an instant on the IST calendar:
// last2(startYear) + last2(endYear), e.g. 1 April 2026 00:00 IST → "2627",
// 31 March 2026 23:59 IST → "2526".
export function financialYearIST(at: Date): string {
  const wall = new Date(at.getTime() + IST_OFFSET_MS)
  const year = wall.getUTCFullYear()
  const startYear = wall.getUTCMonth() >= 3 ? year : year - 1
  return `${String(startYear).slice(-2)}${String(startYear + 1).slice(-2)}`
}

/** "RS/2627/000123": branch prefix, financial year, sequence. */
export function formatInvoiceNumber(
  prefix: string,
  financialYear: string,
  sequence: number,
): string {
  return `${prefix}/${financialYear}/${String(sequence).padStart(INVOICE_SEQUENCE_DIGITS, '0')}`
}

/** An invoice number made safe for a file name or storage key ("/" → "-"). */
export function invoiceFileStem(invoiceNumber: string): string {
  return invoiceNumber.replace(/[^A-Za-z0-9-]+/g, '-')
}
