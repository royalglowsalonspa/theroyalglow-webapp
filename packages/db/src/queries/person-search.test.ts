/************************************************************
 * Module Name  : person-search.test
 * Scope        : Data Access — shared people lookup predicate
 *
 * Description  : The name / phone / email predicate shared by the walk-in
 *                customer lookup and the Users & Roles lookup. Rendered with
 *                Drizzle's PgDialect (no database) so the assertions cover the
 *                exact SQL and bound parameters Postgres receives.
 ************************************************************/

import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { user } from '../schema/auth'
import { customerProfile, staffProfile } from '../schema/profile'
import { escapeLikePattern, personSearchCondition, phoneDigitsForSearch } from './person-search'

const dialect = new PgDialect()
const COLUMNS = {
  name: user.name,
  email: user.email,
  phones: [customerProfile.phone, staffProfile.phone],
}

function render(term: string) {
  const condition = personSearchCondition(term, COLUMNS)
  return condition ? dialect.sqlToQuery(condition) : null
}

describe('escapeLikePattern', () => {
  it('escapes LIKE metacharacters so they match literally', () => {
    expect(escapeLikePattern('50%_off\\')).toBe('50\\%\\_off\\\\')
  })

  it('leaves ordinary text unchanged', () => {
    expect(escapeLikePattern('Priya Sharma')).toBe('Priya Sharma')
  })
})

describe('phoneDigitsForSearch', () => {
  it('strips formatting and the +91 prefix down to the national number', () => {
    expect(phoneDigitsForSearch('+91 98765 43210')).toBe('9876543210')
    expect(phoneDigitsForSearch('0091-98765-43210')).toBe('9876543210')
  })

  it('keeps a partial number as typed digits', () => {
    expect(phoneDigitsForSearch('98765')).toBe('98765')
  })

  it('returns null when there are too few digits to be a phone search', () => {
    expect(phoneDigitsForSearch('ab')).toBeNull()
    expect(phoneDigitsForSearch('a1b2')).toBeNull()
  })
})

describe('personSearchCondition', () => {
  it('returns undefined for a blank term so callers add no filter', () => {
    expect(personSearchCondition('   ', COLUMNS)).toBeUndefined()
  })

  it('matches name, email, and every phone column with the escaped pattern', () => {
    const query = render('  priya  ')
    expect(query).not.toBeNull()
    expect(query?.sql).toContain('"user"."name" ilike')
    expect(query?.sql).toContain('"user"."email" ilike')
    expect(query?.sql).toContain('"customer_profile"."phone" ilike')
    expect(query?.sql).toContain('"staff_profile"."phone" ilike')
    // A name-only term has no digits, so no digit-normalised phone match.
    expect(query?.sql).not.toContain('regexp_replace')
    expect(query?.params).toEqual(['%priya%', '%priya%', '%priya%', '%priya%'])
  })

  it('adds a digit-normalised match per phone column for a phone-like term', () => {
    const query = render('+91 98765 43210')
    expect(query?.sql.match(/regexp_replace/g)).toHaveLength(2)
    expect(query?.params).toContain('%9876543210%')
  })

  it('binds the term as a parameter, never as SQL text', () => {
    const query = render("x' OR 1=1 --")
    expect(query?.sql).not.toContain('OR 1=1')
    expect(query?.params).toContain("%x' OR 1=1 --%")
  })
})
