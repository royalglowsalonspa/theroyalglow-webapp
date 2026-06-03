/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : invoice-number
 * Scope        : Business Logic — Invoicing
 *
 * Description  : Generates unique invoice numbers following the
 *                format INV-{branch}-{FY}-{random5}.
 *
 * Responsibilities :
 * - Determine Indian financial year (April–March) from a date
 * - Generate unique, human-readable invoice numbers
 *
 * Features / Functionality :
 * - getFinancialYear(date) → "2627" format
 * - generateInvoiceNumber(branchNumber, date) → "INV-1-2627-92921"
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : nanoid
 *
 * Notes        :
 * - Indian FY: April (current year) → March (next year)
 ************************************************************/
import { customAlphabet } from 'nanoid'

const digits = customAlphabet('0123456789', 5)

// Indian financial year runs April–March. The label is last2(startYear) +
// last2(endYear), e.g. a date in May 2026 → FY "2627", a date in Feb 2026 → "2526".
export function getFinancialYear(date: Date): string {
  const year = date.getFullYear()
  const month = date.getMonth() + 1 // 1-12
  const startYear = month >= 4 ? year : year - 1
  const endYear = startYear + 1
  return `${String(startYear).slice(-2)}${String(endYear).slice(-2)}`
}

// INV-{branch_number}-{financial_year}-{5_digit_random}, e.g. INV-1-2627-92921.
export function generateInvoiceNumber(branchNumber: number, date: Date): string {
  return `INV-${branchNumber}-${getFinancialYear(date)}-${digits()}`
}
