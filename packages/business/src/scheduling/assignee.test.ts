/************************************************************
 * Module Name  : scheduling/assignee.test
 * Scope        : Business Logic — who may do a booking, and who to suggest
 *
 * Description  : SPA work is for Therapists, salon work for Stylists, and the
 *                Manager or Receptionist may do either (membership-
 *                scheduling.md). A held-up booking's suggestions are people
 *                free for its slot who may do it, never the held-up person:
 *                those who perform more of its services first, then
 *                specialists, then by name, at most three by default.
 ************************************************************/

import { STAFF_DESIGNATIONS, type StaffDesignation } from '@rgss/types'
import { describe, expect, it } from 'vitest'
import { isCandidateFor, replacementSuggestions, type SuggestionCandidate } from './assignee'

function person(
  id: string,
  designation: StaffDesignation,
  extra: Partial<SuggestionCandidate> = {},
): SuggestionCandidate {
  return { id, name: id, designation, performs: 0, busy: null, ...extra }
}

describe('isCandidateFor', () => {
  it.each<[StaffDesignation, boolean, boolean]>([
    ['therapist', true, false],
    ['stylist', false, true],
    ['manager', true, true],
    ['receptionist', true, true],
  ])('a %s may do SPA work: %s, salon work: %s', (designation, spa, salon) => {
    expect(isCandidateFor('spa', designation)).toBe(spa)
    expect(isCandidateFor('salon', designation)).toBe(salon)
  })

  it('covers every designation', () => {
    for (const designation of STAFF_DESIGNATIONS) {
      expect(isCandidateFor('spa', designation) || isCandidateFor('salon', designation)).toBe(true)
    }
  })
})

describe('replacementSuggestions', () => {
  const people = [
    person('Asha', 'therapist', { performs: 1, busy: { reason: 'working' } }),
    person('Ravi', 'stylist', { performs: 2 }),
    person('Zoya', 'therapist'),
    person('Kavya', 'receptionist'),
    person('Lata', 'therapist', { performs: 1 }),
    person('Manish', 'manager', { performs: 1 }),
    person('Meena', 'therapist', { busy: { reason: 'on_leave' } }),
  ]

  it('suggests free SPA candidates, those who perform its services first, then specialists', () => {
    expect(replacementSuggestions(people, { kind: 'spa', limit: 10 })).toEqual([
      'Lata',
      'Manish',
      'Zoya',
      'Kavya',
    ])
  })

  it('stops at three by default and never names the held-up person', () => {
    const free = people.map((p) => ({ ...p, busy: null }))
    // Asha performs one of the services too, but she is the one held up.
    expect(replacementSuggestions(free, { kind: 'spa', exclude: 'Asha' })).toEqual([
      'Lata',
      'Manish',
      'Meena',
    ])
  })

  it('suggests Stylists, not Therapists, for salon work', () => {
    expect(replacementSuggestions(people, { kind: 'salon', limit: 10 })).toEqual([
      'Ravi',
      'Manish',
      'Kavya',
    ])
  })

  it('suggests nobody when nobody is free, or the limit is 0', () => {
    expect(replacementSuggestions([people[0] as SuggestionCandidate], { kind: 'spa' })).toEqual([])
    expect(replacementSuggestions(people, { kind: 'spa', limit: 0 })).toEqual([])
  })
})
