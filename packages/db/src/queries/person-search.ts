/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : person-search
 * Scope        : Data Access — shared people lookup
 *
 * Description  : One search predicate for "find a person by name, phone, or
 *                email", shared by the walk-in customer lookup
 *                (getCustomers) and the Users & Roles lookup (searchUsers),
 *                so both screens match the same way.
 *
 * Responsibilities :
 * - Match the typed term against name / email (case-insensitive substring)
 * - Match phone numbers by digits, ignoring spaces, dashes, and +91
 * - Treat typed % and _ literally (no accidental LIKE wildcards)
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm
 *
 * Notes        : Parameterised SQL only. Pure helpers (escapeLikePattern,
 *                phoneDigitsForSearch) are exported for unit tests.
 ************************************************************/

import { type AnyColumn, ilike, or, type SQL, sql } from 'drizzle-orm'

// Fewer digits than this would match almost every phone number, so short
// numeric fragments only participate in the name/email match.
const MIN_PHONE_DIGITS = 3
// Indian mobile numbers are 10 digits; anything longer carries a country or
// trunk prefix (+91, 0091, 0), so only the trailing 10 digits are compared.
const NATIONAL_NUMBER_DIGITS = 10

// Escape the LIKE metacharacters so the term matches literally. Postgres uses
// backslash as the default LIKE escape character.
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`)
}

// Digits to compare against stored phone numbers, or null when the term does
// not contain enough digits to be a phone search. "+91 98765 43210" and
// "98765-43210" both reduce to "9876543210".
export function phoneDigitsForSearch(term: string): string | null {
  const digits = term.replace(/\D/g, '')
  if (digits.length < MIN_PHONE_DIGITS) {
    return null
  }
  return digits.length > NATIONAL_NUMBER_DIGITS ? digits.slice(-NATIONAL_NUMBER_DIGITS) : digits
}

type PersonSearchColumns = {
  name: AnyColumn
  email: AnyColumn
  // Every phone column that can identify the person (customer and/or staff).
  phones: readonly AnyColumn[]
}

// OR-predicate over name, email, and phone(s), or undefined for a blank term.
export function personSearchCondition(
  rawTerm: string,
  columns: PersonSearchColumns,
): SQL | undefined {
  const term = rawTerm.trim()
  if (term.length === 0) {
    return undefined
  }

  const pattern = `%${escapeLikePattern(term)}%`
  const conditions: SQL[] = [ilike(columns.name, pattern), ilike(columns.email, pattern)]

  const digits = phoneDigitsForSearch(term)
  for (const phone of columns.phones) {
    conditions.push(ilike(phone, pattern))
    if (digits) {
      // Strip formatting from the stored value so it compares digit-for-digit.
      conditions.push(sql`regexp_replace(${phone}, '[^0-9]', '', 'g') like ${`%${digits}%`}`)
    }
  }

  return or(...conditions)
}
