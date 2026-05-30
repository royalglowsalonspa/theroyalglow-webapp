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
