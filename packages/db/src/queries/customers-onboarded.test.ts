/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (packages/db)
 * Module Name  : customers-onboarded.test
 * Scope        : Walk-in customer lookup — onboarded customers only
 *
 * Description  : Static source invariants for the two queries behind the admin
 *                "New walk-in" flow. A receptionist may find, and book for,
 *                ONLY a customer who completed onboarding, meaning a
 *                customer_profile row carrying phone, date of birth and gender.
 *
 *                - getCustomers: the "Find an existing customer" search
 *                  (GET /api/customers). Also the CRM customer list.
 *                - getCustomerProfile: the server-side re-check in
 *                  POST /api/bookings/new.
 *
 *                Both enforce the rule purely through an INNER JOIN on
 *                customer_profile. Relaxing either to a LEFT JOIN would silently
 *                let never-onboarded accounts appear in walk-in search and be
 *                booked. These are source assertions, not a live-DB test, in
 *                keeping with the repository's other placement invariants.
 *
 * Tech Stack   : Vitest + node:fs
 * Layer        : Test
 ************************************************************/

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'customers.ts'), 'utf8')

const PROFILE_INNER_JOIN = '.innerJoin(customerProfile, eq(customerProfile.userId, user.id))'

/** The source of one exported function, up to the next top-level export. */
function functionSource(name: string): string {
  const start = SOURCE.indexOf(`export async function ${name}(`)
  expect(start, `${name} not found in customers.ts`).toBeGreaterThanOrEqual(0)
  const next = SOURCE.indexOf('\nexport ', start + 1)
  return SOURCE.slice(start, next === -1 ? undefined : next)
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

describe('walk-in customer lookup only ever returns onboarded customers', () => {
  it('getCustomers INNER JOINs customer_profile on both the data query and the count query', () => {
    const body = functionSource('getCustomers')

    // Two joins: the page of rows AND the total count must agree, or pagination
    // would advertise customers the search never shows.
    expect(occurrences(body, PROFILE_INNER_JOIN)).toBe(2)
    expect(body).not.toContain('.leftJoin(customerProfile')
  })

  it('getCustomers is limited to customer accounts, so staff never appear in walk-in search', () => {
    expect(functionSource('getCustomers')).toContain("eq(user.role, 'customer')")
  })

  it('getCustomerProfile INNER JOINs customer_profile, so an account with no profile resolves to null', () => {
    const body = functionSource('getCustomerProfile')

    expect(body).toContain(PROFILE_INNER_JOIN)
    expect(body).not.toContain('.leftJoin(customerProfile')
  })
})
