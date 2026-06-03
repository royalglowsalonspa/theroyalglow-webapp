/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : membership-number
 * Scope        : Business Logic — Membership
 *
 * Description  : Generates unique SPA membership numbers in the
 *                format RG-MEM-{YY}-{branch}-{random5}.
 *
 * Responsibilities :
 * - Generate human-readable membership IDs
 *
 * Features / Functionality :
 * - generateMembershipNumber(branchNumber, date) → "RG-MEM-26-1-90872"
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : nanoid
 *
 * Notes        :
 * - YY = two-digit year from date
 ************************************************************/
import { customAlphabet } from 'nanoid'

const digits = customAlphabet('0123456789', 5)

// RG-MEM-{YY}-{branchNumber}-{5random}, e.g. RG-MEM-26-1-90872.
// YY is the two-digit year of the supplied date. The trailing segment is five
// numeric digits. Mirrors the invoice-number generator's nanoid digit alphabet.
export function generateMembershipNumber(branchNumber: number, date: Date): string {
  const yy = String(date.getFullYear()).slice(-2)
  return `RG-MEM-${yy}-${branchNumber}-${digits()}`
}
