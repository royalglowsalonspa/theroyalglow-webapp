/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : gstin (types)
 * Scope        : Shared Types & Validation — GSTIN (multi-branch R6.1)
 *
 * Description  : Format and check character of a 15-character GSTIN: state
 *                code, PAN, entity number, 'Z', check character.
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        : Its own module so ./branch and ./tax can both use it without
 *                importing each other. Re-exported from ./tax.
 ************************************************************/
import { z } from 'zod'

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** True when the 15th character is the GSTIN check character of the first 14. */
export function hasValidGstinCheckCharacter(gstin: string): boolean {
  if (!GSTIN_PATTERN.test(gstin)) {
    return false
  }
  let sum = 0
  for (let i = 0; i < 14; i++) {
    const product = GSTIN_CHARS.indexOf(gstin.charAt(i)) * (i % 2 === 0 ? 1 : 2)
    sum += Math.floor(product / 36) + (product % 36)
  }
  const check = GSTIN_CHARS.charAt((36 - (sum % 36)) % 36)
  return gstin.charAt(14) === check
}

export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(GSTIN_PATTERN, 'Enter the 15-character GSTIN.')
  .refine(hasValidGstinCheckCharacter, 'That GSTIN’s last character does not match the rest.')
