/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : phone
 * Scope        : Business Logic — Lead Pipeline
 *
 * Description  : Normalises Indian mobile numbers to canonical
 *                +91XXXXXXXXXX format for storage and deduplication.
 *
 * Responsibilities :
 * - Strip non-digit characters
 * - Remove country/trunk prefix (91 / 0)
 * - Apply +91 prefix to last 10 digits
 *
 * Features / Functionality :
 * - normaliseIndianPhone(raw) → "+919876543210"
 * - Idempotent — already-normalised values pass through
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : None
 *
 * Notes        : None
 ************************************************************/

// Normalise an Indian mobile number to the canonical +91XXXXXXXXXX form used for
// storage and deduplication. Strips every non-digit character, keeps the last
// ten digits (dropping any leading 91 / 0 country/trunk prefix), and re-applies
// the +91 prefix. Idempotent: normalising an already-canonical value is a no-op.
export function normaliseIndianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  const last10 = digits.slice(-10)
  return `+91${last10}`
}
