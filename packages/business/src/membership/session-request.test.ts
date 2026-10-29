/************************************************************
 * Module Name  : membership/session-request.test
 * Scope        : Business Logic — Membership
 *
 * Description  : A retried "record session" request may replay the session
 *                its idempotency key already recorded only when it asks for
 *                exactly the same lines: services, durations and staff, in any
 *                order. Anything else must be treated as a different request.
 ************************************************************/

import { describe, expect, it } from 'vitest'
import { isSameSessionRequest, type SessionLine } from './session-request'

const RECORDED: SessionLine[] = [
  { serviceId: 'svc_aroma_60', durationMinutes: 60, staffId: 'stf_1' },
  { serviceId: 'svc_scrub_30', durationMinutes: 30, staffId: null },
]

describe('isSameSessionRequest', () => {
  it('matches the same lines in any order, treating a missing staff member as null', () => {
    expect(
      isSameSessionRequest(
        [
          { serviceId: 'svc_scrub_30', durationMinutes: 30 },
          { serviceId: 'svc_aroma_60', durationMinutes: 60, staffId: 'stf_1' },
        ],
        RECORDED,
      ),
    ).toBe(true)
  })

  it.each([
    [
      'a changed duration',
      [
        { serviceId: 'svc_aroma_60', durationMinutes: 90, staffId: 'stf_1' },
        { serviceId: 'svc_scrub_30', durationMinutes: 30 },
      ],
    ],
    [
      'a changed staff member',
      [
        { serviceId: 'svc_aroma_60', durationMinutes: 60, staffId: 'stf_2' },
        { serviceId: 'svc_scrub_30', durationMinutes: 30 },
      ],
    ],
    [
      'a staff member added to an unassigned line',
      [
        { serviceId: 'svc_aroma_60', durationMinutes: 60, staffId: 'stf_1' },
        { serviceId: 'svc_scrub_30', durationMinutes: 30, staffId: 'stf_1' },
      ],
    ],
    [
      'a different service',
      [
        { serviceId: 'svc_aroma_60', durationMinutes: 60, staffId: 'stf_1' },
        { serviceId: 'svc_wrap_30', durationMinutes: 30 },
      ],
    ],
    ['a missing line', [{ serviceId: 'svc_aroma_60', durationMinutes: 60, staffId: 'stf_1' }]],
    [
      'an extra line',
      [...RECORDED, { serviceId: 'svc_aroma_60', durationMinutes: 60, staffId: 'stf_1' }],
    ],
    [
      'one line repeated instead of two different lines',
      [
        { serviceId: 'svc_aroma_60', durationMinutes: 60, staffId: 'stf_1' },
        { serviceId: 'svc_aroma_60', durationMinutes: 60, staffId: 'stf_1' },
      ],
    ],
  ])('rejects %s', (_label, requested) => {
    expect(isSameSessionRequest(requested, RECORDED)).toBe(false)
  })

  it('matches repeated lines only when the counts agree', () => {
    const twice: SessionLine[] = [
      { serviceId: 'svc_aroma_60', durationMinutes: 60 },
      { serviceId: 'svc_aroma_60', durationMinutes: 60 },
    ]
    expect(isSameSessionRequest(twice, twice)).toBe(true)
  })
})
