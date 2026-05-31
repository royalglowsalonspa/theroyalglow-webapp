import { customAlphabet } from 'nanoid'

const digits = customAlphabet('0123456789', 5)

// RG-MEM-{YY}-{branchNumber}-{5random}, e.g. RG-MEM-26-1-90872.
// YY is the two-digit year of the supplied date. The trailing segment is five
// numeric digits. Mirrors the invoice-number generator's nanoid digit alphabet.
export function generateMembershipNumber(branchNumber: number, date: Date): string {
  const yy = String(date.getFullYear()).slice(-2)
  return `RG-MEM-${yy}-${branchNumber}-${digits()}`
}
