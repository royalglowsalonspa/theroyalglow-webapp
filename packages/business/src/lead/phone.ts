/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : phone
 * Scope        : Business Logic — Lead Pipeline
 *
 * Description  : Validates and normalises Indian mobile numbers to the
 *                canonical +91XXXXXXXXXX format for storage and deduplication.
 *
 * Responsibilities :
 * - Validate against the Indian mobile format
 * - Strip non-digit characters
 * - Remove country/trunk prefix (91 / 0)
 * - Apply +91 prefix to last 10 digits
 *
 * Features / Functionality :
 * - isValidIndianMobile(raw) → boolean
 * - normaliseIndianPhone(raw) → "+919876543210"
 * - normaliseValidIndianPhone(raw) → "+919876543210" | null
 * - Idempotent — already-normalised values pass through
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : None
 *
 * Notes        : None
 ************************************************************/

// Indian mobile number format: an optional +91 / 91 / 0 prefix followed by a
// ten-digit number whose first digit is 6–9. Matches the Zod schema used at the
// API boundary (packages/types/src/lead.ts).
export const INDIAN_MOBILE_PATTERN = /^(?:\+?91|0)?[6-9]\d{9}$/

// Returns true when the (trimmed) candidate is a valid Indian mobile number.
export function isValidIndianMobile(raw: string): boolean {
  return INDIAN_MOBILE_PATTERN.test(raw.trim())
}

// Normalise an Indian mobile number to the canonical +91XXXXXXXXXX form used for
// storage and deduplication. Strips every non-digit character, keeps the last
// ten digits (dropping any leading 91 / 0 country/trunk prefix), and re-applies
// the +91 prefix. Idempotent: normalising an already-canonical value is a no-op.
//
// This assumes a valid input; call isValidIndianMobile (or
// normaliseValidIndianPhone) first when the source is untrusted.
export function normaliseIndianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  const last10 = digits.slice(-10)
  return `+91${last10}`
}

// Validate and normalise in one step. Returns the canonical +91XXXXXXXXXX form
// when the candidate is a valid Indian mobile number, otherwise null.
export function normaliseValidIndianPhone(raw: string): string | null {
  return isValidIndianMobile(raw) ? normaliseIndianPhone(raw) : null
}
